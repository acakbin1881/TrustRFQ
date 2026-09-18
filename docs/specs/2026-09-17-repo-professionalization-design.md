# Repository professionalization and monorepo layout

**Status:** adopted 2026-09-17. Supersedes nothing; it reshapes the repository around the
architecture in `2026-08-17-rfq-protocol-architecture-design.md`, which stays the protocol
design record.

**Superseded in part, 2026-09-18.** The protocol-only repository decision
(`2026-09-18-protocol-only-repo-decision.md`) retires `apps/desk`, the OTC and broadcast lanes,
Supabase, `otc_swap`, `tools/e2e`, `tools/checks`, `tools/reference` and the desk's Vercel
configuration. Of this design, the monorepo layout, the `@trustrfq/sdk` extraction, the contract
fixes, CI and the root files, the `tools/research` and `tools/testnet` hygiene and the docs path
rules stand. Every `apps/desk` item is cancelled: the USDC runtime config, `Topbar`, the desk
comment and copy hygiene, the landing rewrite and the README product copy. Read that decision
first; where the two disagree, it wins.

## 1. Goal

A senior web3 developer who opens this repository on GitHub should see, in the first two
minutes, one coherent project: a request-for-quote protocol on Stellar made of settlement
contracts, a maker registry and a taker SDK, with a reference desk that proves it works and
measurement tools that justify it. Nothing in the tree, the comments, the README or the
deployed configuration should read as scratch, as an AI planning trail, or as a claim the code
does not back.

Non-goals: rewriting git history; changing protocol behaviour beyond the fixes listed in
section 8; the OTC-into-`rfq_swap` consolidation (`require_fill_guard`), which stays a separate
milestone; the maker quote server, which stays in its own repository; splitting the E2E
driver into modules.

## 2. Target layout

One repository, npm workspaces, four kinds of top-level part.

```
TrustRFQ/
├── contracts/                 Cargo workspace: rfq_swap, rfq_registry, otc_swap
│   ├── Cargo.toml             workspace root; [workspace.package] + [profile.release]
│   ├── Makefile               build / test / fmt / clippy / check-hash / optimize
│   ├── README.md              the three contracts, Testnet ids, hash gate, deploy steps
│   └── rust-toolchain.toml    pins the channel that reproduces the deployed hashes
├── packages/
│   └── sdk/                   @trustrfq/sdk, the taker SDK (TypeScript, no React, no DB, no wallet)
│       ├── src/               wire, order, assets, validate, discover, settle, retry, network, index
│       ├── fixtures/          rfq-order-vectors.json, rfq-auth-tree.json
│       ├── package.json       deps: @stellar/stellar-sdk, buffer
│       ├── tsconfig.json
│       └── vitest.config.ts
├── apps/
│   └── desk/                  the reference client (React + TypeScript + Vite)
│       ├── src/               App, RfqDemo, core (OTC lane), data, ui, wallet, config
│       ├── public/            landing (hero.*), stylesheets, otc-config.js, supabase-config.js
│       ├── fixtures/          canonical-args.json (OTC fill args golden vector)
│       ├── otc.html, rfq.html
│       ├── vite.config.ts, vite.rfq.config.ts
│       ├── package.json
│       └── tsconfig.json
├── tools/
│   ├── lib/                   testnet.mjs (friendbot, Horizon, RPC, submit), chrome.mjs (browser resolver)
│   ├── e2e/                   headless drivers, mock Freighter, stub maker, README.md
│   ├── testnet/               fund-demo, mint-usdc, sweep-xlm, derive-keys, rfq-live-swap, rfq-registry-live
│   ├── research/              slippage/, tradesize/ (mainnet measurements, committed run records)
│   ├── checks/                capture.html + capture-server, bundle-check.html + driver, dev-smoke
│   ├── reference/             frozen vanilla desk
│   ├── build-rfq-demo.mjs
│   └── README.md              one line per script, required env vars
├── docs/
│   ├── specs/                 dated design records (this file included)
│   ├── migrations/            Supabase SQL
│   ├── evidence/              committed live-run records
│   └── testnet-reset.md       the redeploy runbook, moved out of otc-config.js
├── .github/workflows/ci.yml
├── .editorconfig
├── SECURITY.md
├── LICENSE, README.md
├── package.json               workspaces + delegating scripts + tool devDependencies
├── vitest.config.ts           test.projects: apps/*, packages/*
├── vercel.json                desk deploy: build via root script, output apps/desk/dist
└── .vercelignore, .gitignore
```

