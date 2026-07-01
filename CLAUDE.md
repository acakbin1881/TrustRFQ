# CLAUDE.md

Guidance for Claude Code sessions working in this repo. This file is **auto-loaded into context
at the start of every session** — no command needed. Run **`/init`** to regenerate/refresh it as
the project evolves.

## Required reading (auto-loaded)

@STELLAR.md

The import above pulls in **[STELLAR.md](STELLAR.md)** — a curated Stellar/Soroban development
reference distilled from the full `developers.stellar.org/docs/build` tree (Introduction → Securing
web-based projects). It loads every session alongside this file. **Read it before doing any Stellar
work.** When it and this file disagree on a repo-specific detail, this file wins.

## Project

**Trust OTC** — a peer-to-peer OTC dApp on **Stellar** (XLM/USDC), modeled on the Swap/AirSwap
peer protocol: parties agree **off-chain** (RFQ negotiation) and settle **on-chain**
(atomic swap). On-chain settlement is **AirSwap-style**: each party signs an **off-chain Soroban
authorization entry** over the exact terms; a permissionless **`fill`** carries both signatures
and moves the legs in one tx (no separate on-chain `approve`).

## Status (keep current)

- **Off-chain RFQ: done & working.** Create → wallet-sign → deliver (routed by taker address) →
  Accept/Decline, all live via Supabase realtime.
- **On-chain settlement: deployed (AirSwap-style signed `fill`).** Soroban contract rewritten to
  `require_auth` + direct `transfer` (no allowances) + **6/6 unit tests pass** (incl. amount-tamper
  rejection). Deployed to Testnet: `OTC_CONTRACT_ID = CCAPYEWHYSGORPUOC7FBSIRBIWSJJSPJOIWPJNEZLGDXUWJVWV7MTKBJ`
  (redeployed 2026-06-30 from macOS under the local `deployer` identity, built with rustc 1.96.1 /
  soroban-sdk 26.1.0 — on-chain bytecode provably matches `src/lib.rs`; supersedes the prior
  `CBLKKVX3…` deploy, which was the same source built with rustc 1.96.0).
  `otc.html` rewritten to `signOrderAuth` (off-chain auth entry) + enforcing-mode assemble/submit;
  proven end-to-end on Testnet via standalone spikes.
- **DB migrated (live).** Supabase project `zaflldqvenbgfaxtzbjc` (TrustRFQ) transitioned to the
  auth model: `maker_approve_tx`/`taker_approve_tx` → `maker_auth`/`taker_auth`, `settlement_status`
  check now `idle|signing|ready|settling|settled|failed`. Table is in `supabase_realtime` with
  `replica identity full` (verified).
- **Pending to go live:** two-wallet **XLM↔XLM** E2E in the browser (verifies wallet
  `signAuthEntry` end-to-end). Targets **Testnet** only.
