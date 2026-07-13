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
- **Intent/private-offer layer built (2026-07-11, branch `feat/intent-layer`).** Full spec
  (`docs/superpowers/specs/2026-07-10-intent-private-offer-layer-design.md`) implemented as a
  second Vite entry (`intent.html` → `src/intent/`, served as `/intent` — **both folded into the
  desk on 2026-07-13, see below**): pair-intent toggles,
  one-signature broadcast fan-out (per-taker `orders` rows + `broadcast_id`), isolated
  counter-offer threads (`rounds`, final terms written back onto the order row), settlement
  reused unchanged via `OrderCard`/`useSettlement`. DB reconciled live (2026-07-11):
  `broadcasts` added to realtime; `orders` anon UPDATE re-scoped to workflow columns **plus
  `maker_amount`/`taker_amount`** (round write-back; README + `docs/migrations/…intent-layer.sql`
  document the trade-off). 4-lens adversarial review run; all confirmed findings fixed.
  Pending: the spec §8 two-browser E2E.
- **Landing redesigned (2026-07-12, branch `design`): electric-indigo glassmorphism.** Rebuilt from a
  supplied reference mockup — frosted panel, pill nav, two-tone headline, and a stack of floating
  glass **order tickets** (the mockup's credit cards, re-authored as the artifact this product makes).
  Self-contained in `public/hero.css` (`.lp-` prefix); `hero.html` no longer loads `styles.css`, and
  the now-dead landing rules were removed from it. **The desk is untouched and stays dark + gold** —
  verified pixel-identical at 1440px and 375px. Fonts: Outfit + Plus Jakarta Sans + IBM Plex Mono
  (all on the already-allowed Google Fonts origin → **no CSP change**). All 30 text elements clear
  WCAG AA, measured against rendered pixels; zero CSP violations under the production headers.
- **Desk redesigned (2026-07-12, branch `design`): light "milky swap" theme.** Rebuilt from a
  user-supplied mobile reference: white cards (32px radii, borderless, soft lavender shadows) on a
  cool-lavender canvas (`#EBEDF8→#D5D9EE`), near-black **ink accent** (the `--gold` token family
  now holds ink values — names frozen for the intent contract), Inter + IBM Plex Mono. The three
  tabs collapsed into a floating bottom pill (`src/ui/SectionSheet.tsx`) opening a centered modal
  sheet; `.tabs` CSS survived for the intent page only (**both gone 2026-07-13**). Ticket = notched split-card (CSS mask on
  the card, drop-shadow on a plain `.ticket__card-shadow` wrapper); counterparty/expiry/maker
  fields live INSIDE the bottom card (user decision — no separate details card). intent.css got a
  value-only harmony recolor; intent layout unchanged. Verified: 89 tests, clean build (zero
  inline scripts), zero console errors, sheet a11y (Escape/backdrop/focus-return/scroll-lock),
  drafts survive section switches, and **WCAG AA on rendered pixels — 51 text elements across 5
  views, 0 fail** (glyph-diff sampling). A 4-lens adversarial review (14 agents) confirmed 4
  findings, all fixed: invisible counter-form inputs on intent, sheet scroll-lock leaking across
  disconnect (sheet now unmounts on disconnect), focus-trap escape via `<body>`, mask-erased card
  shadow. Spec: `docs/superpowers/specs/2026-07-12-desk-light-redesign-design.md`.
- **Merged to ONE page (2026-07-13, branch `design`). `intent.html` is gone.** The desk is the whole
  app: one compose form where **the optional counterparty address is the only thing that decides
  directed vs broadcast** — fill it and the offer goes to that wallet (one `orders` row); leave it
  empty and it fans out to every taker watching the pair (one `broadcasts` row + per-taker rows).
  The broadcast form's pair select and direction radios are **deleted**: `orderPairKey` derives the
  pair from the two legs, and direction IS the leg order. One nav pill → New offer / Incoming
  (offers + the pairs you watch) / Sent (direct offers + grouped broadcasts). **Every** offer is now
  a `ThreadView` with Accept/Decline/Counter — the `OrderCard` list path is retired. **No DB
  migration** (`rounds.order_id` never cared about `broadcast_id`). Three real defects closed by the
  merge: (1) broadcast offers used to render on BOTH pages (the desk's `fetchOrders` has no
  `broadcast_id` filter); (2) the desk's `OrderCard` accept could take stale round-0 terms on an
  order with a live counter — the hazard `repairCounteredStatus` was written for; (3) the desk had
  **no `amountTooLarge` guard**, so it could mint an order both parties sign but nobody can ever
  fill (`BigInt('1e+21')` throws in `toStroops` at settlement). The directed path also gained the
  fresh-Horizon balance gate the broadcast/counter paths already had. `src/intent/` moved into
  `src/ui/`; `.tabs` CSS (53 lines) and `.wrap--desk` are dead and deleted; `otc.html` now loads
  `styles.css` **then** `intent.css` (order is load-bearing).

## Stack

- **Frontend: React + TypeScript on Vite** (migrated 2026-07-10). **ONE entry: `otc.html` → `src/`**
  (merged 2026-07-13) — a client-only SPA compiled to static files; **no server runtime** (mirrors
  AirSwap's architecture — their quote server is a separate deployable, and so will ours be). The
  landing (`public/hero.html` + `hero.css` + `hero.js`) stays hand-written static HTML, copied
  verbatim into the build. Deployed on Vercel via `npm run build` → `dist/`.
- **Two visual systems, on purpose.** The desk is the light "milky swap" theme
  (`styles.css` + `intent.css`, **in that order** — see Gotchas); the landing is electric-indigo
  glassmorphism (`hero.css`). They share no CSS — the landing does not load `styles.css`, and every
  landing selector is `.lp-`-prefixed. **styles.css token NAMES and selectors are a compatibility
  contract with `intent.css` and the JSX that hardcodes them**: change values freely, never rename
  or drop. `--gold`/`--gold-hi`/`--gold-lo`/`--gold-ink` = the primary ink-accent family, not gold.
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
| `otc.html` | **The one Vite entry**: head + both stylesheets + `#root` + config scripts + `src/main.tsx`. |
| `src/App.tsx` | The shell: topbar + gate + 3 sections. Owns every subscription. **Must never call `useSettlement`** (see Gotchas). |
| `src/ui/Ticket.tsx` | **The one compose form** — an empty counterparty address means broadcast, a filled one means directed. |
| `src/core/canonical.ts` | **The signature boundary** — `fillCanonicalArgs` etc., pinned by golden vectors. |
| `src/core/fill.ts` | Chain ops: `signFillAuth` / `submitFill`, wallet injected as `WalletSigner`. |
| `src/core/tokens.ts` | Token allow-list (quarantine boundary) + validation/display helpers. |
| `src/config.ts` | Typed reader of the `window.*` runtime config (the only module that may). |
| `src/data/` | Supabase client + queries/hooks: `orders`, `broadcasts`, `rounds`, `intents`, `useBalances` (+ realtime). |
| `src/wallet/` | Wallets-kit singleton + `walletSign`, `WalletContext` (connect/disconnect). |
| `src/ui/` | Everything else: `Gate`, `SectionSheet`, `OfferList`, `ThreadView`, `BroadcastList`, `CounterForm`, `RoundTimeline`, `PairsPanel`, `BalanceStrip`, `OrderCard`, `SettlementStrip`, `Toast`, `useSettlement`, `useNow`. |
| `src/core/pairs.ts` / `negotiation.ts` / `balances.ts` | Pure logic (pair keys, rounds/`currentTerms`, Horizon balance parsing) — unit-tested. |
| `public/intent.css` | Threads / broadcasts / pairs / balances styles. Loaded by `otc.html` **after** `styles.css`; consumes its tokens, never edits it. |
| `public/hero.html` + `hero.js` | Hand-written landing (never bundled); links → `otc.html`. `hero.js` = scroll reveal + ticket parallax. |
| `public/hero.css` | **The landing's design system** — self-contained, `.lp-` prefixed, loads instead of `styles.css`. |
| `public/styles.css` | **The desk's design system** (`otc.html` only); JSX must keep its classes. |
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

- **`src/App.tsx` must NEVER call `useSettlement`.** Its `txBusy` is a `useRef`, i.e. **per
  instance**. `ThreadView` is the only render site of `OrderCard` and therefore the only place a
  settlement can start; it serializes every sign/settle through a **module-scope `settleLock`**. A
  second `useSettlement` instance in the shell would be invisible to that lock and could race a
  ThreadView settle — two wallet prompts, two `submitFill`s, two competing `settlement_status`
  writes. Panels stay mounted, so up to **three** ThreadViews are alive at once. Invariant:
  `grep -rn "^import.*useSettlement\|useSettlement(" src/` → exactly 3 lines (definition, import,
  one call — all in `useSettlement.ts` + `ThreadView.tsx`).
- **`otc.html` loads `styles.css` THEN `intent.css`, and the order is load-bearing.**
  `.counter-form input` (intent.css) and the base `input[type="text"]` (styles.css) have **equal
  specificity** — source order alone decides. Swap them and the counter-form inputs render invisible
  against their own sunken well. (This bug already shipped once.)
- **`intent.css`'s `[data-panel="…"]` rules track the desk's section names** (`create`/`incoming`/
  `sent`). A stale name **fails silently** — no error, just lost spacing. Grep `data-panel` in both
  `src/App.tsx` and `public/intent.css` after renaming a section.
- **Desk: a CSS `mask` clips everything its own element paints — `box-shadow` AND
  `filter: drop-shadow` output alike** (filter runs BEFORE mask in the paint pipeline; verified by
  pixel probe 2026-07-12). That's why the notched swap cards' shadow lives on the plain
  `.ticket__card-shadow` wrapper, not on the masked `.field--card` itself: the wrapper's
  drop-shadow traces the already-masked (notched) silhouette. Moving the shadow back onto the
  masked element makes it silently disappear.
- **Landing: `transform` and `backdrop-filter` must be on the SAME element.** A transformed (or
  `filter`ed / `will-change`d) *ancestor* becomes the backdrop root, and any descendant's blur then
  samples nothing — the panel renders empty/black in Chrome and Safari. This is why the ticket
  parallax feeds through `--lp-mx`/`--lp-my` custom properties instead of transforming a wrapper, and
  why `.lp-surface` is a plain translucent wash rather than a `.lp-glass` (a frosted parent would
  flatten the frost on every nav pill and ticket inside it).
- **Landing: the glass comes in two tints and that is an accessibility decision, not a style one.**
  A milky *white* frost lifts its backdrop so far toward white that on the electric canvas even
  **pure white text cannot reach 4.5:1** — on the first pass all 30 text elements failed WCAG AA. So
  surfaces carrying small copy (`.lp-card`, `.lp-plaque`, `.lp-contrast`, `.lp-cta`, `.lp-eyebrow`)
  use the **deep indigo frost** (`--lp-glass-deep`), which buys ~3 stops at no visual cost. Same
  reason the ambient blooms are faint and each ticket band carries its own ink. **If you lighten any
  landing surface or dim any landing text, re-measure** — and measure against the *rendered pixels*
  (screenshot the page with the glyphs made transparent and sample the backdrop), because walking the
  CSSOM cannot see gradients, stacked frosts, or `backdrop-filter`.
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

1. `npm test` green — golden vectors byte-identical + token/pairs/negotiation/balances suites (90 tests).
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
