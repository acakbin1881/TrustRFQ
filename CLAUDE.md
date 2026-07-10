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

## Stack

- **Frontend — migration decided (2026-07-10):** the frontend will be rebuilt in
  **React + TypeScript** (build-based stack); upcoming complex features (intent/private-offer
  layer, institutional RFQ) will be developed on the new stack. **The current vanilla files
  (`otc.html`/`otc.js`/`hero.*`/`styles.css`) remain the live product until the migration lands** —
  bugfixes continue on the vanilla side. Framework/tooling choice (Next.js vs Vite etc.) is not
  yet decided; the migration gets its own design session.
- **Current (live) frontend:** plain static HTML, **no build step**, deployed on Vercel. Browser
  libraries are ES-module imports from **esm.sh**.
- **Backend:** Supabase (Postgres + RLS + Realtime) used with the **anon key, no auth**.
- **Chain:** Stellar **Testnet**; settlement via a **Soroban** (Rust) contract; classic assets used
  as **SACs** (Stellar Asset Contracts).
- **Pinned browser deps:** `@creit.tech/stellar-wallets-kit@1.9.5`, `@stellar/stellar-sdk@16`,
  `@supabase/supabase-js@2`, `buffer@6`.

## File map

| Path | What |
|------|------|
| `hero.html` | TrustRFQ landing (self-contained animated hero); links → `otc.html`. |
| `otc.html` | The desk shell: wallet gate, RFQ ticket, Incoming/Sent, settlement UI. **Markup only.** |
| `otc.js` | The app logic (one ES module): wallet, RFQ, `signOrderAuth`/`fillOrder`. |
| `styles.css` | **Shared design system** (tokens + all component/page styles for both pages). |
| `hero.js` | Landing-only canvas starfield (plain script, reduced-motion aware). |
| `favicon.svg` | Gold swap-mark favicon (both pages). |
| `supabase-config.js` | `window.SUPABASE_URL` / `SUPABASE_ANON_KEY`. |
| `otc-config.js` | `window.RPC_URL` / `HORIZON_URL` / `NETWORK_PASSPHRASE` / `OTC_CONTRACT_ID`. |
| `vercel.json` | `cleanUrls` + rewrite `/` → `/hero`; security **headers** (CSP, HSTS, …). |
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
npx serve .                                                   # → http://localhost:3000/otc.html
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

- **esm.sh `?bundle-deps` is mandatory** for `stellar-wallets-kit` and `stellar-sdk` — default
  builds ship a CJS dep with broken named-export interop that throws on import and kills the whole
  module (symptom: Connect button does nothing). Keep the `globalThis.Buffer = Buffer` shim.
- **The CSP in `vercel.json` is an allow-list — keep it in sync with the code.** Page JS must stay
  in external files (`otc.js`, `hero.js`), never inline. Any new external origin must be added to
  the matching directive (RPC/Horizon/Supabase → `connect-src`, etc.) or the browser silently
  blocks it. Test in the browser console (zero CSP violations) after any change.
- **macOS (aarch64) toolchain works natively** — rustc 1.96.1, `wasm32v1-none` target, Stellar
  CLI 27 (`~/.local/bin/stellar`). No workarounds needed on this Mac.
- **Windows-only:** native build/test hits MSVC-linker / non-ASCII-path / cdylib traps; the wasm
  target is `wasm32v1-none`, NOT `wasm32-unknown-unknown`; install the Stellar CLI via winget, not
  cargo. Full details in this file's history (commits `426f85a`…`4d01878`).
- **Supabase DDL only via the SQL Editor** (the anon key cannot run DDL). Migrations live in README.
- **Token SAC ids are derived in-app** (`Asset.contractId`); only `OTC_CONTRACT_ID` is hardcoded.
- **Testnet resets ~quarterly** → redeploy the contract and update `OTC_CONTRACT_ID`.

## Verify before deploying

1. `cargo test …` green — 6 tests (swap, replay, expiry, zero-amount, scoped-auth, amount-tamper).
2. `stellar contract build` produces `otc_swap.wasm` (target `wasm32v1-none`).
3. Review amounts + contract/SAC ids before signing any wallet prompt.
4. Deploy → paste `C…` id into `otc-config.js` → run the Phase-2 migration → two funded Testnet
   wallets, two browsers, E2E (README).

## Conventions

- **Live vanilla side:** match existing style (vanilla JS, no framework/build; design tokens are
  CSS custom properties in `styles.css` — extend the tokens, don't hardcode new literals). Any
  DB-sourced string entering `innerHTML` goes through `esc()`; keep IDs and `data-*` hooks stable.
- **New complex features** (intent layer, institutional RFQ) wait for / are built on the
  **React + TypeScript** stack — don't grow them into the vanilla codebase.
- Reference files as clickable `path:line` links.
- **Commit/push only when asked**; branch off `main` first.
