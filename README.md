<p align="center">
  <h1 align="center">TrustRFQ</h1>
  <p align="center">
    <strong>Peer-to-Peer OTC Trading on Stellar</strong>
  </p>
  <p align="center">
    Negotiate block-size swaps privately off-chain, then settle atomically on-chain in a single signed transaction
  </p>
</p>

<p align="center">
  <a href="#overview">Overview</a> •
  <a href="#features">Features</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#roadmap">Roadmap</a>
</p>

---

## Overview

### The Problem

Stellar has no venue for **block trades**, large OTC swaps like 570000 USDC ↔ 3000000 XLM. A trade
that size has nowhere good to go:

- **On the DEX / AMMs, size means slippage.** Sweeping the order book or a liquidity pool for a
  large amount walks the price against you; the fill you get is far worse than the quote you saw.
- **A public order book leaks intent.** Resting a large order signals the market and invites
  front-running before it fills.
- **Settling a hand-negotiated deal is risky.** Off-chain agreements usually rely on one side to
  move first, or on a trusted intermediary. Terms can drift between the handshake and the transfer.

### The Solution

**TrustRFQ** is a peer-to-peer OTC (over-the-counter) trading app built on the
[Stellar](https://stellar.org) blockchain using [Soroban](https://soroban.stellar.org) smart
contracts. It gives block trades a home: two parties negotiate a swap privately through an RFQ
(request-for-quote) thread, agree on terms off-chain, then settle on-chain in one atomic
transaction. There is no order book, so **no slippage and no leaked intent**, the price is exactly
what the two sides agreed.

The settlement model follows [AirSwap](https://www.airswap.io): each party signs an off-chain
Soroban authorization entry over the exact terms, and a single `fill` transaction carries both
signatures. Because every amount is hashed into both signatures, the party who submits the
transaction cannot alter the deal, and both legs move at once or neither does. No side moves first,
and no intermediary is trusted.

**Status:** working end-to-end on Testnet. A real cross-asset trade (10 XLM ↔ 1 USDC, exercising
the USDC trustline path) was negotiated and settled through two Freighter wallets on 2026-07-14
([tx](https://stellar.expert/explorer/testnet/tx/af0392ff49ac9478a95fd8059bc64f62fd715d1de84d16d4acd912c5268a63aa),
ledger 3604560).

## Features

| For Traders | Description |
|-------------|-------------|
| Directed offers | Send a signed offer to one specific `G…` wallet address |
| Broadcast offers | Fan an offer out to every taker subscribed to a token pair (one signature) |
| Negotiation threads | Every offer is a thread: Accept, Decline, or Counter on the amounts |
| Atomic swaps | Settle accepted terms in a single on-chain `fill` transaction |
| Fair-price hint | Optional advisory reference price from the [Reflector](https://reflector.network) oracle |

| Protocol | Description |
|----------|-------------|
| Off-chain RFQ | Negotiation coordinated through Supabase Realtime, pushed live to both sides |
| On-chain settlement | Dual-authorized Soroban `fill` with direct SAC transfers |
| Replay protection | Layered: host nonces, a per-order `Filled` key, and signature/order expiration |
| Token allow-list | Only vetted assets can be rendered, signed, or settled |

## Supported Assets

| Asset | Details |
|-------|---------|
| XLM | Native Stellar asset; no trustline required |
| USDC | Classic asset via its SAC; receiver needs a trustline (created automatically) |

Both assets move as **Stellar Asset Contracts** with ids derived in-app from the asset and network
passphrase. Amounts are 7-decimal base units.

> **Note:** the demo build temporarily points USDC at a self-issued Testnet asset so it can be
> minted freely (a 570000 USDC block trade exceeds Circle's faucet). Revert `src/core/tokens.ts`
> (and its two pinned tests) to Circle's issuer before any real use. See `CLAUDE.md` for details.

## How It Works

A trade goes from private negotiation to one atomic on-chain settlement:

```
┌─────────────┐   RFQ thread    ┌─────────────┐   accept    ┌─────────────┐
│    Maker    │────────────────▶│   Supabase  │────────────▶│    Taker    │
│  (wallet A) │  (off-chain)    │  (Realtime) │             │  (wallet B) │
└──────┬──────┘                 └─────────────┘             └──────┬──────┘
       │                                                          │
       │  sign auth entry                        sign auth entry  │
       └──────────────────────┐        ┌──────────────────────────┘
                              ▼        ▼
                       ┌──────────────────────┐
                       │   fill (Soroban)     │  one atomic tx
                       │  both legs transfer  │  moves XLM + USDC
                       └──────────────────────┘
```

1. **Connect.** A maker connects a Stellar wallet (Freighter). The connected address is the
   identity; there is no sign-in.
2. **Compose.** The maker fills the ticket: amounts, tokens, expiry, and either a counterparty
   address (directed) or none (broadcast). Signing the offer sends it.
3. **Negotiate.** The taker sees the thread live and can Accept, Decline, or Counter. Only amounts
   are negotiable; counters bounce back and forth until one side accepts.
4. **Authorize.** After acceptance, each party signs an off-chain Soroban authorization entry over
   the exact final terms (in any order).
5. **Settle.** Either party submits one `fill` transaction carrying both signatures. Both token
   legs move atomically, and the thread flips to Settled with a link to the explorer.

## Architecture

```
TrustRFQ/
├── otc.html                  # The single Vite entry (head + config + #root)
├── src/
│   ├── App.tsx               # Shell: topbar, wallet gate, three sections
│   ├── core/                 # Pure logic (no wallet/network/window)
│   │   ├── canonical.ts      # The signature boundary (pinned by golden vectors)
│   │   ├── fill.ts           # Chain ops: signFillAuth, submitFill, trustlines
│   │   └── tokens.ts         # Token allow-list + validation
│   ├── data/                 # Supabase client, queries, realtime hooks, oracle read
│   ├── ui/                   # Ticket, thread view, counter form, settlement strip
│   └── wallet/               # Wallets Kit singleton + signature normalizer
├── public/                   # Landing page, stylesheets, runtime config (window.*)
├── contracts/otc_swap/       # Soroban settlement contract (fill) + tests
├── fixtures/                 # Golden vectors pinning canonical bytes
└── vercel.json               # Build config + strict CSP / security headers
```

### Deployments (Testnet)

| Contract | Address |
|----------|---------|
| OTC settlement (`fill`) | `CCAPYEWHYSGORPUOC7FBSIRBIWSJJSPJOIWPJNEZLGDXUWJVWV7MTKBJ` |
| Reflector oracle (fair-price) | `CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63` |

### Technology Stack

- **Frontend**: React 19 + TypeScript on Vite, a client-only SPA (no server runtime)
- **Backend**: Supabase (Postgres + Realtime) with the anon key, as a coordination layer only
- **Chain**: Stellar Testnet; settlement via a Soroban (Rust) contract
- **Wallet**: Freighter, via [Stellar Wallets Kit](https://github.com/Creit-Tech/Stellar-Wallets-Kit)
- **Deploy**: Vercel (`npm run build` → `dist/`)

## Getting Started

### Prerequisites

- **Node** ≥ 20.19
- For contract work: **Rust** ≥ 1.84 with the `wasm32v1-none` target and the
  [Stellar CLI](https://developers.stellar.org/docs/tools/cli) (v27)
- A [Freighter](https://freighter.app) wallet with Testnet XLM

### Installation

```bash
git clone https://github.com/acakbin1881/TrustRFQ.git
cd TrustRFQ
npm install
```

### Configuration

Runtime config lives in plain `window.*` scripts (deliberately un-bundled, so a Testnet reset is a
one-file edit). Point them at your own Supabase project and contract id, or leave the checked-in
Testnet values.

- `public/otc-config.js`: RPC/Horizon URLs, network passphrase, `OTC_CONTRACT_ID`, `REFLECTOR_ORACLE_ID`
- `public/supabase-config.js`: Supabase URL + anon key

For a fresh Supabase project, run the schema in the SQL Editor (the anon key cannot run DDL): the
base `orders` table and settlement columns, then
[`docs/migrations/2026-07-10-intent-layer.sql`](docs/migrations/2026-07-10-intent-layer.sql) in
full. See `CLAUDE.md` for the complete SQL.

### Running

```bash
npm run dev        # → http://localhost:5173/otc.html
npm test           # vitest: 8 suites, 109 tests
npm run build      # tsc --noEmit && vite build → dist/
```

Contract:

```bash
rustup target add wasm32v1-none
cargo test --manifest-path contracts/otc_swap/Cargo.toml   # 6 tests
cd contracts/otc_swap && stellar contract build            # → otc_swap.wasm
```

### Try it (two wallets)

Use two funded Testnet wallets in two browsers. Start with an XLM↔XLM order to avoid trustlines.

1. **Wallet A** connects and composes a New offer (amounts, tokens, expiry, optional counterparty).
2. **Wallet B** sees the thread live in Incoming and Accepts (or Counters).
3. Both press **Sign order**, then either presses **Settle now**. One `fill` transaction moves both
   balances atomically.

## Roadmap

### Phase 1: Off-chain RFQ ✅
- [x] Compose ticket with directed and broadcast modes
- [x] Negotiation threads (Accept / Decline / Counter)
- [x] Supabase Realtime coordination

### Phase 2: On-chain Settlement ✅
- [x] Soroban `fill` contract with dual authorization
- [x] AirSwap-style off-chain signed auth entries
- [x] Atomic cross-asset swaps (XLM ↔ USDC)
- [x] Two-wallet end-to-end on Testnet

### Phase 3: Enhancements ✅
- [x] Intent / private-offer layer (broadcasts, rounds, pair subscriptions)
- [x] Reflector fair-price suggestion (advisory)
- [x] Light desk theme + glass landing page

### Phase 4: Hardening (In Progress)
- [x] Strict CSP + security headers
- [ ] Sign-In-With-Stellar sessions and per-wallet RLS
- [ ] Server-side verification of off-chain RFQ signatures

### Phase 5: Production
- [ ] Institutional RFQ protocol (peer-to-server quoting)
- [ ] Fee relayer / sponsorship for submitters
- [ ] Security audit and Mainnet deployment

## Security

- **The database is untrusted.** Supabase only coordinates UI state; integrity comes from wallet
  signatures, not RLS. The real boundary is the two Soroban authorization entries the host verifies
  inside `fill`.
- **Frozen terms.** A column-scoped anon grant means an order's addresses, tokens, expiration, and
  nonce cannot be rewritten after insert.
- **Tamper-proof settlement.** `fill` requires both parties' auth over the full arguments; a
  changed amount has no valid signature, so the transaction reverts.
- **Token quarantine.** Only allow-listed assets can be rendered or signed; a look-alike asset with
  an attacker-controlled issuer is flagged and blocked.
- **Strict headers.** `vercel.json` ships an allow-list CSP (no inline or CDN scripts), HSTS,
  `X-Frame-Options: DENY`, and `Referrer-Policy: no-referrer`.

> **Disclaimer:** TrustRFQ targets Stellar **Testnet** only and has not been audited. Do not use it
> with real funds.

## License

[MIT](LICENSE). Built as a demonstration project on Stellar / Soroban; no warranty.

<p align="center">
  <sub>Built with React, Rust, and Soroban on Stellar</sub>
</p>
