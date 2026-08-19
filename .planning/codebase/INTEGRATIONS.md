# External Integrations

**Analysis Date:** 2026-08-18

## APIs & External Services

**Stellar RPC (Soroban):**
- **Service:** Soroban Testnet RPC endpoint
- **URL:** `https://soroban-testnet.stellar.org`
- **What it's used for:** Contract invocation, simulation, transaction submission, ledger state
- **SDK/Client:** `@stellar/stellar-sdk` RPC methods (invoke, simulate, getLatestLedger, getTransaction, pollTransaction)
- **Auth:** Permissionless (public Testnet)
- **Config env var:** `window.RPC_URL` in `public/otc-config.js`
- **Code references:**
  - `src/core/fill.ts` - submitFill, signFillAuth, authValidUntil (contract invocation + simulation)
  - `src/data/oracle.ts` - fetchLastPrice (read-only oracle simulation)
  - `src/data/useBalances.ts` - fetchBalances (ledger entry reads)

**Stellar Horizon (Classic):**
- **Service:** Stellar Horizon Testnet API
- **URL:** `https://horizon-testnet.stellar.org`
- **What it's used for:** Account loading (sequence numbers, balances, trustlines), trustline management
- **SDK/Client:** `@stellar/stellar-sdk` Horizon.Server methods (loadAccount, submitTransaction)
- **Auth:** Permissionless (public Testnet)
- **Config env var:** `window.HORIZON_URL` in `public/otc-config.js`
- **Code references:**
  - `src/core/fill.ts` - ensureTrustline, waitForTx (account state + classic trustline setup)
  - `src/ui/useSettlement.ts` - settlement flow

**Stellar Wallets Kit (Freighter):**
- **Service:** Browser wallet extension
- **Package:** `@creit.tech/stellar-wallets-kit` 1.9.5 (exact)
- **What it's used for:** User authentication (wallet connection), transaction signing, auth-entry signing
- **Methods used:** `kit.signTransaction(xdr, opts)`, `kit.signAuthEntry(preimageXdr, opts)`
- **Auth:** User-initiated (extension prompts)
- **Key quirk:** `signAuthEntry` double-encodes the signature; normalised by `src/wallet/authSignature.ts` (decode once before passing to `Stellar.authorizeEntry`)
- **Config:** Freighter only (no other wallets registered in `src/wallet/kit.ts`)
- **Code references:**
  - `src/wallet/kit.ts` - kit singleton, walletSign message signing
  - `src/core/fill.ts` - signFillAuth, submitFill (wallet signing interface injected as WalletSigner)
  - `src/ui/Gate.tsx` - connect/disconnect
  - `src/ui/useSettlement.ts` - settlement signing

## Data Storage

**Databases:**

**Supabase PostgreSQL (off-chain coordination):**
- **Project:** `zaflldqvenbgfaxtzbjc` (Testnet)
- **Connection:** `window.SUPABASE_URL` + `window.SUPABASE_ANON_KEY` in `public/supabase-config.js`
- **URL:** `https://zaflldqvenbgfaxtzbjc.supabase.co`
- **Auth:** Anon public key (no sign-in, identity = wallet address)
- **RLS:** Explicit policies on orders/broadcasts/rounds/intents tables (anon reads all, insert/update gated by status/workflow columns only)
- **Realtime:** Subscription via PostgREST streaming (supabase_realtime publication)
- **Client:** `@supabase/supabase-js` ^2.110.2
- **Tables:**
  - `public.orders` - Peer offers (maker/taker, amounts, tokens, expiration, signatures, settlement state)
  - `public.broadcasts` - Broadcast offers (one maker to many takers)
  - `public.rounds` - Negotiation rounds (linked to broadcasts)
  - `public.intents` - Intent layer state (from 2026-07-10 migration)
- **Sensitive columns:** None (off-chain coordination only; integrity in wallet signatures + on-chain fill)
- **Code references:**
  - `src/data/supabase.ts` - client singleton
  - `src/data/orders.ts` - createOrder, updateOrder, fetchSettlementStatus
  - `src/data/broadcasts.ts` - broadcast queries
  - `src/data/rounds.ts` - round tracking
  - `src/data/intents.ts` - intent layer
  - `src/data/useOrders.ts`, `useBroadcasts.ts`, `useRounds.ts` - React hooks with realtime subscriptions

**File Storage:**
- Local filesystem only (no S3 or external CDN for app assets)
- Static assets (hero.html, hero.css, hero.js, styles.css, intent.css, config scripts) served from Vercel `/public` directory
- Contract wasms stored locally in `contracts/target/wasm32v1-none/release/` (built, never fetched)

**Caching:**
- None configured (Vercel provides HTTP cache, no Redis/Memcached layer)

## Authentication & Identity

**Auth Model:**
- **No sign-in:** Identity = connected Stellar wallet address (Freighter extension)
- **Integrity:** Wallet signatures (off-chain), then dual Soroban auth-entry signatures (on-chain settlement)
- **Supabase:** Anon-key-only access (no per-wallet JWT); RLS policies enforce workflow (cannot rewrite order terms post-insert)
- **Future hardening:** Sign-In-With-Stellar (signed nonce → JWT) for per-wallet RLS (not yet implemented)

**Wallet Provider:**
- **Freighter** (SEP-43 implementation)
- Freighter methods: `signTransaction`, `signAuthEntry`, `signMessage` (detected at runtime)

## On-Chain Settlement

**Stellar Soroban Contracts (Testnet):**

