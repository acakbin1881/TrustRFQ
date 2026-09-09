// ---------------------------------------------------------------------------
// RFQ retry guard + trustline predicate — pure. No network, no globals, no
// wallet (mirrors src/core/oracle.ts's isolation discipline).
// ---------------------------------------------------------------------------
// Encodes exactly two rules from 02-CONTEXT.md and nothing else:
//
//   - needsTrustline (D-08): the passive-note predicate over the
//     ALREADY-FETCHED balance map (src/data/useBalances.ts) — zero extra
//     network cost, and the caller must never assert a trustline fact it
//     has not fetched.
//   - retryDecision + isExpiredAuthFailure (D-09): the price-guarded retry —
//     the taker never signs at a price they have not seen. At most one
//     automatic retry, and only when the fresh price is equal to or better
//     than what was already shown; a strictly worse price stops and forces
//     explicit re-confirmation.
//
// isExpiredAuthFailure's match text is EMPIRICAL, not guessed: verified live
// against the deployed rfq_swap (2026-09-09, Testnet) that a maker entry
// whose signature_expiration_ledger has already passed is rejected during
// the ENFORCING-mode `simulateTransaction` call inside settleQuote — i.e.
// BEFORE the taker's wallet is ever asked to sign anything. The host's own
// diagnostic text is the literal phrase "signature has expired" wrapped in
// `HostError: Error(Auth, InvalidInput)`. This is why
// contracts/rfq_swap/src/lib.rs's header comment calls this a HOST-level
// failure: it is not one of the contract's own `#[contracterror] Error`
// variants (`Expired` there means the order's own `expiry` timestamp, a
// different, contract-level check) — the classifier below matches the
// host's exact wording, narrowly, so an unrelated auth/balance failure can
// never falsely spend the one retry this guard allows.

import { assetFor } from '../canonical';
import type { BalanceMap } from '../balances';
import { quotePrice } from './discover';
import type { MakerSideOrderResult } from './wire';

/**
 * D-08's trustline predicate over an already-fetched balance map. Three
 * states, kept distinct — this mirrors src/core/balances.ts's `canAfford`:
 * unknown is never resolved into a convenient answer.
 *   - the native asset never needs a trustline, regardless of the map;
 *   - a null map (not yet fetched) is NOT evidence of a missing trustline —
 *     the passive note must stay suppressed rather than assert a trustline
 *     is missing;
 *   - a fetched map that lacks the key means the trustline is genuinely
 *     absent; a present key at a zero balance means the trustline IS live.
 */
export function needsTrustline(balances: BalanceMap | null, tokenStr: string): boolean {
  if (assetFor(tokenStr).native) return false;
  if (balances === null) return false;
  return balances[tokenStr] === undefined;
}

/**
 * True for the host-level authorization-expiration failure settleQuote
 * throws when a maker's signed entry has already gone stale (see the module
 * header for the exact verified text and where in the settle flow it
 * fires). False for anything else — a differently-shaped auth failure (a
 * missing entry, a bad signature) or an unrelated failure such as a missing
 * trustline or a paused contract — because retrying those would be
 * pointless and would burn the one retry this guard ever grants.
 */
export function isExpiredAuthFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /signature has expired/i.test(message);
}

export type RetryDecision =
  | { action: 'auto_retry'; reason: 'price_equal_or_better' }
  | { action: 'reconfirm'; reason: 'price_worse' }
  | { action: 'stop'; reason: 'not_expired_auth_failure' | 'already_attempted' | 'no_fresh_quote' };

/**
 * D-09's price guard. The ORDER of these guards is the security property
 * (never reorder): a non-expiration failure or an already-spent retry stops
 * before price ever enters the decision, so `auto_retry` can never fire
 * outside the one narrow case it exists for.
 *
 * Equal is deliberately on the auto side: the taker has already seen and
 * agreed to that exact price, so re-showing it is friction with no consent
 * value. Only a STRICTLY worse fresh price is a price the taker has not
 * seen, which is the one case that must stop and re-confirm rather than
 * retry silently — the wallet's own contract-invocation prompt does not
 * render amounts human-readably, so the panel showing the price BEFORE any
 * signature request is the taker's real consent surface.
 */
export function retryDecision(args: {
  failure: unknown;
  /** quotePrice(...) of the quote already shown to (and accepted by) the taker */
  seenPrice: bigint;
  /** a freshly re-fetched, already-validated quote, or null if none came back */
  freshQuote: MakerSideOrderResult | null;
  /** automatic retries already spent on this accept sequence */
  attemptsAlready: number;
}): RetryDecision {
  if (!isExpiredAuthFailure(args.failure)) return { action: 'stop', reason: 'not_expired_auth_failure' };
  if (args.attemptsAlready >= 1) return { action: 'stop', reason: 'already_attempted' };
  if (!args.freshQuote) return { action: 'stop', reason: 'no_fresh_quote' };
  const freshPrice = quotePrice(args.freshQuote);
  if (freshPrice >= args.seenPrice) return { action: 'auto_retry', reason: 'price_equal_or_better' };
  return { action: 'reconfirm', reason: 'price_worse' };
}
