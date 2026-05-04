# Current State

Last updated: 2026-05-04

---

## What works

- Milestone 1 private RFQ mock flow is complete and committed.
- RFQ list, RFQ detail, new RFQ, and deal pages preserve the chosen model: private RFQ + bilateral escrow settlement.
- Creator and maker views remain separated:
  - RFQ creator can see submitted quotes and accept one valid quote.
  - Quote makers can submit their own quote but cannot see competing quotes or accept quotes.
- Minimum receive amount is a hard floor. Below-minimum quotes cannot be submitted or accepted.
- Closed or expired RFQs cannot receive quotes.
- Expired quotes cannot be accepted.
- Supabase is connected and confirmed working:
  - Supabase project live at `vzitlzzbdnnxigexopdj.supabase.co`
  - Migration `001_initial_schema.sql` applied — all 4 tables exist with RLS policies.
  - `apps/web/.env.local` configured with real project credentials.
  - RFQ creation writes to Supabase confirmed via browser + dashboard check.
- Pages use repository helpers with automatic mock fallback when env vars are absent.
- Deal page loads deals through the repository and persists status transitions (funding, settlement, refund).

---

## What is still mocked

- `CURRENT_USER_ADDRESS` is still a mock identity — no real wallet auth yet.
- Quote submission and deal creation via real multi-user flow not yet confirmed (Vercel deployment pending for multi-user testing).
- Funding, settlement, and refund buttons are UI-only — not real Stellar transactions.
- No Freighter wallet integration.
- No Stellar SDK transaction building.
- No Soroban escrow contract calls.
- No Trustless Work integration.

---

## Verification

- `npm run lint` passes.
- `npm run build` passes.
- RFQ create → Supabase write confirmed locally.

---

## Milestone status

- Milestone 1: Complete.
- Milestone 2: In progress. Supabase connected and RFQ writes confirmed. Vercel deployment in progress for multi-user quote/deal testing.
