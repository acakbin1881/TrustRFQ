<!-- refreshed: 2026-08-18 -->
# Architecture

**Analysis Date:** 2026-08-18

## System Overview

TrustRFQ is a peer-to-peer OTC dApp with three distinct operational domains: **off-chain RFQ negotiation** (user experience via Supabase realtime), **settlement signing** (wallet-driven auth entry construction), and **on-chain atomic swaps** (verified via two Soroban contracts). The system is deliberately split across Testnet (Stellar) and cloud (Supabase), with the wallet as the trust anchor and signature as the integrity boundary.

```text
┌──────────────────────────────────────────────────────────────────┐
│                   React + Vite Frontend (Desktop)                 │
│                    `src/App.tsx` (shell)                          │
├─────────┬────────────────────────────────────────────────────────┤
│  Desk   │  Three Sections (create/incoming/sent)                  │
│ Topbar  │  - Ticket (compose form) `src/ui/Ticket.tsx`           │
│ Wallet  │  - OfferList + ThreadView (negotiations) `src/ui/`     │
│         │  - BroadcastList (fan-out offers) `src/ui/`            │
└─────────┴────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Negotiation + State Layer                      │
│              Supabase Realtime (Postgres on Testnet)             │
│                    `src/data/*.ts` (hooks)                        │
├─────────┬────────────────────────────────────────────────────────┤
│ Orders  │ Maker/taker threads: pending/accepted/declined/settled │
│Broadcasts│ One RFQ → N taker fan-out threads (same order_id)     │
│ Rounds  │ Intent-layer: maker/taker counters (price negotiation)│
│ Intents │ Intent counters (interim, may be removed)              │
│Balances │ XLM/USDC (cached balance snapshot + Horizon query)    │
└─────────┴────────────────────────────────────────────────────────┘
         │
         ├─────────────────────┬──────────────────────┐
         ▼                     ▼                      ▼
┌──────────────────────┐ ┌───────────────────┐ ┌────────────────┐
│  Core Logic Layer    │ │ Settlement Layer  │ │  Wallet Layer  │
│ (Pure functions)     │ │ (Chain ops only)  │ │  (SEP-43)      │
│                      │ │                   │ │                │
│ canonical.ts         │ │ fill.ts           │ │ kit.ts         │
│ tokens.ts            │ │ -signFillAuth     │ │ -signTx        │
│ negotiation.ts       │ │ -submitFill       │ │ -signAuthEntry │
│ pairs.ts             │ │ -ensureTrustline  │ │                │
│ balances.ts          │ │                   │ │ authSignature  │
│ address.ts           │ │ (RPC + Horizon)   │ │ .ts            │
│ oracle.ts            │ │                   │ │ (normalizer)   │
└──────────────────────┘ └───────────────────┘ └────────────────┘
         │                     │                      │
         └─────────────────────┴──────────────────────┘
                        │
                        ▼
                 ┌──────────────┐
                 │ Stellar Chain │
                 │  (Testnet)    │
                 ├──────────────┤
                 │ RPC + Horizon │
                 └──────────────┘
                        │
                        ├─────────────────────────┬──────────────┐
                        ▼                         ▼              ▼
                ┌──────────────────┐    ┌──────────────────┐   │
                │  OTC Settlement  │    │  RFQ Settlement  │   │
                │    Contract      │    │    Contract      │   │
                │                  │    │                  │   │
                │ otc_swap/lib.rs  │    │rfq_swap/lib.rs   │   │
                │                  │    │                  │   │
                │ fill(...)        │    │ swap(Order)      │   │
                │ (6 tests)        │    │ cancel(...) (17) │   │
                │                  │    │ get_config()     │   │
                │ symmetric        │    │ (admin)          │   │
                │ auth model       │    │ asymmetric auth  │   │
                │ (interim)        │    │ (RFQ protocol)   │   │
                └──────────────────┘    └──────────────────┘   │
                                                                 ▼
                                                        ┌────────────────┐
                                                        │  Stellar Assets│
                                                        │  (SAC tokens)  │
                                                        │ XLM / USDC     │
                                                        └────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **Desk** | Shell: topbar + 3 panels (create/incoming/sent), owns all data subscriptions | `src/App.tsx` |
| **Ticket** | Compose form: pair selection, amount entry, counterparty addressing | `src/ui/Ticket.tsx` |
| **OfferList** | Render orders as threads (not just cards) | `src/ui/OfferList.tsx` |
| **ThreadView** | Per-order negotiation UI: rounds timeline, counter form, settlement status | `src/ui/ThreadView.tsx` |
| **BroadcastList** | Fan-out UI for broadcast orders (one RFQ → N threads) | `src/ui/BroadcastList.tsx` |
| **OrderCard** | Pair/amount/counterparty display + sign/settle buttons | `src/ui/OrderCard.tsx` |
| **fillCanonicalArgs** | Deterministic arg builder (signature boundary) | `src/core/canonical.ts` |
| **signFillAuth** | Off-chain auth entry signing (recording-mode simulation) | `src/core/fill.ts` |
| **submitFill** | Settlement submission (enforcing-mode sim + on-chain confirm) | `src/core/fill.ts` |
| **useOrders** | Realtime orders state (incoming + sent, per-address) | `src/data/useOrders.ts` |
| **useSettlement** | Sign/settle orchestration (chain ops + DB writes + UI feedback) | `src/ui/useSettlement.ts` |
| **Freighter wallet** | User identity, tx + auth entry signing (SEP-43) | `src/wallet/kit.ts` |
| **otc_swap contract** | Symmetric settlement (both parties sign, permissionless submit) | `contracts/otc_swap/src/lib.rs` |
| **rfq_swap contract** | Asymmetric RFQ settlement (maker pre-signs, taker is source) | `contracts/rfq_swap/src/lib.rs` |

## Pattern Overview

**Overall:** Client-only SPA (no backend server) with **three-tier signing**:
1. **Off-chain negotiation** — Supabase DB coordination only (no cryptography)
2. **Auth entry signing** — Maker + taker each sign off-chain via wallet
3. **On-chain settlement** — Permissionless submitter carries both signatures

**Key Characteristics:**
- **Stateless chain ops:** Settlement is a pure function of the signed entries; no server-side state for the swap
- **Realtime UX:** Supabase Realtime subscriptions keep UI in sync across tabs/wallets
- **No intermediate approvals:** Signed auth entries authorize the exact transfer amounts; no separate `approve` step
- **Wallet-driven:** Connected Freighter wallet is the single point of identity and trust
- **Deterministic encoding:** Every field signed by both parties must derive identically at sign time and submit time (`canonical.ts`)

## Layers

**UI Layer:**
- Purpose: React component tree for the desk (topbar, three panels, modal forms)
- Location: `src/ui/`
- Contains: Ticket (compose), OrderCard (display), ThreadView (negotiation), OfferList/BroadcastList (lists), form components (CounterForm, TokenSelect)
- Depends on: Data layer (useOrders, useBalances, etc.), core logic (tokens, negotiation, pairs), wallet (connect/disconnect)
- Used by: React app shell (`src/App.tsx`)

**Data/State Layer:**
- Purpose: Supabase queries + realtime subscriptions + React hooks
- Location: `src/data/`
- Contains: `supabase.ts` (client init), `useOrders.ts` / `useBroadcasts.ts` / `useBalances.ts` (hooks), `orders.ts` / `rounds.ts` / `broadcasts.ts` (queries)
- Depends on: Supabase client, core types
- Used by: UI components (via hooks), useSettlement (for DB writes)

**Core Logic Layer:**
- Purpose: Pure, testable business logic (no side effects, no UI, no wallet, no network)
- Location: `src/core/`
- Contains:
  - `canonical.ts` — Deterministic order encoding (signature boundary)
  - `tokens.ts` — Token allow-list, display formatting, validation
  - `negotiation.ts` — Round logic, currentTerms calculation
  - `pairs.ts` — Pair key derivation, pair labels
  - `balances.ts` — Balance-map parsing from Horizon
  - `address.ts` — Strkey checksum validation
  - `oracle.ts` — Reflector fair-price math (read-only)
  - `types.ts` — Shared TypeScript types
- Depends on: None (pure)
- Used by: UI, data layer, settlement layer (fill.ts)

**Settlement Layer:**
- Purpose: Chain operations only (RPC, Horizon, Soroban simulation, tx submit)
- Location: `src/core/fill.ts`
- Contains:
  - `signFillAuth` — Off-chain auth entry signing (counterparty as source, so signer's auth is returned)
  - `submitFill` — On-chain settlement (enforcing-mode sim with both entries, sign envelope, poll)
  - `ensureTrustline` — Ensure non-native token trustline before signing (SAC limitation)
  - `authValidUntil` — Compute `signature_expiration_ledger` (order expiry + buffer)
- Depends on: Core logic (canonical, types), wallet (injected as WalletSigner interface)
- Used by: useSettlement hook (via wallet-signing flow)

**Wallet Layer:**
- Purpose: Freighter SEP-43 integration + signature normalization
- Location: `src/wallet/`
- Contains:
  - `kit.ts` — Stellar Wallets Kit singleton (Freighter only), `walletSign` (message), `walletSignAuthEntry` (preimage)
  - `authSignature.ts` — Normalizer for the kit's double-encoded auth entry signatures
  - `WalletContext.tsx` — React context for connect/disconnect state
- Depends on: Stellar Wallets Kit
- Used by: Settlement layer (as WalletSigner), UI (connect button, wallet chip)

**On-Chain Layer:**
- Purpose: Atomic settlement verification on Stellar Testnet
- Location: `contracts/`
- Components:
  - **otc_swap** (interim, permissionless settle): Symmetric model (both maker + taker sign detached entries via `require_auth`). Used until RFQ protocol ships.
  - **rfq_swap** (RFQ protocol): Asymmetric model (maker pre-signs with `require_auth_for_args`, taker is tx source). Deployed 2026-08-18.
- Workspace root: `contracts/Cargo.toml` (holds `[profile.release]` and member list)

## Data Flow

### Primary Request Path (Compose → Accept → Settle)

1. **Compose order** (`Ticket.tsx` submit)
   - User enters maker/taker tokens, amounts, optional counterparty
   - `onSent` callback → insert order to `orders` table with `status='pending'`
   - DB write triggers realtime subscription on both parties
   - Location: `src/data/orders.ts:insertOrder`

2. **Receive order** (realtime subscription)
   - Counterparty's `useOrders` hook fires on `postgres_changes`
   - Order appears in Incoming panel as ThreadView → OrderCard
   - Display pair, amounts, counterparty, expiry, current status
   - Location: `src/data/useOrders.ts` (supabase channel subscription)

3. **Accept order**
   - Taker clicks Accept in ThreadView
   - `acceptInitialTerms` DB call → sets `settlement_status='signing'`
   - Taker then clicks "Sign this leg" button on OrderCard
   - Location: `src/data/rounds.ts:acceptInitialTerms`

4. **Sign auth entry**
   - User clicks "Sign this leg"
   - `useSettlement.signOrder` calls `signFillAuth` (core/fill.ts)
   - `signFillAuth` simulates `fill` with counterparty as source → returns signer's auth entry
   - `authorizeEntry` (SDK) wraps preimage, calls wallet for signature
   - Result stored as `maker_auth` or `taker_auth` (base64 XDR)
   - Both signings → `settlement_status='ready'`
   - Location: `src/ui/useSettlement.ts:signOrder`

5. **Submit settlement** (on-chain)
   - Either party clicks "Submit to settle"
   - `useSettlement.settle` calls `submitFill` (core/fill.ts)
   - `submitFill` rebuilds exact canonical args, attaches both signed entries
   - Enforcing-mode simulation validates signatures (host nonce, arg binding)
   - Signs envelope as tx source, submits to RPC
   - Polls `getTransaction` for confirmation (≈30 attempts, ~45 sec timeout)
   - On success: store `settle_tx_hash`, set `settlement_status='settled'`, `settled_at`
   - Location: `src/ui/useSettlement.ts:settle`

### Secondary Flow: Intent-Layer Counters (RFQ negotiation)

1. Taker creates a counter-offer in ThreadView → Counter Form
2. `counterOffer` DB call adds a new round (n ≥ 1) with taker's new terms
3. Maker sees the counter in Sent panel, clicks "View counter"
4. Decision: Accept, Decline, or Counter again
5. `acceptRound` / `declineRound` / `counterOffer` update round.resolution
6. Once accepted, order proceeds to Settlement (Path 5 above)
7. Location: `src/data/rounds.ts`, `src/ui/CounterForm.tsx`, `src/ui/RoundTimeline.tsx`

### State Management

- **Orders** (`orders` table): One row per directed offer or broadcast root. Queried at load, subscribed realtime per-address.
- **Broadcasts** (`broadcasts` table): One row per broadcast RFQ. Feeds BroadcastList (de-duped group view).
- **Rounds** (`rounds` table): Intent-layer negotiation history (n, maker_amount, maker_token, taker_amount, taker_token, resolution). One order may have multiple rounds.
- **Intents** (`intents` table): Historical counter offers (interim, may be removed when RFQ protocol fully ships).
- **Balances**: Queried fresh from Horizon every ~30s (cached in React state, not persisted).
- **Settlement status**: Ephemeral, lives in the orders row (`settlement_status`, `maker_auth`, `taker_auth`, `settle_tx_hash`, `settle_error`, `settled_at`).

## Key Abstractions

**Order (type):**
- Purpose: All order data (compose terms + settlement state)
- Examples: `src/core/types.ts` (TypeScript definition), `src/data/orders.ts` (Supabase row)
- Pattern: Flat row, not nested (for easy DB/JSON serialization)

**Thread (logical, not a type):**
- Purpose: One order viewed from one party's perspective
- Implementation: `Order` + `Side` ('maker' or 'taker') + `Rounds` (optional, for intent layer)
- Used in: ThreadView, OrderCard, OfferList

**FillTerms (canonical encoding):**
- Purpose: The fields that both parties cryptographically bind to (signature payload)
- Example: `src/core/canonical.ts:FillTerms` (id, maker/taker address/token/amount, expiration)
- Pattern: Deterministic JSON serialization (fixed key order)

**Pair (key):**
- Purpose: Group orders by token pair (e.g., 'XLM:USDC')
- Implementation: `orderPairKey()` in `src/core/pairs.ts` (lexicographic sort)
- Used in: PairsPanel (toggle which pairs to receive broadcasts for), display labels

**Balance:**
- Purpose: User's token holdings (native XLM + trusted SAC balances)
- Implementation: Horizon `balances` array, parsed in `src/core/balances.ts`
- Used in: BalanceStrip (display), Ticket (send gate), CounterForm (receive gate)

## Entry Points

**Web Entry Point:**
- Location: `otc.html`
- What it is: Vite-compiled HTML entry, loads `src/main.tsx`
- Triggers: Browser navigates to `https://trustRFQ.vercel.app/otc.html` (or served as root `/`)
- Responsibilities: Head (stylesheets, config scripts), body (#root div, topbar structure)

**App Shell:**
- Location: `src/App.tsx`
- What it does: Desk component, WalletProvider, ToastProvider, all data subscriptions
- Responsibilities: Topbar, wallet gate, three panels (create/incoming/sent)

**Compose Form:**
- Location: `src/ui/Ticket.tsx`
- Triggers: User clicks "New offer" in navigation
- Responsibilities: Pair select, amount entry, counterparty address, submit

**Receive Order:**
- Location: `src/ui/ThreadView.tsx`
- Triggers: Order appears in Incoming panel (realtime subscription)
- Responsibilities: Display order, accept/decline/counter, sign/settle buttons

**Settlement Orchestration:**
- Location: `src/ui/useSettlement.ts` (signOrder, settle callbacks)
- Triggers: User clicks "Sign this leg" or "Submit to settle"
- Responsibilities: Chain ops, DB writes, error recovery, toast feedback

## Architectural Constraints

- **Threading:** Single-threaded event loop (browser JS). Settlement is serialized module-level (not per-instance) via `settleLock` ref in ThreadView to prevent concurrent wallet prompts/submits.
- **Global state:** Wallet kit singleton (`src/wallet/kit.ts`), Supabase client singleton (`src/data/supabase.ts`), module-level `settleLock` in ThreadView. All intentional.
- **Circular imports:** None known (checked with `grep -r "import.*from.*import"` implicit cycles are low-risk in bundled code).
- **Auth boundary:** Wallet signature is the trust anchor. No on-chain permissions, no bearer tokens, no JWT. Public reads via anon Supabase key (accepted for Testnet MVP).
- **Network assumptions:** RPC latency ≤5s (polling), Horizon latency ≤2s (balance checks), Supabase ≤1s (realtime). No retry logic on timeout (user-visible failures).
- **Signature freshness:** `signature_expiration_ledger` set to order expiry + buffer (computed in `authValidUntil`, ~20-60 ledgers ahead). Stale signatures are rejected by the host on submit-time simulation.

## Anti-Patterns

### App.tsx calls useSettlement (violates concurrency)

**What happens:** If App.tsx imported and called `useSettlement`, its `txBusy.current` ref would be per-instance (invisible to ThreadView's lock).

**Why it's wrong:** Two wallets tabs open + one settlement → two wallet prompts, two concurrent `submitFill` calls, two competing `settlement_status` writes. One tx lands on-chain, the other reverts (`AlreadyFilled`), but the DB is corrupted by the concurrent write.

**Do this instead:** ThreadView is the only render site of OrderCard, so it is the only place settlement starts. Module-level `settleLock` there serializes all mounted ThreadViews. App.tsx never calls `useSettlement`. Invariant: `grep -rn "useSettlement" src/` → exactly 3 lines (definition in useSettlement.ts, import in ThreadView, call in ThreadView).

### signFillAuth without ensureTrustline

**What happens:** Sign auth entry for a non-native token (USDC) without first adding a trustline to the signer's account.

**Why it's wrong:** On-chain `transfer` of an untrustlined asset fails with `op_no_trust`. The signed entry is wasted, user must re-sign.

**Do this instead:** `signFillAuth` calls `ensureTrustline` before simulation. It's a blocking operation (one classic `changeTrust` tx per new asset per user per settlement), unavoidable for cross-asset swaps.

### Reordering canonical args or changing numeric types

**What happens:** `fillCanonicalArgs` returns args in a different order, or amounts as `u64` instead of `i128`.

**Why it's wrong:** The hash of the args changes. The pre-signed auth entry no longer matches. `fill` simulation fails with a signature error that reads as "sig doesn't match payload" (maximally unhelpful).

**Do this instead:** Keep arg order and types byte-identical to the contract `fill` signature. Lock down the encoding in `canonical.test.ts` golden vectors (pinned to `fixtures/canonical-args.json`).

### Forgetting supply "both" signatures on submit

**What happens:** `submitFill` is called when only one party has signed.

**Why it's wrong:** Enforcing-mode simulation requires both entries pre-attached. The host enforces both `require_auth` calls, so a missing entry reverts the simulation with "auth failed".

**Do this instead:** Check `order.maker_auth && order.taker_auth` before calling `submitFill` (done in useSettlement hook).

## Error Handling

**Strategy:** Progressive trust + explicit checks at every step.

**Patterns:**
- **Wallet connectivity:** `isConnected()` guard in Gate; disconnect on reject
- **Asset validation:** `orderTokensKnown()` check before signing (refuses unrecognized token)
- **Trustline gate:** `ensureTrustline()` before auth signing (prevents wasted signatures)
- **Simulation errors:** Explicit error check after each `simulateTransaction` (prevents blind tx submission)
- **Race recovery:** On settle failure, re-check settlement status before marking as failed (concurrent submitter recovery; see useSettlement)
- **Wallet prompts:** User-facing toast on every critical action (signature, submit, settlement)
- **On-chain failures:** Contract errors bubble as `Error(message)` (e.g., "AlreadyFilled", "Expired", "Cancelled")

## Cross-Cutting Concerns

**Logging:** No logging layer (dev tools via Chrome DevTools; production errors via React Error Boundary if added).

**Validation:**
- Address strkey checksum (`address.ts`)
- Token in allow-list (`tokens.ts`)
- Amount ranges (non-zero, ≤ balance for sender, ≤ limit for receiver)
- Expiration staleness (vs `Date.now()`)
- Round nesting (no counter after accept)

**Authentication:**
- Wallet signature (entry auth; never bearer token)
- No session, no JWT, no signed nonce challenge (Testnet MVP simplification)
- On-chain auth via Soroban `require_auth` (contract enforces caller identity)

**Rate Limiting:** None (Testnet, no backend). Production would add API rate-limit headers + backoff.

---

*Architecture analysis: 2026-08-18*
