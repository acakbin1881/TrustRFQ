# StellarBig Agent Instructions

These instructions apply to every coding agent working in this repository.

## Product Identity

StellarBig is a Stellar testnet OTC platform built around:

- private RFQ creation
- private maker quotes
- manual quote acceptance by the RFQ creator
- escrow-backed settlement

Do not redesign this into any of the following:

- public auction
- bidding marketplace
- public order book
- AMM/swap UI
- automatic best-price winner
- market maker engine

The core rule is simple: makers submit private firm quotes; only the RFQ creator sees competing quotes and manually accepts one valid quote.

## Current Milestone State

Read these docs before changing product behavior:

- `docs/01-MILESTONES.md`
- `docs/02-DECISIONS.md`
- `docs/03-CURRENT-STATE.md`
- `docs/04-NEXT-TASK.md`
- `docs/05-M2-SUPABASE-TESTING.md`
- `docs/06-M3-XLM-USDC-ESCROW-PLAN.md`

Current checkpoint:

- Milestone 1 is complete: clickable private RFQ mock flow.
- Milestone 2 is complete: Supabase persistence, mock identity switcher, quote acceptance, deal creation, escrow events, expired RFQ sync, lint/build, and backend audit.
- Next work is Milestone 3 planning: Stellar-only XLM/USDC bilateral escrow settlement.
- Trustless Work P2P escrow is moved to Milestone 4 as a separate one-sided escrow use case.

## Hard Product Rules

Always preserve these rules:

- RFQ creator can see submitted quotes.
- Makers cannot see competing quotes.
- Makers cannot accept quotes.
- Minimum receive amount is a hard floor.
- Below-minimum quotes are invalid.
- Expired quotes are invalid.
- Closed or expired RFQs cannot receive quotes.
- RFQ creator manually accepts one valid, non-expired quote.
- Accepted quote closes the RFQ and rejects non-selected quotes.
- Accepted quote creates exactly one deal.
- Deal lifecycle is escrow settlement, not instant swap.

## Milestone Discipline

Work one milestone at a time.

Do not add wallet signing, Stellar SDK transactions, Soroban contracts, Trustless Work, auth, or production RLS unless the current task explicitly asks for it. M3 planning may discuss Soroban and wallet signing, but implementation must stay within the approved M3 plan.

If a requested feature belongs to a later milestone, say so and either:

- update docs/planning only, or
- ask before changing scope.

## Current Technical Shape

Repo layout:

```txt
apps/web/              Next.js app, TypeScript, Tailwind
contracts/rfq_escrow/  Future Soroban escrow contract area
packages/stellar/      Future shared Stellar helpers
supabase/migrations/   Supabase SQL migrations
docs/                  Product, milestone, and test docs
```

Important files:

```txt
apps/web/src/lib/mock-data.ts          Shared types and mock fallback data
apps/web/src/lib/supabase.ts           Supabase browser client
apps/web/src/lib/database.types.ts     Supabase table types
apps/web/src/lib/rfq-repository.ts     RFQ/quote/deal persistence helpers
apps/web/src/lib/identity.ts           Temporary M2 mock identity switcher
apps/web/src/components/IdentitySelector.tsx
apps/web/src/app/rfqs/page.tsx
apps/web/src/app/rfqs/new/page.tsx
apps/web/src/app/rfqs/[id]/page.tsx
apps/web/src/app/deals/[id]/page.tsx
supabase/migrations/001_initial_schema.sql
```

## Environment

Use testnet only.

Required app env vars live in `apps/web/.env.local` and Vercel env settings:

```txt
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_STELLAR_NETWORK=TESTNET
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_CONTRACT_ID=
```

Never commit `.env.local` or real secrets.

## Commands

From repo root:

```powershell
npm.cmd run lint
npm.cmd run build
npm run dev
```

On Windows, prefer `npm.cmd` for lint/build to avoid PowerShell execution policy issues.

## Backend Rules

Supabase tables for M2:

- `rfqs`
- `quotes`
- `deals`
- `escrow_events`

M2 uses permissive anon/authenticated RLS only for testnet MVP validation. Do not treat this as production security.

Repository behavior to preserve:

- If Supabase env vars are missing, fallback to mock data.
- If Supabase is configured, read/write Supabase.
- Deal status transitions must record escrow events.
- Expired open RFQs should be synchronized to `expired`.

## UI Rules

- Keep role separation obvious.
- Creator views may show quote lists and accept buttons.
- Maker views must not show competing quotes or accept buttons.
- UI copy should say private RFQ, firm quote, escrow settlement.
- Avoid auction/bid/outbid language.
- Keep test identity selector visible while M2/M3 testing still needs it.

## Documentation Rule

When changing behavior under `apps/`, `contracts/`, `packages/`, or `supabase/`, update docs if the current state or next task changed.

Use:

- `docs/03-CURRENT-STATE.md` for what works now and what remains mocked.
- `docs/04-NEXT-TASK.md` for the immediate next step.
- `docs/01-MILESTONES.md` only when milestone scope/status changes.
- `docs/02-DECISIONS.md` only when a product/architecture decision changes.
- `docs/05-M2-SUPABASE-TESTING.md`
- `docs/06-M3-XLM-USDC-ESCROW-PLAN.md` for M2 backend testing references.

## Definition of Done

A code task is not complete until:

- `npm.cmd run lint` passes.
- `npm.cmd run build` passes.
- Relevant browser smoke test passes when UI changed.
- Supabase/backend checks pass when persistence changed.
- Docs are accurate.
- No unrelated user or agent changes were reverted.