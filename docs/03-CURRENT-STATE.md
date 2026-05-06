# Current State

Last updated: 2026-05-05

---

## What works

- Milestone 1 private RFQ mock flow is complete and committed.
- Milestone 2 Supabase persistence flow is complete.
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
- Full backend RFQ lifecycle is confirmed against Supabase:
  - RFQ creation writes to `rfqs`.
  - Maker quote submission writes to `quotes`.
  - Quote acceptance closes the RFQ, accepts the selected quote, rejects non-selected quotes, creates a deal, and records `deal_created`.
  - Funding and settlement status changes record escrow events.
  - Expired open RFQs are synchronized to `expired`.
  - Backend audit currently reports no consistency findings.
- Pages use repository helpers with automatic mock fallback when env vars are absent.
- Deal page loads deals through the repository and persists status transitions for backend-flow testing.
- Mock identity switcher is in the nav bar:
  - Three identities: RFQ Creator, Maker A, Maker B.
  - Selection persists in localStorage across page navigations.
  - Switching identity immediately changes creator/maker role detection across all pages.
  - Creator view vs maker view on RFQ detail, `your RFQ` label on RFQ list, and creatorAddress on new RFQ all use the selected identity.
  - Full creator -> maker flow can be tested in a single browser by switching identity.

---

## What is still temporary or mocked

- Identity is a mock switcher for testnet testing; no real wallet auth yet.
- Funding, settlement, and refund buttons are backend-state tests only; they are not real Stellar transactions.
- No real wallet transaction signing.
- No Stellar SDK transaction building.
- No Soroban escrow contract calls.
- No Trustless Work integration.

---

## What Milestone 2 tested

Milestone 2 tested whether the off-chain backend flow works:

- RFQs persist in Supabase.
- Quotes persist in Supabase.
- Creator/maker role rules are enforced in the app flow.
- Accepting a quote closes one RFQ, rejects other quotes, creates one deal, and records escrow events.
- Deal state transitions record funding and settlement events.

Milestone 2 did not test real wallet signing or real on-chain settlement.

---

## Verification

- `npm.cmd run lint` passes.
- `npm.cmd run build` passes.
- Full RFQ -> quote -> accept -> deal -> escrow events flow confirmed against Supabase.
- Backend audit counts: 7 RFQs, 6 quotes, 4 deals, 16 escrow events, 0 consistency findings.

---

## Milestone status

- Milestone 1: Complete.
- Milestone 2: Complete.
- Next: Milestone 3 planning for Stellar-only XLM/USDC bilateral escrow settlement. Trustless Work P2P escrow is moved to Milestone 4.