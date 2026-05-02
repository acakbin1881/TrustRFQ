# StellarBig — Project Instructions

## What this project is
A Stellar OTC/RFQ escrow settlement MVP.
Two parties negotiate a trade via RFQ/quote flow, then settle atomically through a Soroban smart contract escrow.

## Hard rules
- **Testnet only.** Never use the mainnet network passphrase.
- **No mainnet.** Not in this version.
- **No fiat.** No payment rails, no bank integration.
- **No KYC.** No identity verification.
- **No dispute resolution.** The contract state machine handles all outcomes.
- **No multi-chain.** Stellar only.
- **No market maker engine.** Manual RFQ/quote flow only.
- **Implement one milestone at a time.** Do not build ahead.
- **Do not add out-of-scope features.** If it is not in the current milestone, skip it.
- **Ask before major architecture changes.** Do not restructure without approval.

## Monorepo layout
```
apps/web/              Next.js frontend (TypeScript + Tailwind)
contracts/rfq_escrow/  Soroban Rust smart contract
packages/stellar/      Shared Stellar SDK helpers
supabase/migrations/   PostgreSQL schema migrations
docs/                  Product specs and diagrams
```

## Key paths
- Supabase client → `apps/web/src/lib/supabase.ts`
- Stellar helpers → `apps/web/src/lib/stellar.ts`
- TypeScript alias `@/*` resolves to `apps/web/src/*`

## Environment variables (apps/web/.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_STELLAR_NETWORK=TESTNET
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_CONTRACT_ID=
```

## Running the web app
```bash
cd apps/web
npm run dev
```
Or from the root:
```bash
npm run dev
```

## Documentation maintenance rule

Every time you change files under `apps/`, `contracts/`, or `packages/`, you must also update:

- `docs/03-CURRENT-STATE.md` — reflect what now works and what is still mocked
- `docs/04-NEXT-TASK.md` — update next steps if they changed

Only update `docs/01-MILESTONES.md` when a milestone status changes.
Only update `docs/02-DECISIONS.md` when an architecture or product decision changes.

## Definition of Done

A task is not complete until:
1. Build passes (`npm run build` in `apps/web`)
2. Lint passes (`npm run lint` in `apps/web`)
3. `docs/03-CURRENT-STATE.md` is accurate
4. `docs/04-NEXT-TASK.md` is accurate

The Stop hook (`scripts/docs-gate.sh`) enforces rules 3 and 4 automatically.
Run it manually at any time: `bash scripts/docs-gate.sh`
