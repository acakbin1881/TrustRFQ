// ---------------------------------------------------------------------------
// Quote validation: the gate between an untrusted maker server and the taker's wallet.
// ---------------------------------------------------------------------------
// PURE — no wallet, no network, no DOM, no globalThis/browser reads, no
// module-level mutable state. Everything it needs arrives as arguments: the maker's quote, the
// desk's own request, the live on-chain Config, the network passphrase, the
// settlement contract id, and the current unix second + ledger sequence.
// That argument-shaped design is what lets validate.test.ts pin behaviour
// without a network, and what lets the separate-repo taker SDK lift this
// module unchanged.
//
// FAILS CLOSED, mirroring src/core/balances.ts's canAfford discipline: an
// unrecognised shape, an undecodable entry, or any field this module cannot
// positively verify against something the maker does NOT control (the
// desk's own request, the live get_config read, or the maker's own signed
// invocation tree) is a rejection, never a default-accept.
//
// Order of checks is cheapest-first so a malformed quote costs nothing:
// target binding -> economics -> token allow-list -> fee -> paused ->
// expiry -> entry expiration -> only then the authorization-tree decode.

import { Address, buildInvocationTree, xdr, type ExecuteInvocation, type InvocationTree } from '@stellar/stellar-sdk';
import { toAtomic, tokenForSac } from './assets';
import type { GetMakerSideOrderParams, MakerSideOrderResult } from './wire';

/**
 * Shape of the maker's `require_auth_for_args` invocation tree, as the
 * contract source defines it (contracts/rfq_swap/src/lib.rs): the root
 * `execute` node carries the eight bound arguments (taker, maker_token,
 * maker_amount, taker_token, taker_amount, expiry, order_id, fee_bps); with
 * a positive fee, two maker_token.transfer sub-invocations (maker -> taker,
 * maker -> fee collector) sit under the maker's credential. validate.test.ts
 * asserts these against a captured real tree.
 */
export const AUTH_TREE_SHAPE = { rootArgCount: 8, feePositiveSubInvocations: 2 } as const;

/** rfq_swap::get_config's return shape, snake_case field names as decoded by
 *  scValToNative (the same map keys the contract's #[contracttype] derive
 *  produces — see src/core/rfq/order.ts's header comment on Soroban's
 *  sorted-symbol-key encoding for the sibling case). */
export interface SwapConfig {
  admin: string;
  fee_bps: number;
  fee_collector: string;
  paused: boolean;
}

/** Everything validateQuote needs that is NOT already inside the maker's
 *  own MakerSideOrderResult. */
export interface ValidateContext {
  /** The desk's own getMakerSideOrder request — the taker's own terms, never
   *  the maker's claim about them. */
  request: GetMakerSideOrderParams;
  /** A live rfq_swap.get_config() read, once per fan-out pass. */
  config: SwapConfig;
  /** The desk's configured network passphrase. */
  passphrase: string;
  /** RFQ_SWAP_CONTRACT_ID. */
  swapContractId: string;
  /** The caller's curated token strings ('XLM' or 'CODE:ISSUER'); both legs of a quote must be on it. */
  allowedTokens: readonly string[];
  /** Unix seconds "now" the caller wants this quote checked against. */
  nowUnixSeconds: number;
  /** The current Soroban ledger sequence. */
  currentLedgerSeq: number;
}

/** Why a quote was rejected. */
export type RejectReason =
  | 'economics_mismatch'
  | 'fee_mismatch'
  | 'contract_paused'
  | 'expired'
  | 'entry_expired'
  | 'wrong_target'
  | 'token_not_allowed'
  | 'undecodable_entry'
  | 'tree_mismatch'
  // A maker- or desk-controlled decimal-string amount could not be
  // interpreted at all (non-numeric, absent, or the wrong JSON type), as
  // distinct from a value that WAS interpretable and simply disagreed with
  // something (economics_mismatch / tree_mismatch): without this, an
  // uninterpretable value throws out of toAtomic and denies the whole pass,
  // not just this quote.
  | 'malformed_field';

