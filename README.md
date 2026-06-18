# TrustRFQ

Off-chain RFQ negotiation desk for block-trading XLM / USDC. Static frontend
(`otc.html`) backed by Supabase as a real, shared backend. Implements the
off-chain half of the AirSwap-style *Swap* protocol — **no wallet, no signatures,
no on-chain settlement** (acceptance is a mock terminal state).

One app, two peer roles via a top-bar **role switcher**:

- **Taker** — opens an RFQ (intent to trade), watches makers compete with
  time-limited quotes, **counters** for a better price, and **accepts** one.
- **Maker** — browses open RFQs (the Indexer feed), submits a price quote, and
  negotiates counters back and forth in real time.

Quotes carry a live **countdown** (expiry), an **Oracle** mid-price reference
with bps spread, and a full **counter-offer** loop. Updates stream live over
Supabase realtime — demo it by opening **two browser tabs**, one per role.

> No accounts: identity is just a display name you type, persisted in
> `localStorage`. Acceptance / "settlement" is mocked; the negotiation lifecycle
> (RFQ → quotes → counters → accept) is persisted in Supabase.

## Setup

1. Create a project at https://supabase.com.
2. In the SQL Editor, run the schema (extends `rfqs`, adds `quotes`, opens RLS,
   and enables realtime on both tables):

   ```sql
   -- base table (skip the create if you already have rfqs)
   create table if not exists public.rfqs (
     id uuid primary key default gen_random_uuid(),
     created_at timestamptz not null default now(),
     side text not null check (side in ('sell','buy')),
     amount numeric not null check (amount > 0),
     status text not null default 'open' check (status in ('open','settled','cancelled')),
     maker text,
     price numeric
   );

   -- negotiation columns
   alter table public.rfqs add column if not exists base_asset  text default 'XLM';
   alter table public.rfqs add column if not exists quote_asset text default 'USDC';
   alter table public.rfqs add column if not exists taker_name  text;
   alter table public.rfqs add column if not exists accepted_quote_id uuid;

   -- one row per price proposal; a "thread" = all rows sharing (rfq_id, maker_name)
   create table public.quotes (
     id             uuid primary key default gen_random_uuid(),
     created_at     timestamptz not null default now(),
     rfq_id         uuid not null references public.rfqs(id) on delete cascade,
     maker_name     text not null,
     maker_initials text,
     price          numeric not null check (price > 0),
     from_role      text not null default 'maker' check (from_role in ('maker','taker')),
     status         text not null default 'active'
                      check (status in ('active','superseded','accepted','rejected','expired')),
     expires_at     timestamptz not null,
     parent_id      uuid references public.quotes(id)   -- informational only
   );
   create index on public.quotes (rfq_id, created_at);
   create index on public.quotes (maker_name);

   -- Row Level Security: anon may read/insert/update (demo only, no auth)
   alter table public.rfqs   enable row level security;
   alter table public.quotes enable row level security;
   create policy "anon read rfqs"     on public.rfqs   for select using (true);
   create policy "anon insert rfqs"   on public.rfqs   for insert with check (true);
   create policy "anon update rfqs"   on public.rfqs   for update using (true) with check (true);
   create policy "anon read quotes"   on public.quotes for select using (true);
   create policy "anon insert quotes" on public.quotes for insert with check (true);
   create policy "anon update quotes" on public.quotes for update using (true) with check (true);

   -- realtime feeds (so quotes/counters/settles stream live)
   alter publication supabase_realtime add table public.rfqs;
   alter publication supabase_realtime add table public.quotes;
   ```

3. Project Settings → API → copy the **Project URL** and **anon public** key into
   `supabase-config.js`.
4. Serve the folder and open `otc.html`:

   ```
   npx serve
   ```

## Demo flow (two tabs)

1. **Tab A — Taker:** type a name, keep role **Taker**, set a size, click
   *Request quotes*. The RFQ goes `open`.
2. **Tab B — Maker:** type a maker name, switch role to **Maker**. The RFQ shows
   in the open feed; click it and send a quote with a short validity.
3. Tab A sees the quote arrive **live** with its bps-vs-oracle spread and a
   ticking countdown. Open more maker tabs to make offers compete — the best
   price floats to the top with a `★ BEST QUOTE` tag.
4. **Counter:** Tab A clicks *Counter* and sends a price; Tab B sees it and can
   *Accept* it or *Re-quote*. Repeat as a real back-and-forth.
5. **Accept:** Tab A accepts a standing maker quote → both tabs show the result;
   the RFQ leaves every maker's open feed. Expired quotes dim and can't be
   accepted until re-quoted.

## How it maps to the whitepaper

- *Indexer* (intent to trade) → the shared `rfqs` table / open-RFQ feed.
- *Quote / Order API* (`provideQuote` / `provideOrder`) → rows in `quotes`, one
  negotiation thread per `(rfq, maker)`.
- *Oracle* (`getPrice`) → the client-side mid + bps spread.
- *Smart Contract* `fillOrder` → a mock "accepted" terminal state (out of scope).

## Files

- `otc.html` — the OTC desk app: role switcher, Taker & Maker views, Supabase
  data layer, realtime, oracle, countdown, counter-offer negotiation.
- `hero.html` — marketing landing page.
- `supabase-config.js` — your Supabase URL + anon key (edit this).
