-- Milestone 2 initial schema for StellarBig.
-- Product model: private RFQ + bilateral escrow settlement.

create extension if not exists pgcrypto;

create table if not exists public.rfqs (
  id uuid primary key default gen_random_uuid(),
  creator_address text not null,
  sell_asset text not null check (sell_asset in ('XLM', 'USDC', 'EURC')),
  sell_amount numeric(24, 7) not null check (sell_amount > 0),
  buy_asset text not null check (buy_asset in ('XLM', 'USDC', 'EURC')),
  min_buy_amount numeric(24, 7) not null check (min_buy_amount > 0),
  status text not null default 'open' check (status in ('open', 'closed', 'expired', 'cancelled')),
  invited_maker_address text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sell_asset <> buy_asset)
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  maker_address text not null,
  quote_amount numeric(24, 7) not null check (quote_amount > 0),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references public.rfqs(id) on delete restrict,
  quote_id uuid not null references public.quotes(id) on delete restrict,
  rfq_creator_address text not null,
  quote_maker_address text not null,
  rfq_creator_asset text not null check (rfq_creator_asset in ('XLM', 'USDC', 'EURC')),
  rfq_creator_amount numeric(24, 7) not null check (rfq_creator_amount > 0),
  quote_maker_asset text not null check (quote_maker_asset in ('XLM', 'USDC', 'EURC')),
  quote_maker_amount numeric(24, 7) not null check (quote_maker_amount > 0),
  status text not null default 'pending_deposits' check (status in ('pending_deposits', 'settled', 'refunded')),
  rfq_creator_deposited boolean not null default false,
  quote_maker_deposited boolean not null default false,
  expires_at timestamptz not null,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rfq_id),
  unique (quote_id)
);

create table if not exists public.escrow_events (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  event_type text not null check (event_type in (
    'deal_created',
    'rfq_creator_funded',
    'quote_maker_funded',
    'settled',
    'refunded',
    'expired'
  )),
  actor_address text,
  tx_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists rfqs_status_expires_at_idx on public.rfqs(status, expires_at);
create index if not exists rfqs_creator_address_idx on public.rfqs(creator_address);
create index if not exists quotes_rfq_id_idx on public.quotes(rfq_id);
create index if not exists quotes_maker_address_idx on public.quotes(maker_address);
create index if not exists deals_rfq_id_idx on public.deals(rfq_id);
create index if not exists deals_quote_id_idx on public.deals(quote_id);
create index if not exists escrow_events_deal_id_created_at_idx on public.escrow_events(deal_id, created_at);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_rfqs_updated_at on public.rfqs;
create trigger touch_rfqs_updated_at
before update on public.rfqs
for each row execute function public.touch_updated_at();

drop trigger if exists touch_quotes_updated_at on public.quotes;
create trigger touch_quotes_updated_at
before update on public.quotes
for each row execute function public.touch_updated_at();

drop trigger if exists touch_deals_updated_at on public.deals;
create trigger touch_deals_updated_at
before update on public.deals
for each row execute function public.touch_updated_at();

alter table public.rfqs enable row level security;
alter table public.quotes enable row level security;
alter table public.deals enable row level security;
alter table public.escrow_events enable row level security;

-- Testnet MVP policies. Wallet-authenticated RLS can replace these once auth is introduced.
drop policy if exists "rfqs readable by anon" on public.rfqs;
create policy "rfqs readable by anon" on public.rfqs for select to anon, authenticated using (true);

drop policy if exists "rfqs insertable by anon" on public.rfqs;
create policy "rfqs insertable by anon" on public.rfqs for insert to anon, authenticated with check (true);

drop policy if exists "rfqs updateable by anon" on public.rfqs;
create policy "rfqs updateable by anon" on public.rfqs for update to anon, authenticated using (true) with check (true);

drop policy if exists "quotes readable by anon" on public.quotes;
create policy "quotes readable by anon" on public.quotes for select to anon, authenticated using (true);

drop policy if exists "quotes insertable by anon" on public.quotes;
create policy "quotes insertable by anon" on public.quotes for insert to anon, authenticated with check (true);

drop policy if exists "quotes updateable by anon" on public.quotes;
create policy "quotes updateable by anon" on public.quotes for update to anon, authenticated using (true) with check (true);

drop policy if exists "deals readable by anon" on public.deals;
create policy "deals readable by anon" on public.deals for select to anon, authenticated using (true);

drop policy if exists "deals insertable by anon" on public.deals;
create policy "deals insertable by anon" on public.deals for insert to anon, authenticated with check (true);

drop policy if exists "deals updateable by anon" on public.deals;
create policy "deals updateable by anon" on public.deals for update to anon, authenticated using (true) with check (true);

drop policy if exists "escrow events readable by anon" on public.escrow_events;
create policy "escrow events readable by anon" on public.escrow_events for select to anon, authenticated using (true);

drop policy if exists "escrow events insertable by anon" on public.escrow_events;
create policy "escrow events insertable by anon" on public.escrow_events for insert to anon, authenticated with check (true);
