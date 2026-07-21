# CLAUDE.md

Guidance for Claude Code sessions working in this repo. This file is **auto-loaded into context
at the start of every session**, no command needed. Run **`/init`** to regenerate/refresh it as
the project evolves.

## Required reading (auto-loaded)

@STELLAR.md

The import above pulls in **[STELLAR.md](STELLAR.md)**, a curated Stellar/Soroban development
reference distilled from the official docs. **Read it before doing any Stellar work.** When it and
this file disagree on a repo-specific detail, this file wins.

## Project

**TrustRFQ** is a peer-to-peer OTC dApp on **Stellar** (XLM/USDC), modeled on the Swap/AirSwap
peer protocol: parties agree **off-chain** (RFQ negotiation) and settle **on-chain**
(atomic swap). Settlement is **AirSwap-style**: each party signs an **off-chain Soroban
authorization entry** over the exact terms; a permissionless **`fill`** carries both signatures
and moves the legs in one tx (no separate on-chain `approve`).

Roadmap: an **institutional RFQ protocol** (peer-to-server quoting), built on the same stack.
The earlier roadmap item, the intent/private-offer layer, already shipped (see Status).

## Status (keep current)

- **App shape: ONE page.** `otc.html` → `src/` (React + TS + Vite), everything merged to `main`
  (the old `frontend/react-ts-migration`, `feat/intent-layer`, and `design` branches are all in;
  `intent.html` deleted 2026-07-13). Light "milky swap" desk + electric-indigo glass landing;
  latest design merge `e75cf6f` (2026-07-15: bar-mounted section nav, glass Incoming panel,
  landing refresh). Targets **Testnet** only.
- **Off-chain RFQ: done & working.** One compose form; the optional counterparty address alone
  decides directed vs broadcast; every offer is a `ThreadView` (Accept/Decline/Counter), live via
  Supabase realtime.
- **On-chain settlement: deployed** (AirSwap-style signed `fill`: `require_auth` + direct
  `transfer`). `OTC_CONTRACT_ID = CCAPYEWHYSGORPUOC7FBSIRBIWSJJSPJOIWPJNEZLGDXUWJVWV7MTKBJ`
  (redeployed 2026-06-30; on-chain bytecode provably matches `src/lib.rs`).
- **Two-wallet browser E2E: PASSED 2026-07-14**, cross-asset (10 XLM ↔ 1 USDC, so the trustline
  path ran) through two Freighter wallets. Order `41dbd5ef-9bb3-49d2-b9f7-cec13f13e6bb`, tx
  `af0392ff49ac9478a95fd8059bc64f62fd715d1de84d16d4acd912c5268a63aa`, ledger 3604560.
  Wallet-signed auth entries work end-to-end; getting there required the wallets-kit
  `signAuthEntry` normalisation (see Gotchas).
- **DB live.** Supabase project `zaflldqvenbgfaxtzbjc`: settlement columns
  (`maker_auth`/`taker_auth`, `settlement_status`), realtime with `replica identity full`;
  intent-layer schema + grant reconciliation applied 2026-07-11
  (`docs/migrations/2026-07-10-intent-layer.sql`).
- **Wallets: Freighter only** for now (`src/wallet/kit.ts` registers only `FreighterModule`;
  commit `584a9ad`).
- **Reflector fair-price suggestion (2026-07-18, `b051d2b`).** Advisory reference price on the
  compose ticket via SEP-40 read-only simulation (`src/core/oracle.ts`,
  `src/data/useFairPrice.ts`); never signed, never on the settlement path.
  `window.REFLECTOR_ORACLE_ID` in `public/otc-config.js` (empty = feature silently off; update on
  a Testnet reset like `OTC_CONTRACT_ID`; uses the already-allowed RPC origin, so no CSP change).
  Spec: `docs/superpowers/specs/2026-07-15-reflector-fair-price-suggestion-design.md`.
