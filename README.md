# TrustRFQ

Off-chain RFQ negotiation desk for block-trading XLM / USDC. Static frontend
(`otc.html`) backed by Supabase as a real, shared backend. Implements the
off-chain half of the AirSwap-style *Swap* protocol — **no wallet, no signatures,
no on-chain settlement** (acceptance is a mock terminal state).

One app, two peer roles via a top-bar **role switcher**:

- **Taker** — builds an RFQ ticket by choosing the **token to receive**
  (`makerToken`) + amount and the **token to pay** (`takerToken`) — XLM or USDC —
  then either **gets an indicative quote** (`getQuote`) or **requests a firm,
  signed order** (`getOrder`). Watches makers compete with time-limited
  responses, **counters** for a better price, and **accepts** a signed order.
- **Maker** — browses open requests (the Indexer feed), and responds in kind:
  `provideQuote` (indicative) to a quote request, or `provideOrder` (a signed,
  executable order carrying `expiration` / `nonce` / `signature`) to an order
  request, negotiating counters back and forth in real time.

### Peer Protocol (off-chain RPCs)

Implemented as a `Peer` namespace in `otc.html`, with spec-faithful signatures:

| RPC | Caller → Callee | Meaning |
| --- | --- | --- |
| `getOrder(makerAmount, makerToken, takerToken, takerAddress)` | Taker → Maker | "I want to buy 10 XLM using USDC." |
| `provideOrder(makerAddress, makerAmount, makerToken, takerAddress, takerAmount, takerToken, expiration, nonce, signature)` | Maker → Taker | "I'll sell you 10 XLM for 5 USDC." (signed) |
| `getQuote(makerAmount, makerToken, takerTokens)` | Taker → Maker | "How much to buy 10 XLM using USDC?" |
| `provideQuote(makerAmount, makerToken, takerAmounts)` | Maker → Taker | "It'll cost you 5 USDC for 10 XLM." (indicative) |
| `getPrice(makerToken, takerToken)` | Maker/Taker → Oracle | "What is the price of XLM for USDC?" |
| `providePrice(makerToken, takerToken, price)` | Oracle → Maker/Taker | "The price of XLM for USDC is 0.12." (suggestion) |

> Tokens are limited to **XLM** and **USDC** on Soroban. `expiration` / `nonce` /
> `signature` are **mocked** (no wallet, no on-chain settlement yet) and shown on
> the order card as a "Signed order" badge. An indicative quote is not
> executable; the taker can **escalate** it to a firm order (`request_kind`
> flips `quote → order`), prompting the maker to send a signed order.

Quotes carry a live **countdown** (expiry), an **Oracle** mid-price reference
with bps spread, and a full **counter-offer** loop. Updates stream live over
Supabase realtime — demo it by opening **two browser tabs**, one per role.

The **Oracle** is a gently-live mock price feed (drifts a few bps every few
seconds). A **Maker** consults `getPrice` while pricing — the desk shows the fair
total with a one-click **Use** button. A **Taker** consults `getPrice` to verify
a received order — each offer card shows a live fairness badge (**Oracle ✓ fair**
within ±15 bps, else **⚠ N bps over fair**). Oracle prices are suggestions only,
never executable.

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

   -- peer-protocol order envelope (getOrder / getQuote)
   alter table public.rfqs add column if not exists maker_token   text default 'XLM';   -- token the taker wants to receive
   alter table public.rfqs add column if not exists taker_token   text default 'USDC';  -- token the taker pays with
   alter table public.rfqs add column if not exists maker_amount  numeric;              -- makerAmount (in maker_token)
   alter table public.rfqs add column if not exists taker_address text;
   alter table public.rfqs add column if not exists request_kind  text default 'order'
     check (request_kind in ('quote','order'));   -- 'quote' = indicative, 'order' = firm/signed

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

   -- peer-protocol response envelope (provideOrder / provideQuote)
   alter table public.quotes add column if not exists response_kind text default 'order'
     check (response_kind in ('quote','order'));  -- 'quote' = indicative, 'order' = signed/executable
   alter table public.quotes add column if not exists maker_address text;
   alter table public.quotes add column if not exists taker_amount  numeric;  -- takerAmount (in taker_token)
   alter table public.quotes add column if not exists nonce         text;     -- mock (no on-chain yet)
   alter table public.quotes add column if not exists signature     text;     -- mock '0x…' (no wallet yet)

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

1. **Tab A — Taker:** type a name, keep role **Taker**. In the RFQ ticket pick
   the token to **receive** (`makerToken`, XLM or USDC) and an amount — the
   **pay** token auto-sets to the other. Click *Get indicative quote* (`getQuote`)
   or *Request firm order* (`getOrder`). The RFQ goes `open`.
2. **Tab B — Maker:** type a maker name, switch role to **Maker**. The request
   shows in the open feed tagged **QUOTE** or **ORDER**; click it and respond —
   *Send indicative quote* or *Send signed order* — with a short validity.
3. Tab A sees the response arrive **live** with its bps-vs-oracle spread and a
   ticking countdown. A signed order shows a **Signed order** badge (nonce + sig).
   Open more maker tabs to make offers compete — the best price floats to the top
   with a `★ BEST QUOTE` tag.
4. **Escalate:** if Tab A only asked for an indicative quote, click *Request firm
   order* on the card to flip it to an order — Tab B is then prompted to send a
   signed order.
5. **Counter:** Tab A clicks *Counter* and sends a price; Tab B sees it and can
   *Accept* it or *Re-quote*. Repeat as a real back-and-forth.
6. **Accept:** Tab A accepts a standing signed order → both tabs show the result;
   the RFQ leaves every maker's open feed. Expired quotes dim and can't be
   accepted until re-quoted.

## How it maps to the whitepaper

- *Indexer* (intent to trade) → the shared `rfqs` table / open-RFQ feed; each row
  carries the order envelope (`maker_token`, `taker_token`, `maker_amount`,
  `taker_address`, `request_kind`).
- *Order API* (`getOrder` / `provideOrder`) → an `rfqs` row with
  `request_kind='order'` + `quotes` rows with `response_kind='order'` carrying
  `expiration` / `nonce` / `signature` (mocked).
- *Quote API* (`getQuote` / `provideQuote`) → `request_kind='quote'` +
  `response_kind='quote'`, indicative and non-executable.
- *Oracle* (`getPrice` / `providePrice`) → the `oracle` service: a gently-live
  mock mid + bps spread. Maker uses it to price (fair-total + **Use**); Taker uses
  it to verify (per-card fairness badge). Suggestions only, not executable.
- *Smart Contract* `fillOrder` → a mock "accepted" terminal state (out of scope).

## Files

- `otc.html` — the OTC desk app: role switcher, Taker & Maker views, Supabase
  data layer, realtime, oracle, countdown, counter-offer negotiation.
- `hero.html` — marketing landing page.
- `supabase-config.js` — your Supabase URL + anon key (edit this).
