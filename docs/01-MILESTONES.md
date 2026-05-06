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

**Status:** Complete  
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
- Deal funding and settlement status changes record escrow events
- Expired open RFQs are synchronized to `expired`
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

## Milestone 3 - Stellar XLM/USDC bilateral escrow settlement

**Status:** Not started  
**Scope:** Design and build the Stellar-only escrow settlement path for XLM/USDC accepted RFQ deals.

Goal:
Create the core StellarBig settlement engine for XLM/USDC pairs: both counterparties fund escrow on Stellar, then the system releases both legs according to the accepted deal terms.

This milestone is only for Stellar-chain assets and only for the XLM/USDC pair. Do not add fiat, BTC, non-Stellar assets, order books, AMMs, or public bidding.

Planned deliverables:
- XLM/USDC-only deal path after quote acceptance
- Escrow state model:
  - DealCreated
  - RfqCreatorFunded
  - QuoteMakerFunded
  - ReadyToSettle
  - Settled
  - Refunded
  - Expired
- Funding rules:
  - RFQ creator funds the XLM side when selling XLM for USDC
  - Quote maker funds the USDC side
  - Settlement is not available until both sides are funded
- Settlement rules:
  - XLM releases to quote maker
  - USDC releases to RFQ creator
  - If expiry passes before both sides are funded, deposits are refundable to original depositors
- Supabase support for escrow contract IDs, transaction hashes, and on-chain status references
- Clear UI distinction between mocked backend-state buttons and real Stellar funding/settlement actions
- Testnet-only implementation plan

Acceptance criteria:
- Only XLM/USDC pair is supported in this milestone
- Accepted RFQ deal can move into escrow funding state
- Both sides must fund before settlement
- Settlement releases each asset to the opposite party
- Refund returns each side's own deposit after expiry
- Supabase records funding, settlement, refund, and tx references
- `npm.cmd run lint` passes
- `npm.cmd run build` passes

Out of scope:
- Trustless Work P2P escrow use case
- Fiat rails
- BTC or non-Stellar assets
- Mainnet
- Production auth/RLS hardening
- General multi-asset escrow beyond XLM/USDC

---

## Milestone 4 - Trustless Work P2P escrow use case

**Status:** Not started  
**Scope:** Add a separate Trustless Work P2P/OTC-style escrow flow after the core XLM/USDC Stellar settlement path is planned.

Goal:
Use Trustless Work for the use case it fits best: one-sided Stellar stablecoin escrow with conditional release, inspired by the Trustless Work P2P exchanges and OTC desks model.

This is separate from the XLM/USDC bilateral settlement path. Trustless Work P2P escrow should not be treated as a replacement for the two-sided XLM/USDC escrow unless their platform explicitly supports that model.

Planned deliverables:
- Trustless Work feasibility confirmation for the chosen P2P use case
- One-sided USDC or EURC escrow flow on Stellar
- Supabase fields/tables for Trustless Work escrow IDs, statuses, and tx hashes
- UI path for creating, funding, releasing, or refunding a Trustless Work escrow
- Documentation explaining how this differs from XLM/USDC bilateral settlement

Out of scope:
- Replacing the XLM/USDC bilateral settlement engine without explicit feasibility proof
- Fiat rails
- BTC/non-Stellar assets
- Mainnet

---

## Milestone 5 - End-to-end testnet demo

**Status:** Not started  
**Scope:** Connect frontend, Supabase, wallet signing, and the chosen escrow path into one working demo.

Goal:
Run the full RFQ -> quote -> accepted deal -> escrow funding -> settlement/refund flow on Stellar testnet.

Planned deliverables:
- RFQ created in frontend and stored in Supabase
- Maker submits quote
- RFQ creator accepts quote
- Deal is created
- Escrow is initialized
- RFQ creator funds escrow
- Quote maker funds escrow
- Escrow settles or refunds according to state
- Supabase updates after each escrow event
- UI shows final settled/refunded status
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
