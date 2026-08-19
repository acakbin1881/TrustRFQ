# Codebase Structure

**Analysis Date:** 2026-08-18

## Directory Layout

```
TrustRFQ/
├── otc.html                        # Vite entry point: loads src/main.tsx + config scripts
├── otc.js                          # Vanilla reference implementation (frozen, dev-only)
├── canonical.js                    # Vanilla canonical encoder (frozen, dev-only)
│
├── src/                            # React + TypeScript frontend (compiled by Vite)
│   ├── main.tsx                    # Vite entry: mounts App to #root
│   ├── App.tsx                     # Shell: Desk + WalletProvider + ToastProvider
│   ├── config.ts                   # Typed reader of window.* runtime config
│   ├── polyfills.ts                # Buffer shim for wasm compat
│   │
│   ├── core/                       # Pure business logic (no side effects, no UI)
│   │   ├── canonical.ts            # Deterministic order encoding (SIGNATURE BOUNDARY)
│   │   ├── canonical.test.ts       # Golden vectors vs fixtures/canonical-args.json
│   │   ├── fill.ts                 # Chain ops: signFillAuth, submitFill, ensureTrustline
│   │   ├── tokens.ts               # Allow-list, decimals, display formatting
│   │   ├── tokens.test.ts
│   │   ├── negotiation.ts          # Round logic, currentTerms(order, rounds)
│   │   ├── negotiation.test.ts
│   │   ├── pairs.ts                # Pair key derivation, pair labels
│   │   ├── pairs.test.ts
│   │   ├── balances.ts             # Horizon balance parsing + type coercion
│   │   ├── balances.test.ts
│   │   ├── address.ts              # Strkey checksum validation
│   │   ├── address.test.ts
│   │   ├── oracle.ts               # Reflector fair-price math (read-only)
│   │   ├── oracle.test.ts
│   │   └── types.ts                # Shared TypeScript types (Order, Side, etc.)
│   │
│   ├── data/                       # Supabase queries + React hooks
│   │   ├── supabase.ts             # Supabase client singleton (anon key, no auth)
│   │   ├── orders.ts               # Queries: fetchOrders, insertOrder, updateOrder
│   │   ├── useOrders.ts            # React hook: incoming + sent orders, realtime
│   │   ├── broadcasts.ts           # Queries: fetchBroadcasts
│   │   ├── useBroadcasts.ts        # React hook: broadcast orders, realtime
│   │   ├── rounds.ts               # Queries: acceptInitialTerms, counterOffer, etc.
│   │   ├── useRounds.ts            # React hook: rounds for one order, realtime
│   │   ├── intents.ts              # Queries: intent-layer counters (interim)
│   │   ├── useIntents.ts           # React hook: intents, realtime
│   │   ├── useIntentCount.ts       # Memo hook: intent count badge
│   │   ├── balances.ts             # Queries: fetchBalances (Horizon REST)
│   │   ├── useBalances.ts          # React hook: balances, polling + realtime
│   │   └── useFairPrice.ts         # React hook: Reflector oracle read
│   │
│   ├── ui/                         # React components (UI layer)
│   │   ├── Ticket.tsx              # Compose form (the ONE entry form)
│   │   ├── OfferList.tsx           # Order list (incoming or sent)
│   │   ├── ThreadView.tsx          # Per-order negotiation UI + settlement orchestration
│   │   ├── OrderCard.tsx           # Order pair/amount/counterparty display
│   │   ├── BroadcastList.tsx       # Broadcast fan-out threads
│   │   ├── CounterForm.tsx         # Counter-offer form (intent layer)
│   │   ├── RoundTimeline.tsx       # Round history (intent layer)
│   │   ├── PairsPanel.tsx          # Pair watch toggle + explainer
│   │   ├── BalanceStrip.tsx        # Balance display (topbar)
│   │   ├── TokenSelect.tsx         # Token picker dropdown
│   │   ├── TokenBadge.tsx          # Token code badge
│   │   ├── AddressSeal.tsx         # Counterparty address display
│   │   ├── SettlementStrip.tsx     # Settlement status + sign/settle buttons
│   │   ├── SectionSheet.tsx        # Tab navigator (create/incoming/sent)
│   │   ├── Gate.tsx                # Wallet connect prompt
│   │   ├── Toast.tsx               # Toast notifications + provider
│   │   ├── useSettlement.ts        # Settlement orchestration hook
│   │   ├── useNow.ts               # Current timestamp hook (60s refresh)
│   │   └── useNow.test.ts
│   │
│   ├── wallet/                     # Freighter wallet integration
│   │   ├── kit.ts                  # Wallets Kit singleton, walletSign, walletSignAuthEntry
│   │   ├── WalletContext.tsx       # React context: connect/disconnect/address
│   │   ├── authSignature.ts        # Normalizer for wallets-kit's double-encoded auth
│   │   └── authSignature.test.ts
│   │
│   └── index.css                   # Global CSS (never used; all CSS is external)
│
├── public/                         # Static assets + runtime config
│   ├── otc-config.js               # Runtime config: RPC/Horizon/contract ids (window.*)
│   ├── supabase-config.js          # Runtime config: Supabase URL/key (window.*)
│   ├── styles.css                  # Desk design system (dark milky swap theme)
│   ├── intent.css                  # Intent-layer styles (consumes styles.css tokens)
│   ├── hero.html                   # Landing page (hand-written, never bundled)
│   ├── hero.js                     # Landing scroll reveal + ticket parallax
│   ├── hero.css                    # Landing design system (electric indigo glass)
│   └── *.svg                       # Icons, copied verbatim into dist
│
├── contracts/                      # Soroban settlement contracts (Rust, Cargo workspace)
│   ├── Cargo.toml                  # Workspace root (HOLDS [profile.release])
│   ├── Cargo.lock                  # Workspace lock (both members share it)
│   │
│   ├── otc_swap/                   # Interim: symmetric settlement (both sign, permissionless submit)
│   │   ├── Cargo.toml              # Member manifest (no profile block)
│   │   ├── src/
│   │   │   ├── lib.rs              # fill(...) contract entry (6 unit tests in test.rs)
│   │   │   └── test.rs             # Unit tests: args binding, replay, auth checks
│   │   └── target/
│   │       └── wasm32v1-none/release/otc_swap.wasm
│   │
│   └── rfq_swap/                   # RFQ protocol: asymmetric settlement (maker pre-signs)
│       ├── Cargo.toml              # Member manifest (no profile block)
│       ├── src/
│       │   ├── lib.rs              # swap(Order), cancel, is_cancelled, get_config, admin (17 unit tests)
│       │   └── test.rs             # Unit tests: arg binding (mutation tested), replay rejection
│       └── target/
│           └── wasm32v1-none/release/rfq_swap.wasm
│
├── tools/                          # Build/test/demo utilities
│   ├── capture.html                # Browser tool: regenerate fixtures/canonical-args.json
│   ├── capture-server.mjs          # Serve capture.html (Node server, dev-only)
│   ├── bundle-check.html           # Browser smoke test: loads app via bundled modules
│   ├── bundle-check-driver.mjs     # Headless runner for bundle-check.html
│   ├── dev-smoke.mjs               # Headless React StrictMode double-mount check
│   │
│   ├── rfq-live-swap.mjs           # Live Testnet proof: rfq_swap auth model + replay rejection
│   ├── derive-keys.mjs             # Generate demo keypairs
│   ├── fund-demo.mjs               # Friendbot fund demo actors
│   ├── mint-usdc.mjs               # Mint demo USDC issuer tokens
│   ├── sweep-xlm.mjs               # Sweep demo XLM balances
│   │
│   └── e2e/                        # Headless two-browser end-to-end test
│       ├── prepare-keys.mjs        # Generate e2e-keys.json (gitignored)
│       ├── e2e-run.mjs             # Main driver: spawn maker + taker browsers
│       ├── maker-bot.mjs           # Headless maker browser (no Freighter, mock wallet)
│       ├── taker-bot.mjs           # Headless taker browser (no Freighter, mock wallet)
│       └── wallet-sim.mjs          # PostMessage mock Freighter (no extension needed)
│
├── docs/                           # Documentation
│   ├── migrations/
│   │   ├── 00-base-schema.sql      # Core orders/broadcasts/rounds/intents schema
│   │   └── 2026-07-10-intent-layer.sql  # Intent-layer schema + RLS/grant reconciliation
│   └── superpowers/specs/
│       ├── 2026-07-10-intent-private-offer-layer-design.md
│       ├── 2026-07-10-react-ts-frontend-migration-design.md
│       ├── 2026-07-12-desk-light-redesign-design.md
│       ├── 2026-07-15-reflector-fair-price-suggestion-design.md
│       ├── 2026-08-17-rfq-protocol-architecture-design.md  # CURRENT
│       └── (historical specs)
│
├── fixtures/                       # Golden test vectors
│   ├── canonical-args.json         # Pinned order encoding (SIGNATURE BOUNDARY)
│   └── canonical-args.snapshot.*   # Vitest snapshots (if generated)
│
├── dist/                           # Built Vite output (on-disk after npm run build)
│   ├── otc.html                    # Compiled entry (links dist/assets/*.js)
│   ├── hero.html                   # Copied landing (CSS rewritten as internal)
│   ├── assets/
│   │   ├── main-*.js               # Bundled src/ (React + all deps)
│   │   ├── otc-*.css               # Bundled styles.css + intent.css
│   │   └── hero-*.css              # Bundled hero.css
│   └── (no inline scripts; CSP compliant)
│
├── .planning/
│   └── codebase/
│       ├── ARCHITECTURE.md         # System design, layers, data flow
│       ├── STRUCTURE.md            # This file: directory layout, naming patterns
│       ├── CONVENTIONS.md          # (optional) Coding style + patterns
│       ├── TESTING.md              # (optional) Test setup + patterns
│       ├── STACK.md                # (optional) Tech stack
│       ├── INTEGRATIONS.md         # (optional) External services
│       └── CONCERNS.md             # (optional) Tech debt + issues
│
├── node_modules/                   # npm dependencies (gitignored)
├── package.json                    # npm scripts + deps (React 19, Vite 8, Vitest 4)
├── package-lock.json               # npm lock (committed)
├── tsconfig.json                   # TypeScript config (strict, ES2020 target)
├── vite.config.ts                  # Vite build: alias buffer, define global, CSP polyfill
│
├── CLAUDE.md                       # Project instructions (auto-loaded every session)
├── STELLAR.md                      # Stellar/Soroban dev reference (auto-loaded via @STELLAR.md)
├── README.md                       # Product-style doc, setup/deploy/E2E walkthrough
├── LICENSE                         # MIT
├── .gitignore                      # Excludes node_modules, .env.local, demo-keys.json, e2e-keys.json
├── .env.local                      # Local secrets (NOT committed; template in README)
├── demo-keys.json                  # Demo wallet keypairs (gitignored, generated by tools)
├── e2e-keys.json                   # E2E test actor keypairs (gitignored, generated by tools)
│
├── .vercel/                        # Vercel project config
├── vercel.json                     # Build command, output dir, /hero rewrite, CSP headers
├── .vercelignore                   # Files excluded from Vercel deploy
│
├── .claude/                        # Claude Code project config
├── .agents/                        # Agent skills directory
└── .git/                           # Git repository
```

