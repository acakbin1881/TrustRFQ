# CLAUDE.md

Guidance for Claude Code sessions working in this repo. This file is **auto-loaded into context
at the start of every session** — no command needed. Run **`/init`** to regenerate/refresh it as
the project evolves.

## Required reading (auto-loaded)

@STELLAR.md

The import above pulls in **[STELLAR.md](STELLAR.md)** — a curated Stellar/Soroban development
reference distilled from the official docs. **Read it before doing any Stellar work.** When it and
this file disagree on a repo-specific detail, this file wins.

## Project

**TrustRFQ** — a peer-to-peer OTC dApp on **Stellar** (XLM/USDC), modeled on the Swap/AirSwap
peer protocol: parties agree **off-chain** (RFQ negotiation) and settle **on-chain**
(atomic swap). Settlement is **AirSwap-style**: each party signs an **off-chain Soroban
authorization entry** over the exact terms; a permissionless **`fill`** carries both signatures
and moves the legs in one tx (no separate on-chain `approve`).

Roadmap: a near-term **intent/private-offer layer** (pair-classified taker discovery), then an
**institutional RFQ protocol** (peer-to-server quoting). Both will be built on the new frontend
stack (see Stack below).

## Status (keep current)

- **Off-chain RFQ: done & working.** Create → wallet-sign → deliver (routed by taker address) →
  Accept/Decline, live via Supabase realtime.
- **On-chain settlement: deployed (AirSwap-style signed `fill`).** `require_auth` + direct
  `transfer`, 6/6 unit tests pass. Testnet:
  `OTC_CONTRACT_ID = CCAPYEWHYSGORPUOC7FBSIRBIWSJJSPJOIWPJNEZLGDXUWJVWV7MTKBJ` (redeployed
  2026-06-30; on-chain bytecode provably matches `src/lib.rs`). Proven end-to-end via spikes.
- **DB migrated (live).** Supabase project `zaflldqvenbgfaxtzbjc`: auth-model columns
  (`maker_auth`/`taker_auth`, `settlement_status`), table in `supabase_realtime` with
  `replica identity full` (verified).
- **Pending to go live:** two-wallet **XLM↔XLM** E2E in the browser (verifies wallet
  `signAuthEntry` end-to-end). Targets **Testnet** only.
- **STELLAR.md compliance audit (2026-06-30): passed.** All fund/signature-critical paths verified;
  strict CSP + security headers added (`vercel.json`), `otc.html`'s module externalized to `otc.js`.
  Accepted risks (Testnet MVP): public anon-key reads; off-chain RFQ signatures stored but
  unverified (on-chain auth entries are the real integrity boundary); no SRI on esm.sh imports.
- **Frontend redesigned (2026-07-08): "private desk", brand = TrustRFQ.** Shared design system in
  `styles.css`; hardened output layer (`esc()` on all DB strings, token allow-list quarantine,
  `settle_tx_hash` validation). Details in commit `ef4b70c`.
- **Frontend migrated to React + TypeScript + Vite (2026-07-10, branch
  `frontend/react-ts-migration`).** Like-for-like port of the desk; landing stays hand-written
  static HTML in `public/`. The signature boundary (`src/core/canonical.ts`) is pinned
  **byte-for-byte** to the vanilla output via golden vectors (`fixtures/canonical-args.json`,
  captured from the live esm.sh stack — regenerate with `npm run capture`). CSP tightened:
  **esm.sh removed entirely** (deps now bundled). Vanilla `otc.js`/`canonical.js` kept at repo
  root as the reference implementation (not deployed) until the two-wallet E2E passes on the new
  stack. Spec: `docs/superpowers/specs/2026-07-10-react-ts-frontend-migration-design.md`.

## Stack

- **Frontend: React + TypeScript on Vite** (migrated 2026-07-10). The desk (`otc.html` → `src/`)
  is a client-only SPA compiled to static files; **no server runtime** (mirrors AirSwap's
  architecture — their quote server is a separate deployable, and so will ours be). The landing
  (`public/hero.html` + `hero.js`) stays hand-written static HTML, copied verbatim into the build.
  Deployed on Vercel via `npm run build` → `dist/`.
- **Runtime config is deliberately un-bundled:** `public/otc-config.js` / `public/supabase-config.js`
  stay `window.*` scripts, so a Testnet reset is a one-file edit, not a rebuild (typed in
  `src/config.ts`).
