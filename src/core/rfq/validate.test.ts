// Fixture-driven validation suite (TAKER-03, TAKER-05): the positive baseline
// is built from fixtures/rfq-auth-tree.json — a REAL captured maker
// invocation tree, not a synthetic one — so every negative case tampers a
// single field against a genuinely signed entry, exactly the attack model
// validateQuote defends against.

import { describe, expect, it } from 'vitest';
import authTreeFixture from '../../../fixtures/rfq-auth-tree.json';
import type { GetMakerSideOrderParams, MakerSideOrderResult, RfqOrder } from './wire';
import { validateQuote, type SwapConfig, type ValidateContext } from './validate';

const PASSPHRASE = 'Test SDF Network ; September 2015';
const SWAP_CONTRACT_ID = authTreeFixture.tree.args.source; // matches the captured tree's root source

const BASE_ORDER = authTreeFixture.order as RfqOrder;
const BASE_AUTH_ENTRY = authTreeFixture.authEntry;

function baseResult(overrides: Partial<MakerSideOrderResult> = {}): MakerSideOrderResult {
  return {
    order: { ...BASE_ORDER },
    authEntry: BASE_AUTH_ENTRY,
    signatureExpirationLedger: 999_999_999,
    network: PASSPHRASE,
    swapContract: SWAP_CONTRACT_ID,
    ...overrides,
  };
}

function baseRequest(overrides: Partial<GetMakerSideOrderParams> = {}): GetMakerSideOrderParams {
  return {
    network: PASSPHRASE,
    swapContract: SWAP_CONTRACT_ID,
    makerToken: BASE_ORDER.makerToken,
    takerToken: BASE_ORDER.takerToken,
    takerAmount: BASE_ORDER.takerAmount,
    takerWallet: BASE_ORDER.taker,
    minExpiry: BASE_ORDER.expiry - 60,
    ...overrides,
  };
}

const BASE_CONFIG: SwapConfig = {
  admin: 'GB3WSGXR5GBMJ7HSBWTBWSWGI3A5AJGD4Y254XBI2P6AKS5N2VIXV7HI',
  fee_bps: BASE_ORDER.feeBps,
  fee_collector: 'GB3WSGXR5GBMJ7HSBWTBWSWGI3A5AJGD4Y254XBI2P6AKS5N2VIXV7HI', // matches the fixture's fee-transfer "to"
  paused: false,
};

function baseCtx(overrides: Partial<ValidateContext> = {}): ValidateContext {
  return {
    request: baseRequest(),
    config: { ...BASE_CONFIG },
    passphrase: PASSPHRASE,
    swapContractId: SWAP_CONTRACT_ID,
    nowUnixSeconds: BASE_ORDER.expiry - 100,
    currentLedgerSeq: 100,
    ...overrides,
  };
}

describe('validateQuote — accepts a genuinely valid quote', () => {
  it('accepts a quote matching the fixture in every field', () => {
    const v = validateQuote(baseResult(), baseCtx());
    expect(v.accepted).toBe(true);
  });

  it('accepts a quote whose expiry equals "now" exactly (contract check is strictly-greater-than)', () => {
    const v = validateQuote(baseResult(), baseCtx({ nowUnixSeconds: BASE_ORDER.expiry }));
    expect(v.accepted).toBe(true);
  });
});

describe('validateQuote — economics_mismatch', () => {
  it('rejects a takerAmount different from what the desk requested', () => {
    const v = validateQuote(baseResult(), baseCtx({ request: baseRequest({ takerAmount: '5' }) }));
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'economics_mismatch' } });
  });

  it('rejects a takerToken different from the requested pair', () => {
    const v = validateQuote(baseResult(), baseCtx({ request: baseRequest({ takerToken: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJLL' }) }));
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'economics_mismatch' } });
  });

  it('rejects a makerToken different from the requested pair', () => {
    const v = validateQuote(baseResult(), baseCtx({ request: baseRequest({ makerToken: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJLL' }) }));
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'economics_mismatch' } });
  });

  it('rejects order.taker not equal to the connected taker address', () => {
    const v = validateQuote(baseResult(), baseCtx({ request: baseRequest({ takerWallet: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' }) }));
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'economics_mismatch' } });
  });
});

describe('validateQuote — token_not_allowed', () => {
  it('rejects a makerToken not on the curated allow-list', () => {
    const doctoredOrder = { ...BASE_ORDER, makerToken: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJLL' };
    const ctx = baseCtx({ request: baseRequest({ makerToken: doctoredOrder.makerToken }) });
    const v = validateQuote(baseResult({ order: doctoredOrder }), ctx);
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'token_not_allowed' } });
  });

  it('rejects a takerToken not on the curated allow-list', () => {
    const doctoredOrder = { ...BASE_ORDER, takerToken: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJLL' };
    const ctx = baseCtx({ request: baseRequest({ takerToken: doctoredOrder.takerToken }) });
    const v = validateQuote(baseResult({ order: doctoredOrder }), ctx);
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'token_not_allowed' } });
  });
});