- **TEMPORARY, demo only (2026-07-18, `4b3ebd5`): the USDC allow-list points at OUR OWN Testnet
  issuer, not Circle's** (both issuer ids sit in the `src/core/tokens.ts` comment; real Circle
  USDC reads balance 0 and is quarantined while this is active). Revert = restore Circle's issuer
  in `tokens.ts` AND update `src/core/tokens.test.ts` + `src/core/pairs.test.ts` (they pin the
  issuer). Demo funding tools: `tools/derive-keys.mjs` / `fund-demo.mjs` / `mint-usdc.mjs` /
  `sweep-xlm.mjs`; secrets live in the gitignored `demo-keys.json`.
- **Security posture.** STELLAR.md compliance audit passed 2026-06-30; strict CSP + security
  headers in `vercel.json`. Accepted Testnet-MVP risks: public anon-key reads; off-chain RFQ
  signatures stored but unverified (on-chain auth entries are the real integrity boundary).
- **Docs.** README rewritten 2026-07-20 (React stack, full Supabase setup SQL, contract deploy,
  E2E walkthrough). Feature history lives in `git log` and `docs/superpowers/specs/`.

## Stack

- **Frontend: React + TypeScript on Vite** (migrated 2026-07-10). **ONE entry: `otc.html` →
  `src/`** (merged 2026-07-13): a client-only SPA compiled to static files, **no server runtime**
  (mirrors AirSwap's architecture: their quote server is a separate deployable, and so will ours
  be). The landing (`public/hero.html` + `hero.css` + `hero.js`) stays hand-written static HTML,
  copied verbatim into the build. Deployed on Vercel via `npm run build` → `dist/`.
- **Two visual systems, on purpose.** The desk is the light "milky swap" theme
  (`styles.css` + `intent.css`, **in that order**, see Gotchas); the landing is electric-indigo
  glassmorphism (`hero.css`). They share no CSS: the landing does not load `styles.css`, and every
  landing selector is `.lp-`-prefixed. **styles.css token NAMES and selectors are a compatibility
  contract with `intent.css` and the JSX that hardcodes them**: change values freely, never rename
  or drop. `--gold`/`--gold-hi`/`--gold-lo`/`--gold-ink` = the primary ink-accent family, not gold.
- **Runtime config is deliberately un-bundled:** `public/otc-config.js` / `public/supabase-config.js`
  stay `window.*` scripts, so a Testnet reset is a one-file edit, not a rebuild (typed in
  `src/config.ts`).
- **Backend:** Supabase (Postgres + RLS + Realtime) used with the **anon key, no auth**.
- **Chain:** Stellar **Testnet**; settlement via a **Soroban** (Rust) contract; classic assets used
  as **SACs** (Stellar Asset Contracts).
- **Pinned deps (package.json):** `@creit.tech/stellar-wallets-kit@1.9.5` (exact),
  `@stellar/stellar-sdk@^16`, `@supabase/supabase-js@^2`, `buffer@^6`, React 19, Vite 8, Vitest 4.

## File map

