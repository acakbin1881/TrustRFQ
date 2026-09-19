// RFQ order encoding: the signature boundary. This is what the maker's server
// signs with `require_auth_for_args` and what the taker submits; if the two
// ever encode differently by a single byte the maker's signature is invalid
// and `swap` reverts. Pinned byte for byte by order.test.ts against
// fixtures/rfq-order-vectors.json.
//
// Soroban's #[contracttype] struct derive encodes fields as an ScMap with
// Symbol keys in SORTED ALPHABETICAL order, not Rust declaration order.
// Getting this wrong either fails decode on-chain or, worse, silently binds
// fields to the wrong keys.

import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { toAtomic } from './assets';
import type { RfqOrder } from './wire';

export { toAtomic, tokenForSac } from './assets';

/**
 * `Order` -> ScVal map with alphabetical symbol keys. This module owns the
 * camelCase (wire) -> snake_case (contract) translation.
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
    .sort() // the load-bearing line: sorted symbol keys
    .map((k) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: fields[k] }));
  return xdr.ScVal.scvMap(entries);
}

/** The golden-vector target: base64 XDR of orderToScVal(order). */
export function orderScValBase64(order: RfqOrder): string {
  return orderToScVal(order).toXDR('base64');
}
