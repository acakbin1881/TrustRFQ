// Golden-vector regression for the RFQ signature boundary.
//
// fixtures/rfq-order-vectors.json pins orderScVal's encoded output byte for
// byte; if the sorted-key encoding ever drifts, this suite goes red first.

import { describe, expect, it } from 'vitest';
import fixtures from '../fixtures/rfq-order-vectors.json';
import { orderScValBase64, orderToScVal, toAtomic } from './order';
import type { RfqOrder } from './wire';

describe('orderScValBase64', () => {
  for (const v of fixtures.vectors) {
    it(`reproduces the captured XDR for ${v.name}`, () => {
      expect(orderScValBase64(v.order as RfqOrder)).toBe(v.scValBase64);
    });
  }

  it('is deterministic across calls', () => {
    const [v] = fixtures.vectors;
    const a = orderScValBase64(v.order as RfqOrder);
    const b = orderScValBase64(v.order as RfqOrder);
    expect(a).toBe(b);
  });

  it('changes when an amount changes by one atomic unit — the tamper guard', () => {
    const [v] = fixtures.vectors;
    const tampered = { ...v.order, makerAmount: '2.0000001' } as RfqOrder;
    expect(orderScValBase64(tampered)).not.toBe(v.scValBase64);
  });

  it('changes when fee_bps changes — the fee is inside the signed tuple', () => {
    const [v] = fixtures.vectors;
    const tampered = { ...v.order, feeBps: 11 } as RfqOrder;
    expect(orderScValBase64(tampered)).not.toBe(v.scValBase64);
  });

  it('encodes symbol keys in ascending alphabetical order, not declaration order', () => {
    const [v] = fixtures.vectors;
    const scv = orderToScVal(v.order as RfqOrder);
    const entries = scv.map();
    if (!entries) throw new Error('expected orderToScVal to produce an ScMap');
    const keys = entries.map((entry) => entry.key().sym().toString());
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
    // Declaration order (maker, taker, maker_token, maker_amount, taker_token,
    // taker_amount, expiry, order_id, fee_bps) must NOT be what comes out.
    expect(keys).not.toEqual([
      'maker', 'taker', 'maker_token', 'maker_amount',
      'taker_token', 'taker_amount', 'expiry', 'order_id', 'fee_bps',
    ]);
  });
});

describe('toAtomic', () => {
  it("toAtomic('1.0000001') returns 10000001n", () => {
    expect(toAtomic('1.0000001')).toBe(10000001n);
  });

  it("toAtomic('0') returns 0n", () => {
    expect(toAtomic('0')).toBe(0n);
  });

  it('scales whole amounts by 10^7 without floating point', () => {
    expect(toAtomic('2')).toBe(20000000n);
    expect(toAtomic('123.4567891')).toBe(1234567891n);
  });

  it('pads short fractions rather than truncating them', () => {
    expect(toAtomic('0.1')).toBe(1000000n);
  });
});
