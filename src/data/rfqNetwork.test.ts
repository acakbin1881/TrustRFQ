// Unit half of TAKER-02's drop semantics: getMakerSideOrder's per-request
// behaviour, exercised with the global fetch stubbed and no real request
// issued. The live/behavioural half (a full validated fan-out settling for
// real on Testnet) is proven by tools/e2e/rfq-driver.mjs (E2E-01).
//
// window is stubbed BEFORE the module under test is imported (dynamically,
// after the stub is in place) because src/config.ts reads window.* once, at
// module-load time — RFQ_SWAP_CONTRACT_ID/RFQ_REGISTRY_ID would otherwise
// resolve to '' in Vitest's node environment and rfqNetwork.ts's
// `new Contract(...)` calls would throw before any test body runs.

import { Address, nativeToScVal, rpc, xdr } from '@stellar/stellar-sdk';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import authTreeFixture from '../../fixtures/rfq-auth-tree.json';
import type { GetMakerSideOrderParams, RfqOrder } from '../core/rfq/wire';

const PASSPHRASE = 'Test SDF Network ; September 2015';
const RFQ_SWAP_CONTRACT_ID = authTreeFixture.tree.args.source;
const RFQ_REGISTRY_ID = 'CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G';

vi.stubGlobal('window', {
  RFQ_SWAP_CONTRACT_ID,
  RFQ_REGISTRY_ID,
  NETWORK_PASSPHRASE: PASSPHRASE,
});

let getMakerSideOrder: typeof import('./rfqNetwork').getMakerSideOrder;
let fanOutMakerSideOrder: typeof import('./rfqNetwork').fanOutMakerSideOrder;

beforeAll(async () => {
  const mod = await import('./rfqNetwork');
  getMakerSideOrder = mod.getMakerSideOrder;
  fanOutMakerSideOrder = mod.fanOutMakerSideOrder;
});

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

describe('getMakerSideOrder — TAKER-02 drop semantics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('window', { RFQ_SWAP_CONTRACT_ID, RFQ_REGISTRY_ID, NETWORK_PASSPHRASE: PASSPHRASE });
  });

  it('a rejected request yields null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(getMakerSideOrder('http://maker.test', PARAMS)).resolves.toBeNull();
  });

  it('a non-2xx response yields null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    await expect(getMakerSideOrder('http://maker.test', PARAMS)).resolves.toBeNull();
  });

  it('a body that is not parseable JSON yields null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json{{{', { status: 200 })));
    await expect(getMakerSideOrder('http://maker.test', PARAMS)).resolves.toBeNull();
  });

  it('a well-formed JSON-RPC response carrying an error member yields null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: -33601, message: 'pair not traded' } })),
    );
    await expect(getMakerSideOrder('http://maker.test', PARAMS)).resolves.toBeNull();
  });

  it('a result missing the authorization entry yields null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 1, result: { order: BASE_ORDER } })),
    );
    await expect(getMakerSideOrder('http://maker.test', PARAMS)).resolves.toBeNull();
  });

  it('a request that exceeds the timeout yields null, while the other requests in the same pass still resolve', async () => {
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
    expect(slowResult).toBeNull();
    expect(fastResult).not.toBeNull();
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

describe('fanOutMakerSideOrder — the validated fan-out (TAKER-02 + TAKER-03)', () => {
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
    vi.stubGlobal('window', { RFQ_SWAP_CONTRACT_ID, RFQ_REGISTRY_ID, NETWORK_PASSPHRASE: PASSPHRASE });
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

    const { accepted, rejections } = await fanOutMakerSideOrder(
      ['http://good.test', 'http://non2xx.test', 'http://malformed.test', 'http://refused.test'],
      PARAMS,
    );

    expect(accepted).toHaveLength(1);
    expect(accepted[0].order.orderId).toBe(BASE_ORDER.orderId);
    // The three failing makers never reached validateQuote — they were
    // dropped at the wire layer, so they produce no rejection record either.
    expect(rejections).toHaveLength(0);
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

    const { accepted, rejections } = await fanOutMakerSideOrder(['http://good.test', 'http://doctored.test'], PARAMS);

    expect(accepted).toHaveLength(1);
    expect(rejections).toHaveLength(1);
    expect(rejections[0].rejection.reason).toBe('tree_mismatch');
  });
});
