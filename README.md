# TrustRFQ

TrustRFQ is a peer-to-peer RFQ and OTC escrow product for stablecoin trades.

It is being prepared for the Boundless x Trustless Work hackathon as a focused product, not a generic escrow platform. The core idea is simple: two counterparties agree on a private OTC trade through an RFQ and quote flow, then the accepted deal is protected by Trustless Work escrow primitives so nobody has to send first on trust alone.

## Hackathon position

- **Event:** Boundless x Trustless Work Hackathon, May 13-16, 2026
- **Category:** Core Trustless Work Applications
- **Use case:** P2P stablecoin exchanges and OTC desks
- **Product:** Private RFQ + accepted quote + escrow-backed settlement
- **Demo proof:** Accepted deals should show escrow state in the Trustless Work Escrow Viewer

## What TrustRFQ solves

Current wording is provisional until the GPT Deep Research pass is added.

The starting problem: OTC stablecoin trades create counterparty risk because one side is often expected to send funds first, wait for the other side, or rely on informal reputation. TrustRFQ turns the trade into a structured RFQ flow and routes accepted deals into escrow, where funds move only when the agreed conditions are met.

## Current technical base

The current codebase already includes:

- Next.js web app with TypeScript and Tailwind
- Private RFQ creation and listing
- Role-based quote submission and acceptance
- Supabase persistence for RFQs, quotes, deals, and escrow events
- Mock identity switcher for creator/maker testing
- Deal lifecycle page with backend-state escrow events
- Stellar/Soroban folders preserved from the earlier technical prototype

The next phase is documentation-led and hackathon-focused: improve the UI and replace or connect the current escrow simulation with Trustless Work primitives.

## Product flow

1. Maker creates a private RFQ.
2. Takers/makers submit private quotes.
3. RFQ creator manually accepts one valid quote.
4. A deal is created.
5. TrustRFQ creates or links a Trustless Work escrow.
6. Parties fund or satisfy escrow conditions.
7. The deal page shows escrow state.
8. Judges/users verify escrow state in the Escrow Viewer.

## Scope for the hackathon

In scope:

- Perfect UI for the RFQ and deal flow
- Trustless Work escrow integration
- Escrow Viewer links/state for demos
- Supabase-backed RFQ and deal persistence
- Clear demo script and submission materials

Out of scope unless explicitly added:

- Generic escrow builder
- Mainnet launch
- Fiat rails
- KYC
- Public order book
- AMM/swap UI
- Market maker automation
- Multi-chain expansion

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Environment variables

Existing app variables:

```txt
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_STELLAR_NETWORK=TESTNET
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_CONTRACT_ID=
```

Planned Trustless Work variables should be finalized from official docs before implementation:

```txt
NEXT_PUBLIC_TRUSTLESS_WORK_NETWORK=
NEXT_PUBLIC_TRUSTLESS_WORK_API_URL=
TRUSTLESS_WORK_API_KEY=
NEXT_PUBLIC_ESCROW_VIEWER_URL=https://viewer.trustlesswork.com
```

## Research reminder

The user will provide GPT Deep Research material for the exact user problem, market context, affected parties, solution reasoning, and demo proof. When that arrives, update README and docs together. Do not treat the current problem wording as final.