# Codebase Concerns

**Analysis Date:** 2026-08-18

## Tech Debt

**TEMPORARY Demo USDC Issuer (Critical - Testnet only):**
- Issue: `src/core/tokens.ts` line 36 points the USDC allow-list at a demo-only Testnet issuer (`GBJH2XCGKRMFKCBYPFJHHGISZGLOYZ3TM3IMFQPQSK7NT2L7JUARLC26`), not Circle's official Testnet USDC (`GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`). This quarantines real Circle USDC balances to zero for any user holding the real asset.
- Files: `src/core/tokens.ts` (lines 22-37), `src/core/tokens.test.ts`, `src/core/pairs.test.ts` (both pin the issuer)
- Impact: Any real-world user testing with Circle USDC cannot use the app; their balance reads as zero. Production deployment must revert this first.
- Fix approach: Before mainnet or any real user access: restore Circle's issuer in `tokens.ts`, update golden vectors in `tokens.test.ts` + `pairs.test.ts`, redeploy. Demo funding helpers (`tools/mint-usdc.mjs`, etc.) become unusable after revert.

**RFQ Protocol Architecture Adopted but Not Implemented:**
- Issue: Design adopted 2026-08-17 (`docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md`). Only `rfq_swap` contract is built and deployed; missing: `rfq_registry`, `swap_any` entry point, maker quote server (separate repo), taker SDK (separate repo), desk taker integration path.
- Files: `contracts/rfq_swap/src/` (built), `contracts/rfq_registry/` (not yet created), maker server + taker SDK (to be in separate repo)
- Impact: RFQ protocol is proven on-chain but cannot be used end-to-end; interim fan-out mode (intent layer) stays the active broadcast path. When RFQ ships, the entire intent/private-offer layer (`broadcasts`, `rounds`, `intents` tables, `BroadcastList.tsx`, `RoundTimeline.tsx`, broadcast UI) must be removed, which is a large deletion but not a blocker until then.
- Fix approach: RFQ taker path is a future phase. Schedule the intent-layer deprecation only after RFQ ships and desk taker integration is confirmed working.

**Interim Fan-Out Mode Needs Removal Path:**
- Issue: Broadcast/intent layer shipped as a temporary interim fan-out mode pending RFQ protocol adoption. Design now adopted, but removal is deferred until RFQ taker integration ships. The longer it persists, the harder removal becomes (users may adopt it, UI debt accumulates).
- Files: `src/data/broadcasts.ts`, `src/data/rounds.ts`, `src/data/intents.ts`, `src/data/useRounds.ts`, `src/data/useBroadcasts.ts`, `src/data/useIntentCount.ts`, `src/ui/BroadcastList.tsx`, `src/ui/RoundTimeline.tsx`, Supabase `broadcasts`, `rounds`, `intents` tables, database migration `docs/migrations/2026-07-10-intent-layer.sql`
- Impact: UI complexity is higher than necessary; three sections (Incoming Offers, Sent Broadcasts, Sent Directed) blend two protocols; test coverage is missing for the broadcast path; E2E only covers directed lane.
- Fix approach: Document the removal checklist (tables, columns, React components, CSS classes, Supabase RLS rules, golden vectors) and link it to the RFQ taker-integration phase so it's not forgotten.

**Contract Storage Access via Unwrap():**
- Issue: `contracts/rfq_swap/src/lib.rs` lines 359, 363, 370 use `.unwrap()` to read `Admin`, `FeeBps`, `FeeCollector` from instance storage (initialized in constructor). If instance storage is ever corrupted, archived past recovery, or the constructor fails silently, these calls panic the contract.
- Files: `contracts/rfq_swap/src/lib.rs:358-371` (functions `admin()`, `fee_bps()`, `fee_collector()`)
- Impact: Low in practice (constructor guarantees presence, instance storage is read on every call, archival for instance storage is designed to be stale-proof). Panic would revert the tx and block the contract until recovery.
- Fix approach: Low priority. Could be mitigated by `.expect()` with a message for debuggability, but unwrap semantics are acceptable here: the contract is designed to never run without these values. If ever adding optional config, switch to `.ok_or()` returns.