## Directory Purposes

**`src/`:**
- Purpose: All TypeScript/React source code (compiled by Vite into dist/)
- Contains: UI components, data hooks, core logic, wallet integration
- Key files: App.tsx (shell), canonical.ts (signature boundary), fill.ts (settlement)
- Structure: Organized by concern (core/, data/, ui/, wallet/)

**`src/core/`:**
- Purpose: Pure, testable business logic (no imports from data/, ui/, or wallet/)
- Contains: Order encoding, token validation, negotiation state machines, address checks
- Key patterns: Pure functions, types imported only from types.ts
- Testing: 8 test files (canonical.test.ts pinned to golden vectors in fixtures/)

**`src/data/`:**
- Purpose: Supabase queries + React hooks for realtime state
- Contains: Supabase client singleton, fetch/insert/update functions, useOrders/useBalances/etc.
- Key patterns: Hooks use supabase channels for realtime, initial load on address change
- Testing: Integration tests with real Supabase (not included in npm test suite)

**`src/ui/`:**
- Purpose: React component tree for the desk experience
- Contains: Form components (Ticket, CounterForm), list/card components (OrderCard, ThreadView), utilities (Gate, Toast)
- Key patterns: Props-only (no internal state except for UI ephemeral state), data pre-filtered by App.tsx
- Constraints: Ticket is the ONE compose form; ThreadView is the ONE settle site (serialized via settleLock)

