---
phase: 02-desk-rfq-taker-path
plan: 04
subsystem: rfq-taker
tags: [stellar, soroban, rfq, react, vitest, playwright, trustline, retry]

# Dependency graph
requires:
  - phase: 02-desk-rfq-taker-path
    provides: "Plan 02-03's discovery/ranking panel (src/core/rfq/discover.ts, src/ui/RfqPanel.tsx's ranked rows) and the nine-scenario driver this plan extends to twelve"
provides:
  - "src/core/rfq/retry.ts — pure price-guarded retry decision (retryDecision, isExpiredAuthFailure) and the D-08 trustline predicate (needsTrustline), mutation-verified"
  - "src/core/rfq/settle.ts — fronted with the D-08 ensureTrustline step (imported unchanged from src/core/fill.ts)"
  - "src/ui/RfqPanel.tsx — the D-08 passive trustline note, the D-09 guarded retry wired to its three visible outcomes, AND (continuation-session fix) the trustline pre-flight moved to fire during Refresh quotes instead of Accept, because a maker cannot produce a quote at all for a trustline-less taker"
  - "tools/e2e/stub-maker.mjs — EXPIRED_ENTRY and RE_QUOTE_PRICE failure knobs, genuinely signed"
  - "tools/e2e/rfq-driver.mjs — RETRY_EQUAL, RETRY_WORSE, TRUSTLINE scenarios (twelve total), settling for real on Testnet with measured prompt sequences"
affects: [phase-3-real-maker-server]

# Actuals (#2632)
actuals:
  tokens: 18935
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "retry.ts mirrors src/core/oracle.ts's purity discipline; retryDecision's guard ORDER (not-expired -> already-attempted -> no-fresh-quote -> price compare) is itself the security property, mutation-verified on the equal-price and at-most-once branches"
    - "needsTrustline mirrors balances.ts's canAfford fail-closed posture: a null (unfetched) balance map is never treated as evidence a trustline is missing"
    - "E2E harness diagnostics: a scenario driving its OWN browser context (TRUSTLINE, RETRY_WORSE's isolated maker) must attach its own console/pageerror listeners and take its own screenshot on failure — the outer handler in main() only ever captures the FIRST context's page, so a second-context failure was previously invisible"
    - "A maker's signed RFQ quote is produced by a RECORDING-mode simulation of the REAL swap call, which actually executes the SAC transfer — so a maker can never produce a quote for a taker who lacks the receiving trustline. Any UX design that assumes 'quote first, trustline later' is unreachable; the trustline step must run before the quote request, not after it exists."

key-files:
  created:
    - src/core/rfq/retry.ts
    - src/core/rfq/retry.test.ts
  modified:
    - src/core/rfq/settle.ts
    - src/ui/RfqPanel.tsx
    - tools/e2e/stub-maker.mjs
    - tools/e2e/rfq-driver.mjs

key-decisions:
  - "D-08's changeTrust step moved from settle time (inside settleQuote, fired only at Accept) to refresh-quotes time (inside RfqPanel's refreshQuotes, fired on the taker's Refresh quotes click) — proven live that a maker's own RECORDING-mode simulation of swap cannot succeed, and therefore cannot sign a quote at all, for a taker who lacks the receiving trustline. settleQuote keeps its own ensureTrustline call as a no-op fail-safe; the real work now happens earlier."
  - "D-09's retry guard order is fixed and mutation-verified: not-an-expiration-failure stops, an already-spent retry stops, no fresh quote stops, THEN price is compared — auto_retry only for equal-or-better, reconfirm for strictly worse, never silent, never twice."
  - "RETRY_EQUAL/RETRY_WORSE's live-measured prompt counts differ from the plan's literal text (two prompts / one prompt): an expired maker entry is rejected during settleQuote's ENFORCING-mode simulate before any signTransaction prompt is ever opened, so the doomed first attempt costs ZERO prompts in both cases. RETRY_EQUAL asserts exactly one prompt (the successful retry); RETRY_WORSE asserts exactly zero."