describe('validateQuote — fee_mismatch', () => {
  it('rejects a feeBps that differs from the live get_config value', () => {
    const v = validateQuote(baseResult(), baseCtx({ config: { ...BASE_CONFIG, fee_bps: BASE_ORDER.feeBps + 1 } }));
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'fee_mismatch' } });
  });
});

describe('validateQuote — contract_paused', () => {
  it('rejects a quote arriving while the contract reports paused', () => {
    const v = validateQuote(baseResult(), baseCtx({ config: { ...BASE_CONFIG, paused: true } }));
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'contract_paused' } });
  });
});

describe('validateQuote — expired', () => {
  it('rejects an expiry strictly in the past relative to now', () => {
    const v = validateQuote(baseResult(), baseCtx({ nowUnixSeconds: BASE_ORDER.expiry + 1 }));
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'expired' } });
  });
});

describe('validateQuote — entry_expired', () => {
  it('rejects a signatureExpirationLedger at the current ledger', () => {
    const v = validateQuote(baseResult({ signatureExpirationLedger: 100 }), baseCtx({ currentLedgerSeq: 100 }));
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'entry_expired' } });
  });

  it('rejects a signatureExpirationLedger below the current ledger', () => {
    const v = validateQuote(baseResult({ signatureExpirationLedger: 50 }), baseCtx({ currentLedgerSeq: 100 }));
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'entry_expired' } });
  });
});

describe('validateQuote — wrong_target', () => {
  it('rejects a network different from the desk’s passphrase', () => {
    const v = validateQuote(baseResult({ network: 'Public Global Stellar Network ; September 2015' }), baseCtx());
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'wrong_target' } });
  });

  it('rejects a swapContract different from the configured settlement contract', () => {
    const v = validateQuote(baseResult({ swapContract: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJLL' }), baseCtx());
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'wrong_target' } });
  });
});

describe('validateQuote — undecodable_entry', () => {
  it('rejects an authEntry that is not decodable base64 XDR', () => {
    const v = validateQuote(baseResult({ authEntry: 'not-valid-base64-xdr!!!' }), baseCtx());
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'undecodable_entry' } });
  });
});

describe('validateQuote — tree_mismatch', () => {
  it('rejects makerAmount silently reduced by one atomic unit relative to the signed tree', () => {
    const doctoredOrder = { ...BASE_ORDER, makerAmount: '1.9999999' };
    const v = validateQuote(baseResult({ order: doctoredOrder }), baseCtx());
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'tree_mismatch' } });
  });

  it('rejects a claimed taker different from the signed tree’s taker argument', () => {
    const otherTaker = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
    const doctoredOrder = { ...BASE_ORDER, taker: otherTaker };
    const ctx = baseCtx({ request: baseRequest({ takerWallet: otherTaker }) });
    const v = validateQuote(baseResult({ order: doctoredOrder }), ctx);
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'tree_mismatch' } });
  });

  it('rejects a claimed maker whose address does not match the entry’s credential', () => {
    const otherMaker = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
    const doctoredOrder = { ...BASE_ORDER, maker: otherMaker };
    const v = validateQuote(baseResult({ order: doctoredOrder }), baseCtx());
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'tree_mismatch' } });
  });

  it('rejects a claimed orderId different from the signed tree’s order_id argument', () => {
    const doctoredOrder = { ...BASE_ORDER, orderId: BASE_ORDER.orderId + 1 };
    const v = validateQuote(baseResult({ order: doctoredOrder }), baseCtx());
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'tree_mismatch' } });
  });

  it('rejects a claimed expiry different from the signed tree’s expiry argument', () => {
    const doctoredOrder = { ...BASE_ORDER, expiry: BASE_ORDER.expiry + 1 };
    const v = validateQuote(baseResult({ order: doctoredOrder }), baseCtx({ nowUnixSeconds: BASE_ORDER.expiry - 100 }));
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'tree_mismatch' } });
  });
});