Why this shape and not separate repositories: one maintainer, contract ids and golden vectors
shared by every part, one CI. AirSwap keeps its protocol (contracts, libraries, tools) in one
repository and only its web app and maker kit outside; the maker server is already outside
here. Stellar's own scaffold produces `contracts/` + `packages/` + a frontend, so a Stellar
developer expects this arrangement.

All moves use `git mv` so history follows the files.

## 3. The SDK package

`packages/sdk` is what the README has promised as "the taker SDK extracted from those
modules". It becomes real and visible now, consumed by the desk through the workspace link.

What moves in, from `src/core/rfq/` and `src/data/rfqNetwork.ts`:

| Module | Content | Change on the way in |
|---|---|---|
| `wire.ts` | JSON-RPC types, `RFQ_ERROR` | none |
| `assets.ts` | `assetFor`, `sacIdFor`, `toStroops` (from `src/core/canonical.ts`) | new home; the desk's `canonical.ts` imports them from the SDK, golden vectors prove bytes unchanged |
| `order.ts` | `toAtomic`, `tokenForSac`, `orderToScVal`, `orderScValBase64` | `toAtomic` becomes an alias of `toStroops`; the one-line `sacIdFor` wrapper is dropped |
| `validate.ts` | `validateQuote`, `ValidateContext`, `SwapConfig`, `QuoteRejection` | `ValidateContext` gains `isTokenAllowed(token: string): boolean`; the module stops importing the desk allow-list. `ROOT_ARG_COUNT` and the sub-invocation count become named constants with a pointer to `contracts/rfq_swap/src/lib.rs`; the fixture is asserted against in the test only. `REJECT_REASON` is renamed `RejectReason` |
| `discover.ts` | `intersectUrls`, `quotePrice`, `rankQuotes`, `bestQuote`, `dropExpired`, `fmtCountdown` | none |
| `settle.ts` | `settleQuote`, `waitForTx`, `RfqChainConfig`, `RfqWalletSigner`, events | `readSwapEvent` takes the transaction hash and returns the event whose `txHash` matches, or `null` |
| `retry.ts` | `needsTrustline`, `isExpiredAuthFailure`, `retryDecision` | `needsTrustline` takes a structural `TrustlineLookup` (an object keyed by token string, or `null`) instead of the desk's `BalanceMap` type; the desk's map satisfies it unchanged |
| `network.ts` (was `rfqNetwork.ts`) | `simulateRead`, `discoverMakerUrls`, `readSwapConfig`, `getMakerSideOrder`, `fanOutMakerSideOrder` | every function takes an `RfqClientConfig { rpcUrl, passphrase, registryId, swapContractId }` argument instead of reading module-scope config; the JSON-RPC result passes an `isMakerSideOrderResult` type guard before it is used; `error.code` from a maker's JSON-RPC error is surfaced in `FanOutRejection` |
| `index.ts` | the public barrel | new |

Rules for the package: no import of React, Supabase, the wallet kit, `window`, or anything
under `apps/`. Dependencies are `@stellar/stellar-sdk` and `buffer` only. The desk keeps thin
wrappers in `apps/desk/src/data/rfq.ts` that bind the SDK functions to `config.ts` and the
desk allow-list, so UI code calls `discoverMakerUrls(pair)` exactly as it does today.

Tests move with the modules. The `buffer` alias from the desk's Vite config is repeated in the
SDK's Vitest config, so the golden vectors keep exercising the npm `buffer` implementation.

## 4. The desk app

`apps/desk` is the current root minus what moved to the SDK and to tools. `src/core/` keeps
the OTC lane (`canonical.ts`, `fill.ts`, `tokens.ts`, `pairs.ts`, `negotiation.ts`,
`balances.ts`, `oracle.ts`, `address.ts`, `types.ts`). A new `src/ui/Topbar.tsx` replaces the
topbar duplicated between `App.tsx` and `RfqDemo.tsx`.

The USDC allow-list entry becomes runtime-configured: `config.ts` reads
`window.USDC_ISSUER`, defaulting to Circle's Testnet issuer; `tokens.ts` builds `TOKENS` from
it. The repository default is Circle's issuer, so `main` never carries the self-issued demo
asset; the demo deployment sets the demo issuer in its own `otc-config.js`. `tokens.test.ts`
and `pairs.test.ts` pin Circle's issuer.