**`src/wallet/`:**
- Purpose: Freighter SEP-43 integration + wallet context
- Contains: Wallets Kit singleton, auth entry normalizer, React context
- Key patterns: Injected WalletSigner interface (used by fill.ts), module-level kit singleton
- Testing: authSignature.ts (double-encoding quirk) unit-tested

**`contracts/`:**
- Purpose: Soroban settlement contracts (Rust, compiled to wasm)
- Structure: Cargo workspace with otc_swap and rfq_swap members
- Key constraint: [profile.release] MUST stay in root Cargo.toml (ignored in members)
- Testing: 23 unit tests (6 otc_swap + 17 rfq_swap), mutation-tested arg binding

**`public/`:**
- Purpose: Static assets + runtime config (never bundled)
- Config: otc-config.js (contract ids, RPC/Horizon URLs), supabase-config.js (Supabase endpoints)
- Styles: styles.css (desk) + intent.css (intent layer) + hero.css (landing)
- Landing: hero.html (hand-written, copied verbatim into dist on build)

**`tools/`:**
- Purpose: Build, test, and demo utilities
- Capture tool: regenerates fixtures/canonical-args.json (run when canonical.ts encoding changes)
- Bundle check: headless smoke test (React StrictMode double-mount)
- Dev smoke: headless dev-server check
- E2E: Two-browser headless test with mock Freighter (no extension needed)
- Demo scripts: Friendbot funding, token minting, key derivation (secrets in gitignored demo-keys.json)

