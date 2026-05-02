# Next Task

Last updated: 2026-05-01

---

## Immediate next step

Create a clean checkpoint/commit for **Milestone 1 complete**.

Suggested commit message:

```txt
Complete milestone 1 private RFQ mock flow
```

Before committing, stop the local dev server if you want to run the production build, because Windows may lock generated `.next` files while `localhost:3000` is running.

---

## Milestone 2 scope

Next milestone is **Milestone 2 — Supabase schema + persistence**.

Goal: replace frontend-only mock state with real Supabase persistence while keeping the Milestone 1 product model unchanged.

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
- Production authentication beyond what is strictly needed for the Supabase MVP

---

## Product model to preserve

- Private RFQ, not public auction
- RFQ creator sees submitted quotes
- Makers cannot see competing quotes
- RFQ creator manually accepts one valid quote
- Accepted quote creates one bilateral escrow deal
- RFQ creator funds the RFQ sell side
- Quote maker funds the quoted receive side
- Settlement is atomic once both sides are funded