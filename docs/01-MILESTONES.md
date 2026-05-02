# Milestones

## Milestone 1 â€” Clickable mock MVP flow + correct private RFQ mechanism

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
  - Home â†’ RFQs â†’ New RFQ â†’ RFQ Detail â†’ Submit Quote â†’ Accept Quote â†’ Deal Page
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

## Milestone 2 â€” Supabase schema + persistence

**Status:** Not started  
**Scope:** Replace frontend-only mock state with real Supabase persistence.

Goal:
Persist RFQs, quotes, deals, and escrow events in Supabase while keeping the product model from Milestone 1 unchanged.

Planned deliverables:
- `supabase/migrations/001_initial_schema.sql`
- Tables:
  - `rfqs`
  - `quotes`
  - `deals`
  - `escrow_events`
- Basic RLS policies
- `apps/web/src/lib/supabase.ts`
- Supabase read/write helpers
- RFQ creation writes to database
- Quote submission writes to database
- Accepting a quote creates a deal in database
- Pages read from Supabase instead of mock data
- `.env.local.example`

Out of scope:
- Freighter wallet
- Stellar SDK
- Soroban contract
- Real on-chain settlement
- Authentication beyond what is strictly needed for Supabase MVP

---

## Milestone 3 â€” Soroban escrow contract

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

## Milestone 4 â€” Freighter + Stellar Testnet integration

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

## Milestone 5 â€” End-to-end testnet demo

**Status:** Not started  
**Scope:** Connect frontend, Supabase, Freighter, and Soroban into one working demo.

Goal:
Run the full RFQ â†’ quote â†’ accepted deal â†’ escrow settlement flow on Stellar testnet.

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

## Milestone 6 â€” Polish, validation, and testnet deploy

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