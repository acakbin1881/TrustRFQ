// Unit half of the wire drop semantics: getMakerSideOrder's per-request
// behaviour with the global fetch stubbed, plus the validated fan-out with
// the RPC reads mocked. The live half (a full validated fan-out settling on
// Testnet) is exercised by tools/e2e/rfq-driver.mjs.

import { Address, nativeToScVal, rpc, xdr } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authTreeFixture from '../fixtures/rfq-auth-tree.json';
import { fanOutMakerSideOrder, getMakerSideOrder, isMakerSideOrderResult } from './network';
import type { RfqClientConfig } from './settle';
import * as validateModule from './validate';
import type { GetMakerSideOrderParams, RfqOrder } from './wire';

const PASSPHRASE = 'Test SDF Network ; September 2015';
const RFQ_SWAP_CONTRACT_ID = authTreeFixture.tree.args.source;
const RFQ_REGISTRY_ID = 'CBEFE7JY3PT5XF6CT3BMWF5RGPNUBGHKWPUDD3KLFZBLXFE3RPIDRLL3';

const CFG: RfqClientConfig = {
  rpcUrl: 'https://rpc.test',
  horizonUrl: 'https://horizon.test',
  passphrase: PASSPHRASE,
  registryId: RFQ_REGISTRY_ID,
  swapContractId: RFQ_SWAP_CONTRACT_ID,
  allowedTokens: ['XLM', 'USDC:GBJH2XCGKRMFKCBYPFJHHGISZGLOYZ3TM3IMFQPQSK7NT2L7JUARLC26'],
};

const BASE_ORDER = authTreeFixture.order as RfqOrder;
const FEE_COLLECTOR = 'GB3WSGXR5GBMJ7HSBWTBWSWGI3A5AJGD4Y254XBI2P6AKS5N2VIXV7HI';

const PARAMS: GetMakerSideOrderParams = {
  network: PASSPHRASE,
  swapContract: RFQ_SWAP_CONTRACT_ID,
  makerToken: BASE_ORDER.makerToken,
  takerToken: BASE_ORDER.takerToken,
  takerAmount: BASE_ORDER.takerAmount,
  takerWallet: BASE_ORDER.taker,
  minExpiry: BASE_ORDER.expiry - 60,
};

const GOOD_RESULT = {
  order: BASE_ORDER,
  authEntry: authTreeFixture.authEntry,
  signatureExpirationLedger: 999_999_999,
  network: PASSPHRASE,
  swapContract: RFQ_SWAP_CONTRACT_ID,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('getMakerSideOrder: wire drop semantics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a rejected request is dropped as unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(getMakerSideOrder('http://maker.test', PARAMS)).resolves.toEqual({ dropped: { kind: 'unreachable' } });
  });

  it('a non-2xx response is dropped as http_error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    await expect(getMakerSideOrder('http://maker.test', PARAMS)).resolves.toEqual({ dropped: { kind: 'http_error', status: 500 } });
  });

  it('a body that is not parseable JSON is dropped as unparseable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json{{{', { status: 200 })));
    await expect(getMakerSideOrder('http://maker.test', PARAMS)).resolves.toEqual({ dropped: { kind: 'unparseable' } });
  });

  it('a well-formed JSON-RPC response carrying an error member is dropped as rpc_error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: -33601, message: 'pair not traded' } })),
    );
    await expect(getMakerSideOrder('http://maker.test', PARAMS)).resolves.toEqual({
      dropped: { kind: 'rpc_error', code: -33601, message: 'pair not traded' },
    });
  });

  it('a result missing the authorization entry is dropped as malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 1, result: { order: BASE_ORDER } })),
    );
    await expect(getMakerSideOrder('http://maker.test', PARAMS)).resolves.toEqual({ dropped: { kind: 'malformed' } });
  });

  it('a request that exceeds the timeout is dropped as unreachable, while the other requests in the same pass still resolve', async () => {
    const slow = vi.fn().mockRejectedValue(new DOMException('The operation was aborted.', 'TimeoutError'));
    const fast = vi.fn().mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 1, result: GOOD_RESULT }));
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => (url === 'http://slow.test' ? slow() : fast())),
    );
    const [slowResult, fastResult] = await Promise.all([
      getMakerSideOrder('http://slow.test', PARAMS),
      getMakerSideOrder('http://fast.test', PARAMS),
    ]);
    expect(slowResult).toEqual({ dropped: { kind: 'unreachable' } });
    expect('result' in fastResult).toBe(true);
  });
});