- **Backend:** Supabase (Postgres + RLS + Realtime) used with the **anon key, no auth**.
- **Chain:** Stellar **Testnet**; settlement via a **Soroban** (Rust) contract; classic assets used
  as **SACs** (Stellar Asset Contracts).
- **Pinned deps (now in package.json):** `@creit.tech/stellar-wallets-kit@1.9.5` (exact),
  `@stellar/stellar-sdk@^16`, `@supabase/supabase-js@^2`, `buffer@^6`, React 19, Vite 8, Vitest 4.

## File map

| Path | What |
|------|------|
| `otc.html` | **Vite entry** for the desk: head + `#root` + config scripts + `src/main.tsx`. |
| `src/core/canonical.ts` | **The signature boundary** — `fillCanonicalArgs` etc., pinned by golden vectors. |
| `src/core/fill.ts` | Chain ops: `signFillAuth` / `submitFill`, wallet injected as `WalletSigner`. |
| `src/core/tokens.ts` | Token allow-list (quarantine boundary) + validation/display helpers. |
| `src/config.ts` | Typed reader of the `window.*` runtime config (the only module that may). |
| `src/data/` | Supabase client, `orders.ts` queries/mutations, `useOrders` (+ realtime). |
| `src/wallet/` | Wallets-kit singleton + `walletSign`, `WalletContext` (connect/disconnect). |
| `src/ui/` | `Gate`, `Ticket`, `OrderCard`, `SettlementStrip`, `Toast`, `useSettlement`, `useNow`. |
| `public/hero.html` + `hero.js` | Hand-written landing (never bundled); links → `otc.html`. |
| `public/styles.css` | **Shared design system** — unchanged by the migration; JSX must keep its classes. |
| `public/*-config.js` | Runtime config (`window.*`): Supabase URL/key, RPC/Horizon/passphrase/contract id. |
| `fixtures/canonical-args.json` | Golden vectors pinning `canonical.ts` to the vanilla bytes. |
| `tools/capture.html` + `capture-server.mjs` | Regenerates the golden vectors from the vanilla esm.sh stack. |
| `otc.js`, `canonical.js` | **Vanilla reference implementation** (root; excluded from deploy). |
| `vercel.json` | `buildCommand`/`outputDirectory` + `cleanUrls` + `/`→`/hero` rewrite; CSP/HSTS headers. |
| `contracts/otc_swap/` | Soroban contract: `fill(...)` + unit tests (`src/lib.rs`, `src/test.rs`). |
| `README.md` | Setup, schema SQL (+ anon-grant hardening), Phase-2 deploy steps, E2E. |

## Identity & trust model

- **Connected Stellar wallet = identity.** No sign-in. Integrity comes from **wallet signatures**,
  not RLS: maker/taker sign the RFQ steps, and on-chain each party signs an off-chain Soroban auth
  entry over the exact `fill` terms, so the submitter cannot alter the deal. The anon Supabase
  backend only coordinates UI state; **reads are public** — acceptable for a Testnet MVP.
- Future hardening (not built): Sign-In-With-Stellar (signed nonce → JWT) for per-wallet RLS.

## Data model

`public.orders`, routed by `taker_address`. Core: `maker_address/amount/token`,
`taker_address/amount/token`, `expiration`, `nonce`, `signature`, `signed_payload`,
`taker_signature`, `status` (`pending|accepted|declined|cancelled|expired`). Settlement:
`settlement_status` (`idle|signing|ready|settling|settled|failed`), `maker_auth`, `taker_auth`
(base64 XDR of signed auth entries), `settle_tx_hash`, `settle_error`, `settled_at`.

## Commands

```bash
npm run dev                                                   # → http://localhost:5173/otc.html
npm test                                                      # vitest: golden vectors + token/validation suites
npm run build                                                 # tsc --noEmit && vite build → dist/
npm run capture                                               # regenerate fixtures/ from the vanilla esm.sh stack
cargo test --manifest-path contracts/otc_swap/Cargo.toml      # contract unit tests
cd contracts/otc_swap && stellar contract build               # → target/.../release/otc_swap.wasm
# deploy + SAC + config: see README "On-chain settlement (Phase 2)"
```