**Stellar-Wallets-Kit 1.9.5 Double-Encoding Quirk (Already Mitigated):**
- Issue: `@creit.tech/stellar-wallets-kit@1.9.5` (exact-pinned) encodes auth-entry signatures twice when calling `signAuthEntry()`, returning base64-of-base64 instead of the signature bytes. This is an upstream bug in the kit's Freighter module.
- Files: `src/wallet/authSignature.ts:1-25` (normaliser), `src/core/fill.ts:122-124` (integration)
- Impact: Any direct use of `kit.signAuthEntry()` without the normaliser produces invalid signatures. Already mitigated by the normaliser in `authSignature.ts`, which decodes once and verifies the result is 64 bytes. Regression risk if the normaliser is ever bypassed.
- Fix approach: Cannot fix upstream (the kit is maintenance-mode). Keep the normaliser in place and never widen `WalletSigner.signAuthEntry` back to returning the kit's raw output. The frozen `otc.js:456` reference implementation still carries the bug but is not deployed.

**Manual Testnet Reset Dependencies:**
- Issue: Multiple files hardcode Testnet contract IDs and configuration that change ~quarterly on Testnet reset: `OTC_CONTRACT_ID`, `REFLECTOR_ORACLE_ID`, `RFQ_SWAP_CONTRACT_ID` in `public/otc-config.js`, Testnet Supabase project URL + key (in `public/supabase-config.js`), token allow-list in `src/core/tokens.ts` (if Circle redeploys).
- Files: `public/otc-config.js`, `public/supabase-config.js`, `src/core/tokens.ts`, `src/core/tokens.test.ts`, `src/core/pairs.test.ts`
- Impact: Quarterly Testnet resets require manual redeploy of contract, update of config files, and re-run of golden-vector tests. If any step is skipped or mistyped, the app silently breaks (settlement disabled or silently misrouted).
- Fix approach: The one-file-edit workflow is deliberate (Testnet reset without rebuild). Mitigate by: (1) documenting the exact checklist in CLAUDE.md (already done), (2) adding a pre-flight check in the app to warn if contract IDs are stale, (3) automating golden-vector test updates in a script.

---

## Known Bugs

**Cross-Asset Settlement Order Constraint (Found in E2E 2026-07-27):**
- Symptoms: On a cross-asset order (e.g. 10 XLM for 1 USDC), the taker cannot sign their leg until the maker's trustline is on-chain. If the taker tries to sign before the maker's trustline settles, `signFillAuth` simulation fails with a footprint error.
- Files: `src/core/fill.ts:106-128` (ensureTrustline + signFillAuth), E2E test report: `tools/e2e/out/report-taker-*.json`
- Trigger: (1) Maker creates a cross-asset order and signs first, (2) Taker tries to sign before maker's trustline lands on-chain, (3) Simulation fails; taker must wait ~5 seconds for maker's trustline to settle, then retry.
- Workaround: UI should detect this and prompt taker to wait + retry automatically, or enforce maker-first signing order on cross-asset pairs (currently unforced; E2E found it empirically). The constraint is inherited from Stellar's design: taker's trustline for the incoming asset must exist before `transfer_from` can succeed.
- Mitigation: Already documented in CLAUDE.md Status (2026-07-27 E2E finding); E2E measured maker 11 clicks/4 prompts, taker 7/3 (cross-asset maker +1 changeTrust prompt). No fix needed; it's a platform constraint, not a bug.

**No Recovery Path for Failed Settlement Writes:**
- Symptoms: If Supabase write fails after a tx settles on-chain, the row stays in `settling` status, and the tx hash is never recorded.
- Files: `src/ui/useSettlement.ts:102-110` (the three writes after confirmation are `.catch(() => {})`), `src/data/orders.ts` (updateOrder)
- Trigger: Supabase outage or RLS denial during the bookkeeping window after on-chain confirmation
- Current handling: The settlement is confirmed on-chain; the app treats a failed bookkeeping write as non-fatal (correct). The row stays `settling` until a later reconcile process reads `settle_tx_hash` from RPC and updates the DB.
- Impact: Temporary; a reconcile process must exist to periodically query RPC for settled txs and backfill `settle_tx_hash` + `settled_at`. Not yet built.
- Fix approach: Add a background job (separate repo, scheduled task, or webhook) that periodically scans `orders` where `settlement_status = 'settling'` and `settled_at IS NULL`, queries RPC/Horizon for the referenced tx, and updates the row.

---

## Security Considerations

