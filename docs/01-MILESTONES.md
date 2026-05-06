# Milestones

## Milestone 1 — Clickable mock MVP flow + correct private RFQ mechanism

**Status:** Complete  
**Scope:** Frontend-only prototype. No blockchain, no database, no wallet.

Goal:
Create a clickable mock product that clearly represents a private RFQ + escrow settlement flow.

This milestone is not complete until the product clearly behaves like private RFQ, not public bidding.

Deliverables:
- Home page (`/`) with product explanation and navigation
- RFQ list page (`/rfqs`) with mock RFQs
- New RFQ form (`/rfqs/new`) with:
  - sell asset
  - sell amount
  - receive asset
  - minimum receive amount
  - expiry
  - optional counterparty / private RFQ mode
- RFQ detail page (`/rfqs/[id]`) with role-based views:
  - Creator view: submitted quotes, accept buttons, below-minimum grouping, "only you can see quotes" note
  - Maker view: quote submission form only, no competing quotes visible, confirmation after submit
  - Role determined by `CURRENT_USER_ADDRESS` vs `rfq.creatorAddress` (mock identity)
- Deal page (`/deals/[id]`) with:
  - accepted quote details
  - escrow status timeline
  - mock actions for funding, settlement, and refund
- Mock data in `apps/web/src/lib/mock-data.ts`
- OTC-size mock examples, not tiny retail swap examples
- Updated docs:
  - `docs/01-MILESTONES.md`
  - `docs/02-DECISIONS.md`
  - `docs/03-CURRENT-STATE.md`
  - `docs/04-NEXT-TASK.md`

Product rules:
- This is private RFQ + escrow settlement
- This is not public auction
- This is not bidding marketplace
- This is not order book
- This is not AMM swap
- Quotes are hidden from competing makers
- RFQ creator can see submitted quotes
- Makers cannot see competing quotes
- Minimum receive amount is a hard floor
- Quotes below minimum are invalid
- Best quote does not automatically win
- RFQ creator manually accepts one valid quote
- Accepted quote closes the RFQ and creates a deal
- Deal moves into escrow settlement

Acceptance criteria:
- `npm run build` passes
- `npm run lint` passes if available
- User can navigate the full flow:
  - Home → RFQs → New RFQ → RFQ Detail → Submit Quote → Accept Quote → Deal Page
- UI clearly says this is private RFQ, not public bidding
- No language implies auction, bidding, outbidding, or automatic best-price winner
- Below-minimum quotes cannot be accepted
- Deal page shows escrow lifecycle interactively with RFQ creator and quote maker funding roles
- No real blockchain calls
- No real database calls
- No wallet integration
- No authentication
- No backend/API logic

---

## Milestone 2 — Supabase schema + persistence

**Status:** In progress  
**Scope:** Replace frontend-only mock state with real Supabase persistence and test the backend RFQ lifecycle.

Goal:
Persist RFQs, quotes, deals, and escrow events in Supabase while keeping the product model from Milestone 1 unchanged.

This milestone tests the backend/application flow, not wallet or blockchain settlement. A temporary frontend identity layer may be used only to exercise creator and maker roles against real Supabase records. Different devices do not automatically mean different users until a real identity source exists.

Planned deliverables:
- `supabase/migrations/001_initial_schema.sql` (done)
- Tables:
  - `rfqs`
  - `quotes`
  - `deals`
  - `escrow_events`
- Basic RLS policies (done for testnet MVP)
- `apps/web/src/lib/supabase.ts` (done)
- Supabase read/write helpers (first slice done in `apps/web/src/lib/rfq-repository.ts`)
- RFQ creation writes to Supabase when env vars are configured; otherwise mock fallback
- Quote submission writes to Supabase when env vars are configured; otherwise mock fallback
- Accepting a quote closes the RFQ, rejects other quotes, creates a deal, and records an escrow event in Supabase
- RFQ list, RFQ detail, and deal pages read through repository helpers with Supabase/mock fallback
- Temporary creator/maker identity mechanism for testing role-based persistence before wallet/auth
- `.env.local.example` (done)

Acceptance criteria:
- RFQ creation writes to the `rfqs` table
- Maker quote submission writes to the `quotes` table
- RFQ creator can see submitted quotes; makers cannot see competing quotes
- RFQ creator can accept one valid, non-expired quote
- Accepting a quote closes the RFQ, rejects non-selected quotes, creates a `deals` row, and creates an `escrow_events` row
- Closed or expired RFQs reject new quotes
- Below-minimum and expired quotes cannot be accepted
- `npm.cmd run lint` passes
- `npm.cmd run build` passes

Out of scope:
- Real wallet transaction signing
- Stellar SDK transaction building
- Soroban contract
- Real on-chain settlement
- Production authentication beyond what is strictly needed for Supabase MVP

---

## Milestone 3 — Soroban escrow contract

**Status:** Not started  
**Scope:** Write and test the escrow contract for accepted deals.

Goal:
Create the testnet escrow contract that can hold both sides of an accepted RFQ deal and settle or refund.

Planned deliverables:
- `contracts/rfq_escrow/src/lib.rs`
- Contract state machine:
  - Created
  - MakerFunded
  - TakerFunded
  - ReadyToSettle
  - Settled
  - Refunded
  - Expired
- Contract functions:
  - `initialize_deal()`
  - `fund_maker_side()`
  - `fund_taker_side()`
  - `settle()`
  - `refund_after_expiry()`
  - `get_deal()`
- Unit tests with Soroban test utilities
- WASM build
- Testnet deployment plan

Out of scope:
- Frontend wallet integration
- Production security audit
- Mainnet deployment

---

## Milestone 4 — Freighter + Stellar Testnet integration

**Status:** Not started  
**Scope:** Connect wallet and build real testnet transactions.

Goal:
Allow users to connect Freighter and interact with the Soroban escrow contract on Stellar testnet.

Planned deliverables:
- `apps/web/src/lib/stellar.ts`
- Wallet connect/disconnect
- Testnet network checks
- Transaction helpers:
  - initialize escrow
  - fund maker side
  - fund taker side
  - settle
  - refund after expiry
- Store transaction hashes in Supabase
- Display explorer links

Out of scope:
- Mainnet
- Fiat
- KYC
- Multi-chain

---

## Milestone 5 — End-to-end testnet demo

**Status:** Not started  
**Scope:** Connect frontend, Supabase, Freighter, and Soroban into one working demo.

Goal:
Run the full RFQ → quote → accepted deal → escrow settlement flow on Stellar testnet.

Planned deliverables:
- RFQ created in frontend and stored in Supabase
- Maker submits quote
- RFQ creator accepts quote
- Deal is created
- Escrow contract initialized
- Maker funds escrow
- Taker funds escrow
- Contract settles atomically
- Supabase updates after each on-chain event
- UI shows final settled status
- E2E walkthrough with two testnet accounts

---

## Milestone 6 — Polish, validation, and testnet deploy

**Status:** Not started  
**Scope:** Harden UX, deploy the demo, and prepare validation materials.

Goal:
Make the testnet demo usable enough to show to Stellar builders, potential makers, and grant reviewers.

Planned deliverables:
- Loading states
- Error messages
- Toast notifications
- Expired RFQ handling
- Wrong-caller handling
- Empty states
- Vercel deployment with testnet env vars only
- Demo script
- Short walkthrough recording
- Validation notes from user interviews / Stellar community feedback