patterns-established:
  - "Retry/price-guard logic lives in a pure module (retry.ts) the UI merely asks — settle.ts and RfqPanel.tsx never re-implement the decision, mirroring discover.ts's rankQuotes precedent from Plan 02-03."
  - "A trustline pre-flight that depends on off-chain quote availability must run BEFORE the network call that needs the trustline to succeed, not after — the accept-time convention from the OTC lane (src/core/fill.ts's ensureTrustline call inside submitFill) does not transfer to RFQ because RFQ's quote itself is chain-state-dependent in a way OTC's is not."

requirements-completed: [TAKER-04, TAKER-05]

coverage:
  - id: D1
    description: "The D-08 trustline predicate (needsTrustline) and D-09 price-guarded retry decision (retryDecision, isExpiredAuthFailure), pure and mutation-verified"
    requirement: "TAKER-05"
    verification:
      - kind: unit
        ref: "src/core/rfq/retry.test.ts — native asset, unfetched map, absent key, zero-balance key, expired-vs-unrelated failure classification, better/equal/worse price, second attempt, no-fresh-quote"
        status: pass
    human_judgment: false
  - id: D2
    description: "Trustline pre-flight (ensureTrustline, imported unchanged) fronting the RFQ quote flow so a taker without the receiving trustline can still get a quote and settle, with the trustline prompt always preceding the swap prompt"
    requirement: "TAKER-05"
    verification:
      - kind: e2e
        ref: "tools/e2e/rfq-driver.mjs TRUSTLINE scenario — report-rfq-1789121353643.json, promptSequence: [\"changeTrust\",\"invokeHostFunction\"], noteVisibleBeforeAccept: true, settled for real on Testnet"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-09 guarded retry: an expired maker entry auto-retries once at an equal-or-better price with a visible note, and stops for explicit re-confirmation at a worse price, never signing at an unseen price"
    requirement: "TAKER-04"
    verification:
      - kind: e2e
        ref: "tools/e2e/rfq-driver.mjs RETRY_EQUAL + RETRY_WORSE scenarios — report-rfq-1789121353643.json, autoRetryNoteObserved: true / reconfirmNoteObserved: true, priceChanged: true, settled for real on Testnet"
        status: pass
    human_judgment: false

duration: ~5h across two sessions (2026-09-09 start, interrupted; 2026-09-11 continuation and completion)
completed: 2026-09-11
status: complete
---

# Phase 2 Plan 4: Trustline Pre-Flight and Price-Guarded Retry Summary

**Price-guarded expired-quote retry (retry.ts, mutation-verified) plus a D-08 trustline flow that had to be redesigned mid-plan after live testing proved a maker cannot sign a quote at all for a taker without the receiving trustline.**

## Performance

- **Duration:** ~5h across two sessions (original executor: 2026-09-09, interrupted after Task 2; this continuation: 2026-09-11, finished Task 3 and its follow-on fix)
- **Started:** 2026-09-09T16:08:29+03:00 (Task 1 commit)
- **Completed:** 2026-09-11T13:13:55+03:00 (Task 3 commit)
- **Tasks:** 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- `src/core/rfq/retry.ts`: pure `retryDecision`/`isExpiredAuthFailure`/`needsTrustline`, boundary-tested and mutation-verified on both the equal-price and at-most-once branches (both confirmed RED under mutation, then reverted).
- `settleQuote` fronted with `ensureTrustline` (imported unchanged from `src/core/fill.ts`, never reimplemented) and the guarded retry wired into `RfqPanel.tsx`'s accept path, with all three D-09 outcomes rendering their contract-fixed copy.
- Twelve live-Testnet driver scenarios (previously nine), each settling or rejecting for real, with `RETRY_EQUAL`, `RETRY_WORSE`, and `TRUSTLINE` proving the retry guard and the trustline flow against the deployed `rfq_swap` rather than a mock.
- A genuine architectural gap in the original D-08 design was found, proven with a direct on-chain probe, and fixed: the D-08 `ensureTrustline` step moved from Accept time to Refresh-quotes time so a first-time taker can get a quote at all (see Deviations).

## Task Commits

Each task was committed atomically:

1. **Task 1: retry.ts — the price guard and the trustline predicate, both pure** - `5bcbbb2` (test)
2. **Task 2: Trustline pre-flight and the guarded retry in the accept path** - `fdde8f5` (feat)
3. **Task 3: Driver scenarios for the trustline and retry paths** - `7fe7509` (feat) — includes the Task-2-adjacent `src/ui/RfqPanel.tsx` fix this task's own live run required (see Deviations)

**Plan metadata:** (this commit, immediately following)

## Files Created/Modified

- `src/core/rfq/retry.ts` - Pure D-08/D-09 decision logic: `needsTrustline`, `isExpiredAuthFailure`, `retryDecision`
- `src/core/rfq/retry.test.ts` - Boundary + mutation-targeted coverage for every behavior line
- `src/core/rfq/settle.ts` - Fronts `settleQuote` with `ensureTrustline` (unchanged import); now a fail-safe no-op in the normal flow (see Deviations)
- `src/ui/RfqPanel.tsx` - D-08 passive note; D-09 retry outcomes and their fixed copy; the trustline pre-flight moved into `refreshQuotes` (Deviations)
- `tools/e2e/stub-maker.mjs` - `EXPIRED_ENTRY` (deep-past signature expiration) and `RE_QUOTE_PRICE` (better/equal/worse) knobs, plus fixes for two collision bugs the retry scenarios' back-to-back re-quoting exposed (probe-source nonce collision; base-mode-only arming missing the `:EQUAL`→`:WORSE` transition)
- `tools/e2e/rfq-driver.mjs` - `RETRY_EQUAL`, `RETRY_WORSE`, `TRUSTLINE` scenarios; a dedicated isolated maker + forced-empty clear pass for `RETRY_WORSE` (stale-row race fix); per-scenario diagnostics for `TRUSTLINE`'s own second browser context

## Decisions Made