`vite.rfq.config.ts` derives from `vite.config.ts` through `mergeConfig` instead of copying
it. `vercel.rfq-demo.json` is deleted; `tools/build-rfq-demo.mjs` derives the demo's
`vercel.json` from the root `vercel.json` by removing the Supabase origins, the redirect and
the rewrite, so the two CSP strings cannot drift.

## 5. Tools

- No absolute paths anywhere. Every script resolves the repository root from
  `import.meta.url` and reads key files relative to it.
- `tools/lib/testnet.mjs` holds the Testnet constants (`RPC_URL`, `HORIZON_URL`,
  `FRIENDBOT_URL`, `PASSPHRASE`), `friendbot(address)`, `submit(tx)` and the zero-balance
  `simulateRead` used by four scripts today.
- `tools/lib/chrome.mjs` resolves a browser binary: `CHROME_PATH` if set, else a candidate
  list (Playwright cache under `os.homedir()`, then system Chrome), else a clear error. Every
  headless script uses it.
- `tools/research/slippage/com.trustrfq.slippage.plist` ships as `.plist.example` with
  `__REPO__` and `__NODE__` placeholders; its README shows the `sed` install line.
  `schedule.json` records a UTC offset instead of a city and machine narrative.
- `tools/testnet/derive-keys.mjs` gets its two missing devDependencies (`bip39`,
  `ed25519-hd-key`) declared at the root.
- `tools/README.md` and `tools/e2e/README.md` document every script, its env vars, its
  on-chain side effects, and the fact that the RFQ E2E lane registers a throwaway maker on
  the live registry and must not be run casually.

## 6. Root and workflow files

- `package.json`: name `trustrfq`, `private: true`, `workspaces: ["apps/*", "packages/*"]`,
  `license: "MIT"`, `description`, `repository`, `engines.node >= 20.19`. Scripts delegate:
  `dev`, `build`, `preview`, `typecheck`, `test`, `build:rfq-demo`, `e2e:*`, `check:*`.
  Tool-only devDependencies live here (`@stellar/stellar-sdk`, `playwright-core`, `vite`,
  `vitest`, `typescript`, `bip39`, `ed25519-hd-key`).
- `.github/workflows/ci.yml`, two jobs on push and pull request:
  - `web`: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, then fail if any
    `apps/desk/dist/*.html` contains an inline `<script>`.
  - `contracts`: install the pinned toolchain with the `wasm32v1-none` target, `cargo fmt
    --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`, fail if
    `test_snapshots/` is dirty afterwards, `stellar contract build`, fail if
    `otc_swap.wasm` does not hash to `83f60b85…`.
- `SECURITY.md`: scope (Testnet only, unaudited), what to report, a private contact
  (GitHub private vulnerability reporting), what not to file publicly.
- `.editorconfig`: 2-space, LF, final newline, UTF-8; 4-space for `*.rs`.
- `.vercelignore` adds `dist-rfq/` and the new paths.

## 7. Comment hygiene rules

Applied across `src/`, `packages/`, `contracts/`, `tools/`, `public/*.css`,
`public/otc-config.js`, `docs/migrations/`, spec banners.

Remove:
- Plan, task, decision and requirement identifiers: `D-xx`, `T-xx-yy`, `TAKER-xx`, `REG-xx`,
  `CR-xx`, `WR-xx`, `IDX-xx`, `02-06`, `03-04`, "Task 2", "Phase 3", "plan SUMMARY",
  "RESEARCH.md Pitfall N", "CONTEXT.md", "UI-SPEC.md", "Claude's Discretion", "a planner
  decision", "continuation session".
- Pointers to files that are not in the repository: `CLAUDE.md`, `.planning/`, Notion pages,
  the SCF customer development plan, "Work-plan card".
- Session narrative: "cost an hour", "verified live 2026-09-11", "this comment used to
  claim", "tried first and was wrong", dates that only mark when a line was written.
- Migration provenance describing the vanilla app ("ported line-for-line from otc.js",
  "as vanilla did", "CSS lands later", "redesigned 2026-07-13 from the handoff").

Keep, rewritten as a plain statement when needed:
- Every invariant and every "why" that a maintainer needs: auth must be attached before
  simulation, the CSS load order, the wallet-kit double-encoding, the fee cap, the hash gate.
- Dates on things that are facts about the world, not about the author: deployment dates,
  measurement windows, the day a Testnet instance was replaced.

The `public/otc-config.js` runbook moves to `docs/testnet-reset.md`; the config file keeps
one line per id saying what it is and where the runbook lives.

The Turkish quotation in `2026-07-12-desk-light-redesign-design.md` is translated.

## 8. Code fixes