**Public Supabase Reads (Accepted for Testnet MVP):**
- Risk: All `orders`, `broadcasts`, `rounds`, `intents` rows are readable by the anon key. A user can discover all active offers, all counterparties, and all broadcast makers—an Information Disclosure at low severity for Testnet demo but unacceptable for production.
- Files: `src/data/supabase.ts` (anon key, no auth), all fetch functions in `src/data/`, Supabase RLS policies in `docs/migrations/`
- Current mitigation: Documented as accepted in CLAUDE.md; RLS rules exist but are currently `true` (disabled). This is fine for Testnet MVP where the risk is low.
- Recommendations: Before production, implement per-wallet RLS via Sign-In-With-Stellar (signed nonce → JWT). The architecture is sketched in CLAUDE.md (Identity & trust model, Future hardening).

**No Multi-Wallet Support (Freighter Only):**
- Risk: Only `FreighterModule` is registered in `src/wallet/kit.ts` (commit `584a9ad`). If Freighter is unavailable, has a bug, or the user prefers another wallet, they cannot use the app. Single point of failure for the wallet dependency.
- Files: `src/wallet/kit.ts` (wallet-kit singleton registration), `src/wallet/WalletContext.tsx` (connect flow)
- Current mitigation: None. Freighter is well-maintained and widely available on Testnet.
- Recommendations: Consider adding `LedgerModule` (hardware wallet) and `StellarGuard` as fallbacks. This is a UX enhancement, not a security blocker.