| Path | What |
|------|------|
| `otc.html` | **The one Vite entry**: head + both stylesheets + `#root` + config scripts + `src/main.tsx`. |
| `src/App.tsx` | The shell: topbar + gate + 3 sections. Owns every subscription. **Must never call `useSettlement`** (see Gotchas). |
| `src/ui/Ticket.tsx` | **The one compose form**: an empty counterparty address means broadcast, a filled one means directed. Hosts the fair-price read-back. |
| `src/core/canonical.ts` | **The signature boundary**: `fillCanonicalArgs` etc., pinned by golden vectors. |
| `src/core/fill.ts` | Chain ops: `signFillAuth` / `submitFill`, wallet injected as `WalletSigner`. |
| `src/core/tokens.ts` | Token allow-list (quarantine boundary) + validation/display helpers. USDC entry is **temporarily the demo issuer** (see Status). |
| `src/core/address.ts` | Real strkey checksum check for the counterparty field, with graded errors. |
| `src/core/oracle.ts` | Pure Reflector fair-price math: supported symbols, cross-rate, staleness. |
| `src/core/pairs.ts` / `negotiation.ts` / `balances.ts` | Pure logic (pair keys, rounds/`currentTerms`, Horizon balance parsing), unit-tested. |
| `src/config.ts` | Typed reader of the `window.*` runtime config (the only module that may). |
| `src/data/` | Supabase client + queries/hooks: `orders`, `broadcasts`, `rounds`, `intents`, `useBalances`, `useFairPrice` (+ realtime). `oracle.ts` = the one network read for the fair price (RPC simulation). |
| `src/wallet/` | Wallets-kit singleton (**Freighter only**) + `walletSign` / `walletSignAuthEntry`, `WalletContext` (connect/disconnect). `authSignature.ts` = pure, unit-tested normaliser for the kit's broken `signAuthEntry` encoding (see Gotchas). |
| `src/ui/` | Everything else: `Gate`, `SectionSheet`, `OfferList`, `ThreadView`, `BroadcastList`, `CounterForm`, `RoundTimeline`, `PairsPanel`, `BalanceStrip`, `OrderCard`, `SettlementStrip`, `TokenSelect`, `AddressSeal`, `Toast`, `useSettlement`, `useNow`. |
| `public/intent.css` | Threads / broadcasts / pairs / balances styles. Loaded by `otc.html` **after** `styles.css`; consumes its tokens, never edits it. |
| `public/hero.html` + `hero.js` | Hand-written landing (never bundled); links → `otc.html`. `hero.js` = scroll reveal + ticket parallax. |
| `public/hero.css` | **The landing's design system**: self-contained, `.lp-` prefixed, loads instead of `styles.css`. |
| `public/styles.css` | **The desk's design system** (`otc.html` only); JSX must keep its classes. |
| `public/*-config.js` | Runtime config (`window.*`): Supabase URL/key, RPC/Horizon/passphrase, `OTC_CONTRACT_ID`, `REFLECTOR_ORACLE_ID`. |
| `fixtures/canonical-args.json` | Golden vectors pinning `canonical.ts` to the vanilla bytes. |
| `tools/` | `capture.html` + `capture-server.mjs` (regenerate the golden vectors from the vanilla esm.sh stack), `bundle-check.html` + `bundle-check-driver.mjs` + `dev-smoke.mjs` (headless proofs), and the 4 Testnet demo-funding scripts (secrets go to the gitignored `demo-keys.json`). |
| `otc.js`, `canonical.js` | **Vanilla reference implementation** (root; excluded from deploy). |
| `vercel.json` | `buildCommand`/`outputDirectory` + `cleanUrls` + `/`→`/hero` rewrite + `/intent`→`/otc` redirect; CSP/HSTS headers. |
| `contracts/otc_swap/` | Soroban contract: `fill(...)` + unit tests (`src/lib.rs`, `src/test.rs`). |
| `README.md` | Setup + full Supabase schema SQL (incl. anon-grant hardening), contract deploy, E2E walkthrough (rewritten 2026-07-20). |

## Identity & trust model

- **Connected Stellar wallet = identity.** No sign-in. Integrity comes from **wallet signatures**,
  not RLS: maker/taker sign the RFQ steps, and on-chain each party signs an off-chain Soroban auth
  entry over the exact `fill` terms, so the submitter cannot alter the deal. The anon Supabase
  backend only coordinates UI state; **reads are public**, acceptable for a Testnet MVP.
- Future hardening (not built): Sign-In-With-Stellar (signed nonce → JWT) for per-wallet RLS.

## Data model

`public.orders`, routed by `taker_address`. Core: `maker_address/amount/token`,
`taker_address/amount/token`, `expiration`, `nonce`, `signature`, `signed_payload`,
`taker_signature`, `status` (`pending|accepted|declined|cancelled|expired|countered`). Settlement:
`settlement_status` (`idle|signing|ready|settling|settled|failed`), `maker_auth`, `taker_auth`
(base64 XDR of signed auth entries), `settle_tx_hash`, `settle_error`, `settled_at`. Intent layer:
`broadcasts`, `rounds`, `intents` tables + `orders.broadcast_id`
(see `docs/migrations/2026-07-10-intent-layer.sql`).