TypeScript (desk and SDK), in addition to section 3:
- `intersectUrls` is used by `discoverMakerUrls`.
- One `waitForTx`, shared by the OTC and RFQ lanes.
- Quote rows in `RfqPanel` are `<button type="button" aria-pressed>`.
- `RfqPanel` receives `refreshBalances` and calls it after a trustline is created.
- `config.ts`: stale comments fixed; `rfqEnabled` and `registryEnabled` gate the RFQ tab and
  the demo the way `settlementEnabled` gates the settlement strip.
- `kit.ts`: `walletSign` reduced to the pinned kit's typed return.
- Dead `WALLET_ID_KEY` removed; `sacIdFor` reduced to the SDK 16 return type;
  `fetchSettlementStatus` propagates its error; `SectionSheet` imports `CSSProperties`;
  `RfqPanel` uses `tokenLabel`, drops the dead `busy` check and the duplicated replace block;
  `rfqNetwork.test.ts` casts through `unknown`; timing constants named
  (`LEDGER_CLOSE_MS`, `TX_POLL_INTERVAL_MS`, `MAKER_REQUEST_TIMEOUT_MS`, `MIN_QUOTE_TTL_S`,
  `AUTH_LEDGER_BUFFER`); one `DEFAULT_QUOTE_TOKEN`; one shared simulation source constant.
- The `console.debug` in `RfqPanel` runs only under `import.meta.env.DEV`; the eslint
  directive goes.
- User-visible copy: no em dashes, no emoji, no instructions that name config files. The
  lone dash used as an empty-value glyph in `Ticket` stays.

Contracts (`rfq_swap`, `rfq_registry`; `otc_swap` receives only formatting, one clippy
attribute and comment edits, each gated on its hash):
- `rfq_registry::remove_tokens` refunds what the maker paid, never the current admin price.
  The per-token rate is fixed per maker for its whole registration: `MakerConfig` gains
  `per_token_cost: i128`, recorded from the admin price at `set_url` time; `add_tokens`
  charges that recorded rate and `remove_tokens` refunds it, so "refund equals what was paid"
  holds for every token without any reconciliation. `set_costs` therefore affects only makers
  registering afterwards; a maker that ejects and re-registers picks up the current price.
  A test raises the price between add and remove and asserts the refund and `staked` are
  unchanged by the raise; a second test asserts that a maker registered after the raise pays
  the new rate.
- `Error::NotInitialized` is returned by the getters on an uninitialized instance instead of
  trapping.
- `bump_instance` runs from `swap`, `set_url`, `add_tokens`, `remove_tokens`,
  `add_protocols`, `remove_protocols` (threshold-gated).
- `rfq_registry`'s persistent `Maker` and `Token` entries get a longer TTL (threshold
  518,400 ledgers, extend to 2,073,600, about 120 days), so a maker that is silent for a
  month is not archived out of `get_urls_for_token`; the doc comment that called an archived
  key "missing" is corrected. `rfq_swap::is_paused` reads its key the way the sibling getters
  do.
- `swap` rejects `order.expiry` more than `MAX_QUOTE_LIFETIME` (one hour) in the future, well
  inside `CANCEL_TTL`, so a cancelled order id cannot outlive its cancellation flag; the header
  states why. The planned directed-offer mode (`require_fill_guard`, separate milestone) will
  lift this bound for guarded orders together with a persistent cancellation key.
- `rfq_swap::Error::NotAuthorized` is deleted and the numbering closed.
- Event topics use full symbols (`fee_collector_set`, `registered`, `url_set`, `tokens_added`,
  `tokens_removed`, `protocols_added`, `protocols_removed`, `costs_set`, `max_makers_set`).
- Error variants use adjective-first names in both RFQ contracts; codes unchanged.
- `rfq_swap` tests assert its five events, the fee landing at a new collector after
  `set_fee_collector`, `MathOverflow` in `mul_bps`, and the taker's auth entry in the
  scoped-auth test. Auth-rejection tests assert `Err(Err(_))`; business-rule tests assert
  the typed error.
- `set_fee`, `set_fee_collector`, every error variant and every `DataKey` enum get a doc
  comment.
- `[workspace.package]` carries version, edition, license, repository, rust-version; members
  inherit. `[profile.release-with-logs]` added.

Every contract change above alters the `rfq_swap` and `rfq_registry` bytecode and therefore
their contract ids. Redeploy is a separate, explicitly authorised step (section 11).

## 9. README, landing and positioning

