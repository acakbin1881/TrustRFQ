---
phase: 02-desk-rfq-taker-path
plan: 06
subsystem: rfq-taker-core
tags: [validation, fan-out, denial-of-service, mutation-testing, vitest]

# Dependency graph
requires:
  - phase: 02-desk-rfq-taker-path (02-01, 02-02)
    provides: fanOutMakerSideOrder / validateQuote and the REJECT_REASON union this plan extends
provides:
  - Per-quote isolation of value-level malformed maker amounts, closing 02-VERIFICATION.md's one blocking gap
  - REJECT_REASON gains malformed_field, guarding all four maker/request numeric reads in validate.ts
  - A structural (mock-based) mutation test proving the rfqNetwork.ts call-site catch is load-bearing, not dead code
affects: [02-desk-rfq-taker-path (phase close / ship gate), any future taker-SDK extraction of src/core/rfq/validate.ts]

# Actuals (#2632)
actuals:
  tokens: 3755
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-private tryToAtomic() guard: convert a throw into null at the call site, let the caller decide the rejection detail (maker-response vs desk-request provenance stays distinguishable)."
    - "Per-quote try/catch as defense-in-depth backstop around a pure validation call, distinct from and outside the per-pass Promise.all reads that must stay fail-closed."
    - "vi.spyOn on a namespace import (import * as mod) to structurally mutation-test a call-site catch once the pure layer becomes total for every currently-known input — proves the catch is reachable/load-bearing without reintroducing a real bug."

key-files:
  created: []
  modified:
    - src/core/rfq/validate.ts
    - src/core/rfq/validate.test.ts
    - src/data/rfqNetwork.ts
    - src/data/rfqNetwork.test.ts

key-decisions:
  - "Guard both the economics-section AND the tree-section toAtomic call sites (all four total), even though the tree-section's takerAmount re-check is provably redundant once the economics section already validated the same string — done for defense-in-depth/consistency per the plan's explicit instruction, not because it changes today's behavior."
  - "Strengthened the mixed-pass test with a detail-text assertion once mutation-check 1 (remove validate.ts's guard) unexpectedly stayed GREEN: the network-layer backstop catch alone was already sufficient to satisfy the original accepted/rejections-count assertions, so the test needed a discriminator specific to the pure layer's crafted message to prove that layer's necessity."
  - "Mutation-check 2 (remove rfqNetwork.ts's catch) cannot be demonstrated red via any real malformed-field value once Task 1+2 make validateQuote total for all four known call sites — by design, nothing throws anymore for a known field. Added a separate structural test (vi.spyOn on the validate module namespace, forcing a throw for an unclassified reason) to prove the catch is genuinely load-bearing rather than dead code, satisfying the spirit of 'the call-site catch is a backstop for a throw the pure layer did not already classify' rather than the letter of reusing one single test for both mutants."

requirements-completed: [TAKER-02]

coverage:
  - id: D1
    description: "A maker response carrying a value-level malformed order.takerAmount is rejected as that one quote (validateQuote returns a rejection, never throws)."
    requirement: "TAKER-02"
    verification:
      - kind: unit
        ref: "src/core/rfq/validate.test.ts#validateQuote — malformed_field (02-06 gap closure) > rejects a non-numeric takerAmount without throwing"
        status: pass
    human_judgment: false
  - id: D2
    description: "A throw originating anywhere inside per-quote validation is converted into a per-quote FanOutRejection inside fanOutMakerSideOrder's loop, never a failure of the whole fan-out promise."
    requirement: "TAKER-02"
    verification:
      - kind: unit
        ref: "src/data/rfqNetwork.test.ts#fanOutMakerSideOrder — the validated fan-out (TAKER-02 + TAKER-03) > the call-site catch isolates a throw from validateQuote for a reason the pure layer never classifies (structural backstop)"
        status: pass
    human_judgment: false
  - id: D3
    description: "In one fan-out pass mixing a malformed maker with N well-formed makers, every well-formed maker's quote still arrives in accepted."
    requirement: "TAKER-02"
    verification:
      - kind: unit
        ref: "src/data/rfqNetwork.test.ts#fanOutMakerSideOrder — the validated fan-out (TAKER-02 + TAKER-03) > a pass mixing one maker with a non-numeric takerAmount and three valid makers isolates the bad quote to one rejection"
        status: pass
    human_judgment: false
  - id: D4
    description: "The isolation is regression-tested at both layers, and the mixed-pass case was observed RED before the guard existed."
    requirement: "TAKER-02"
    verification:
      - kind: unit
        ref: "src/core/rfq/validate.test.ts and src/data/rfqNetwork.test.ts — both mutation checks recorded in this SUMMARY's Deviations/Verification notes below"
        status: pass
    human_judgment: false
  - id: D5
    description: "Fail-closed preserved: a failed per-pass readSwapConfig read still fails the whole fan-out pass, never degrades into a per-quote skip of the fee/paused gate."
    requirement: "TAKER-02"
    verification:
      - kind: unit
        ref: "src/data/rfqNetwork.test.ts#fanOutMakerSideOrder — the validated fan-out (TAKER-02 + TAKER-03) > rejects the whole pass when the per-pass get_config read fails"
        status: pass
    human_judgment: false
  - id: D6
    description: "Order encoding for valid inputs is untouched: order.ts and the golden vectors stay byte-identical."
    requirement: "TAKER-02"
    verification:
      - kind: unit
        ref: "src/core/rfq/order.test.ts (10 tests, unmodified, green)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-09-12