**CSP Strict but No Subresource Integrity:**
- Risk: CSP in `vercel.json` is allow-list style (good), but lacks SRI hashes for allowed external resources (fonts.googleapis.com, fonts.gstatic.com). A compromised CDN could inject malicious CSS/fonts.
- Files: `vercel.json:17-18` (CSP headers)
- Current posture: Very low risk (fonts.gstatic.com is Google's trusted CDN, and CSS/fonts cannot execute scripts). The app has zero inline scripts per the CSP (`script-src 'self' 'wasm-unsafe-eval'`).
- Recommendations: Add SRI hashes if moving to a less-trusted CDN. For now, low priority.

**Settlement Serialization Enforced by Convention:**
- Risk: `src/ui/useSettlement.ts` uses a module-scope `txBusy` ref to serialize sign/settle actions across the desk. If a second `useSettlement` instance is ever created (e.g. in the shell), both could run concurrently and race: two wallet prompts, two submits, two competing DB writes.
- Files: `src/ui/useSettlement.ts:38`, `src/ui/ThreadView.tsx` (only caller), `src/App.tsx` (explicitly does NOT call useSettlement)
- Current mitigation: Invariant documented in CLAUDE.md + `grep -rn "^import.*useSettlement\|useSettlement(" src/` should yield exactly 3 lines. Enforced by code review, not by type system.
- Recommendations: Consider wrapping settlement in a provider + context to make the constraint type-safe (higher refactor cost). For now, the grep invariant is working; document it prominently and teach team members.

---

## Performance Bottlenecks

**Large Component: Ticket.tsx (489 lines):**
- Problem: The one compose form is 489 lines of JSX + logic. It handles single token/amount entry, pair selection, negotiation state (rounds, counters), fair-price oracle read, balance validation, and settlement triggering. Growing it further risks performance and maintainability.
- Files: `src/ui/Ticket.tsx:1-489`
- Cause: It's the central UI for order creation and inherits both the intent-layer broadcast logic and the fair-price read-back.
- Improvement path: Extract fair-price display to a sub-component. When RFQ taker path ships, refactor to separate broadcast vs direct compose flows.

**Supabase Realtime Subscriptions Without Pagination:**
- Problem: `useOrders` subscribes to all orders for the connected wallet, `useBroadcasts` to all broadcasts, `useIntentCount` to all intents for a pair. No pagination. A prolific maker or taker with hundreds of orders loads all of them on every change.
- Files: `src/data/useOrders.ts`, `src/data/useBroadcasts.ts`, `src/data/useIntentCount.ts`, `src/data/useRounds.ts`
- Cause: Realtime subscriptions are per-filter; pagination would require managing cursor state per subscription.
- Impact: Acceptable for Testnet MVP and current user base. Scaling limits are probably 1000s of orders before UI lag becomes noticeable.
- Improvement path: Defer until production; then implement (1) cursor-based pagination with a "load more" button, or (2) infinite scroll with automatic load-on-scroll.

**No RPC Rate Limiting:**
- Problem: `src/core/fill.ts` makes multiple RPC calls (getAccount, getLatestLedger, simulateTransaction, sendTransaction, getTransaction) without rate-limit backoff. A burst of concurrent fill attempts could hit RPC limits (typically ~1000 req/min on public endpoints).
- Files: `src/core/fill.ts:62-165` (waitForTx has basic 30-iteration polling but no exponential backoff; other calls have no retry)
- Impact: Low for single-user testing; Testnet public RPC is lenient. Production would need a private or gated RPC.
- Improvement path: Add exponential backoff on getTransaction polling (currently fixed 1500ms), and implement circuit breaker for RPC errors.

**No Caching of Token SAC IDs:**
- Problem: Every call to `fillCanonicalArgs` derives SAC ids via `Asset.contractId(passphrase)`. No caching. The derivation is deterministic and could be cached in memory.
- Files: `src/core/canonical.ts:45-55` (assetFor function)
- Impact: Negligible; derivation is sub-millisecond. Caching complexity not worth it.

---

## Fragile Areas

**CSS Specificity and Load Order (Multiple Gotchas):**
- Files: `public/styles.css`, `public/intent.css`, `public/hero.css`
- Why fragile:
  1. **Stylesheet order matters.** `otc.html` loads `styles.css` THEN `intent.css`. Swapping them breaks `.counter-form input` styling (equal specificity, source order wins). Gotcha is documented in CLAUDE.md but easy to miss during refactor.
  2. **`[data-panel]` selectors track hardcoded section names.** Renaming a section in `src/App.tsx` without updating `intent.css` silently breaks spacing (no error, just lost padding). Mitigation: grep both files after renaming.
  3. **Mask clips shadows.** A `.field--card` with `mask` will clip `box-shadow` AND `filter: drop-shadow`. Gotcha required moving shadow to `.ticket__card-shadow` wrapper. Moving it back would silently break.
  4. **Ticket parallax + backdrop-filter conflict.** Landing transforms and backdrop-filters must be on the same element; transform on ancestor becomes backdrop root and collapses the blur. Gotcha is why parallax uses CSS custom properties instead of transforms.
- Safe modification: Always test CSS changes in both desk (light milky theme) and landing (electric indigo) after touch. Measure accessibility on rendered pixels (not CSSOM walkable).

**Wallet Auth Entry Encoding (Freighter + Kit Quirk):**
- Files: `src/wallet/authSignature.ts`, `src/wallet/kit.ts`
- Why fragile: The double-encoding quirk is hidden in a normaliser. Any future wallet swap or kit upgrade could reintroduce the bug if the normaliser is bypassed. The check `if (sig.length !== 64)` is a runtime guard but not foolproof if the bug changes form.
- Safe modification: Never widen `WalletSigner.signAuthEntry` to return the kit's raw output. Keep the normaliser in place. Add a comment linking to the upstream issue.

**Golden Vectors Pinned to Vanilla Reference:**
- Files: `fixtures/canonical-args.json`, `src/core/canonical.test.ts`, `tools/capture.html`, `tools/capture-server.mjs`
- Why fragile: Canonical args must match byte-for-byte between the vanilla `canonical.js` and the TypeScript `canonical.ts`. Any drift in numeric encoding or arg order breaks signatures. The golden vectors lock this down; running the `npm run capture` tool regenerates them from the vanilla stack (esm.sh).
- Safe modification: Never hand-edit `fixtures/canonical-args.json`. Always use `npm run capture` after canonical logic changes. The tool is dev-only and brittle (depends on esm.sh + Playwright); it's meant to be run once per breaking change.

**Intent Layer Removal Debt:**
- Files: Multiple (see "Interim Fan-Out Mode Needs Removal Path")
- Why fragile: The longer the intent layer persists, the more UI logic couples to it, and the harder removal becomes. A future dev could add broadcast-only features (e.g. broadcast negotiation rounds, fan-out counters) that don't carry over to RFQ.
- Safe modification: Document the removal checklist and review it in every design phase. When RFQ taker ships, remove all intent-layer code in one PR, not piecemeal.

---

## Scaling Limits

**Testnet Contract Bytecode Claim:**
- Current: `otc_swap.wasm` hashes to `83f60b85…` and is claimed to match the deployed contract `CCAPYEWHYSGORPUOC7FBSIRBIWSJJSPJOIWPJNEZLGDXUWJVWV7MTKBJ` on Testnet (redeployed 2026-06-30). The workspace conversion (2026-08-18) was gated on this, and the hash was re-verified post-conversion.
- Risk: If the `[profile.release]` block is ever accidentally moved to a member crate or removed, the wasm ships unoptimized and the hash changes, breaking the bytecode-matches-source claim. Also, if the member crate adds a `[profile.release]` of its own, Cargo silently ignores it.
- Limit: Cannot add new dependencies or change member crate structure without re-verifying the wasm hash. Adding `rfq_registry` as a new member was gated on this; it passed (no hash change for `otc_swap`).

**Instance Storage TTL (Small Config Only):**
- Limit: Instance storage is read on every contract invocation; every key adds latency. `rfq_swap` currently stores 4 keys (Admin, FeeBps, FeeCollector, Paused). This is fine. If the config grows beyond ~10 keys, consider splitting into a typed struct to reduce read count.
- Files: `contracts/rfq_swap/src/lib.rs:111-121` (DataKey enum)

**Maker Registration Staking (Not Yet Built):**
- Limit: `rfq_registry` will require makers to stake to register. Staking amounts (base + per-token) are TBD. High barriers discourage spam but also adoption. This is a future trade-off decision.

---

## Dependencies at Risk

**stellar-wallets-kit@1.9.5 (Exact Pin):**
- Risk: The kit is pinned to exactly `1.9.5` because it carries the double-encoding bug; minor/patch bumps could fix the bug, break the normaliser, or introduce new bugs. Pinning buys stability but locks in the defect forever.
- Impact: If the kit ever ships a fix for the double-encoding bug (unlikely, kit is in maintenance mode), the normaliser would need to detect the version and conditionally apply the fix, or the kit upgrade would break auth signing.
- Recommendation: Monitor upstream; if major security issues surface in 1.9.5, fork the kit locally and patch the double-encoding bug, then switch the dependency.

**@stellar/stellar-sdk@^16 (Caret Range):**
- Risk: Caret range allows minor/patch bumps. The SDK is well-maintained and rarely introduces breaking changes in minor versions. However, `soroban-sdk` (Rust) is pinned to 26, so misalignment could occur.
- Current: No known conflicts. SDK 16.1+ works fine.
- Recommendation: Monitor SDK changelog; pin to a minor range (`~16.0`) if issues arise.

**Supabase@^2.110.2 (Caret Range):**
- Risk: Supabase JS client is updated frequently. Realtime channel API could change; the app uses basic `.subscribe()` / `.removeChannel()` patterns that should be stable.
- Current: No known issues. Upgrade flow is smooth.
- Recommendation: Test Supabase upgrades in staging before production. The realtime channel filter syntax (`filter: 'taker_address=eq.${address}'`) is stable.

**Vite 8 (Major Pin):**
- Risk: Major version. Vite 9+ introduces breaking changes. The app uses basic Vite patterns (React plugin, dynamic imports, `define` shims for `global`/`Buffer`). Should be forward-compatible.
- Recommendation: Plan a Vite 9 upgrade in the next major release cycle.

---

## Missing Critical Features

**Reconcile Job for Failed Settlement Writes:**
- Feature gap: If Supabase write fails after on-chain settlement, the tx hash is never recorded and the row stays in `settling` status forever.
- Blocks: Production-grade settlement (end-users need proof of settlement).
- Impact: Currently acceptable for Testnet (users can check RPC directly). Required for production.
- Implementation: Background job (could be a serverless function) that periodically scans `orders WHERE settlement_status = 'settling' AND settled_at IS NULL` and backfills `settle_tx_hash` from RPC/Horizon.

**Per-Wallet RLS (Sign-In-With-Stellar):**
- Feature gap: Supabase reads are public (anon key). No per-wallet access control.
- Blocks: Production privacy (makers don't want their broadcasts public; takers don't want their counterparties known).
- Impact: Accepted for Testnet MVP. Unacceptable for production.
- Implementation: Sketch exists in CLAUDE.md (signed nonce → JWT issued by a trusted server, then used as Supabase auth token). Adds a token endpoint (not part of this repo; maker server will host one).

**RFQ Maker Server + Taker SDK:**
- Feature gap: The `rfq_swap` contract is deployed and proven, but no maker server or taker SDK exists yet.
- Blocks: End-to-end RFQ protocol; current interim fan-out mode cannot scale beyond demo.
- Impact: RFQ adoption is blocked. These will be in a separate repo (reaffirmed in CLAUDE.md).

**RFQ Registry Contract:**
- Feature gap: Makers cannot register for discovery.
- Blocks: Maker discovery; without it, takers must know maker URLs out-of-band.
- Impact: Blocks production RFQ. Design is adopted; implementation is a future phase.

**UI Auto-Retry for Cross-Asset Signing Constraint:**
- Feature gap: When taker's trustline exists but maker's doesn't, taker's sign fails with no guidance.
- Blocks: Smooth UX on cross-asset pairs.
- Impact: E2E workaround is manual retry; UX gap for end-users.
- Implementation: Detect the `footprint` error in `signFillAuth` and retry with exponential backoff, or enforce maker-first signing order on cross-asset pairs at UI level.

---

## Test Coverage Gaps

**UI Components (React):**
- Untested: `Ticket.tsx` (489 lines), `ThreadView.tsx` (239), `BroadcastList.tsx` (252), `CounterForm.tsx` (127), `RoundTimeline.tsx` (99), `OrderCard.tsx` (96), `SettlementStrip.tsx` (85), `OfferList.tsx`, `PairsPanel.tsx`, `BalanceStrip.tsx`, `TokenSelect.tsx`, `AddressSeal.tsx`, `SectionSheet.tsx`, `Gate.tsx`, all in `src/ui/`.
- What's not tested: Component rendering, prop handling, state updates, form input/submission, user interactions (clicks, scrolls), layout breakpoints.
- Files: `src/ui/*.tsx` (all)
- Risk: High. UI bugs (broken form, hidden buttons, wrong data displayed) only surface in browser testing. E2E covers the happy path via Playwright, but unit tests could catch regressions faster.
- Priority: Medium. E2E tests mitigate risk for critical paths (order creation, settlement). UI component regressions would likely be caught in manual QA or user testing.

**Data Layer (Supabase Hooks):**
- Untested: `useOrders`, `useBroadcasts`, `useBalances`, `useIntents`, `useRounds`, `useIntentCount`, `useFairPrice`.
- What's not tested: Initial data load, realtime subscription lifecycle (mount, unmount, address change), error handling, race conditions (fast reconnect/disconnect).
- Files: `src/data/*.ts` (all except `supabase.ts`)
- Risk: Medium-high. Realtime subscriptions are brittle; subscription leaks could silently accumulate memory, slow page, or drop updates. The cleanup logic (`useEffect` return functions) is tested via manual browser testing only.
- Priority: Medium. E2E exercises these hooks for happy paths. Unit tests would catch cleanup bugs and edge cases (address change during fetch, rapid connect/disconnect).

**Settlement Flow (useSettlement):**
- Untested: `signOrder` and `settle` callback logic, error handling, concurrent-submit race prevention (txBusy serialization), Supabase write failures.
- Files: `src/ui/useSettlement.ts:37-119`
- What's not tested: Sign with wrong wallet address, sign when disconnected, settle when both parties haven't signed, failed sign, failed settle, settlement race (two concurrent settles), settlement after disconnect.
- Risk: High. This is the most security-critical flow (authorizing transfers). Logic bugs could lead to wallet prompts without corresponding on-chain action or vice versa.
- Priority: High. Should be covered by unit tests (mock wallet + Supabase) before expanding E2E.

**Error Handling Paths:**
- Untested: RPC errors (timeout, rate-limit, simulation failure), Supabase errors (read/write failure, realtime connection drop), wallet errors (user deny, extension crash), network failures (offline).
- Files: `src/core/fill.ts`, `src/data/`, `src/ui/useSettlement.ts`, `src/ui/Toast.tsx`
- What's not tested: Error messages, retry logic, graceful degradation, state after error.
- Risk: Medium. E2E touches some error paths (intentional simulation errors for testing). Unit tests needed for more comprehensive coverage.

**Fair-Price Oracle (useFairPrice):**
- Untested: Oracle read-back, Reflector contract call, invalid response handling, stale data detection, display formatting.
- Files: `src/core/oracle.ts` (logic, tested), `src/data/useFairPrice.ts` (hook, not tested), `src/ui/Ticket.tsx` (display integration, not tested)
- Risk: Low. Oracle is advisory (never signed, never on settlement path). If it fails, the suggestion is silently omitted. Unlikely to cause user harm.
- Priority: Low-medium. Add unit tests for oracle logic boundary cases (zero liquidity, extreme rates, stale feeds).

**Broadcast/Intent Layer:**
- Untested: Broadcast negotiation rounds, counter-offers, round timeline, intent fan-out logic.
- Files: `src/data/rounds.ts`, `src/data/intents.ts`, `src/ui/RoundTimeline.tsx`, `src/ui/CounterForm.tsx`
- Risk: Medium. The interim fan-out mode is complex but not critical (RFQ is the future direction). Bugs here affect broadcast users only, not the permanent OTC directed lane.
- Priority: Low. Will be removed when RFQ ships; testing effort not justified. Manual QA during broadcast feature work.

---

*Concerns audit: 2026-08-18*
