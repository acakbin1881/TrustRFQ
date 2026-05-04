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
- Supabase Milestone 2 foundation is now in place:
  - Initial schema migration exists.
  - Supabase client helper exists.
  - Repository helpers exist for RFQs, quotes, deals, and escrow events.
  - `.env.local.example` documents required Supabase and Stellar testnet variables.
- Pages now use repository helpers. If Supabase env vars are configured, they read/write Supabase. If not, they fall back to the Milestone 1 mock data.
- Deal page can load a deal through the repository and persist mock/Supabase status transitions for funding, settlement, and refund.

---

## What is still mocked

- `CURRENT_USER_ADDRESS` is still a mock identity.
- There is no real authentication or wallet identity yet.
- Funding, settlement, and refund buttons are still UI/testnet-prep actions, not real Stellar transactions.
- No Freighter wallet integration.
- No Stellar SDK transaction building.
- No Soroban escrow contract calls.
- No Trustless Work integration.

---

## Verification

- `npm.cmd run lint` passes.
- `npm.cmd run build` passes.

---

## Milestone status

- Milestone 1: Complete.
- Milestone 2: In progress. First persistence slice is implemented; next step is to connect a real Supabase project and run the migration.