README (rewritten in place, same voice, shorter):
- Getting started: prerequisites, install, run, test, build, contract build; config files a
  fork must change.
- Try it: links to the desk and the RFQ-only demo; one screenshot of the RFQ panel.
- Architecture: the tree in section 2, the three parts, the SDK as a package.
- What is proven: the real-maker run from `docs/evidence/live-rfq-run.md` with its six
  transactions replaces the unrecorded stub-maker transaction; the two earlier proofs keep
  their links; every command named has its prerequisites and on-chain side effects stated.
- Where it stands: the reference maker server exists, is deployed and registered, and lives
  in a separate repository that is not yet public.
- The OTC lane: one paragraph explaining directed offers, `otc_swap`, and the planned fold.
- Protocol parameters table; a `getMakerSideOrder` request and response; the error codes.
- Roadmap: the three shipped items move to Shipped; slogans said once; "Why RFQ" folded into
  About; sprint dates removed except on transaction links; claims corrected (network call
  sites, entries, scenario count, 1.20M vs 1.25M, "in practice 30 to 90 s", fixtures count,
  the `style-src` exception, "the deployed 100-maker limit").
- Security: links `SECURITY.md`. A CI badge at the top.

Landing (`apps/desk/public/hero.html`): copy rewritten to the protocol positioning with an
RFQ section (discover, quote, one signature) while the layout and design system stay as they
are; title "TrustRFQ: signed-quote RFQ on Stellar"; the slippage ladder cites the measured
floor from `tools/research/slippage/` or is labelled illustrative; links use `/` and `/otc`;
no em dashes in copy; `og:` meta added. `otc.html` and `rfq.html` titles lose the em dash.

GitHub: the repository description stays; topic `dex` is removed; the homepage stays
`trustrfq.vercel.app`, whose landing will now match the README.

## 10. Verification gates

Each workstream ends green on all of these before its commit:

1. `npm run typecheck`, `npm test` (all projects), `npm run build`; `apps/desk/dist/*.html`
   free of inline scripts; `grep -r esm.sh apps/desk/dist` empty.
2. `npm run build:rfq-demo` passes its own assertions.
3. `cargo fmt --all -- --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`
   (83 today, more after section 8), `git status --porcelain contracts/*/test_snapshots` empty.
4. `stellar contract build`; `otc_swap.wasm` sha256 `83f60b854089d1a93644483968e04b5661fef3b6006966fdead4d1221b5a4df3`.
5. `node tools/checks/dev-smoke.mjs` and a headless load of the preview on `/otc` and `/` with
   zero console errors and zero CSP violations.
6. `git grep` for the removed identifier families (section 7) returns nothing outside
   `docs/specs/` and `tools/reference/`; `git grep -I '/Users/'` returns nothing; no em dash
   in `apps/desk/src/**/*.tsx` JSX text, `public/hero.html`, or the HTML titles.

## 11. Execution order and git

Workstreams, each one or more atomic commits on `feat/rfq-milestone`:

1. Restructure (this spec, the `docs/specs` move, workspaces, `apps/desk`, `packages/sdk`
   with the interface changes of section 3, tools regrouped, root files, CI). Gate: section 10
   items 1 to 5.
2. Foundations for contracts (fmt, clippy, toolchain pin, workspace metadata, Makefile,
   README, comment hygiene in `contracts/`). Gate: items 3 and 4.
3. Comment hygiene everywhere else.
4. TypeScript fixes (section 8), test first where behaviour changes.
5. Tools hygiene (section 5).
6. README, landing, positioning, `docs/testnet-reset.md`, evidence notes.
7. Contract code fixes (section 8) with tests. Redeploy only on an explicit instruction, then
   ids, README, evidence and config are updated in one commit.
8. Local `CLAUDE.md` rewritten to the new layout (untracked, not part of any commit).

Pushing `feat/rfq-milestone` happens at the end; merging to `main` is the owner's act, since
a push to `main` deploys production.

## 12. Deferred

- Splitting `tools/e2e/rfq-driver.mjs` into scenario modules (cannot be exercised without
  registering a throwaway maker on the live registry).
- Factoring the six Supabase hooks' shared stale-fetch skeleton.
- Moving pure helpers out of `AddressSeal`, `Ticket`, `BroadcastList`, `RoundTimeline` into
  tested modules.
- Extracting `useSendOffer` from `Ticket`.
- Publishing `@trustrfq/sdk` to npm (needs a build step and a version policy).
- Replacing `initialize` with a constructor in `rfq_registry`.
