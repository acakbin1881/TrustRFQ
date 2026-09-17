// ---------------------------------------------------------------------------
// RFQ discovery + ranking — pure. No network, no globals, no wallet.
// ---------------------------------------------------------------------------
// Mirrors src/core/oracle.ts's isolation discipline: every input is passed
// in, nothing is fetched or read from any global browser object here. This module owns the
// two decisions the panel must not make for itself — which maker URLs are
// common to both legs of the pair (intersectUrls), and what order the
// resulting quotes render in (rankQuotes/bestQuote) — plus the pure display
// helpers (dropExpired, fmtCountdown) the per-row countdown rides on.
//
// URL comparison is DELIBERATELY EXACT: no trailing-slash folding, no case
// folding, no scheme coercion. No source artifact (spec, CONTEXT.md,
// UI-SPEC.md) specifies a normalization rule, and inventing one here would
// silently merge two endpoints a maker registered as genuinely distinct on
// the registry. This was a decision, not an oversight.

import { toAtomic, type MakerSideOrderResult } from '@trustrfq/sdk';

/**
 * Plain set intersection preserving the FIRST array's order. Defensive
 * against a null/undefined side (a failed registry read must yield an
 * empty list, never a thrown exception that blanks the whole panel).
 * Duplicate URLs within `a` collapse to a single entry in the output.
 */
export function intersectUrls(a: string[] | null | undefined, b: string[] | null | undefined): string[] {
  if (!a || !b) return [];
  const bSet = new Set(b);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of a) {
    if (bSet.has(u) && !seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

// A fixed-point scale wide enough that two mathematically equal price
// ratios always compare bigint-exactly-equal, regardless of how the
// maker/taker atomic magnitudes differ between two quotes in the same list.
const PRICE_SCALE = 10n ** 18n;

/**
 * The taker's rate for one quote: makerAmount atomic units received per
 * takerAmount atomic unit sold, scaled to a fixed bigint precision so the
 * comparison never rounds through a float. Higher is better for the taker.
 * A non-positive takerAmount (should never happen past validateQuote, but
 * this module has no visibility into that gate) prices as 0 rather than
 * throwing on a division by zero.
 */
export function quotePrice(quote: MakerSideOrderResult): bigint {
  const makerAtomic = toAtomic(quote.order.makerAmount);
  const takerAtomic = toAtomic(quote.order.takerAmount);
  if (takerAtomic <= 0n) return 0n;
  return (makerAtomic * PRICE_SCALE) / takerAtomic;
}

/**
 * Best price first. `Array.prototype.sort` is stable (guaranteed since
 * ES2019 / every engine this project targets), so an exact bigint tie
 * preserves the two quotes' relative input order — the one property a
 * preselected primary action must never violate between renders. Returns a
 * new array; never mutates the input.
 */
export function rankQuotes(quotes: MakerSideOrderResult[]): MakerSideOrderResult[] {
  return [...quotes].sort((a, b) => {
    const pa = quotePrice(a);
    const pb = quotePrice(b);
    if (pa === pb) return 0;
    return pa > pb ? -1 : 1;
  });
}

/** The first (best) quote in an already-ranked list, or null if empty. */
export function bestQuote(ranked: MakerSideOrderResult[]): MakerSideOrderResult | null {
  return ranked[0] ?? null;
}

/**
 * Drop quotes whose expiry is strictly in the past relative to `nowSeconds`.
 * A quote whose expiry EQUALS `nowSeconds` is KEPT — this mirrors the
 * contract's own strictly-greater-than check (validateQuote's `expired`
 * rejection fires only when `now > order.expiry`), so the client is never
 * stricter than the chain it settles against.
 */
export function dropExpired(quotes: MakerSideOrderResult[], nowSeconds: number): MakerSideOrderResult[] {
  return quotes.filter((q) => q.order.expiry >= nowSeconds);
}

/**
 * "Expires in {mm:ss}" collapsing to the exact string "Expired" at or past
 * zero remaining seconds (02-UI-SPEC.md's Copywriting Contract). Distinct
 * from src/core/tokens.ts's fmtRemaining (a d/h/m format with a lowercase
 * "expired" sentinel used by the OTC lane) — the RFQ countdown is a
 * deliberately separate, shorter-horizon convention (a quote lives seconds
 * to minutes, not days), not a second attempt at the same job.
 */
export function fmtCountdown(expirySeconds: number, nowSeconds: number): string {
  const remaining = expirySeconds - nowSeconds;
  if (remaining <= 0) return 'Expired';
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
