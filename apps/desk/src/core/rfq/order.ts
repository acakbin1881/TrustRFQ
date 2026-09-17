// ---------------------------------------------------------------------------
// RFQ order encoding — the signature boundary (TAKER-06).
// ---------------------------------------------------------------------------
// PURE — no wallet, no network, no DOM, no `window`. This is what the maker's
// server signs (`require_auth_for_args`) and what the taker submits; if the
// two ever encode differently by a single byte, the maker's signature is
// invalid and `swap` reverts. Golden-vector pinned by order.test.ts against
// fixtures/rfq-order-vectors.json, mirroring src/core/canonical.ts's discipline.
//
// Soroban's #[contracttype] struct derive encodes fields as an ScMap with
// Symbol keys in SORTED ALPHABETICAL order, not Rust declaration order
// (verified live: tools/rfq-live-swap.mjs:94-110, tx 49fa69b2258d5...).
// Getting this wrong either fails decode on-chain or, worse, silently binds
// fields to the wrong keys.

import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { sacIdFor as otcSacIdFor } from '../canonical';
import { TOKENS } from '../tokens';
import type { RfqOrder } from './wire';

/** decimal string (up to 7dp) -> atomic i128 units, mirrors canonical.ts's toStroops */
export function toAtomic(s: string): bigint {
  const [whole, frac = ''] = String(s).split('.');
  return BigInt(whole || '0') * 10000000n + BigInt((frac + '0000000').slice(0, 7));
}

/** curated token string ('XLM' | 'CODE:ISSUER') -> its Stellar Asset Contract id */
export function sacIdFor(tokenStr: string, passphrase: string): string {
  return otcSacIdFor(tokenStr, passphrase);
}

/** reverse lookup: SAC id -> curated token string, or null if not on the allow-list (TAKER-05) */
export function tokenForSac(sacId: string, passphrase: string): string | null {
  for (const t of TOKENS) {
    if (sacIdFor(t.value, passphrase) === sacId) return t.value;
  }
  return null;
}

/**
 * `Order` -> ScVal map, alphabetical symbol keys
 * (maker, taker, maker_token, maker_amount, taker_token, taker_amount,
 *  expiry, order_id, fee_bps sorted -> expiry, fee_bps, maker, maker_amount,
 *  maker_token, order_id, taker, taker_amount, taker_token).
 * `order.ts` owns the camelCase (wire) -> snake_case (contract) translation.
 */
export function orderToScVal(order: RfqOrder): xdr.ScVal {
  const fields: Record<string, xdr.ScVal> = {
    maker: new Address(order.maker).toScVal(),
    taker: new Address(order.taker).toScVal(),
    maker_token: new Address(order.makerToken).toScVal(),
    maker_amount: nativeToScVal(toAtomic(order.makerAmount), { type: 'i128' }),
    taker_token: new Address(order.takerToken).toScVal(),
    taker_amount: nativeToScVal(toAtomic(order.takerAmount), { type: 'i128' }),
    expiry: nativeToScVal(BigInt(order.expiry), { type: 'u64' }),
    order_id: nativeToScVal(BigInt(order.orderId), { type: 'u64' }),
    fee_bps: nativeToScVal(order.feeBps, { type: 'u32' }),
  };
  const entries = Object.keys(fields)
    .sort() // <-- the load-bearing line (Pitfall 1)
    .map((k) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: fields[k] }));
  return xdr.ScVal.scvMap(entries);
}

/** the golden-vector target: base64 XDR of orderToScVal(order) */
export function orderScValBase64(order: RfqOrder): string {
  return orderToScVal(order).toXDR('base64');
}
