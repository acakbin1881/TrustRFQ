# StellarBig Claude Instructions

Claude: read this before editing. This repo is easy to push in the wrong direction if you treat RFQs as auctions or swaps.

## Project Summary

StellarBig is a Stellar testnet OTC/RFQ product.

The chosen model is:

```txt
Private RFQ + private maker quotes + manual quote acceptance + escrow settlement
```

It is not:

- an auction
- a public bidding marketplace
- an order book
- an AMM
- an instant swap UI
- an automatic best-quote winner system

## Current Status

Milestone 1: complete.

- Clickable private RFQ mock flow.
- Correct creator/maker role separation.
- No database/blockchain/wallet.

Milestone 2: complete.

- Supabase schema and persistence are implemented.
- Mock identity switcher is implemented for testnet role testing.
- RFQ creation, quote submission, quote acceptance, deal creation, escrow events, expired RFQ sync, lint, build, and backend audit passed.
- Current backend audit: 7 RFQs, 6 quotes, 4 deals, 16 escrow events, 0 consistency findings.

Next: Milestone 3 planning.

- Milestone 3: Stellar-only XLM/USDC bilateral escrow settlement.
- Trustless Work P2P escrow is moved to Milestone 4 and must stay separate from the XLM/USDC bilateral path.

## Read These Docs First

Before changing behavior, read:

```txt
docs/01-MILESTONES.md
docs/02-DECISIONS.md
docs/03-CURRENT-STATE.md
docs/04-NEXT-TASK.md
docs/05-M2-SUPABASE-TESTING.md
docs/06-M3-XLM-USDC-ESCROW-PLAN.md
```

## Product Rules You Must Not Break

- RFQ creator sees submitted quotes.
- Makers cannot see competing quotes.
- Makers cannot accept quotes.
- Quotes below minimum receive amount are invalid.
- Expired quotes are invalid.
- Closed or expired RFQs cannot receive quotes.
- RFQ creator manually accepts one valid quote.
- Accepting a quote closes the RFQ.
- Non-selected quotes are rejected.
- A deal is created from the accepted quote.
- Escrow settlement comes after quote acceptance.

Do not use language like bid, outbid, auction winner, public bidding, order book, or swap unless explicitly discussing what StellarBig is not.

## Current App Architecture

Important files:

```txt
apps/web/src/lib/mock-data.ts          Types and mock fallback data
apps/web/src/lib/supabase.ts           Supabase client
apps/web/src/lib/database.types.ts     Database types
apps/web/src/lib/rfq-repository.ts     Supabase/mock repository layer
apps/web/src/lib/identity.ts           Temporary mock identity switcher
apps/web/src/components/IdentitySelector.tsx
apps/web/src/app/rfqs/page.tsx         RFQ list
apps/web/src/app/rfqs/new/page.tsx     RFQ creation
apps/web/src/app/rfqs/[id]/page.tsx    RFQ detail, creator/maker views
apps/web/src/app/deals/[id]/page.tsx   Deal lifecycle view
supabase/migrations/001_initial_schema.sql
```

## Current Temporary Pieces

These are intentional for now:

- Mock identity selector: RFQ Creator, Maker A, Maker B.
- Backend-state funding/settlement buttons.
- Supabase permissive testnet RLS.
- Mock fallback when Supabase env vars are missing.

Do not remove these unless the user explicitly asks or the milestone requires a replacement.

## What Is Out of Scope Unless Explicitly Asked

- Mainnet.
- Fiat rails.
- KYC.
- Multi-chain.
- Production auth.
- Production RLS hardening.
- Real wallet transaction signing.
- Stellar SDK transaction submission.
- Soroban contract implementation outside the approved M3 XLM/USDC plan.
- Trustless Work integration code before Milestone 4 planning is approved.

## Trustless Work Direction

The user wants to explore Trustless Work.

Current understanding:

- Trustless Work is useful for one-sided P2P/OTC escrow flows.
- It may not replace a two-sided USDC/XLM bilateral atomic settlement contract.
- Milestone 3 is the Stellar-only XLM/USDC bilateral settlement path.
- Milestone 4 should handle Trustless Work P2P escrow as a separate one-sided escrow use case.

Do not merge these two concepts accidentally.

## Commands

From repo root:

```powershell
npm.cmd run lint
npm.cmd run build
npm run dev
```

Use `npm.cmd` on Windows for lint/build.

## Docs Maintenance

If you change app, backend, contract, package, or migration behavior, update docs when state changes:

- `docs/03-CURRENT-STATE.md`
- `docs/04-NEXT-TASK.md`

Update `docs/01-MILESTONES.md` only for milestone scope/status changes.
Update `docs/02-DECISIONS.md` only for architecture/product decisions.

## Completion Checklist

Before saying a task is done:

1. Run `npm.cmd run lint`.
2. Run `npm.cmd run build`.
3. Smoke test changed UI if relevant.
4. Check Supabase if persistence changed.
5. Update docs if current state or next task changed.
6. Do not revert unrelated user/Codex changes.