# StellarBig

Peer-to-peer OTC escrow settlement on Stellar Testnet.

Two parties negotiate a trade via an RFQ/quote flow, then settle atomically through a Soroban smart contract. No counterparty trust required.

## MVP scope

**In scope**
- Post RFQs (asset pair, amount, expiry)
- Submit and accept quotes
- Create deals
- Lock funds into Soroban escrow
- Atomic settlement once both sides deposited
- Refund after expiry if trade did not complete
- Freighter wallet integration
- Stellar Testnet only

**Out of scope**
- Mainnet
- Fiat / payment rails
- KYC / identity
- Dispute resolution
- Market maker automation
- Partial fills
- Multi-chain
- Mobile app

## Monorepo structure

```
apps/web/              Next.js frontend (TypeScript + Tailwind)
contracts/rfq_escrow/  Soroban Rust smart contract
packages/stellar/      Shared Stellar SDK helpers
supabase/migrations/   PostgreSQL schema migrations
docs/                  Product specs and diagrams
```

## Running the web app

```bash
# From the repo root
npm run dev

# Or directly
cd apps/web
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Copy `.env.local.example` to `apps/web/.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_STELLAR_NETWORK=TESTNET
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_CONTRACT_ID=
```