## Commands

```bash
npm run dev                                                   # → http://localhost:5173/otc.html
npm test                                                      # vitest: 8 suites, 109 tests (golden vectors + core/wallet units)
npm run build                                                 # tsc --noEmit && vite build → dist/
npm run typecheck                                             # tsc --noEmit only
npm run preview                                               # serve the built dist/
npm run capture                                               # regenerate fixtures/ from the vanilla esm.sh stack
npm run check:bundle                                          # golden vectors through the browser-resolved module graph
npm run check:dev                                             # headless dev-server smoke (React StrictMode double-mount)
cargo test --manifest-path contracts/otc_swap/Cargo.toml      # contract unit tests (6)
cd contracts/otc_swap && stellar contract build               # → target/.../release/otc_swap.wasm
# deploy + SAC + config: see README "The settlement contract"
```

The contract is the **on-chain `fill`**: `maker.require_auth()` + `taker.require_auth()` over the
full args (the security boundary: tampered amounts have no valid signature), then direct SAC
`transfer`s. Replay: `Filled(order_id)` key + auth-entry nonces; staleness: `expiration`.
Client: `signOrderAuth` simulates `fill` with the counterparty as source, signs via
`kit.signAuthEntry` wrapped in `Stellar.authorizeEntry`; `fillOrder` attaches both entries,
enforcing-mode simulate, assemble + submit. **`fillCanonicalArgs` must stay deterministic**
(derive `expiration` from `order.expiration`, never `Date.now()`).

## Gotchas (do not rediscover)