export interface QuoteRejection {
  reason: RejectReason;
  detail: string;
}

/** A discriminated result, never a bare boolean, so callers can report WHY a
 *  quote was dropped (the panel's dev console, the E2E driver's report). */
export type ValidatedQuote =
  | { accepted: true; quote: MakerSideOrderResult }
  | { accepted: false; rejection: QuoteRejection };

const reject = (reason: RejectReason, detail: string): ValidatedQuote => ({ accepted: false, rejection: { reason, detail } });

/** Guards a maker- or desk-controlled decimal-string amount through toAtomic,
 *  converting a throw into null instead of letting it escape. Module-private:
 *  every call site decides its own rejection detail so a maker-supplied value
 *  and the desk's own request can still be told apart by the caller. */
function tryToAtomic(value: unknown): bigint | null {
  try {
    return toAtomic(value as string);
  } catch {
    return null;
  }
}

// See AUTH_TREE_SHAPE above.
const ROOT_ARG_COUNT = AUTH_TREE_SHAPE.rootArgCount;

const FEE_POSITIVE_SUB_INVOCATION_COUNT = AUTH_TREE_SHAPE.feePositiveSubInvocations;
// When fee_bps resolves to a zero fee amount, swap()'s `if fee > 0` guard
// (contracts/rfq_swap/src/lib.rs) skips the fee transfer entirely, leaving
// only the maker->taker transfer.
const FEE_ZERO_SUB_INVOCATION_COUNT = FEE_POSITIVE_SUB_INVOCATION_COUNT - 1; // 1

const FEE_DIVISOR = 10000n;

/** Mirrors rfq_swap::mul_bps's floor(amount * bps / 10_000) exactly. */
function feeAtomicFor(makerAtomic: bigint, feeBps: number): bigint {
  return (makerAtomic * BigInt(feeBps)) / FEE_DIVISOR;
}

/** Coerce a natively-typed invocation-tree arg (BigInt for i128/u64, number
 *  for u32, per the SDK's scValToNative rules) into a BigInt for comparison. */
function asBigInt(v: unknown): bigint {
  return BigInt(v as bigint | number | string);
}

/** The Address-credential's authorized address, or null for anything else
 *  (source-account credential, decode failure, unrecognised shape) — fails
 *  closed, mirroring tools/e2e/stub-maker.mjs's isAddressCredential /
 *  src/core/rfq/settle.ts's isMakerAddressEntry. */
function credentialAddress(entry: xdr.SorobanAuthorizationEntry): string | null {
  try {
    const c = entry.credentials();
    if (c.switch().name !== 'sorobanCredentialsAddress') return null;
    return Address.fromScAddress(c.address().address()).toString();
  } catch {
    return null;
  }
}

function asExecuteArgs(node: InvocationTree): ExecuteInvocation | null {
  if (node.type !== 'execute') return null;
  return node.args as ExecuteInvocation;
}

/** True iff `node` is exactly `tokenId.transfer(from, to, amount)`. */
function isTransfer(node: InvocationTree, tokenId: string, from: string, to: string, amount: bigint): boolean {
  const args = asExecuteArgs(node);
  if (!args) return false;
  if (args.source !== tokenId || args.function !== 'transfer') return false;
  const [nodeFrom, nodeTo, nodeAmount] = args.args;
  if (nodeFrom !== from || nodeTo !== to) return false;
  try {
    return asBigInt(nodeAmount) === amount;
  } catch {
    return false;
  }
}

/**
 * Validate one maker quote against everything the maker does NOT control:
 * the taker's own request, the live on-chain Config, and the maker's own
 * signed authorization entry. Never trusts a field the maker's JSON response
 * merely claims.
 */
