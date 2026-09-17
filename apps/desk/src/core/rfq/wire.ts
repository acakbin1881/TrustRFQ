// ---------------------------------------------------------------------------
// Stellar RFQ v1 wire — pure types + error-code constants.
// ---------------------------------------------------------------------------
// No network, no wallet, no window: this module only describes the JSON-RPC
// 2.0 shapes the spec defines (docs/specs/2026-08-17-rfq-protocol-
// architecture-design.md §6). The one network call site lives in
// src/data/rfqNetwork.ts.

/**
 * The nine on-chain `Order` fields (contracts/rfq_swap/src/lib.rs), spelled
 * in JSON-RPC camelCase. `order.ts` owns the translation to the contract's
 * snake_case ScVal map keys — this module never encodes anything.
 *
 * Amounts are DECIMAL STRINGS, never numbers, expressed at the SAC's 7dp
 * atomic precision (e.g. "10.0000000") — see order.ts's `toAtomic` for the
 * exact conversion to the i128 the contract expects.
 */
export interface RfqOrder {
  maker: string;
  taker: string;
  makerToken: string;
  makerAmount: string;
  takerToken: string;
  takerAmount: string;
  /** unix seconds */
  expiry: number;
  orderId: number;
  feeBps: number;
}

/** `getMakerSideOrder` request params (spec §6). */
export interface GetMakerSideOrderParams {
  network: string;
  swapContract: string;
  makerToken: string;
  takerToken: string;
  /** decimal string, sell-side amount (D-06) */
  takerAmount: string;
  takerWallet: string;
  /** unix seconds; the maker's quote must be valid at least this long */
  minExpiry: number;
}

/** `getMakerSideOrder` result: the quoted order plus the maker's pre-signed entry. */
export interface MakerSideOrderResult {
  order: RfqOrder;
  /** base64 SorobanAuthorizationEntry, the maker's detached signature */
  authEntry: string;
  signatureExpirationLedger: number;
  network: string;
  swapContract: string;
}

/** Stellar RFQ v1 wire error codes (spec §6), AirSwap-patterned. */
export const RFQ_ERROR = {
  CANNOT_PROVIDE_ORDER: -33600,
  PAIR_NOT_TRADED: -33601,
  AMOUNT_TOO_LOW: -33602,
  AMOUNT_TOO_HIGH: -33603,
  INVALID_PARAMS: -33604,
  RATE_LIMITED: -33605,
  TAKER_TRUSTLINE_MISSING: -33700,
  MAKER_INVENTORY_UNAVAILABLE: -33701,
} as const;