**OTC Swap Contract (AirSwap-style atomic swap):**
- **Contract ID:** `CCAPYEWHYSGORPUOC7FBSIRBIWSJJSPJOIWPJNEZLGDXUWJVWV7MTKBJ`
- **Deployed:** 2026-06-30
- **Wasm hash:** `83f60b85…` (byte-matches source `contracts/otc_swap/src/lib.rs`)
- **What it does:** `fill(maker, taker, maker_token, maker_amount, taker_token, taker_amount, expiration, order_id, nonce)` - moves both legs atomically under dual auth
- **Auth model:** Both maker and taker sign Address-credential entries; permissionless submit
- **Code reference:** `src/core/fill.ts` - fillCanonicalArgs, signFillAuth, submitFill

**RFQ Swap Contract (asymmetric RFQ settlement):**
- **Contract ID:** `CCNP7626WIJVWVTBPLPG6QM77TY6JBU42D4PYONUFTDEPIIW6ZFJQIDT`
- **Deployed:** 2026-08-18
- **What it does:** `swap(maker, taker, maker_token, taker_token, maker_amount, taker_amount, expiry, order_id, fee_bps)` - RFQ-protocol swap with asymmetric auth (maker signs, taker uses SourceAccount)
- **Auth model:** Only maker signs (Address credential scoped with `require_auth_for_args`); taker is SourceAccount
- **Fee:** 10 bps (basis points), configurable by admin (capped at 30 bps in code)
- **Admin:** The deployer identity
- **Fee collector:** Configured at deploy
- **Config env var:** `window.RFQ_SWAP_CONTRACT_ID` in `public/otc-config.js`
- **Status:** Deployed and proven on Testnet; desk does not yet call it (under development)

**Stellar Asset Contracts (SACs - derived):**
- **XLM SAC:** `Asset.native().contractId(networkPassphrase)` → deterministic, not hardcoded
- **USDC SAC:** `new Asset("USDC", <issuer>).contractId(networkPassphrase)` → deterministic
- **Issuer:** Testnet issuer (TEMPORARY 2026-07-18: points to demo issuer, not Circle's; swap on revert to restore Circle)
- **What they do:** Standard SEP-41 token interface (transfer, approve, balance, etc.)
- **Auth:** Each transfer/burn requires the sender's Soroban auth entry (handled by otc_swap's dual auth or rfq_swap's asymmetric auth)
- **Code references:**
  - `src/core/tokens.ts` - token allow-list, issuer ids, SAC derivation
  - `src/core/fill.ts` - transfer sub-invocations under require_auth

**Reflector Price Oracle (read-only advisory pricing):**
- **Service:** Stellar's Reflector Oracle (SEP-40)
- **Contract ID:** `CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63` (Testnet feed: External CEXs & DEXs)
- **What it's used for:** Reference fair price for XLM/USDC pair (never signed, never on settlement path)
- **Methods:** Read-only `lastprice(Asset::Other(symbol))` via RPC simulation
- **Config env var:** `window.REFLECTOR_ORACLE_ID` (empty = feature silently disabled)
- **Code references:**
  - `src/data/oracle.ts` - fetchLastPrice (pure math, returns PriceData | null)
  - `src/data/useFairPrice.ts` - React hook with caching and stale-price detection
  - `src/ui/Ticket.tsx` - displays fair price hint on compose form

## Monitoring & Observability

**Error Tracking:**
- None configured (Testnet MVP — log to console)

**Logs:**
- `console.log/error` (browser console)
- Vercel runtime logs (backend build logs only, no application runtime)

**Toasts/User Feedback:**
- In-app `Toast` component (`src/ui/Toast.tsx`) for wallet prompts, settlement status, errors

## CI/CD & Deployment

**Hosting:**
- **Vercel** (frontend, static `dist/` output)
- Auto-deploy on push to `main` branch
- No CI/CD pipeline configured (no GitHub Actions)

**Contract Deployment:**
- Manual: `stellar contract build` + `stellar contract deploy` (scripted in README)
- Deploy updates `OTC_CONTRACT_ID`, `RFQ_SWAP_CONTRACT_ID`, `REFLECTOR_ORACLE_ID` in `public/otc-config.js` (one-file edit, no rebuild)

## Webhooks & Callbacks

**Incoming:**
- None configured

**Outgoing:**
- None configured (Supabase realtime is pull-based subscription, not push webhooks)

## Environment Configuration

**Required env vars (config scripts):**
- `window.RPC_URL` - Soroban RPC endpoint
- `window.HORIZON_URL` - Horizon classic API endpoint
- `window.NETWORK_PASSPHRASE` - `'Test SDF Network ; September 2015'` (Testnet)
- `window.OTC_CONTRACT_ID` - Deployed otc_swap contract id
- `window.RFQ_SWAP_CONTRACT_ID` - Deployed rfq_swap contract id (not yet used)
- `window.REFLECTOR_ORACLE_ID` - Reflector Oracle contract id (empty = disabled)
- `window.SUPABASE_URL` - Supabase project URL
- `window.SUPABASE_ANON_KEY` - Supabase anon public key

**Secrets location:**
- No secrets in code (anon key is public by design)
- Supabase SQL Editor credentials (server-only, not in repo)
- Wallet extension keeps signing keys locally in browser storage
- Demo funding tools use gitignored `demo-keys.json` and `e2e-keys.json` (never committed)

## Integration Points & Attack Surface

**Security boundary (STELLAR.md compliance):**
- **Off-chain (Supabase):** Coordination only; reads are public; integrity is wallet signatures
- **On-chain (Soroban):** Dual auth entries over exact args; permissionless submit; tamper detected in simulation
- **CSP (vercel.json):** Allow-list only; Soroban RPC, Horizon, Supabase (REST + WSS) in `connect-src`

**Testnet resets (~quarterly):**
- `stellar contract deploy` + update 3 contract ids in `public/otc-config.js`
- Supabase data survives (off-chain coordination table)
- Reflector Oracle redeploys (SDF responsibility, update id in config)

---

*Integration audit: 2026-08-18*
