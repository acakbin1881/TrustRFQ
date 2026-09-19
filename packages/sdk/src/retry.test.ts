// Pure coverage for retry.ts: the trustline predicate's three states, the
// expired-vs-unrelated failure classification, and the price guard's
// boundary (equal counts as not-worse) plus the at-most-once retry property.

import { describe, expect, it } from 'vitest';
import { quotePrice } from './discover';
import { isExpiredAuthFailure, needsTrustline, retryDecision } from './retry';
import type { MakerSideOrderResult } from './wire';
import type { TrustlineLookup } from './retry';

/** A minimal, valid-shaped quote — only makerAmount/takerAmount vary between
 *  calls, mirroring discover.test.ts's mkQuote helper. */
function mkQuote(makerAmount: string, takerAmount = '1.0000000'): MakerSideOrderResult {
  return {
    order: {
      maker: 'GMAKER',
      taker: 'GTAKER',
      makerToken: 'XLM',
      makerAmount,
      takerToken: 'USDC',
      takerAmount,
      expiry: 1000,
      orderId: 1,
      feeBps: 10,
    },
    authEntry: `entry-${makerAmount}`,
    signatureExpirationLedger: 100,
    network: 'Test SDF Network ; September 2015',
    swapContract: 'CSWAP',
  };
}

const EXPIRED_ERR = new Error(
  'HostError: Error(Auth, InvalidInput)\n\nEvent log (newest first):\n' +
    '   0: [Diagnostic Event] ... data:"escalating error to VM trap from failed host function call: require_auth_for_args"\n' +
    '   1: [Diagnostic Event] ... data:["signature has expired", GMAKER, 4587048, 4586048]\n',
);
const INSUFFICIENT_BALANCE_ERR = new Error(
  'HostError: Error(Contract, #13)\n\nEvent log (newest first):\n' +
    '   2: [Failed Diagnostic Event (not emitted)] ... data:["trustline entry is missing for account", "GTAKER"]\n',
);

describe('needsTrustline', () => {
  it('returns false for the native asset regardless of the map', () => {
    expect(needsTrustline(null, 'XLM')).toBe(false);
    expect(needsTrustline({}, 'XLM')).toBe(false);
    expect(needsTrustline({ XLM: '5' }, 'XLM')).toBe(false);
  });

  // A real, curated-allow-list-shaped issuer (src/core/tokens.ts's TOKENS
  // entry) — assetFor constructs a real stellar-sdk Asset and validates the
  // issuer's strkey checksum, so a placeholder like "GISSUER" throws.
  const USDC = 'USDC:GBJH2XCGKRMFKCBYPFJHHGISZGLOYZ3TM3IMFQPQSK7NT2L7JUARLC26';

  it('returns false for an unfetched (null) map — not evidence of a missing trustline', () => {
    expect(needsTrustline(null, USDC)).toBe(false);
  });

  it('returns true for a fetched map lacking the key (genuinely absent trustline)', () => {
    const balances: TrustlineLookup = { XLM: '10' };
    expect(needsTrustline(balances, USDC)).toBe(true);
  });

  it('returns false for a fetched map with the key present at a zero balance (trustline exists)', () => {
    const balances: TrustlineLookup = { [USDC]: '0' };
    expect(needsTrustline(balances, USDC)).toBe(false);
  });
});

describe('isExpiredAuthFailure', () => {
  it('returns true for the host-level "signature has expired" failure', () => {
    expect(isExpiredAuthFailure(EXPIRED_ERR)).toBe(true);
  });

  it('returns false for an unrelated failure such as a missing-trustline error', () => {
    expect(isExpiredAuthFailure(INSUFFICIENT_BALANCE_ERR)).toBe(false);
  });

  it('returns false for a non-Error thrown value with unrelated text', () => {
    expect(isExpiredAuthFailure('some other failure')).toBe(false);
  });
});

describe('retryDecision — price guard', () => {
  it('returns auto_retry when the fresh price is strictly better than the seen price', () => {
    const seenPrice = quotePrice(mkQuote('2.0000000'));
    const fresh = mkQuote('3.0000000'); // strictly better
    const d = retryDecision({ failure: EXPIRED_ERR, seenPrice, freshQuote: fresh, attemptsAlready: 0 });
    expect(d).toEqual({ action: 'auto_retry', reason: 'price_equal_or_better' });
  });

  it('returns auto_retry when the fresh price EXACTLY EQUALS the seen price (equal counts as not-worse)', () => {
    const seenPrice = quotePrice(mkQuote('2.0000000'));
    const fresh = mkQuote('2.0000000'); // exactly equal
    const d = retryDecision({ failure: EXPIRED_ERR, seenPrice, freshQuote: fresh, attemptsAlready: 0 });
    expect(d).toEqual({ action: 'auto_retry', reason: 'price_equal_or_better' });
  });

  it('returns reconfirm when the fresh price is strictly worse than the seen price', () => {
    const seenPrice = quotePrice(mkQuote('3.0000000'));
    const fresh = mkQuote('2.0000000'); // strictly worse
    const d = retryDecision({ failure: EXPIRED_ERR, seenPrice, freshQuote: fresh, attemptsAlready: 0 });
    expect(d).toEqual({ action: 'reconfirm', reason: 'price_worse' });
  });
});

describe('retryDecision — attempt guard (at most one automatic retry, ever)', () => {
  it('returns stop when a retry has already been attempted, regardless of price', () => {
    const seenPrice = 1n;
    const fresh = mkQuote('99.0000000'); // a dramatically better price
    const d = retryDecision({ failure: EXPIRED_ERR, seenPrice, freshQuote: fresh, attemptsAlready: 1 });
    expect(d).toEqual({ action: 'stop', reason: 'already_attempted' });
  });

  it('also stops at a higher attempt count', () => {
    const d = retryDecision({ failure: EXPIRED_ERR, seenPrice: 1n, freshQuote: mkQuote('2.0000000'), attemptsAlready: 2 });
    expect(d.action).toBe('stop');
  });
});

describe('retryDecision — no fresh quote', () => {
  it('returns stop when no fresh quote came back', () => {
    const d = retryDecision({ failure: EXPIRED_ERR, seenPrice: 1n, freshQuote: null, attemptsAlready: 0 });
    expect(d).toEqual({ action: 'stop', reason: 'no_fresh_quote' });
  });
});

describe('retryDecision — non-expiration failures never retry', () => {
  it('returns stop for an unrelated failure even with a better fresh price and zero attempts', () => {
    const d = retryDecision({
      failure: INSUFFICIENT_BALANCE_ERR,
      seenPrice: 1n,
      freshQuote: mkQuote('99.0000000'),
      attemptsAlready: 0,
    });
    expect(d).toEqual({ action: 'stop', reason: 'not_expired_auth_failure' });
  });

  it('never returns auto_retry for any failure isExpiredAuthFailure rejects', () => {
    const failures = [INSUFFICIENT_BALANCE_ERR, new Error('Paused'), 'a string failure', null, undefined];
    for (const failure of failures) {
      const d = retryDecision({ failure, seenPrice: 1n, freshQuote: mkQuote('99.0000000'), attemptsAlready: 0 });
      expect(d.action).not.toBe('auto_retry');
    }
  });
});
