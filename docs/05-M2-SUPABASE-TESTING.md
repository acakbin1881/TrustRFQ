# Milestone 2 Supabase Testing

Last updated: 2026-05-05

Supabase project:

- Dashboard: https://supabase.com/dashboard/project/vzitlzzbdnnxigexopdj
- Project ref: `vzitlzzbdnnxigexopdj`
- Local migration: `supabase/migrations/001_initial_schema.sql`

Do not put Supabase secrets in this file. Keep real values in `.env.local` and Vercel environment variables only.

---

## Purpose

Milestone 2 tests the off-chain backend flow for StellarBig:

- RFQs are persisted in Supabase.
- Quotes are persisted in Supabase.
- Accepted quotes create deals.
- Escrow events are recorded for backend state changes.
- Creator and maker role rules work at the app flow level.

Milestone 2 does not test real wallet signing, Soroban escrow execution, Stellar SDK transactions, or real on-chain settlement.

---

## Required Environment Variables

Local development uses `apps/web/.env.local`.

Vercel must have the same public testnet variables:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_STELLAR_NETWORK=TESTNET
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_CONTRACT_ID
```

`NEXT_PUBLIC_CONTRACT_ID` can stay empty until the Soroban escrow milestone.

---

## Tables

Milestone 2 uses four Supabase tables.

`rfqs`

- Stores private RFQ requests.
- Key fields: `creator_address`, `sell_asset`, `sell_amount`, `buy_asset`, `min_buy_amount`, `status`, `expires_at`.
- Expected statuses: `open`, `closed`, `expired`, `cancelled`.

`quotes`

- Stores maker quotes for one RFQ.
- Key fields: `rfq_id`, `maker_address`, `quote_amount`, `status`, `expires_at`.
- Expected statuses: `pending`, `accepted`, `rejected`.

`deals`

- Stores the single bilateral deal created from one accepted quote.
- Key fields: `rfq_id`, `quote_id`, `rfq_creator_address`, `quote_maker_address`, asset/amount fields, deposit booleans, `status`.
- Expected statuses: `pending_deposits`, `settled`, `refunded`.
- Constraints: one deal per RFQ and one deal per quote.

`escrow_events`

- Stores backend event history for a deal.
- Expected event types: `deal_created`, `rfq_creator_funded`, `quote_maker_funded`, `settled`, `refunded`, `expired`.
- `tx_hash` remains empty until real Stellar transactions exist.

---

## RLS Status

The current migration enables RLS on all four tables and adds permissive `anon` / `authenticated` policies for the testnet MVP.

This is intentional for Milestone 2 because the goal is to validate persistence and RFQ lifecycle behavior before production auth and wallet-based permissions.

Before a production or mainnet path, RLS must become stricter and wallet/auth identity must be enforced server-side.

---

## Identity During M2

A mock identity switcher is in the nav bar. Three fixed test addresses are available:

- **RFQ Creator** — creates RFQs and accepts quotes. Address matches the existing mock data.
- **Maker A** — submits quotes as a distinct maker.
- **Maker B** — a second distinct maker for multi-quote scenarios.

Selection persists in `localStorage`. Switching identity immediately changes the creator/maker role detection on all pages. The full creator → maker flow can be tested in a single browser without separate devices.

The identity layer is only for backend-flow testing. Real wallet transaction signing remains out of scope.

---

## Smoke Test

1. Start with Supabase env vars configured (`npm run dev` or Vercel deployment).
2. In the nav, select **RFQ Creator**. Create a new RFQ.
3. In Supabase, confirm a new row exists in `rfqs` with the correct `creator_address`.
4. In the nav, switch to **Maker A**. Open that RFQ. Confirm the maker view is shown (quote submit form, no competing quotes visible).
5. Submit a valid quote. In Supabase, confirm a new row exists in `quotes`.
6. Switch back to **RFQ Creator**. Open the same RFQ. Confirm the creator view is shown (submitted quotes list with accept buttons).
7. Optionally switch to **Maker B** and submit a second quote to test multi-quote rejection.
8. Switch to **RFQ Creator** and accept one valid quote.
9. In Supabase, confirm:
    - `rfqs.status` changed to `closed`
    - selected `quotes.status` changed to `accepted`
    - non-selected quotes changed to `rejected`
    - one `deals` row was created
    - one `escrow_events` row was created with `event_type = deal_created`
    - funding actions create `rfq_creator_funded` and `quote_maker_funded` events
    - settlement creates a `settled` event
10. Switch to **Maker A** or **Maker B** and try submitting a new quote on the closed RFQ. Confirm it is blocked.
11. Run `npm run lint`.
12. Run `npm run build`.

---

## Useful Dashboard Checks

Use the Supabase table editor or SQL editor. Do not expose service-role keys or private credentials in screenshots or docs.

Recent RFQs:

```sql
select id, creator_address, sell_asset, sell_amount, buy_asset, min_buy_amount, status, expires_at, created_at
from public.rfqs
order by created_at desc
limit 10;
```

Quotes for a specific RFQ:

```sql
select id, rfq_id, maker_address, quote_amount, status, expires_at, created_at
from public.quotes
where rfq_id = '<rfq_id>'
order by created_at asc;
```

Deal created from an RFQ:

```sql
select id, rfq_id, quote_id, rfq_creator_address, quote_maker_address, status, created_at
from public.deals
where rfq_id = '<rfq_id>';
```

Escrow events for a deal:

```sql
select id, deal_id, event_type, actor_address, tx_hash, metadata, created_at
from public.escrow_events
where deal_id = '<deal_id>'
order by created_at asc;
```

---

## Pass Criteria

Milestone 2 can be considered complete when:

- RFQ creation writes to Supabase.
- Maker quote submission writes to Supabase.
- Creator can see quotes, maker cannot see competing quotes.
- Creator can accept one valid quote.
- Accepting a quote closes the RFQ.
- Non-selected quotes are rejected.
- A deal row is created.
- A `deal_created` escrow event is recorded.
- Funding actions record `rfq_creator_funded` and `quote_maker_funded` escrow events.
- Settlement records a `settled` escrow event.
- Expired open RFQs are synchronized to `expired`.
- Closed or expired RFQs reject new quotes.
- Below-minimum and expired quotes cannot be accepted.
- `npm.cmd run lint` passes.
- `npm.cmd run build` passes.
