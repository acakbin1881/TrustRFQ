# Next Task

Last updated: 2026-05-01

---

## After Milestone 1 is complete

Next milestone is **Milestone 2 — Supabase schema + persistence**.

Do not start it yet. Wait for Milestone 1 to be fully signed off.

---

## Milestone 2 scope (preview)

Replace frontend-only mock state with real Supabase persistence. Keep the product model from Milestone 1 unchanged.

Planned deliverables:
- `supabase/migrations/001_initial_schema.sql`
- Tables: `rfqs`, `quotes`, `deals`, `escrow_events`
- Basic RLS policies
- `apps/web/src/lib/supabase.ts` — Supabase client wrapper
- Read/write helpers for each table
- RFQ creation writes to database
- Quote submission writes to database
- Accepting a quote creates a deal in database
- Pages read from Supabase instead of mock data
- `apps/web/.env.local.example`

Out of scope for M2:
- Freighter wallet
- Stellar SDK
- Soroban contract
- Real on-chain settlement
- Authentication beyond what Supabase MVP requires

---

## Remaining milestones

See `01-MILESTONES.md` for M3–M6 scope.
