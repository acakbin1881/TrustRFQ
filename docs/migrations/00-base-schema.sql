-- ---------------------------------------------------------------------------
-- TrustRFQ base schema: the orders table, settlement columns, and the
-- anon-grant hardening. Run this FIRST on a fresh Supabase project (SQL
-- Editor; the anon key cannot run DDL), then run
-- 2026-07-10-intent-layer.sql for the broadcast/intent tables.
--
-- Provenance: this is the consolidated setup SQL that lived in README.md
-- until the 2026-07-21 product-style rewrite dropped it (recovered from git
-- history during the 2026-08-17 docs audit). It matches the live schema of
-- Supabase project zaflldqvenbgfaxtzbjc.
-- ---------------------------------------------------------------------------

-- 1. The orders table + RLS + realtime -------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  maker_address text not null,
  maker_amount numeric not null,
  maker_token text not null,
  taker_address text not null,
  taker_amount numeric not null,
  taker_token text not null,
  expiration timestamptz not null,
  nonce text not null,
  signature text not null,         -- maker signature over signed_payload
  signed_payload text not null,    -- exact canonical message the maker signed
  taker_signature text,            -- taker signature over the accept/decline action
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (maker_address, nonce)
);
create index on public.orders (taker_address);
create index on public.orders (maker_address);

alter table public.orders enable row level security;

-- anon (no auth): explicit, permissive; integrity is enforced by signatures, not RLS
create policy orders_anon_select on public.orders for select to anon using (true);
create policy orders_anon_insert on public.orders for insert to anon with check (status = 'pending');
create policy orders_anon_update on public.orders for update to anon using (true) with check (true);

-- stream new offers + status changes to clients
alter publication supabase_realtime add table public.orders;

-- 2. Settlement columns ------------------------------------------------------

alter table public.orders
  add column settlement_status text not null default 'idle'
    check (settlement_status in ('idle','signing','ready','settling','settled','failed')),
  add column maker_auth text,   -- base64 XDR of the maker's signed SorobanAuthorizationEntry
  add column taker_auth text,   -- base64 XDR of the taker's signed SorobanAuthorizationEntry
  add column settle_tx_hash text,
  add column settle_error text,
  add column settled_at timestamptz;

-- 3. Anon-grant hardening ----------------------------------------------------

-- 3.1 Freeze the order TERMS after insert. The anon role may only advance workflow
--     columns; it can never rewrite addresses / tokens / expiration / nonce
--     (so a row can't be mutated between accept and sign). maker_amount and
--     taker_amount ARE grantable: the intent layer writes the accepted round's
--     amounts back onto the order row, and on-chain dual-auth over the exact
--     fill args remains the integrity boundary.
revoke update on public.orders from anon;
grant  update (status, taker_signature, updated_at,
               settlement_status, maker_auth, taker_auth,
               settle_tx_hash, settle_error, settled_at,
               maker_amount, taker_amount) on public.orders to anon;

-- 3.2 Reject markup / malformed values at the database (defense in depth behind the
--     client's HTML-escaping), and enforce positive amounts + address/token shape.
--     Clean up any pre-existing rows that violate these before adding the constraints.
alter table public.orders
  add constraint maker_amount_pos  check (maker_amount > 0),
  add constraint taker_amount_pos  check (taker_amount > 0),
  add constraint maker_addr_shape  check (maker_address ~ '^G[A-Z2-7]{55}$'),
  add constraint taker_addr_shape  check (taker_address ~ '^G[A-Z2-7]{55}$'),
  add constraint maker_token_shape check (maker_token ~ '^[A-Z0-9]{1,12}(:G[A-Z2-7]{55})?$'),
  add constraint taker_token_shape check (taker_token ~ '^[A-Z0-9]{1,12}(:G[A-Z2-7]{55})?$');