// Gap-closure value-edge coverage (02-06, Task 2): the measured toAtomic
// probe table splits maker-controlled amounts into two groups — values that
// THROW (must reject as malformed_field, and must not escape as an
// exception) and values that silently PARSE to something interpretable but
// wrong (must stay economics_mismatch, never get folded into
// malformed_field). Getting the two groups backwards would either miss the
// isolation gap or blur an honest wrong-value rejection into a generic one.
describe('validateQuote — malformed_field (02-06 gap closure)', () => {
  it('rejects a non-numeric takerAmount without throwing', () => {
    const doctoredOrder = { ...BASE_ORDER, takerAmount: 'abc' };
    let v: ReturnType<typeof validateQuote>;
    expect(() => {
      v = validateQuote(baseResult({ order: doctoredOrder }), baseCtx());
    }).not.toThrow();
    expect(v!).toMatchObject({ accepted: false, rejection: { reason: 'malformed_field' } });
  });

  it('rejects a non-numeric makerAmount without throwing', () => {
    const doctoredOrder = { ...BASE_ORDER, makerAmount: 'xyz' };
    let v: ReturnType<typeof validateQuote>;
    expect(() => {
      v = validateQuote(baseResult({ order: doctoredOrder }), baseCtx());
    }).not.toThrow();
    expect(v!).toMatchObject({ accepted: false, rejection: { reason: 'malformed_field' } });
  });

  it('rejects an absent takerAmount without throwing', () => {
    const doctoredOrder = { ...BASE_ORDER, takerAmount: undefined } as unknown as RfqOrder;
    let v: ReturnType<typeof validateQuote>;
    expect(() => {
      v = validateQuote(baseResult({ order: doctoredOrder }), baseCtx());
    }).not.toThrow();
    expect(v!).toMatchObject({ accepted: false, rejection: { reason: 'malformed_field' } });
  });

  it('rejects a wrong-JSON-type takerAmount (an object) without throwing', () => {
    const doctoredOrder = { ...BASE_ORDER, takerAmount: {} } as unknown as RfqOrder;
    let v: ReturnType<typeof validateQuote>;
    expect(() => {
      v = validateQuote(baseResult({ order: doctoredOrder }), baseCtx());
    }).not.toThrow();
    expect(v!).toMatchObject({ accepted: false, rejection: { reason: 'malformed_field' } });
  });
});

describe('validateQuote — interpretable-but-wrong values stay economics_mismatch, not malformed_field', () => {
  it('rejects an empty-string takerAmount (parses to 0) as economics_mismatch', () => {
    const v = validateQuote(baseResult(), baseCtx({ request: baseRequest({ takerAmount: '' }) }));
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'economics_mismatch' } });
  });

  it('rejects a negative takerAmount as economics_mismatch', () => {
    const v = validateQuote(baseResult(), baseCtx({ request: baseRequest({ takerAmount: '-1' }) }));
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'economics_mismatch' } });
  });

  it('rejects a hex-prefixed takerAmount (BigInt accepts hex) as economics_mismatch', () => {
    const v = validateQuote(baseResult(), baseCtx({ request: baseRequest({ takerAmount: '0x10' }) }));
    expect(v).toMatchObject({ accepted: false, rejection: { reason: 'economics_mismatch' } });
  });
});

describe('validateQuote — concurrency (no shared state)', () => {
  it('validating a mixed array yields the same per-quote verdicts as validating each alone', () => {
    const good = baseResult();
    const badFee = baseResult({ order: { ...BASE_ORDER } });
    const badFeeCtx = baseCtx({ config: { ...BASE_CONFIG, fee_bps: BASE_ORDER.feeBps + 5 } });
    const badEntry = baseResult({ authEntry: 'garbage' });

    const inline = [validateQuote(good, baseCtx()), validateQuote(badFee, badFeeCtx), validateQuote(badEntry, baseCtx())];

    // Same calls again, interleaved differently, to prove no cross-call state leaks.
    const interleaved = [validateQuote(badEntry, baseCtx()), validateQuote(good, baseCtx()), validateQuote(badFee, badFeeCtx)];

    expect(inline[0]).toEqual(interleaved[1]);
    expect(inline[1]).toEqual(interleaved[2]);
    expect(inline[2]).toEqual(interleaved[0]);

    expect(inline[0].accepted).toBe(true);
    expect(inline[1]).toMatchObject({ accepted: false, rejection: { reason: 'fee_mismatch' } });
    expect(inline[2]).toMatchObject({ accepted: false, rejection: { reason: 'undecodable_entry' } });
  });
});
