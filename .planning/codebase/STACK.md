# Technology Stack

**Analysis Date:** 2026-08-18

## Languages

**Primary:**
- **TypeScript** - React 19 frontend (React + JSX strict mode, ES2022 target)
- **Rust** - Soroban smart contracts (no_std, soroban-sdk 26)
- **JavaScript** - Vanilla reference implementation and utility scripts (dev-only)
- **SQL** - Supabase PostgreSQL schema and migrations

**Secondary:**
- **HTML/CSS** - Static landing page (hero.html) and design system (styles.css, intent.css, hero.css)
- **Bash** - Build and deployment scripts

## Runtime

**Environment:**
- **Node.js** 20.19+ (frontend dev, tests, build, tooling)
- **WebAssembly (wasm32v1-none)** - Soroban contracts compiled to WASM (64KB cap, Stellar-optimized)
- **Browser** (ES2022, DOM APIs, no WebWorkers)

**Package Manager:**
- **npm** (with `package-lock.json` for deterministic installs)
- **Cargo** (Rust workspace resolver 2)
- **Lockfile:** `contracts/Cargo.lock` (committed; governs all contract builds)

## Frameworks

**Core:**
- **React** 19.2.7 - Component-based UI (strict mode, React 19 JSX transform)
- **Vite** 8.1.4 - Frontend bundler and dev server (ES modules, hot reload)

**Testing:**
- **Vitest** 4.1.10 - Unit test runner (Node environment, default-exports, golden vectors via fixtures/)
- **Playwright Core** 1.60.0 - Headless browser for E2E tests (uses cached Chromium)

**Build / Dev:**
- **TypeScript** 7.0.2 - Strict type checking (`tsc --noEmit`, isolation, verbatim module syntax)
- **Stellar CLI** 27 - Soroban contract build and deploy (invoked via `stellar contract build/deploy`)
- **Rustc** 1.96.1 + `wasm32v1-none` target - WASM compilation

## Key Dependencies

**Frontend Runtime (production):**
- **@stellar/stellar-sdk** ^16.0.1 - Core Stellar/Soroban operations (signatures, contracts, transactions, RPC, Horizon)
- **@creit.tech/stellar-wallets-kit** 1.9.5 (exact pin) - SEP-43 wallet integration (Freighter only, signTransaction + signAuthEntry)
- **@supabase/supabase-js** ^2.110.2 - PostgreSQL client with realtime subscriptions (anon-key only)
- **buffer** ^6.0.3 - Node.js Buffer polyfill for browser (npm package, aliased in Vite to match Vitest)
- **react**, **react-dom** 19.2.7 - UI framework

**Frontend Build / Dev:**
- **@vitejs/plugin-react** 6.0.3 - Fast JSX transformation
- **@types/react**, **@types/react-dom** - TypeScript definitions

**Smart Contracts (Soroban):**
- **soroban-sdk** 26 (workspace dependency) - Host functions, auth, storage, types, testing utils

**Critical Pinning:**
- `@creit.tech/stellar-wallets-kit` pinned at exact version **1.9.5** (double-encoding bug in `signAuthEntry`, normalised in `src/wallet/authSignature.ts`)
- `soroban-sdk` pinned at **26** in workspace (controls `wasm32v1-none` target; future bumps may invalidate deployed-bytecode-matches-source invariant)
- `stellar-sdk` ^16.x (rides minor bumps but major version pinned)

## Configuration

**Environment:**
- Runtime config is **deliberately unbundled**: `window.*` scripts in `public/otc-config.js` and `public/supabase-config.js` (one-file edits for Testnet resets, no rebuild)
- Typed config access via `src/config.ts` (reads window properties with runtime fallbacks)

**Build:**
- **vite.config.ts:**
  - Aliases `buffer` → `npm:buffer/index.js` (ensures Vitest + browser use same implementation)
  - Defines `global: 'globalThis'` (wallet/SDK deps reference Node's `global` at module scope)
  - Rollup input: `otc.html` (the ONE entry point, desk = entire app)
  - `modulePreload.polyfill: false` (no inline scripts → CSP compliance)
  - Test environment: Node
- **tsconfig.json:**
  - Target: ES2022
  - Strict mode: strict, noUnusedLocals, noUnusedParameters, noFallthroughCasesInSwitch, verbatimModuleSyntax
  - Module resolution: bundler
  - JSX: react-jsx (React 19 transform)
- **vercel.json:**
  - Build command: `npm run build` (tsc + vite bundle)
  - Output: `dist/`
  - Routes: `/` → `/hero` (hand-written landing), `/intent` → `/otc` (legacy redirect)
  - Security headers: CSP (allow-list only), HSTS, X-Frame-Options: DENY, no inline scripts

**Contracts:**
- **contracts/Cargo.toml** (workspace root):
  - Members: otc_swap, rfq_swap
  - Shared dependencies via `[workspace.dependencies]`
  - **`[profile.release]`** (load-bearing, must stay here): opt-level z, LTO, panic=abort, codegen-units 1, strip symbols (WASM size optimization)
  - Cargo silently ignores `[profile.*]` in member crates → copy here would be dead and produce unoptimized 64KB+ wasm

## Platform Requirements

**Development:**
- Node.js 20.19+ (npm)
- Rust 1.84+ (rustup, wasm32v1-none target)
- Stellar CLI 27 (`~/.local/bin/stellar` or `cargo install stellar-cli@27`)
- macOS / Linux (Windows requires MSVC toolchain; see CLAUDE.md Gotchas)
- Playwright Core uses cached Chromium (no Chrome installation needed; `CHROME_PATH` overridable)

**Production / Deployment:**
- **Vercel** (frontend: static build output `dist/`, auto-deploy on push to main)
- **Stellar Testnet** (contract deployment and settlement)
- **Supabase** (off-chain PostgreSQL coordination, realtime)
- **HTTPS + TLS 1.2+** (CSP, no mixed content)

## Build & Serve

```bash
npm install                    # Install both frontend + contract tooling
npm run dev                    # Vite dev server @ http://localhost:5173/otc.html
npm run build                  # tsc --noEmit && vite build → dist/
npm run preview               # Serve built dist/
npm test                      # Vitest: 109 tests (canonical, tokens, pairs, etc.)
npm run typecheck             # tsc --noEmit only

cd contracts && stellar contract build  # → target/wasm32v1-none/release/*.wasm
cargo test --manifest-path contracts/Cargo.toml  # All contracts (23 tests)

npm run e2e:census            # Headless maker+taker E2E, settles for real on Testnet
```

---

*Stack analysis: 2026-08-18*
