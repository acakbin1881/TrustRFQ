// Pure ranking + intersection + expiry-filter coverage for src/core/rfq/discover.ts.
// Every behavior line in 02-03-PLAN.md's Task 1 gets an explicit case,
// including the equal-price stability property (run twice, same output),
// empty/single-element inputs, and the expiry-equals-now boundary.

import { describe, expect, it } from 'vitest';
import { bestQuote, dropExpired, fmtCountdown, intersectUrls, quotePrice, rankQuotes } from './discover';
import type { MakerSideOrderResult } from '@trustrfq/sdk';

/** A minimal, valid-shaped quote for ranking/expiry tests — only the fields
 *  these pure functions actually read vary between calls. */
function mkQuote(opts: { makerAmount: string; takerAmount?: string; expiry?: number; tag?: string }): MakerSideOrderResult {
  return {
    order: {
      maker: 'GMAKER',
      taker: 'GTAKER',
      makerToken: 'XLM',
      makerAmount: opts.makerAmount,
      takerToken: 'USDC',
      takerAmount: opts.takerAmount ?? '1.0000000',
      expiry: opts.expiry ?? 1000,
      orderId: 1,
      feeBps: 10,
    },
    authEntry: `entry-${opts.tag ?? opts.makerAmount}`,
    signatureExpirationLedger: 100,
    network: 'Test SDF Network ; September 2015',
    swapContract: 'CSWAP',
  };
}

describe('intersectUrls', () => {
  it('returns only strings present in both arrays, preserving the first array\'s order', () => {
    expect(intersectUrls(['a', 'b', 'c'], ['c', 'a'])).toEqual(['a', 'c']);
  });

  it('returns an empty array when either side is empty', () => {
    expect(intersectUrls([], ['a'])).toEqual([]);
    expect(intersectUrls(['a'], [])).toEqual([]);
  });

  it('returns an empty array (never throws) when a side is null or undefined', () => {
    expect(intersectUrls(null, ['a'])).toEqual([]);
    expect(intersectUrls(['a'], undefined)).toEqual([]);
    expect(intersectUrls(null, undefined)).toEqual([]);
  });

  it('collapses duplicate URLs within one side to a single entry', () => {
    expect(intersectUrls(['a', 'a', 'b'], ['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('quotePrice', () => {
  it('computes makerAmount/takerAmount without floating-point rounding of the inputs', () => {
    const q = mkQuote({ makerAmount: '2.0000000', takerAmount: '1.0000000' });
    // 2 maker-atomic-units per 1 taker-atomic-unit -> price scales to exactly 2x.
    expect(quotePrice(q)).toBe(quotePrice(mkQuote({ makerAmount: '4.0000000', takerAmount: '2.0000000' })));
  });

  it('two differently-scaled but mathematically equal prices compare bigint-exactly-equal', () => {
    const a = quotePrice(mkQuote({ makerAmount: '3.0000000', takerAmount: '1.0000000' }));
    const b = quotePrice(mkQuote({ makerAmount: '300.0000000', takerAmount: '100.0000000' }));
    expect(a).toBe(b);
  });
});

describe('rankQuotes', () => {
  it('orders by best price first (most received per unit sold)', () => {
    const worse = mkQuote({ makerAmount: '2.0000000', tag: 'worse' });
    const better = mkQuote({ makerAmount: '3.0000000', tag: 'better' });
    const ranked = rankQuotes([worse, better]);
    expect(ranked.map((q) => q.authEntry)).toEqual(['entry-better', 'entry-worse']);
  });

  it('on exactly equal price, preserves input order, and is stable across repeated calls', () => {
    const first = mkQuote({ makerAmount: '2.0000000', tag: 'first' });
    const second = mkQuote({ makerAmount: '2.0000000', tag: 'second' });
    const rankedOnce = rankQuotes([first, second]);
    const rankedTwice = rankQuotes([first, second]);
    expect(rankedOnce.map((q) => q.authEntry)).toEqual(['entry-first', 'entry-second']);
    expect(rankedTwice.map((q) => q.authEntry)).toEqual(rankedOnce.map((q) => q.authEntry));
  });

  it('returns an empty array for an empty input', () => {
    expect(rankQuotes([])).toEqual([]);
  });

  it('returns the single element unchanged for a single-element input', () => {
    const only = mkQuote({ makerAmount: '5.0000000', tag: 'only' });
    expect(rankQuotes([only])).toEqual([only]);
  });
});

describe('bestQuote', () => {
  it('returns the first element of an already-ranked list', () => {
    const ranked = [mkQuote({ makerAmount: '3.0000000', tag: 'best' }), mkQuote({ makerAmount: '2.0000000', tag: 'worst' })];
    expect(bestQuote(ranked)?.authEntry).toBe('entry-best');
  });

  it('returns null for an empty list', () => {
    expect(bestQuote([])).toBeNull();
  });
});

describe('dropExpired', () => {
  it('removes a quote whose expiry is strictly less than now', () => {
    const q = mkQuote({ makerAmount: '1.0000000', expiry: 999 });
    expect(dropExpired([q], 1000)).toEqual([]);
  });

  it('keeps a quote whose expiry EQUALS now (strictly-greater-than boundary, matching the contract)', () => {
    const q = mkQuote({ makerAmount: '1.0000000', expiry: 1000 });
    expect(dropExpired([q], 1000)).toEqual([q]);
  });

  it('keeps a quote whose expiry is in the future', () => {
    const q = mkQuote({ makerAmount: '1.0000000', expiry: 1001 });
    expect(dropExpired([q], 1000)).toEqual([q]);
  });
});

describe('fmtCountdown', () => {
  it('returns a zero-padded mm:ss string while time remains', () => {
    expect(fmtCountdown(1090, 1000)).toBe('01:30');
    expect(fmtCountdown(1005, 1000)).toBe('00:05');
  });

  it('returns the exact string "Expired" at zero remaining seconds', () => {
    expect(fmtCountdown(1000, 1000)).toBe('Expired');
  });

  it('returns the exact string "Expired" past zero (negative remaining)', () => {
    expect(fmtCountdown(990, 1000)).toBe('Expired');
  });
});