- **D-08's trustline step moved from Accept time to Refresh-quotes time.** The plan's original design assumed a quote could exist before the taker's trustline does, with `ensureTrustline` firing inside `settleQuote` at Accept. Live testing (a direct probe against the deployed `rfq_swap`, see Deviations) proved this backwards: a maker's signed quote comes from a RECORDING-mode simulation of the real `swap` call, which actually executes the maker→taker SAC transfer, and that transfer hard-fails with `Error(Contract, #13)` / "trustline entry is missing for account" when the taker has no trustline — so **no maker can ever produce a quote for such a taker**, meaning there is nothing to click Accept on. `ensureTrustline` (same function, same import, still zero-cost once the trustline exists) now fires inside `refreshQuotes`, still gated behind the taker's own "Refresh quotes" click — D-08's "in-flow, never a background prompt" principle is preserved; only the trigger point changed. `settleQuote`'s own `ensureTrustline` call (Task 2, unchanged) is kept as a harmless no-op / fail-safe.
- **RETRY_EQUAL/RETRY_WORSE prompt counts differ from the plan's literal text.** The plan's task description says "two prompts for RETRY_EQUAL / one for RETRY_WORSE" (implying the doomed first attempt reaches the wallet). Live testing showed the expired entry is rejected during `settleQuote`'s ENFORCING-mode `simulateTransaction` call — before `signer.signTransaction` is ever invoked — so the doomed attempt costs **zero** prompts in both cases. `retryDecision`'s own behavior (auto-retry on equal/better, reconfirm on worse, never signing at an unseen price) is exactly as designed; only the prompt-count assertions were adjusted to match reality.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/2 - Architectural discovery, fixed] D-08's "quote first, trustline at accept" design is physically unreachable**
- **Found during:** Task 3, first live run of the `TRUSTLINE` scenario — the row never appeared; `refresh-quotes-trustline` timed out after 30s with no maker-side error log and no client-side console trace (a silent `AbortSignal.timeout`-shaped failure with no diagnostic).
- **Root cause, proven directly:** wrote a standalone probe (`tools/e2e/__probe2.mjs`, a throwaway script, not committed) that POSTed `getMakerSideOrder` straight at the running stub maker for a Friendbot-funded taker with **no** USDC trustline. Response: `{"error":{"code":-33600,"message":"recording sim failed: HostError: Error(Contract, #13)\n...trustline entry is missing for account...\n...fn_call ... transfer ..."}}`, 829ms. This confirms: `signQuote`'s RECORDING-mode `simulateTransaction` of the `swap` call actually executes the SAC transfer to the taker as part of determining the auth-entry set, and that transfer is a genuine, unconditional Stellar invariant failure when the destination lacks a trustline — not a maker-side policy choice, and not fixable by retrying or waiting.
- **Fix:** moved the `ensureTrustline` call from inside `settleQuote` (fired at Accept, Task 2) to inside `RfqPanel.tsx`'s `refreshQuotes` (fired on the "Refresh quotes" click, before the maker fan-out). `settleQuote`'s own call stays as a no-op fail-safe. End-to-end prompt order (trustline signed before swap) is unchanged; only which click triggers the trustline prompt changed.
- **Files modified:** `src/ui/RfqPanel.tsx` (added the pre-flight call + import), `tools/e2e/rfq-driver.mjs` (updated `runTrustlineScenario`'s wait point and header comments to match; the assertion itself — `promptSequence === [changeTrust, invokeHostFunction]` — needed no change since it doesn't care which click produced which prompt).
- **Verification:** full 12-scenario live driver run after the fix — `TRUSTLINE: noteVisibleBeforeAccept=true promptSequence=["changeTrust","invokeHostFunction"]`, all 12 scenarios green, `status: "ok"` (`tools/e2e/out/report-rfq-1789121353643.json`, real Testnet tx `c6913f96e0...` happy path, `265d6f2e20...` RETRY_EQUAL).
- **Committed in:** `7fe7509` (Task 3 commit, bundled with the scenario code since the scenario's own live run is what surfaced the gap)

**2. [Rule 3 - Blocking] Two harness-only collision bugs found while iterating on the retry scenarios**
- **Found during:** Task 3, prior continuation-session debugging (visible in the code's own extensive header comments in `stub-maker.mjs` and `rfq-driver.mjs`)
- **Issue A:** `signQuote`'s probe transaction used a literal constant sequence `'0'` for every RECORDING-mode simulation the maker ever ran, which fed the same `(source, sequence)` pair into the RPC's auto-assigned Address-credential nonce — a later quote could collide with an earlier one's already-consumed nonce (`HostError: Error(Auth, ExistingValue)`).
- **Issue B:** the mode-transition detector that arms `EXPIRED_ENTRY`'s one-shot doomed entry only fired on a BASE-mode change (`'EXPIRED_ENTRY'` vs anything else), so `RETRY_EQUAL` and `RETRY_WORSE` running back-to-back under the same base mode (only the `:EQUAL`/`:WORSE` suffix differing) meant `RETRY_WORSE`'s own "doomed" quote was silently issued genuinely valid — settling immediately with no retry and no reconfirm note.
- **Fix:** Issue A — key the probe's sequence off `order.orderId` (a monotonic per-process counter), making every probe's `(source, sequence)` pair unique. Issue B — re-arm on a requote-suffix change too, not just a base-mode change.
- **Files modified:** `tools/e2e/stub-maker.mjs`
- **Verification:** full 12-scenario driver run, `RETRY_EQUAL`/`RETRY_WORSE` both pass with distinct, correctly-doomed-then-genuine quotes.
- **Committed in:** `7fe7509`

**3. [Rule 3 - Blocking] Stale-row race in `RETRY_WORSE` and two URL-matching bugs**
- **Found during:** Task 3, prior continuation-session debugging
- **Issue:** `RETRY_WORSE` intermittently clicked Accept on `RETRY_EQUAL`'s own already-settled row (a React-state race — a DOM row being "visible" does not prove the newest fetch's re-render has landed), producing a `nonce already exists` failure with no relation to the scenario's intended doomed-entry failure. Separately, both the pre-existing `makerRequestCounter` (02-03) and the new `makerResponseCounter` (02-04) silently never incremented because `req.url()` reports a trailing-slash-normalized origin that a bare-string `===` comparison never matches.
- **Fix:** `RETRY_WORSE` now runs against a dedicated, freshly spawned maker (`makerWorse`), with the primary maker temporarily blocked and a forced "prove `quotes` is empty" clear pass (reusing the `ZERO_MAKERS` registry patch) before its own real fetch — removing any possibility of a stale row by construction rather than by racing a wait against a render. URL matching now checks both the bare origin and its trailing-slash form.
- **Files modified:** `tools/e2e/rfq-driver.mjs`
- **Verification:** full 12-scenario driver run, `RETRY_WORSE` passes deterministically; `ZERO_MAKERS`'s `outgoingQuoteRequests: 0` assertion (which depends on the same counter fix) also passes.
- **Committed in:** `7fe7509`

**4. [Rule 3 - Diagnostics gap, fixed] The outer failure handler never captured the second browser context**
- **Found during:** this continuation session, while diagnosing the `TRUSTLINE` timeout (Deviation 1) — the failure screenshot showed the WRONG page (the primary taker's leftover `RETRY_WORSE` state, not the `TRUSTLINE` taker's own page), and the console log was empty for that context.
- **Fix:** `runTrustlineScenario` now attaches its own `console`/`pageerror` listeners to `page2` and, on error, writes its own screenshot and console log before rethrowing — independent of the outer handler's `page`-only capture.
- **Files modified:** `tools/e2e/rfq-driver.mjs`
- **Committed in:** `7fe7509`

---

**Total deviations:** 4 auto-fixed (1 architectural discovery requiring a real design fix, 3 blocking/diagnostics)
**Impact on plan:** Deviation 1 is the significant one — it corrects the plan's own stated design after live testing proved a part of it physically unreachable, but the fix reuses the exact same function (`ensureTrustline`) the plan already specified, just triggered earlier, and the plan's actual goal (trustline before swap, taker never stuck without a way to receive the token) is fully achieved. Deviations 2-4 are test-harness-only fixes with no `src/` surface beyond Deviation 1's `RfqPanel.tsx` change. No scope creep beyond what was needed to make the plan's own must-haves true.

## Issues Encountered

- The live driver run takes ~5 minutes end-to-end (twelve scenarios, three of them spawning their own maker process with real Friendbot funding + registry registration) and settles real Testnet transactions in `HAPPY_PATH`, `RETRY_EQUAL`, and `TRUSTLINE` — this is expected cost for E2E-01's live-proof requirement, not a defect.
- This machine runs multiple git worktrees' E2E suites concurrently against the SAME shared Testnet registry and Friendbot; `tools/e2e/rfq-driver.mjs` already documents (02-03-SUMMARY.md) a permanent stray registry entry (`http://127.0.0.1:4610`) and now also documents an orphaned-registration risk from any maker process that dies before its `eject` handler runs. Not fixed here (out of scope), but the driver's own de-duplication and defensive allowlisting (Deviation 3) absorb it without weakening any assertion.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 2's taker-side RFQ path is now complete: discovery, ranking, validation, settlement, trustline handling, and price-guarded retry are all proven live against the deployed `rfq_swap` and `rfq_registry`, with a 12-scenario regression harness (`node tools/e2e/rfq-driver.mjs`) covering the happy path, all five D-12 failure knobs, discovery/ranking/expiry, and both trustline/retry edge cases.
- Phase 3 (real maker server) should be aware of the D-08 finding in this summary: **any real maker server will hit the same "cannot sign a quote for a trustline-less taker" constraint**, since it is a property of Soroban RECORDING-mode simulation of a function that performs a real SAC transfer, not something specific to the stub. A real maker server author needs to either accept that a first-time taker's initial quote request may fail (and document why, per D-08's original -33700 rationale), or the taker-side SDK/desk must establish the trustline before the FIRST quote request for a new pair, as this plan's fix now does.
- No blockers for the phase's own completion; `02-PATTERNS.md`'s pattern assignments all held with one addition (the trustline-pre-flight-must-precede-quote pattern, noted above).

---
*Phase: 02-desk-rfq-taker-path*
*Completed: 2026-09-11*

## Self-Check: PASSED

All created/modified files present on disk; all three task commits (`5bcbbb2`, `fdde8f5`, `7fe7509`) found in `git log --oneline --all`. No missing items.