**`docs/`:**
- Purpose: Specification and migration docs
- Migrations: 00-base-schema.sql (core tables), 2026-07-10-intent-layer.sql (counter offer schema)
- Specs: Dated design docs (2026-08-17-rfq-protocol-architecture-design.md is current)

**`fixtures/`:**
- Purpose: Golden test vectors
- Content: canonical-args.json (pinned order encodings), Vitest snapshots if generated
- Usage: canonical.test.ts validates every encoding against these vectors (detects drift)

**`dist/`:**
- Purpose: Built Vite output (never committed)
- Structure: Compiled HTML (otc.html, hero.html), bundled JS/CSS (dist/assets/), static assets
- CSP: Zero inline scripts (modulePreload polyfill disabled; CSP compliance verified)

## Key File Locations

**Entry Points:**
- `otc.html`: Vite HTML entry (head + body + #root + config scripts + `src/main.tsx` tag)
- `src/main.tsx`: React mount (ReactDOM.createRoot)
- `src/App.tsx`: App shell (Desk component, providers, all subscriptions)

**Configuration:**
- `public/otc-config.js`: Contract ID, RPC/Horizon URLs, Reflector oracle ID (window.* for no-rebuild Testnet resets)
- `public/supabase-config.js`: Supabase URL, anon key (window.*)
- `src/config.ts`: Typed reader of the above (only module allowed to touch window.*)
- `.env.local`: Local secrets (never committed; Vercel env vars synced from .env.local on deploy)
- `tsconfig.json`: TypeScript strict mode, ES2020 target, lib DOM + ES2020

**Core Logic:**
- `src/core/canonical.ts`: Deterministic order encoding (SIGNATURE BOUNDARY — keep byte-identical)
- `src/core/fill.ts`: Chain ops (signFillAuth, submitFill, ensureTrustline, Horizon trustline checks)
- `src/core/negotiation.ts`: Round state machine (currentTerms, round resolution)
- `src/core/tokens.ts`: Token allow-list (USDC issuer, SAC ids derived at runtime), decimals, formatting
- `src/core/types.ts`: Shared types (Order, Side, FillTerms, SignedTerms)

**Testing:**
- `src/core/canonical.test.ts`: Golden vectors vs fixtures/canonical-args.json (CRITICAL — byte-binding check)
- `src/core/*.test.ts`: Unit tests for pure logic (tokens, negotiation, balances, address, oracle)
- `src/wallet/authSignature.test.ts`: Double-encoding quirk normalization
- `tools/dev-smoke.mjs`: Headless React StrictMode check (run before each commit)
- `tools/e2e/`: Two-browser headless E2E (makers + takers, mock Freighter, settles for real on Testnet)
- `contracts/otc_swap/src/test.rs`: 6 unit tests (args binding, replay, auth)
- `contracts/rfq_swap/src/test.rs`: 17 unit tests (arg binding mutation-tested, fee checks, cancellation)

**Styles:**
- `public/styles.css`: Desk design tokens (--gold, --gold-hi, --gold-lo, --gold-ink, etc.) + desk layout
- `public/intent.css`: Intent-layer component styles (loaded AFTER styles.css; order is load-bearing)
- `public/hero.css`: Landing design system (self-contained, .lp- prefixed, never uses styles.css tokens)

**Landing:**
- `public/hero.html`: Hand-written landing (never bundled; copied verbatim into dist/)
- `public/hero.js`: Scroll reveal + ticket parallax (IntersectionObserver + requestAnimationFrame)
- `otc.html`: Desk entry (rewritten as `/hero` redirect via vercel.json)

**Deployment & Docs:**
- `README.md`: Product doc, setup, contract deploy, E2E walkthrough (rewritten 2026-07-21)
- `CLAUDE.md`: Project instructions (auto-loaded every Claude session)
- `STELLAR.md`: Stellar/Soroban dev reference (auto-loaded via @STELLAR.md in CLAUDE.md)
- `LICENSE`: MIT
- `vercel.json`: Build command, output dir, / → /hero rewrite, CSP headers (HSTS, X-Frame-Options, etc.)

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` (e.g., `Ticket.tsx`, `OrderCard.tsx`)
- Hooks: `use*.ts` or `use*.tsx` (e.g., `useSettlement.ts`, `useOrders.ts`)
- Core logic: `camelCase.ts` (e.g., `canonical.ts`, `tokens.ts`)
- Tests: `*.test.ts` or `*.test.tsx` (co-located with source)
- Contracts: `snake_case` directories (`otc_swap/`, `rfq_swap/`), `lib.rs` + `test.rs`

**Directories:**
- `src/ui/`: React components (topbar, forms, lists, modals)
- `src/data/`: Data queries + React hooks (Supabase)
- `src/core/`: Pure logic (types, helpers, business rules)
- `src/wallet/`: Wallet integration (kit, context, normalizers)
- `public/`: Static assets + config (never bundled)
- `contracts/`: Cargo workspace + members (otc_swap, rfq_swap)
- `tools/`: Build, test, demo utilities
- `docs/`: Specs and migrations
- `fixtures/`: Golden test vectors
- `.planning/`: GSD task planning (ARCHITECTURE.md, STRUCTURE.md, etc.)

**Classes/Types:**
- React components: `PascalCase` (e.g., `ThreadView`, `OrderCard`)
- Interfaces: `PascalCase` with `I` prefix optional (e.g., `Order`, `FillTerms`, `ChainConfig`)
- Enums: `PascalCase` (e.g., `Error` in contracts)
- Contracts: `#[contracttype]` structs PascalCase (e.g., `Order`, `Config`, `DataKey`)

**Functions:**
- React hooks: `useCamelCase` (e.g., `useSettlement`, `useOrders`)
- Pure functions: `camelCase` (e.g., `fillCanonicalArgs`, `currentTerms`, `orderPairKey`)
- Async chain ops: `camelCase` (e.g., `signFillAuth`, `submitFill`)
- Soroban contract functions: `snake_case` (e.g., `__constructor`, `set_fee`, `is_cancelled`)

**Variables/Constants:**
- DOM class names: `kebab-case` (e.g., `.ticket__card-shadow`, `.badge--accepted`)
- CSS custom properties: `--kebab-case` (e.g., `--gold`, `--gold-hi`, `--lp-mx`)
- Environment variables: `CONSTANT_CASE` (e.g., `RPC_URL`, `OTC_CONTRACT_ID`)
- React state: `camelCase` (e.g., `setIncoming`, `refreshBalances`)

## Where to Add New Code

**New Feature (e.g., price alerts):**
- Primary logic: `src/core/` (pure helpers + types in types.ts)
- UI: `src/ui/` (new component + hook if needed)
- Data: `src/data/` (Supabase query if persisted)
- Tests: Co-locate `*.test.ts` alongside source
- Example: Add `src/core/alerts.ts` (pure logic) + `src/data/useAlerts.ts` (hook) + `src/ui/AlertPanel.tsx` (component)

**New Component/Modal:**
- Implementation: `src/ui/ComponentName.tsx`
- Styling: Add `.component-name` classes to `public/styles.css` or `public/intent.css`
- Consuming: Import in parent component (usually App.tsx or another UI component)
- Example: AlertPanel.tsx consumed by Desk() in App.tsx

**Utilities (shared helpers):**
- Core logic: `src/core/` (pure functions, testable)
- Data queries: `src/data/` (Supabase interactions)
- Wallet adapters: `src/wallet/` (wallet-specific quirks)
- Example: Add `src/core/formatting.ts` for number/date helpers

**Contract Changes:**
- Soroban code: `contracts/otc_swap/src/lib.rs` or `contracts/rfq_swap/src/lib.rs`
- Tests: `contracts/otc_swap/src/test.rs` or `contracts/rfq_swap/src/test.rs`
- Rebuild: `cargo test --manifest-path contracts/Cargo.toml` (tests) + `stellar contract build` (wasm)
- Redeploy: `stellar contract deploy --wasm contracts/target/.../rfq_swap.wasm --source-account ... --network testnet --alias rfq_swap`
- Update config: Paste new contract id into `public/otc-config.js` (no rebuild needed)

**On Testnet Reset:**
1. Recompile contracts: `cargo test && stellar contract build`
2. Deploy both: `stellar contract deploy --wasm otc_swap.wasm ...` + `stellar contract deploy --wasm rfq_swap.wasm ...`
3. Update `public/otc-config.js`: Paste both contract ids
4. Update `public/supabase-config.js`: Supabase survives resets; only contract ids change
5. `npm run build` and `npm run preview` to test locally
6. No git commit needed (deployment is independent); verify E2E works before merge to main

## Special Directories

**`dist/`:**
- Purpose: Built Vite output (generated on `npm run build`)
- Generated: Yes (via `vite build`)
- Committed: No (in .gitignore; Vercel rebuilds from source)
- Deployment: Vercel serves dist/ after build; CSP headers injected via vercel.json

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes (via `npm install`)
- Committed: No (in .gitignore; npm ci in CI)

**`contracts/target/`:**
- Purpose: Rust build artifacts (wasm, intermediate objects)
- Generated: Yes (via `cargo build` / `stellar contract build`)
- Committed: No (in .gitignore)
- Wasm location: `contracts/target/wasm32v1-none/release/otc_swap.wasm`, `contracts/target/wasm32v1-none/release/rfq_swap.wasm`

**`.env.local`:**
- Purpose: Local development secrets (Supabase key, RPC endpoints, contract ids for tests)
- Committed: No (in .gitignore; template in README)
- Usage: `src/config.ts` reads as environment variables in Node (Vite define replaces at build time)

**`demo-keys.json` / `e2e-keys.json`:**
- Purpose: Testnet actor keypairs for local testing/E2E
- Committed: No (in .gitignore; generated by tools/derive-keys.mjs + tools/e2e/prepare-keys.mjs)
- Rotation: Regenerate after Testnet reset (fund via Friendbot)

---

*Structure analysis: 2026-08-18*
