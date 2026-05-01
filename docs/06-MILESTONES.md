# StellarOTC — Implementation Milestones

---

## Milestone 1 — Clickable mock MVP flow ✅

**Status:** Complete  
**Scope:** Frontend-only prototype. No blockchain, no database, no wallet.

Deliverables:
- Home page (`/`) with product explanation and navigation
- RFQ list page (`/rfqs`) with mock open/closed RFQs
- New RFQ form (`/rfqs/new`) with asset, amount, and expiry fields
- RFQ detail page (`/rfqs/[id]`) with quote list and quote submission form
- Deal page (`/deals/[id]`) with escrow status timeline and mock actions
- All mock data in `apps/web/src/lib/mock-data.ts`

Acceptance criteria:
- `npm run build` passes
- User can navigate the full RFQ → quote → deal flow
- Deal page shows all five escrow steps interactively
- No real blockchain or database calls

---

## Milestone 2 — Supabase database layer

**Status:** Not started  
**Scope:** Replace mock data with real Supabase tables.

Planned deliverables:
- `supabase/migrations/001_initial_schema.sql` — rfqs, quotes, deals tables with RLS
- `apps/web/src/lib/supabase.ts` — Supabase client
- API helpers for CRUD on rfqs, quotes, deals
- Pages read from and write to real database
- `.env.local` wired up

---

## Milestone 3 — Soroban smart contract

**Status:** Not started  
**Scope:** Write and deploy the escrow contract to Stellar Testnet.

Planned deliverables:
- `contracts/rfq_escrow/src/lib.rs` — Soroban contract
- `initialize()`, `deposit()`, `settle()`, `refund()` functions
- Unit tests with soroban test utilities
- WASM build and testnet deployment
- `NEXT_PUBLIC_CONTRACT_ID` recorded

---

## Milestone 4 — Wallet and Stellar SDK integration

**Status:** Not started  
**Scope:** Wire Freighter wallet and on-chain transaction building.

Planned deliverables:
- `apps/web/src/lib/stellar.ts` — transaction helpers
- WalletContext with connect/disconnect
- `initializeEscrow(deal)` — calls contract initialize
- `depositToEscrow(deal, caller)` — calls contract deposit
- `settleEscrow(deal)` — calls contract settle
- `refundEscrow(deal)` — calls contract refund

---

## Milestone 5 — Full integration

**Status:** Not started  
**Scope:** Connect all layers end-to-end.

Planned deliverables:
- Real wallet signs all transactions
- Deal creation calls `initialize()` on-chain
- Deposit buttons call `deposit()` on-chain
- Settle/refund buttons call contract
- Supabase updated after each on-chain event
- E2E test: two Freighter accounts, full flow on testnet

---

## Milestone 6 — Polish and testnet deploy

**Status:** Not started  
**Scope:** Harden UX and deploy to Vercel.

Planned deliverables:
- Loading states, error messages, toast notifications
- Expired RFQ / wrong-caller error handling
- Vercel deployment with testnet env vars only
- E2E walkthrough recorded
