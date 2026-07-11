// Shape of a row in public.orders (see README schema + CLAUDE.md data model).
// All DB strings are attacker-writable (anon key, no auth) — integrity is
// enforced by wallet signatures and the on-chain fill, never by trusting these.

export type OrderStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
export type SettlementStatus = 'idle' | 'signing' | 'ready' | 'settling' | 'settled' | 'failed';

export interface Order {
  id: string;
  created_at: string;
  updated_at?: string | null;

  maker_address: string;
  maker_amount: string;
  maker_token: string;
  taker_address: string;
  taker_amount: string;
  taker_token: string;

  expiration: string;
  nonce: string;
  signature: string;
  signed_payload: string;
  taker_signature?: string | null;
  status: OrderStatus;

  settlement_status?: SettlementStatus | null;
  maker_auth?: string | null;
  taker_auth?: string | null;
  settle_tx_hash?: string | null;
  settle_error?: string | null;
  settled_at?: string | null;
}

/** My role in an order: did this wallet create it (maker) or receive it (taker)? */
export type Side = 'maker' | 'taker';