- **STELLAR.md compliance audit (2026-06-30): passed.** Every fund/signature-critical path —
  contract auth (both `require_auth` over full args), `Filled(order_id)` + `expiration` replay/
  staleness, deterministic signed `fill` (`fillCanonicalArgs`, never `Date.now()`), enforcing-mode
  submit, derived SAC ids, i128 BigInt math, `?bundle-deps` imports — verified compliant. Fixed the
  **web-infra gaps (§11)**: added `vercel.json` security headers + a strict **CSP** (which required
  externalizing `otc.html`'s module to `otc.js`). Hardened contract tests with an `env.auths()`
  assertion + host-enforced-layer notes. **Accepted risks** (Testnet MVP): Supabase anon-key public
  reads; off-chain RFQ signatures (`canonicalPayload`) are stored but **unverified** — the on-chain
  auth entries are the real integrity boundary; no SRI on esm.sh imports (dynamic; versions pinned).

## Stack

- **Frontend:** plain static HTML, **no build step**, deployed on Vercel. Browser libraries are
  ES-module imports from **esm.sh**.
- **Backend:** Supabase (Postgres + RLS + Realtime) used with the **anon key, no auth**.
- **Chain:** Stellar **Testnet**; settlement via a **Soroban** (Rust) contract; classic assets used
  as **SACs** (Stellar Asset Contracts).
- **Pinned browser deps:** `@creit.tech/stellar-wallets-kit@1.9.5`, `@stellar/stellar-sdk@16`,
  `@supabase/supabase-js@2`, `buffer@6`.

## File map

| Path | What |
|------|------|
| `hero.html` | Landing page; top-right **OTC** button → `otc.html`. |
| `otc.html` | The app shell: wallet gate, Create/Incoming/Sent, settlement UI. Markup + inline `<style>`; the JS is loaded from `otc.js`. |
| `otc.js` | The app logic (one ES module): wallet, RFQ, `signOrderAuth`/`fillOrder`. Externalized from `otc.html` so the CSP can drop `'unsafe-inline'` for scripts. |
| `supabase-config.js` | `window.SUPABASE_URL` / `SUPABASE_ANON_KEY`. |
| `otc-config.js` | `window.RPC_URL` / `HORIZON_URL` / `NETWORK_PASSPHRASE` / `OTC_CONTRACT_ID`. |
| `vercel.json` | `cleanUrls` + rewrite `/` → `/hero`; security **headers** (CSP, HSTS, X-Frame-Options, …). |
| `contracts/otc_swap/` | Soroban contract: `fill(...)` + unit tests (`src/lib.rs`, `src/test.rs`). |
| `README.md` | Setup, schema SQL, Phase-2 deploy steps, E2E. |

## Identity & trust model

- **Connected Stellar wallet = identity.** No sign-in (no Google/email).
- Integrity comes from **wallet signatures**, not RLS: maker signs the order (`signature`/
  `signed_payload`), taker signs accept/decline (`taker_signature`), and on-chain each party signs
  an **off-chain Soroban auth entry** over the exact `fill` terms (amounts included), so the
  submitter cannot alter the deal. The anon Supabase backend only coordinates UI state and **reads
  are public** — acceptable for a Testnet MVP.
- Future hardening (not built): Sign-In-With-Stellar (sign a nonce → Edge Function mints a JWT) for
  per-wallet RLS + private reads.

## Data model

`public.orders`, routed by `taker_address`. Core: `maker_address/amount/token`,
`taker_address/amount/token`, `expiration`, `nonce`, `signature`, `signed_payload`,
`taker_signature`, `status` (`pending|accepted|declined|cancelled|expired`). Phase-2 settlement
columns: `settlement_status` (`idle|signing|ready|settling|settled|failed`), `maker_auth`,
`taker_auth` (base64 XDR of each party's signed `SorobanAuthorizationEntry`), `settle_tx_hash`,
`settle_error`, `settled_at`. Table is in the `supabase_realtime` publication with
`replica identity full` (so address-filtered UPDATE events stream).

## Commands

```bash
npx serve .                                                   # → http://localhost:3000/otc.html
cargo test --manifest-path contracts/otc_swap/Cargo.toml      # contract unit tests (see Windows note)
cd contracts/otc_swap && stellar contract build               # → target/.../release/otc_swap.wasm
# deploy + SAC + config: see README "On-chain settlement (Phase 2)"
```

The contract is the **on-chain `fill`**: after `maker.require_auth()` + `taker.require_auth()`
(each satisfied by that party's off-chain-signed auth entry, which binds the exact args), it moves
both legs via SAC `transfer` — atomic and permissionless. `require_auth` over the full args is the
security boundary: a `fill` with tampered amounts has no valid signature and reverts. Replay
guarded by a `Filled(order_id)` key + Soroban auth-entry nonces; staleness by `expiration`.

Client (`otc.js`): `signOrderAuth` simulates `fill` with the **counterparty as source** so the
signer's auth surfaces as a signable address credential, signs it via `kit.signAuthEntry`
(SEP-43) wrapped in `Stellar.authorizeEntry`, and stores the base64 entry. `fillOrder` parses both
stored entries, attaches them, runs an **enforcing-mode** simulation (auth pre-attached → correct
footprint), then assembles + submits. **`fillCanonicalArgs` must stay deterministic** (derive
`expiration` from `order.expiration`, never `Date.now()`) — drifting args break the signatures.

## Gotchas (do not rediscover)

- **esm.sh `?bundle-deps` is mandatory** for `stellar-wallets-kit` and `stellar-sdk`. The default
  esm.sh builds leave a CJS dep with broken named-export interop (e.g. `tweetnacl-util`,
  `tweetnacl`) that **throws on import and kills the whole module** — symptom: the Connect button
  does nothing because `init()` never runs. Also keep the `globalThis.Buffer = Buffer` shim.
- **The CSP in `vercel.json` is an allow-list — keep it in sync with the code.** The strict policy
  (`script-src 'self' https://esm.sh`) only works because the app JS lives in `otc.js`, **not**
  inlined in `otc.html` — do not move it back inline. Any new external origin the app talks to must
  be added to the matching directive or the browser **silently blocks it**: RPC/Horizon/Supabase →
  `connect-src`; fonts → `style-src`/`font-src`; the landing video → `media-src`; a wallet module
  beyond Freighter (e.g. WalletConnect) → its relay in `connect-src`. Test in the browser console
  (zero CSP violations) after any change.
- **macOS (aarch64) toolchain works natively — no workarounds.** Set up 2026-06-30: rustc 1.96.1,
  `wasm32v1-none` target, Stellar CLI 27 (`~/.local/bin/stellar`). `cargo test`, `stellar contract
  build`, and `stellar contract deploy --source-account deployer` all run directly from the repo
  path. The Windows traps below are **Windows-only**; ignore them on this Mac.
- **Windows native build/test linker traps:**
  - Default toolchain is **MSVC but `link.exe` is missing** → `cargo test` can't link.
  - Workaround: a **GNU toolchain run from an ASCII-only path** — the repo path contains
    `…\Masaüstü\…` (the `ü`), which breaks MinGW `ld`. Copy `contracts/otc_swap` to e.g.
    `%TEMP%\otc_swap` first.
  - The contract's `cdylib` crate-type triggers MinGW **"export ordinal too large"**; for *native
    tests only* build **rlib-only** (temp copy's `Cargo.toml` → `crate-type = ["rlib"]`). Keep
    `cdylib` in the real `Cargo.toml` (needed for wasm). Working invocation:
    `cargo +stable-x86_64-pc-windows-gnu test` from `%TEMP%\otc_swap`.
  - **wasm target is `wasm32v1-none`, NOT `wasm32-unknown-unknown`** — soroban-sdk 26 hard-rejects
    the latter (reference-types/multi-value). Add it to the GNU toolchain
    (`rustup target add wasm32v1-none --toolchain stable-x86_64-pc-windows-gnu`).
  - **Building wasm directly with cargo still needs the GNU toolchain + an ASCII path** — host
    proc-macros (serde/quote) link with the host linker, so MSVC's missing `link.exe` breaks them
    and MinGW `ld` chokes on the `ü` path. Build from `%TEMP%\otc_swap_wasm`:
    `cargo +stable-x86_64-pc-windows-gnu build --target wasm32v1-none --release`. (`stellar
    contract build` handles toolchain/target itself and is the normal deploy path.)
- **Install the Stellar CLI as a prebuilt binary**: `winget install Stellar.StellarCLI` (installed
  v27 to `C:\Program Files (x86)\Stellar CLI\stellar.exe`; PATH needs a new shell). Do **not**
  `cargo install stellar-cli` (compiles from source → hits the missing MSVC linker).
- **Supabase DDL only via the SQL Editor** (the anon key cannot run DDL). Migrations live in README.
- **Token SAC ids are derived in-app** from asset + network passphrase (`Asset.contractId`); only
  `OTC_CONTRACT_ID` is hardcoded (in `otc-config.js`, after deploy).
- **Testnet resets ~quarterly** → redeploy the contract and update `OTC_CONTRACT_ID`.

## Verify before deploying

1. `cargo test …` green — 6 tests (swap, replay, expiry, zero-amount, scoped-auth, amount-tamper).
2. `stellar contract build` produces `otc_swap.wasm` (target `wasm32v1-none`).
3. Review amounts + contract/SAC ids before signing any wallet prompt.
4. Deploy → paste `C…` id into `otc-config.js` → run the Phase-2 migration → two funded Testnet
   wallets, two browsers, E2E (README).

## Conventions

- Match existing style: vanilla JS, no framework/build; dark theme tokens (`#E5B567` gold, Space
  Grotesk headings, Hanken Grotesk body).
- Reference files as clickable `path:line` links.
- **Commit/push only when asked**; branch off `main` first.
