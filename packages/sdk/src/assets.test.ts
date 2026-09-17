import { describe, expect, it } from 'vitest';
import { assetFor, sacIdFor, toAtomic, toStroops } from './assets';

const TESTNET = 'Test SDF Network ; September 2015';
const USDC = 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

describe('assetFor', () => {
  it('treats XLM (any case) and an empty string as the native asset', () => {
    expect(assetFor('XLM').native).toBe(true);
    expect(assetFor('xlm').native).toBe(true);
    expect(assetFor('').native).toBe(true);
  });
  it('splits CODE:ISSUER into a credit asset', () => {
    const { asset, native } = assetFor(USDC);
    expect(native).toBe(false);
    expect(asset.code).toBe('USDC');
    expect(asset.issuer).toBe('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
  });
});

describe('sacIdFor', () => {
  it('returns a C-address and is deterministic for the same passphrase', () => {
    const a = sacIdFor('XLM', TESTNET);
    expect(a).toMatch(/^C[A-Z2-7]{55}$/);
    expect(sacIdFor('XLM', TESTNET)).toBe(a);
  });
  it('differs across networks', () => {
    expect(sacIdFor('XLM', TESTNET)).not.toBe(sacIdFor('XLM', 'Public Global Stellar Network ; September 2015'));
  });
});

describe('toStroops', () => {
  it('scales a 7-decimal string to atomic units', () => {
    expect(toStroops('1')).toBe(10000000n);
    expect(toStroops('0.0000001')).toBe(1n);
    expect(toStroops('12.5')).toBe(125000000n);
  });
  it('truncates beyond seven decimals and toAtomic is the same function', () => {
    expect(toStroops('1.123456789')).toBe(11234567n);
    expect(toAtomic).toBe(toStroops);
  });
});