The contract is the **on-chain `fill`**: `maker.require_auth()` + `taker.require_auth()` over the
full args (the security boundary — tampered amounts have no valid signature), then direct SAC
`transfer`s. Replay: `Filled(order_id)` key + auth-entry nonces; staleness: `expiration`.
Client: `signOrderAuth` simulates `fill` with the counterparty as source, signs via
`kit.signAuthEntry` wrapped in `Stellar.authorizeEntry`; `fillOrder` attaches both entries,
enforcing-mode simulate, assemble + submit. **`fillCanonicalArgs` must stay deterministic**
(derive `expiration` from `order.expiration`, never `Date.now()`).

## Gotchas (do not rediscover)

- **The bundle must resolve the npm `buffer`, never Node's builtin.** `vite.config.ts` aliases
  `buffer` → `buffer/index.js` so Vitest (Node) and the browser bundle exercise the SAME
  implementation the signatures are computed with. If canonical bytes ever drift, the golden-vector
  tests (`src/core/canonical.test.ts` vs `fixtures/canonical-args.json`) go red — trust them.
- **`define: { global: 'globalThis' }` in `vite.config.ts` is load-bearing** — wallet/SDK deps
  reference Node's `global` at module scope; without the shim the whole bundle dies on load
  (symptom: blank page, "global is not defined"). esm.sh used to shim this invisibly.
- **`modulePreload.polyfill: false` keeps the build free of inline scripts** — the CSP has no
  `'unsafe-inline'` in `script-src` and must never gain one. After any build-config change, check
  `dist/*.html` for inline `<script>` blocks.
- **The CSP in `vercel.json` is an allow-list — keep it in sync with the code.** Any new external
  origin must be added to the matching directive (RPC/Horizon/Supabase → `connect-src`, etc.) or
  the browser silently blocks it. Test in the browser console (zero CSP violations) after any
  change. esm.sh is GONE from the CSP — only `tools/capture.html` (dev-only, never deployed) still
  loads from it.
- **esm.sh `?bundle-deps` (vanilla reference + capture tool only):** default esm.sh builds of
  `stellar-wallets-kit`/`stellar-sdk` ship a CJS dep with broken named-export interop that throws
  on import. Only relevant to `otc.js`/`canonical.js`/`tools/capture.html` now.
- **macOS (aarch64) toolchain works natively** — rustc 1.96.1, `wasm32v1-none` target, Stellar
  CLI 27 (`~/.local/bin/stellar`). No workarounds needed on this Mac.
- **Windows-only:** native build/test hits MSVC-linker / non-ASCII-path / cdylib traps; the wasm
  target is `wasm32v1-none`, NOT `wasm32-unknown-unknown`; install the Stellar CLI via winget, not
  cargo. Full details in this file's history (commits `426f85a`…`4d01878`).
- **Supabase DDL only via the SQL Editor** (the anon key cannot run DDL). Migrations live in README.
- **Token SAC ids are derived in-app** (`Asset.contractId`); only `OTC_CONTRACT_ID` is hardcoded.
- **Testnet resets ~quarterly** → redeploy the contract and update `OTC_CONTRACT_ID`.

## Verify before deploying

1. `npm test` green — golden vectors byte-identical + token/validation suites (34 tests).
2. `npm run build` clean; `dist/*.html` has **zero inline scripts**; `grep -r esm.sh dist/` empty.
3. `cargo test …` green — 6 tests (swap, replay, expiry, zero-amount, scoped-auth, amount-tamper).
4. `stellar contract build` produces `otc_swap.wasm` (target `wasm32v1-none`).
5. Review amounts + contract/SAC ids before signing any wallet prompt.
6. Deploy → paste `C…` id into `public/otc-config.js` → run the Phase-2 migration → two funded
   Testnet wallets, two browsers, E2E (README). Browser console must show zero CSP violations.

## Conventions

- **React side:** strict TS, no `dangerouslySetInnerHTML` (JSX escaping replaces the old `esc()`),
  keep JSX class names in lockstep with `public/styles.css` (design tokens are CSS custom
  properties — extend the tokens, don't hardcode new literals). `src/core/` stays pure: no wallet,
  no network, no window (config comes in through `src/config.ts`, the wallet through the
  `WalletSigner` interface).
- **`otc.js`/`canonical.js` are a frozen reference** — don't develop on them; delete once the
  two-wallet E2E passes on the React build.
- **New complex features** (intent layer, institutional RFQ) go on the React + TypeScript stack.
- Reference files as clickable `path:line` links.
- **Commit/push only when asked**; branch off `main` first.
