# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from repo root on Windows:

```powershell
npm run dev          # start Next.js dev server (apps/web)
npm run build        # production build
npm run lint         # ESLint
npx tsc --noEmit --project apps/web/tsconfig.json  # typecheck
```

There is no test runner configured. Use lint and typecheck to verify changes.

`apps/web` also has `npm run dev:turbo` for Turbopack if webpack is slow.

## Architecture

This is an npm workspaces monorepo. Only `apps/web` is active. `apps/stellar` and `packages/stellar` are legacy Soroban folders — do not modify them.

**`apps/web`** — Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4.

### Routes

- `/` — demo entry / RFQ list
- `/rfqs` — RFQ list
- `/rfqs/new` — create RFQ
- `/rfqs/[id]` — RFQ detail and quote comparison (creator view) / quote submission (maker view)
- `/deals/[id]` — deal detail and escrow timeline

### Data layer

All reads and writes go through `src/lib/rfq-repository.ts`. It operates in two modes:

- **Supabase mode** (when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in `.env.local`): reads/writes to four Supabase tables — `rfqs`, `quotes`, `deals`, `escrow_events`.
- **Mock mode** (env vars absent): returns static data from `src/lib/mock-data.ts`. Mutation functions return plausible in-memory responses but do not persist across page loads.

### Domain types

Defined in `src/lib/mock-data.ts`:

- `Rfq` — `status: RfqStatus` (`"open" | "closed" | "expired" | "cancelled"`)
- `Quote` — `status: QuoteStatus` (`"pending" | "accepted" | "rejected"`)
- `Deal` — `status: DealStatus` (`"pending_deposits" | "settled" | "refunded"`)
- `AssetCode` — `"XLM" | "USDC" | "EURC"`

The Supabase schema shape lives in `src/lib/database.types.ts`.

**Important:** `DealStatus` has only three values. The UI derives richer escrow states (e.g. "both funded, awaiting settlement") from the `takerDeposited` and `makerDeposited` boolean flags on the `Deal` object — not from an additional status enum. Do not add new `DealStatus` values for intermediate states; derive them.

`deriveRfqStatus(rfq)` in `rfq-repository.ts` synthesises `"expired"` from an `"open"` RFQ whose `expiresAt` is in the past — the DB stores `"open"` until a sync write updates it.

### Identity / role switching

`src/lib/identity.ts` implements a three-role mock selector using `useSyncExternalStore` with `localStorage` key `stellarbig_mock_identity`.

Roles:
- **RFQ Creator** — `GAXHX7...` — owns `rfq-1`; sees creator view (quotes visible, can accept)
- **Maker A** — `GBMKR1...`
- **Maker B** — `GCMKR2...`

`src/components/IdentitySelector.tsx` is the client component for the nav switcher. The view rendered on `/rfqs/[id]` is determined by comparing `rfq.creatorAddress` with `currentAddress` from `useCurrentIdentity()`.

### Key data relationships (mock mode)

- `rfq-1` → `deal-rfq1` (via `DEAL_ID_FOR_RFQ` map in `mock-data.ts`)
- `rfq-2` → `deal-rfq2`
- `deal-1` is a standalone deal for `rfq-3` (already closed)

---

## Product context

TrustRFQ solves one problem: buyer and seller want to complete a private OTC trade without going first blindly.

Flow: **RFQ → quotes → accepted quote → escrow deal → funds locked → settlement → release**

Every screen must make obvious: who is waiting on whom, whether funds are locked, what action comes next.

Product vocabulary and scope guardrails are in `.claude/rules/copy-and-terminology.md` and `.claude/rules/frontend-scope.md`. Trustless Work integration rules are in `.claude/rules/trustless-work.md`.
