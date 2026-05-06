# Current State

Last updated: 2026-05-05

---

## What works

- Milestone 1 private RFQ mock flow is complete and committed.
- RFQ list, RFQ detail, new RFQ, and deal pages preserve the chosen model: private RFQ + bilateral escrow settlement.
- Creator and maker views remain separated in the application model:
  - RFQ creator can see submitted quotes and accept one valid quote.
  - Quote makers can submit their own quote but cannot see competing quotes or accept quotes.
- Minimum receive amount is a hard floor. Below-minimum quotes cannot be submitted or accepted.
- Closed or expired RFQs cannot receive quotes.
- Expired quotes cannot be accepted.
- Supabase is connected and confirmed working:
  - Supabase project live at `vzitlzzbdnnxigexopdj.supabase.co`
  - Migration `001_initial_schema.sql` applied; all 4 tables exist with RLS policies.
  - `apps/web/.env.local` configured with real project credentials.
  - RFQ creation writes to Supabase confirmed via browser + dashboard check.
- Pages use repository helpers with automatic mock fallback when env vars are absent.
- Deal page loads deals through the repository and persists status transitions for backend-flow testing.
- Mock identity switcher is in the nav bar:
  - Three identities: RFQ Creator (matches mock data), Maker A, Maker B.
  - Selection persists in localStorage across page navigations.
  - Switching identity immediately changes creator/maker role detection across all pages.
  - Creator view vs maker view on RFQ detail, "your RFQ" label on RFQ list, and creatorAddress on new RFQ all use the selected identity.
  - Full creator → maker flow can be tested in a single browser by switching identity.

---

## What is still temporary or mocked

- Identity is a mock switcher for testnet testing — no real wallet auth yet.
- Quote submission and deal creation through a real multi-user backend flow still need final verification.
- Funding, settlement, and refund buttons are UI/backend-state tests only; they are not real Stellar transactions.
- No real wallet transaction signing.
- No Stellar SDK transaction building.
- No Soroban escrow contract calls.
- No Trustless Work integration.

---

## What Milestone 2 is testing

Milestone 2 is testing whether the off-chain backend flow works:

- RFQs persist in Supabase.
- Quotes persist in Supabase.
- Creator/maker role rules are enforced in the app flow.
- Accepting a quote closes one RFQ, rejects other quotes, creates one deal, and records an escrow event.

Milestone 2 is not testing real wallet signing or real on-chain settlement yet.

---

## Verification

- `npm run lint` passes.
- `npm run build` passes.
- RFQ create -> Supabase write confirmed locally.

---

## Milestone status

- Milestone 1: Complete.
- Milestone 2: In progress. Supabase connected, RFQ writes confirmed, identity switcher implemented. Remaining work is smoke testing the full creator → quote → accept → deal flow against Supabase.
