// Asset helpers shared by every signing path. Pure: no network, no wallet, no
// globals. The passphrase is an argument so the same code serves any network
// and stays pinned by golden vectors.

import { Asset } from '@stellar/stellar-sdk';

/** token string ('XLM' | 'CODE:ISSUER') -> Asset */
export function assetFor(tokenStr: string): { asset: Asset; native: boolean } {
  if (!tokenStr || tokenStr.toUpperCase() === 'XLM') return { asset: Asset.native(), native: true };
  const [code, issuer] = tokenStr.split(':');
  return { asset: new Asset(code, issuer), native: false };
}

/** token string -> its Stellar Asset Contract id ('C...') on the given network */
export function sacIdFor(tokenStr: string, passphrase: string): string {
  return assetFor(tokenStr).asset.contractId(passphrase);
}

/** decimal string (up to 7 decimals) -> i128 atomic units as a BigInt; extra decimals are truncated */
export function toStroops(s: string): bigint {
  const [whole, frac = ''] = String(s).split('.');
  return BigInt(whole || '0') * 10000000n + BigInt((frac + '0000000').slice(0, 7));
}

/** The same conversion under the name the RFQ wire uses. */
export const toAtomic = toStroops;

/**
 * Reverse lookup: a SAC id -> the curated token string it derives from, or
 * null when the id is not on the caller's allow-list. Never trusts a token
 * address arriving inside a maker's response.
 */
export function tokenForSac(sacId: string, passphrase: string, allowedTokens: readonly string[]): string | null {
  for (const t of allowedTokens) {
    if (sacIdFor(t, passphrase) === sacId) return t;
  }
  return null;
}