status: complete
---

# Phase 02 Plan 06: Per-Maker Fan-Out Isolation (Gap Closure) Summary

**Guarded all four maker/request `toAtomic` call sites in `validateQuote` behind a `malformed_field` rejection, plus a per-quote backstop catch in `fanOutMakerSideOrder`, so one maker's non-numeric amount now costs exactly one quote instead of denying the whole fan-out pass.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-09-12T11:50:03Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Closed the one blocking gap from `02-VERIFICATION.md`: a registered maker returning a value-level malformed `order.takerAmount` (or `makerAmount`) no longer throws a raw `SyntaxError` out of `validateQuote` and rejects the entire `fanOutMakerSideOrder` promise. It now costs exactly one rejection; every other maker's valid quote still reaches `accepted`.
- Added the `malformed_field` `REJECT_REASON`, distinct from `economics_mismatch` (interpretable-but-wrong) and `tree_mismatch` (signed-tree tampering) — the honest reason for a value that could not be interpreted at all.
- Guarded all four maker/request `toAtomic` call sites: the two in the economics section (`ctx.request.takerAmount`, `order.takerAmount`) and the two in the authorization-tree section (`order.makerAmount`, `order.takerAmount` for the tree comparison and fee computation).
- Added a per-quote `try`/`catch` backstop in `fanOutMakerSideOrder`'s loop, scoped to only the `validateQuote` call and its two result branches — the shared `Promise.all` (per-pass `get_config` + ledger reads) is untouched and still fails the whole pass on error.
- Regression-tested at both layers with the mixed-pass case observed RED before either guard existed, and both mutation checks performed and recorded (see Deviations below for the full finding).

## Task Commits

Each task was committed atomically:

1. **Task 1: One malformed maker, one rejection — per-quote isolation end to end** - `ccbd4bc` (feat)
2. **Task 2: Cover the rest of the maker-controlled value surface** - `e068c75` (feat)

_Both tasks carried `tdd="true"`; the RED observation for Task 1 preceded any source change (see below), and no separate REFACTOR commit was needed — the guard landed clean on the first GREEN pass._

## Files Created/Modified

- `src/core/rfq/validate.ts` - `REJECT_REASON` gains `malformed_field`; new module-private `tryToAtomic()` guard used at all four maker/request numeric conversions (2 economics-section, 2 tree-section)
- `src/core/rfq/validate.test.ts` - new `malformed_field` describe block (non-numeric takerAmount/makerAmount, absent takerAmount, wrong-JSON-type takerAmount) + `economics_mismatch` describe block for interpretable-but-wrong values (empty string, negative, hex-prefixed)
- `src/data/rfqNetwork.ts` - per-quote `try`/`catch` backstop inside `fanOutMakerSideOrder`'s loop, wrapping only the `validateQuote` call and its two verdict branches
- `src/data/rfqNetwork.test.ts` - mixed-pass isolation regression (one malformed maker + three valid, observed RED then GREEN), a structural mutation-check test (mocked `validateQuote` throw), and the fail-closed counterweight (config-read failure still rejects the whole pass)