- **stellar-wallets-kit 1.9.5 DOUBLE-ENCODES the signature from `signAuthEntry`; never feed its
  return straight to `authorizeEntry`.** Freighter resolves with a base64 **string**; the kit's
  Freighter module then does `Buffer.from(signedAuthEntry).toString('base64')`, and `Buffer.from(<a
  string>)` takes that string's **utf-8 bytes**, so what you get back is base64 OF the base64.
  Decode it once and you hold the 88 ASCII bytes of the inner base64, not a 64-byte ed25519
  signature; `Stellar.authorizeEntry` then rejects every entry with the maximally unhelpful
  **`signature doesn't match payload`** (thrown from its own `Keypair.verify`, so it reads like a
  key/args mismatch and sends you hunting the wrong bug; it cost a full debugging session). The kit
  guards this exact case in its `signMessage` (`typeof x === 'string' ? x : Buffer.from(x)…`) and
  **forgets to in `signAuthEntry`** (an upstream bug, not ours). `src/wallet/authSignature.ts`
  normalises it (decode once; if it isn't 64 bytes, unwrap the extra layer), so `src/core/` never
  sees the quirk and a correctly-encoded signature still passes through untouched. **Never widen
  `WalletSigner.signAuthEntry` back to returning the wallet's raw string**: it returns raw
  signature bytes precisely so this can't regress. The frozen vanilla `otc.js:456` still has the
  bug; it is not deployed.
- **`src/App.tsx` must NEVER call `useSettlement`.** Its `txBusy` is a `useRef`, i.e. **per
  instance**. `ThreadView` is the only render site of `OrderCard` and therefore the only place a
  settlement can start; it serializes every sign/settle through a **module-scope `settleLock`**. A
  second `useSettlement` instance in the shell would be invisible to that lock and could race a
  ThreadView settle: two wallet prompts, two `submitFill`s, two competing `settlement_status`
  writes. Panels stay mounted, so up to **three** ThreadViews are alive at once. Invariant:
  `grep -rn "^import.*useSettlement\|useSettlement(" src/` → exactly 3 lines (definition, import,
  one call, all in `useSettlement.ts` + `ThreadView.tsx`).
- **`otc.html` loads `styles.css` THEN `intent.css`, and the order is load-bearing.**
  `.counter-form input` (intent.css) and the base `input[type="text"]` (styles.css) have **equal
  specificity**: source order alone decides. Swap them and the counter-form inputs render invisible
  against their own sunken well. (This bug already shipped once.)
- **`intent.css`'s `[data-panel="…"]` rules track the desk's section names** (`create`/`incoming`/
  `sent`). A stale name **fails silently**: no error, just lost spacing. Grep `data-panel` in both
  `src/App.tsx` and `public/intent.css` after renaming a section.
- **Desk: a CSS `mask` clips everything its own element paints, `box-shadow` AND
  `filter: drop-shadow` output alike** (filter runs BEFORE mask in the paint pipeline; verified by
  pixel probe 2026-07-12). That's why the notched swap cards' shadow lives on the plain
  `.ticket__card-shadow` wrapper, not on the masked `.field--card` itself: the wrapper's
  drop-shadow traces the already-masked (notched) silhouette. Moving the shadow back onto the
  masked element makes it silently disappear.
- **Ticket: `.ticket__card-shadow` must carry a `box-shadow`, never `filter: drop-shadow`.** The
  hero uses `backdrop-filter`, and a `filter`ed ANCESTOR becomes the backdrop root: the blur would
  then sample nothing and render flat. (The old notched design needed `drop-shadow` for the opposite
  reason: a mask clipped the card's own `box-shadow`. The mask is gone, so the constraint inverted.)
- **Ticket: never write a bare-element selector under `.ticket__swap`.** The deleted
  `.ticket__swap span { …34px circle… }` rule (0,1,1) outranked `.swap-seam` (0,1,0) and silently
  repainted the seam as a floating white disc. Cost an hour to find.
- **Ticket: `.ticket__legs` is `1fr auto 1fr` with the legs justified INWARD, and `.leg` is
  `nowrap`.** Equal side tracks are what keep the swap orb on the exact centre when a wider token
  (USDC) replaces a narrower one (XLM); a flex row drifts. And because each leg is capped at half
  the hero, a long amount must SHRINK (the `is-long`/`is-xlong`/`is-xxlong` size steps + `flex: 0 1
  auto`), not wrap: wrapping pushes the token code under the number and the two legs stop mirroring.
- **Landing: `transform` and `backdrop-filter` must be on the SAME element.** A transformed (or
  `filter`ed / `will-change`d) *ancestor* becomes the backdrop root, and any descendant's blur then
  samples nothing: the panel renders empty/black in Chrome and Safari. This is why the ticket
  parallax feeds through `--lp-mx`/`--lp-my` custom properties instead of transforming a wrapper, and
  why `.lp-surface` is a plain translucent wash rather than a `.lp-glass` (a frosted parent would
  flatten the frost on every nav pill and ticket inside it).
- **Landing: the glass comes in two tints and that is an accessibility decision, not a style one.**
  A milky *white* frost lifts its backdrop so far toward white that on the electric canvas even
  **pure white text cannot reach 4.5:1**: on the first pass all 30 text elements failed WCAG AA. So
  surfaces carrying small copy (`.lp-card`, `.lp-plaque`, `.lp-contrast`, `.lp-cta`, `.lp-eyebrow`)
  use the **deep indigo frost** (`--lp-glass-deep`), which buys ~3 stops at no visual cost. Same
  reason the ambient blooms are faint and each ticket band carries its own ink. **If you lighten any
  landing surface or dim any landing text, re-measure**, and measure against the *rendered pixels*
  (screenshot the page with the glyphs made transparent and sample the backdrop), because walking the
  CSSOM cannot see gradients, stacked frosts, or `backdrop-filter`.
- **The bundle must resolve the npm `buffer`, never Node's builtin.** `vite.config.ts` aliases
  `buffer` → `buffer/index.js` so Vitest (Node) and the browser bundle exercise the SAME
  implementation the signatures are computed with. If canonical bytes ever drift, the golden-vector
  tests (`src/core/canonical.test.ts` vs `fixtures/canonical-args.json`) go red: trust them.
- **`define: { global: 'globalThis' }` in `vite.config.ts` is load-bearing**: wallet/SDK deps
  reference Node's `global` at module scope; without the shim the whole bundle dies on load
  (symptom: blank page, "global is not defined"). esm.sh used to shim this invisibly.
- **`modulePreload.polyfill: false` keeps the build free of inline scripts**: the CSP has no
  `'unsafe-inline'` in `script-src` and must never gain one. After any build-config change, check
  `dist/*.html` for inline `<script>` blocks.
- **The CSP in `vercel.json` is an allow-list: keep it in sync with the code.** Any new external
  origin must be added to the matching directive (RPC/Horizon/Supabase → `connect-src`, etc.) or
  the browser silently blocks it. Test in the browser console (zero CSP violations) after any
  change. esm.sh is GONE from the CSP; only `tools/capture.html` (dev-only, never deployed) still
  loads from it.
- **esm.sh `?bundle-deps` (vanilla reference + capture tool only):** default esm.sh builds of
  `stellar-wallets-kit`/`stellar-sdk` ship a CJS dep with broken named-export interop that throws
  on import. Only relevant to `otc.js`/`canonical.js`/`tools/capture.html` now.
- **macOS (aarch64) toolchain works natively**: rustc 1.96.1, `wasm32v1-none` target, Stellar
  CLI 27 (`~/.local/bin/stellar`). No workarounds needed on this Mac.
- **Windows-only:** native build/test hits MSVC-linker / non-ASCII-path / cdylib traps; the wasm
  target is `wasm32v1-none`, NOT `wasm32-unknown-unknown`; install the Stellar CLI via winget, not
  cargo. Full details in this file's history (commits `426f85a`…`4d01878`).
- **Supabase DDL only via the SQL Editor** (the anon key cannot run DDL). The base schema SQL lives
  in README; the intent layer in `docs/migrations/`.
- **Token SAC ids are derived in-app** (`Asset.contractId`); only `OTC_CONTRACT_ID` is hardcoded.
- **Testnet resets ~quarterly** → redeploy the contract and update `OTC_CONTRACT_ID` AND
  `REFLECTOR_ORACLE_ID` (Reflector redeploys too).

## Verify before deploying

1. `npm test` green: golden vectors byte-identical + the tokens/pairs/negotiation/balances/
   address/oracle/auth-signature suites (8 files, 109 tests).
2. `npm run build` clean; `dist/*.html` has **zero inline scripts**; `grep -r esm.sh dist/` empty.
3. `cargo test …` green: 6 tests (swap, replay, expiry, zero-amount, scoped-auth, amount-tamper).
4. `stellar contract build` produces `otc_swap.wasm` (target `wasm32v1-none`).
5. Review amounts + contract/SAC ids before signing any wallet prompt.
6. Deploy → paste `C…` id into `public/otc-config.js` → two funded Testnet wallets, two browsers,
   E2E (README). Browser console must show zero CSP violations.

## Conventions

- **React side:** strict TS, no `dangerouslySetInnerHTML` (JSX escaping replaces the old `esc()`),
  keep JSX class names in lockstep with `public/styles.css` (design tokens are CSS custom
  properties: extend the tokens, don't hardcode new literals). `src/core/` stays pure: no wallet,
  no network, no window (config comes in through `src/config.ts`, the wallet through the
  `WalletSigner` interface).
- **`otc.js`/`canonical.js` are a frozen reference**: don't develop on them. The two-wallet E2E
  passed on the React build (2026-07-14), but deletion is deferred: `tools/capture.html` imports
  `../canonical.js`, so removing them is tied to a future decision about the capture tool.
- **New complex features** (the institutional RFQ protocol) go on the React + TypeScript stack.
- Reference files as clickable `path:line` links.
- **Commit/push only when asked**; branch off `main` first.
