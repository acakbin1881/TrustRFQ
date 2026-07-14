// ---------------------------------------------------------------------------
// Token allow-list + order display/validation helpers.
// ---------------------------------------------------------------------------
// The allow-list is a SECURITY control, not cosmetics: `tokenLabel` drops the
// issuer, so a look-alike asset with an attacker-controlled issuer
// (USDC:GATTACKER…) would render identically to the real one. Orders that
// reference an unknown token are quarantined — no Accept, no Sign — and shown
// with a warning plus the raw issuer so the user can see something is off.
//
// Unlike the vanilla esc(), nothing here escapes HTML: these values are
// rendered through JSX, which escapes text by default. Nothing in the app may
// use dangerouslySetInnerHTML.

import type { Order } from './types';

export interface TokenOption {
  /** stored on the order: code, or `CODE:ISSUER` for non-native */
  value: string;
  label: string;
}

export const TOKENS: TokenOption[] = [
  { value: 'XLM', label: 'XLM' },
  { value: 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', label: 'USDC' },
];

export const tokenLabel = (v: string): string => (v || '').split(':')[0] || v;
export const tokenIssuer = (v: string): string | undefined => (v || '').split(':')[1];

const TOKEN_VALUES = new Set(TOKENS.map((t) => t.value));
export const isKnownToken = (v: string): boolean => TOKEN_VALUES.has(v);
export const orderTokensKnown = (o: Pick<Order, 'maker_token' | 'taker_token'>): boolean =>
  isKnownToken(o.maker_token) && isKnownToken(o.taker_token);

export const ADDR_RE = /^G[A-Z2-7]{55}$/;

export const validAmount = (v: string): boolean => /^\d+(\.\d{1,7})?$/.test(v) && parseFloat(v) > 0;

export const isTxHash = (h?: string | null): boolean => /^[0-9a-f]{64}$/i.test(h || '');

export const isExpired = (o: Pick<Order, 'expiration'>, now: number = Date.now()): boolean =>
  new Date(o.expiration).getTime() < now;

// TEMPORARY (test aid): swap the three test wallets for readable names. Delete before shipping.
const TEST_ACCOUNT_LABELS: Record<string, string> = {
  GDPFKJXQCOFQXUH5A2QEHGQRCIUYYITVRGOQ6C6CUG3J722EHQZVPQG3: 'Account 1',
  GDVHQK45JAWPZ74QAMCX2LWLG4Y2HBWQK545PIPDR3XS6PHULKE4BNAU: 'Account 2',
  GCR5PZZTUPVJBFOET25U3A72XKP3C7QRDRDGJNCNSZQ7GFHX64CZY4LV: 'Account 3',
  GARMTL4QFLHWGXEY6JQET5D3DA744D2JQFMIQAGHTLIBVHSCLQ2NEAQU: 'Account 4',
};

export const trunc = (a?: string | null): string =>
  a ? (TEST_ACCOUNT_LABELS[a] ?? `${a.slice(0, 5)}…${a.slice(-5)}`) : '';

export function fmtRemaining(iso: string, now: number = Date.now()): string {
  let ms = new Date(iso).getTime() - now;
  if (ms <= 0) return 'expired';
  const d = Math.floor(ms / 86400000); ms -= d * 86400000;
  const h = Math.floor(ms / 3600000); ms -= h * 3600000;
  const m = Math.floor(ms / 60000);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}
