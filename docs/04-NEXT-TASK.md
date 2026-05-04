# Next Task

Last updated: 2026-05-04

---

## Immediate next step

Connect a real Supabase project for Milestone 2.

Steps:
- Create or open a Supabase project.
- Copy `apps/web/.env.local.example` to `apps/web/.env.local`.
- Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Run `supabase/migrations/001_initial_schema.sql` in Supabase.
- Restart the web dev server.
- Smoke test:
  - Create RFQ writes to Supabase.
  - Maker submits quote writes to Supabase.
  - Creator accepts a valid quote and creates a deal.
  - Closed/expired RFQs reject new quotes.

---

## Product model to preserve

- Private RFQ, not public auction.
- RFQ creator sees submitted quotes.
- Makers cannot see competing quotes.
- RFQ creator manually accepts one valid quote.
- Accepted quote creates one bilateral escrow deal.
- RFQ creator funds the RFQ sell side.
- Quote maker funds the quoted receive side.
- Settlement uses escrow settlement with atomic final release.

---

## Still out of scope

- Freighter wallet.
- Stellar SDK.
- Soroban contract.
- Real on-chain settlement.
- Production auth.
- Trustless Work integration.