export function validateQuote(result: MakerSideOrderResult, ctx: ValidateContext): ValidatedQuote {
  const { order } = result;

  // --- target binding (cheapest: string equality only) ---
  if (result.network !== ctx.passphrase || result.swapContract !== ctx.swapContractId) {
    return reject('wrong_target', 'maker response targets a different network or settlement contract than the desk configured');
  }

  // --- economics: the taker's own request is the source of truth, never the
  // maker's claimed order fields (makerAmount is the maker's PRICE and is
  // deliberately not checked here — it is cross-checked against the signed
  // tree below instead). ---
  const requestTakerAtomic = tryToAtomic(ctx.request.takerAmount);
  if (requestTakerAtomic === null) {
    return reject(
      'malformed_field',
      `ctx.request.takerAmount (${JSON.stringify(ctx.request.takerAmount)}) could not be interpreted as a decimal amount — this is the desk's own request, not the maker's response`,
    );
  }
  const orderTakerAtomic = tryToAtomic(order.takerAmount);
  if (orderTakerAtomic === null) {
    return reject(
      'malformed_field',
      `order.takerAmount (${JSON.stringify(order.takerAmount)}) could not be interpreted as a decimal amount — this value came from the maker's response`,
    );
  }
  if (
    order.taker !== ctx.request.takerWallet ||
    order.takerToken !== ctx.request.takerToken ||
    order.makerToken !== ctx.request.makerToken ||
    orderTakerAtomic !== requestTakerAtomic
  ) {
    return reject('economics_mismatch', 'order terms do not match the taker’s own request');
  }

  // --- token allow-list: never trust a token address arriving inside the
  // maker's response (TAKER-05). Both legs must resolve through the curated
  // allow-list, the same quarantine boundary orderTokensKnown enforces for
  // the OTC lane. ---
  if (tokenForSac(order.makerToken, ctx.passphrase, ctx.allowedTokens) === null) {
    return reject('token_not_allowed', `makerToken ${order.makerToken} is not on the curated allow-list`);
  }
  if (tokenForSac(order.takerToken, ctx.passphrase, ctx.allowedTokens) === null) {
    return reject('token_not_allowed', `takerToken ${order.takerToken} is not on the curated allow-list`);
  }

  // --- fee: the live on-chain config is the only source of truth; the
  // contract itself rejects a mismatch at settlement (Error::FeeMismatch),
  // but TAKER-03 requires catching it before any wallet prompt. ---
  if (order.feeBps !== ctx.config.fee_bps) {
    return reject('fee_mismatch', `order.feeBps (${order.feeBps}) does not match the live fee_bps (${ctx.config.fee_bps})`);
  }

  // --- paused: a paused contract rejects swap() before any transfer runs. ---
  if (ctx.config.paused) {
    return reject('contract_paused', 'rfq_swap reports paused = true');
  }

  // --- expiry: mirror the contract's own `>` check exactly (a quote is
  // still good ON its expiry second; the client must never be stricter than
  // the chain). ---
  if (ctx.nowUnixSeconds > order.expiry) {
    return reject('expired', `order.expiry (${order.expiry}) is in the past relative to now (${ctx.nowUnixSeconds})`);
  }

  // --- entry expiration: the auth entry's own signature_expiration_ledger,
  // distinct from the business-layer expiry above. ---
  if (result.signatureExpirationLedger <= ctx.currentLedgerSeq) {
    return reject(
      'entry_expired',
      `signatureExpirationLedger (${result.signatureExpirationLedger}) is at or below the current ledger (${ctx.currentLedgerSeq})`,
    );
  }

  // --- authorization-tree decode: the most expensive check, run last. Every
  // branch that cannot positively establish a fact returns a rejection. ---
  let entry: xdr.SorobanAuthorizationEntry;
  try {
    entry = xdr.SorobanAuthorizationEntry.fromXDR(result.authEntry, 'base64');
  } catch (e) {
    return reject('undecodable_entry', `authEntry did not decode as base64 XDR: ${String(e)}`);
  }

  try {
    const credAddress = credentialAddress(entry);
    if (credAddress === null || credAddress !== order.maker) {
      return reject('tree_mismatch', 'authEntry credential is not an Address credential for order.maker');
    }

    const tree = buildInvocationTree(entry.rootInvocation());
    const rootArgs = asExecuteArgs(tree);
    if (!rootArgs) {
      return reject('tree_mismatch', `root invocation type is ${tree.type}, expected execute`);
    }
    if (rootArgs.source !== ctx.swapContractId) {
      return reject('tree_mismatch', 'root invocation source is not the settlement contract');
    }
    if (rootArgs.function !== 'swap') {
      return reject('tree_mismatch', `root invocation function is ${rootArgs.function}, expected swap`);
    }
    if (rootArgs.args.length !== ROOT_ARG_COUNT) {
      return reject('tree_mismatch', `root invocation has ${rootArgs.args.length} args, expected ${ROOT_ARG_COUNT}`);
    }

    const [treeTaker, treeMakerToken, treeMakerAmount, treeTakerToken, treeTakerAmount, treeExpiry, treeOrderId, treeFeeBps] =
      rootArgs.args;
    // Explicit rejections, reached BEFORE any tree_mismatch check below: an
    // uninterpretable amount is reported as uninterpretable, never folded
    // into "the signed tree disagreed" — that reason must keep meaning a
    // signed tree that genuinely contradicts the quoted order (02-06).
    const makerAtomic = tryToAtomic(order.makerAmount);
    if (makerAtomic === null) {
      return reject(
        'malformed_field',
        `order.makerAmount (${JSON.stringify(order.makerAmount)}) could not be interpreted as a decimal amount — this value came from the maker's response`,
      );
    }
    const takerAtomic = tryToAtomic(order.takerAmount);
    if (takerAtomic === null) {
      return reject(
        'malformed_field',
        `order.takerAmount (${JSON.stringify(order.takerAmount)}) could not be interpreted as a decimal amount — this value came from the maker's response`,
      );
    }

    let rootArgsMatch = true;
    try {
      rootArgsMatch =
        treeTaker === order.taker &&
        treeMakerToken === order.makerToken &&
        asBigInt(treeMakerAmount) === makerAtomic &&
        treeTakerToken === order.takerToken &&
        asBigInt(treeTakerAmount) === takerAtomic &&
        asBigInt(treeExpiry) === BigInt(order.expiry) &&
        asBigInt(treeOrderId) === BigInt(order.orderId) &&
        Number(treeFeeBps) === order.feeBps;
    } catch {
      rootArgsMatch = false;
    }
    if (!rootArgsMatch) {
      return reject('tree_mismatch', 'signed root invocation args do not match the quoted order');
    }

    const feeAtomic = feeAtomicFor(makerAtomic, order.feeBps);
    const expectedSubCount = feeAtomic > 0n ? FEE_POSITIVE_SUB_INVOCATION_COUNT : FEE_ZERO_SUB_INVOCATION_COUNT;
    if (tree.invocations.length !== expectedSubCount) {
      return reject(
        'tree_mismatch',
        `signed entry has ${tree.invocations.length} sub-invocations, expected ${expectedSubCount} for this fee condition`,
      );
    }

    if (!isTransfer(tree.invocations[0], order.makerToken, order.maker, order.taker, makerAtomic)) {
      return reject('tree_mismatch', 'first sub-invocation is not maker_token.transfer(maker -> taker, maker_amount)');
    }

    if (feeAtomic > 0n) {
      if (!isTransfer(tree.invocations[1], order.makerToken, order.maker, ctx.config.fee_collector, feeAtomic)) {
        return reject('tree_mismatch', 'second sub-invocation is not maker_token.transfer(maker -> fee_collector, fee)');
      }
    }
  } catch (e) {
    return reject('tree_mismatch', `authEntry invocation tree could not be verified: ${String(e)}`);
  }

  return { accepted: true, quote: result };
}