// --- fanOutMakerSideOrder: the wire-drop composition + the validation gate ---

function configScVal(cfg: { admin: string; fee_bps: number; fee_collector: string; paused: boolean }): xdr.ScVal {
  const fields: Record<string, xdr.ScVal> = {
    admin: new Address(cfg.admin).toScVal(),
    fee_bps: nativeToScVal(cfg.fee_bps, { type: 'u32' }),
    fee_collector: new Address(cfg.fee_collector).toScVal(),
    paused: xdr.ScVal.scvBool(cfg.paused),
  };
  const entries = Object.keys(fields)
    .sort()
    .map((k) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: fields[k] }));
  return xdr.ScVal.scvMap(entries);
}

describe('fanOutMakerSideOrder: the validated fan-out', () => {
  beforeEach(() => {
    // Pin "now" to just before the fixture's captured expiry — the fixture's
    // signed authEntry is time-bound (a real quote's short TTL), so the real
    // wall clock would make it read as expired on any run after capture.
    vi.useFakeTimers();
    vi.setSystemTime(new Date((BASE_ORDER.expiry - 30) * 1000));

    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockResolvedValue({
      result: { retval: configScVal({ admin: FEE_COLLECTOR, fee_bps: BASE_ORDER.feeBps, fee_collector: FEE_COLLECTOR, paused: false }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.spyOn(rpc.Server.prototype, 'getLatestLedger').mockResolvedValue({
      sequence: 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('a pass mixing one good maker with three failing ones returns exactly one accepted quote', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === 'http://good.test') return jsonResponse({ jsonrpc: '2.0', id: 1, result: GOOD_RESULT });
        if (url === 'http://non2xx.test') return new Response('', { status: 500 });
        if (url === 'http://malformed.test') return new Response('not json{{{', { status: 200 });
        return jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: -33601, message: 'pair not traded' } });
      }),
    );

    const { accepted, rejections, dropped } = await fanOutMakerSideOrder(
      CFG,
      ['http://good.test', 'http://non2xx.test', 'http://malformed.test', 'http://refused.test'],
      PARAMS,
    );

    expect(accepted).toHaveLength(1);
    expect(accepted[0].order.orderId).toBe(BASE_ORDER.orderId);
    // The three failing makers never reached validateQuote — they were
    // dropped at the wire layer, so they produce no rejection record either.
    expect(rejections).toHaveLength(0);
    expect(dropped.map((d) => d.drop.kind).sort()).toEqual(['http_error', 'rpc_error', 'unparseable']);
  });

  it('validates every response that DOES arrive, dropping a validation failure separately from a wire failure', async () => {
    const doctoredOrder = { ...BASE_ORDER, makerAmount: '1.9999999' }; // tree_mismatch: signed tree still says 2
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === 'http://good.test') return jsonResponse({ jsonrpc: '2.0', id: 1, result: GOOD_RESULT });
        return jsonResponse({ jsonrpc: '2.0', id: 1, result: { ...GOOD_RESULT, order: doctoredOrder } });
      }),
    );

    const { accepted, rejections } = await fanOutMakerSideOrder(CFG, ['http://good.test', 'http://doctored.test'], PARAMS);

    expect(accepted).toHaveLength(1);
    expect(rejections).toHaveLength(1);
    expect(rejections[0].rejection.reason).toBe('tree_mismatch');
  });

  // Gap-closure regression: a single maker returning a value-level malformed
  // order.takerAmount must cost exactly one quote, never the whole pass.
  // Before the guard exists in validate.ts + the call-site catch here, this
  // throws a raw SyntaxError out of validateQuote and rejects
  // fanOutMakerSideOrder's whole promise instead of resolving with a
  // per-quote outcome.
  it('a pass mixing one maker with a non-numeric takerAmount and three valid makers isolates the bad quote to one rejection', async () => {
    const malformedOrder = { ...BASE_ORDER, takerAmount: 'abc' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === 'http://malformed.test') {
          return jsonResponse({ jsonrpc: '2.0', id: 1, result: { ...GOOD_RESULT, order: malformedOrder } });
        }
        return jsonResponse({ jsonrpc: '2.0', id: 1, result: GOOD_RESULT });
      }),
    );

    const { accepted, rejections } = await fanOutMakerSideOrder(
      CFG,
      ['http://maker-a.test', 'http://maker-b.test', 'http://maker-c.test', 'http://malformed.test'],
      PARAMS,
    );

    expect(accepted).toHaveLength(3);
    expect(rejections).toHaveLength(1);
    expect(rejections[0].url).toBe('http://malformed.test');
    expect(rejections[0].rejection.reason).toBe('malformed_field');
    // Discriminates the pure-layer guard's own classification from the
    // call-site catch's generic backstop text (mutation check): the pure
    // layer's crafted detail names the field and its provenance; the
    // backstop's detail is just `String(e)` on the raw SyntaxError. Removing
    // the validate.ts guard (while the call-site catch stays) still isolates
    // the quote by count, but this assertion catches the classification
    // regressing to the generic backstop path.
    expect(rejections[0].rejection.detail).toContain('could not be interpreted as a decimal amount');
    expect(rejections[0].rejection.detail).toContain("maker's response");
  });

  // Gap-closure mutation check: once every currently-known maker-controlled
  // numeric field is guarded in validate.ts, validateQuote is total for all
  // of them and none can reach the call-site catch by throwing, so the
  // mixed-pass test above cannot, by itself, prove the catch is load-bearing
  // rather than dead code. This test proves it structurally: it forces
  // validateQuote to throw for a reason the pure layer does not (and, by
  // design, never will) classify, and asserts the catch still isolates it to
  // one quote. Removing the try/catch in fanOutMakerSideOrder's loop turns
  // this RED (the whole promise rejects); restoring it turns it GREEN again.
  it('the call-site catch isolates a throw from validateQuote for a reason the pure layer never classifies (structural backstop)', async () => {
    const POISON_ORDER_ID = -1;
    const poisonOrder = { ...BASE_ORDER, orderId: POISON_ORDER_ID };
    const actualValidateQuote = validateModule.validateQuote;
    vi.spyOn(validateModule, 'validateQuote').mockImplementation((result, ctx) => {
      if (result.order.orderId === POISON_ORDER_ID) {
        throw new Error('structural probe: a bug elsewhere in validateQuote, not a maker-controlled field');
      }
      return actualValidateQuote(result, ctx);
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === 'http://poison.test') return jsonResponse({ jsonrpc: '2.0', id: 1, result: { ...GOOD_RESULT, order: poisonOrder } });
        return jsonResponse({ jsonrpc: '2.0', id: 1, result: GOOD_RESULT });
      }),
    );

    const { accepted, rejections } = await fanOutMakerSideOrder(CFG, ['http://good.test', 'http://poison.test'], PARAMS);

    expect(accepted).toHaveLength(1);
    expect(rejections).toHaveLength(1);
    expect(rejections[0].url).toBe('http://poison.test');
    expect(rejections[0].rejection.reason).toBe('malformed_field');
  });

  // Gap-closure regression: a failed per-pass config read must keep failing
  // the WHOLE pass, never degrade into a per-quote skip of the fee/paused
  // gate. This is the counterweight to the mixed-pass case above; it pins the
  // fail-closed direction against a future widening of the per-quote catch
  // upward into the shared Promise.all reads.
  it('rejects the whole pass when the per-pass get_config read fails', async () => {
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockRestore();
    vi.spyOn(rpc.Server.prototype, 'simulateTransaction').mockRejectedValue(new Error('rpc unavailable'));
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ jsonrpc: '2.0', id: 1, result: GOOD_RESULT })));

    await expect(fanOutMakerSideOrder(CFG, ['http://good.test'], PARAMS)).rejects.toThrow();
  });
});

describe('isMakerSideOrderResult', () => {
  it('accepts the captured real result', () => {
    expect(isMakerSideOrderResult(GOOD_RESULT)).toBe(true);
  });
  it('rejects a result whose signatureExpirationLedger is missing or not an integer', () => {
    const { signatureExpirationLedger: _drop, ...noLedger } = GOOD_RESULT;
    expect(isMakerSideOrderResult(noLedger)).toBe(false);
    expect(isMakerSideOrderResult({ ...GOOD_RESULT, signatureExpirationLedger: '123' })).toBe(false);
    expect(isMakerSideOrderResult({ ...GOOD_RESULT, order: { ...BASE_ORDER, feeBps: '10' } })).toBe(false);
  });
});