## Decisions Made

- **Guard both call-site layers even where one is provably redundant.** After Task 1, the tree section's re-conversion of `order.takerAmount` can never fail (the economics section already validated the identical string earlier in the same call). The plan explicitly asked for the guard at both tree-section conversions anyway, for consistency and future-proofing against a reordering of the checks; implemented as written.
- **Strengthened the mixed-pass test after the first mutation check surprised in the GREEN direction.** See Deviations below — this is the most significant finding of the plan and is documented in full there rather than glossed over.
- **Added a structural (mock-based) test to legitimately exercise mutation-check 2**, since no real value can trigger the network-layer catch anymore once Task 1+2 make `validateQuote` total for all four known call sites.

## Deviations from Plan

### Auto-fixed / self-corrected during execution (not a Rule 1-4 code bug, but a test-design finding the plan itself anticipated)

**1. Mutation check 1 (remove `validate.ts`'s guard) initially left the mixed-pass test GREEN — strengthened per the plan's own escape clause.**

- **Found during:** Task 1, immediately after implementing both guards and running the first mutation check.
- **Issue:** With the pure-layer `validate.ts` guard removed but the `rfqNetwork.ts` call-site catch still present, the mixed-pass test (`accepted` length 3, `rejections` length 1, reason `malformed_field`) still PASSED. The network-layer backstop catch alone was fully sufficient to satisfy those three assertions, because it rescues the raw `SyntaxError` into an identically-shaped rejection. The plan's own action text anticipated exactly this possibility: *"If either removal leaves the test GREEN, the test is not exercising the isolation and must be strengthened before this task is done."*
- **Fix:** Added a discriminating assertion on `rejections[0].rejection.detail`, requiring it to contain the pure layer's crafted phrase ("could not be interpreted as a decimal amount" / "maker's response"). The backstop's detail is the raw `String(e)` on the `SyntaxError` ("SyntaxError: Cannot convert abc to a BigInt"), which does not contain that phrase — so removing the pure-layer guard now correctly flips the test RED.
- **Re-verified:** re-ran mutation check 1 with the strengthened assertion; confirmed RED (`AssertionError: expected 'SyntaxError: Cannot convert abc to a …' to contain 'could not be interpreted as a decimal…'`), then restored the guard and confirmed GREEN.
- **Files modified:** `src/data/rfqNetwork.test.ts` (assertion addition only)
- **Committed in:** `ccbd4bc` (Task 1 commit)

**2. Mutation check 2 (remove `rfqNetwork.ts`'s catch) cannot be shown RED via the same field-level test once both tasks are complete — added a structural test instead.**

- **Found during:** Task 1, second mutation check.
- **Issue:** With the pure-layer guard restored (present) and the network-layer catch removed, the mixed-pass test stayed GREEN. This is architecturally inevitable, not a test-design flaw: once `validate.ts`'s economics-section guard fully classifies `order.takerAmount = 'abc'` and returns a normal (non-throwing) rejection, nothing ever reaches the point where the network-layer catch would matter for that specific value. By the end of Task 2, all four known maker/request numeric call sites are guarded this way, so no real malformed-field value can trigger the network-layer catch anymore — it becomes genuine defense-in-depth against a future, as-yet-unknown bug, exactly as its own code comment says ("a backstop for a throw the pure layer did not already classify").
- **Fix:** Rather than force an artificial regression into `validate.ts` to make a "real" value throw (which would contradict Task 2's own goal of making the pure layer total), added a separate, explicitly-labeled structural test: `vi.spyOn` on the `validate.ts` module namespace forces `validateQuote` to throw for one maker's response (tagged via a sentinel `orderId`), while delegating to the real implementation for all others. This proves the `try`/`catch` in `fanOutMakerSideOrder`'s loop genuinely isolates a throw it did not itself classify — the correct instrument for verifying the catch is load-bearing, independent of whether today's known fields happen to trigger it.
- **Verified:** with the network-layer catch removed, this structural test goes RED (`Error: structural probe: a bug elsewhere in validateQuote, not a maker-controlled field` propagating out of `fanOutMakerSideOrder`, uncaught); with it restored, GREEN, and the original mixed-pass test also stays GREEN throughout (confirming the pure-layer guard alone is now sufficient for that specific value, as expected).
- **Files modified:** `src/data/rfqNetwork.test.ts` (new test + `import * as validateModule from '../core/rfq/validate'`)
- **Committed in:** `ccbd4bc` (Task 1 commit)

---

**Total deviations:** 0 code-behavior deviations (Rules 1-4 did not apply — no bug, no missing critical functionality, no blocker, no architectural change). 2 test-design strengthenings, both explicitly anticipated and authorized by the plan's own text ("must be strengthened before this task is done").
**Impact on plan:** No scope creep — both strengthenings stayed within `src/data/rfqNetwork.test.ts`, one of the four files the plan named. The underlying isolation guarantee (one bad maker costs one quote) was never in doubt; what needed strengthening was the TEST's ability to attribute which layer provided that guarantee, which both mutation checks now do honestly.

## Mutation Check Record (required by Task 1's acceptance criteria)

Observed sequentially, in order, on the real source tree (not simulated):

1. **Both guards absent** (pre-implementation baseline): mixed-pass test RED — `SyntaxError: Cannot convert abc to a BigInt` at `toAtomic` (`src/core/rfq/order.ts:24`) → `validateQuote` (`src/core/rfq/validate.ts:169`) → `fanOutMakerSideOrder` (`src/data/rfqNetwork.ts:140`). 9 of 10 pre-existing tests in the file still passed.
2. **`validate.ts` guard implemented, `rfqNetwork.ts` catch implemented:** mixed-pass test GREEN (`accepted` length 3, `rejections` length 1, reason `malformed_field`).
3. **`validate.ts` guard removed, catch present (mutation check 1, naive form):** test unexpectedly stayed GREEN — see Deviation 1 above.
4. **Test strengthened with detail-text assertion; `validate.ts` guard removed again:** test correctly RED.
5. **`validate.ts` guard restored; `rfqNetwork.ts` catch removed (mutation check 2):** original mixed-pass test stayed GREEN (expected, per Deviation 2's analysis) — added the structural probe test to test this mutant meaningfully.
6. **Structural probe test added; `rfqNetwork.ts` catch removed:** structural test RED (`Error: structural probe: a bug elsewhere in validateQuote, not a maker-controlled field`, uncaught, propagating out of `fanOutMakerSideOrder`). Original mixed-pass test stayed GREEN throughout (10 of 11 tests passed, only the structural probe failed) — confirming the pure-layer guard alone is sufficient for the `takerAmount='abc'` scenario.
7. **Both guards restored:** all 11 tests in `rfqNetwork.test.ts` GREEN.

## Issues Encountered

None beyond the mutation-check test-design finding documented in Deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three `missing:` items from `02-VERIFICATION.md`'s `gaps:` block are now each satisfied by a named, runnable test (see `coverage:` D1-D3 above).
- `npm test`: 13 files, 192 tests (up from 182 recorded in `02-VERIFICATION.md`), all green.
- `npm run build`: clean (`tsc --noEmit && vite build`), the added `malformed_field` union member type-checks against every consumer.
- `src/core/rfq/order.ts` and `fixtures/rfq-order-vectors.json` are byte-unchanged (`git diff` empty against both); `order.test.ts`'s 10 golden-vector tests remain green.
- `npm run e2e:rfq` deliberately not re-run per the plan's own verification note — the live 12-scenario lane was explicitly declined by the verifier, and per-quote isolation is fully and deterministically provable at the unit layer.
- No new external API surface, no schema change, no package installs — the CSP/schema/coverage/package-legitimacy gates from the plan's "Gate notes" section are all no-ops for this plan, confirmed unchanged.
- Phase 02 should now be re-verifiable against `02-VERIFICATION.md`'s closed gap; no further work is anticipated from this plan's scope.

## Self-Check: PASSED

- FOUND: `.planning/phases/02-desk-rfq-taker-path/02-06-SUMMARY.md`
- FOUND: commit `ccbd4bc` (Task 1)
- FOUND: commit `e068c75` (Task 2)
- FOUND: `src/core/rfq/validate.ts`
- FOUND: `src/data/rfqNetwork.ts`

---
*Phase: 02-desk-rfq-taker-path*
*Completed: 2026-09-12*
