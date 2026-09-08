---
phase: 02-desk-rfq-taker-path
plan: 02
subsystem: rfq-taker
tags: [stellar, soroban, rfq, security, validation, jsonrpc, vitest, playwright]

# Dependency graph
requires:
  - phase: 02-desk-rfq-taker-path
    provides: "Plan 02-01's RFQ taker tracer — src/core/rfq/{wire,order,settle}.ts, src/data/rfqNetwork.ts, src/ui/RfqPanel.tsx, tools/e2e/stub-maker.mjs + rfq-driver.mjs, fixtures/rfq-order-vectors.json + rfq-auth-tree.json"
provides:
  - "src/core/rfq/validate.ts — pure, fail-closed quote validation (validateQuote, QuoteRejection, REJECT_REASON), lift-able into the separate-repo taker SDK unchanged"
  - "src/data/rfqNetwork.ts — readSwapConfig() + a validating fanOutMakerSideOrder (accepted quotes and rejections, both reported)"
  - "src/ui/RfqPanel.tsx renders only already-validated quotes; a rejected quote is structurally incapable of becoming a wallet prompt"
  - "tools/e2e/stub-maker.mjs's D-12 failure knobs (SLOW/MALFORMED/REFUSE/DRIFTED/WRONG_FEE) + rfq-driver.mjs's six-scenario proof"
affects: [02-03-discovery-refinement, phase-3-real-maker-server]

# Actuals (#2632)
actuals:
  tokens: 14000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "validate.ts follows src/core/balances.ts's fail-closed discipline: every unrecognised shape returns a rejection, never a default-accept"
    - "Tree-shape assertions anchored to fixtures/rfq-auth-tree.json (imported directly, not reasoned independently) — ROOT_ARG_COUNT and the fee-condition sub-invocation counts trace back to the captured real entry"
    - "fanOutMakerSideOrder reads get_config + the current ledger sequence ONCE per pass (never per-quote, never cached across passes) alongside the parallel maker requests"
    - "D-12 knob selection is per-request via an x-e2e-mode header, injected by the E2E driver through Playwright's page.route() interception rather than any change to the desk's own fetch call — one running maker instance serves every mode"

key-files:
  created:
    - src/core/rfq/validate.ts
    - src/core/rfq/validate.test.ts
    - src/data/rfqNetwork.test.ts
  modified:
    - src/data/rfqNetwork.ts
    - src/ui/RfqPanel.tsx
    - tools/e2e/stub-maker.mjs
    - tools/e2e/rfq-driver.mjs

key-decisions:
  - "The maker's Address-credential auth-entry tree contains ONLY the maker_token transfers where \"from\" is the maker (maker->taker, and maker->fee_collector when fee>0) — the taker_token transfer (taker->maker) is authorized separately by the taker's own SourceAccount credential and never appears in the maker's tree at all. Verified against the real captured fixture (subInvocationCount: 2, both maker_token legs), which corrects the plan's transfer-check text describing three legs; validate.ts's transfer checks reflect the empirical two-leg shape."
  - "WRONG_FEE cannot be produced by signing an entry over an already-wrong fee_bps: rfq_swap::swap's own FeeMismatch check runs INSIDE the recording-mode simulation the maker signs against, so simulating a call with a mismatched fee_bps fails outright before any entry is produced (the JSON-RPC response becomes an error and gets dropped at the wire layer, never reaching validateQuote). Fixed by mirroring DRIFTED's approach: sign genuinely for the TRUE live fee, then doctor only the claimed order.feeBps in the JSON response — still caught by validateQuote's fee_mismatch check, which runs before the tree decode."

patterns-established:
  - "Checks in validate.ts run cheapest-first (target binding -> economics -> token allow-list -> fee -> paused -> expiry -> entry expiration -> authorization-tree decode) so a malformed quote costs the least work before rejection."
  - "The fan-out's rejections are never rendered as rows — they surface only to the dev console (JSON-stringified, not a raw object, so Playwright's console listener can read them as text) so an E2E driver or developer can prove WHICH check caught a doctored quote."

requirements-completed: [TAKER-03, TAKER-05]

coverage:
  - id: D1
    description: "validateQuote rejects every doctored-quote class (economics, fee, paused, expiry, entry expiration, network/contract binding, token allow-list, auth-entry invocation tree) with a named reason, and is proven fail-closed"
    requirement: "TAKER-03"
    verification:
      - kind: unit
        ref: "src/core/rfq/validate.test.ts (22 tests: one baseline accept + at least one negative case per REJECT_REASON + the expiry-boundary and concurrency cases)"
        status: pass
      - kind: other
        ref: "Mutation check: disabling the fee_bps inequality-rejects comparison turned 2 tests RED (the dedicated fee_mismatch case and the concurrency case); reverted after observing the failure"
        status: pass
    human_judgment: false
  - id: D2
    description: "Both token legs of every quote resolve only through the curated src/core/tokens.ts allow-list; a maker-supplied address off that list is rejected before any wallet prompt"
    requirement: "TAKER-05"
    verification:
      - kind: unit
        ref: "src/core/rfq/validate.test.ts — token_not_allowed describe block (makerToken and takerToken cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "fanOutMakerSideOrder validates every response before the panel can render it; a rejected quote cannot become a row or a wallet prompt; the happy path still settles with exactly one signTransaction prompt"
    requirement: "TAKER-03"
    verification:
      - kind: unit
        ref: "src/data/rfqNetwork.test.ts — TAKER-02 drop semantics (6 cases) + fanOutMakerSideOrder's mixed-pass and validation-drop composition (2 cases)"
        status: pass
      - kind: e2e
        ref: "node tools/e2e/rfq-driver.mjs happy-path scenario, tx 3c2093744a4f035c1862beb9e9f8b85059b1c3edd5c6cd2d1305ac90c1adf3f7, promptsByType {REQUEST_ACCESS:1, SUBMIT_TRANSACTION:1}"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every D-12 failure mode (SLOW, MALFORMED, REFUSE, DRIFTED, WRONG_FEE) is exercised by the headless driver against a real signed stub maker, and every one costs zero wallet prompts; DRIFTED/WRONG_FEE record the specific rejection reason that caught them"
    verification:
      - kind: e2e
        ref: "node tools/e2e/rfq-driver.mjs — 6 scenarios reported (HAPPY_PATH + 5 knobs), all five failure scenarios at walletPrompts:0, DRIFTED->tree_mismatch, WRONG_FEE->fee_mismatch"
        status: pass
    human_judgment: false

duration: ~2h10min
completed: 2026-09-08
status: complete
---

# Phase 2 Plan 2: Quote Validation Gate Summary

**A real, fail-closed gate (`validateQuote`) between the untrusted maker server and the taker's wallet — every quote is checked against the taker's own request, a live `get_config` read, and the maker's decoded auth-entry invocation tree before it can become a row or a prompt, proven live against five distinct doctored-quote attack classes.**

## Performance

- **Duration:** ~2h10min
- **Completed:** 2026-09-08
- **Tasks:** 3
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments

- `src/core/rfq/validate.ts`: pure, fail-closed `validateQuote` checking target binding, economics, token allow-list, fee, paused state, expiry, entry expiration, and the maker's decoded auth-entry invocation tree — 9 named rejection reasons, anchored to the real captured `fixtures/rfq-auth-tree.json` (not a reasoned-about shape), fee-guard mutation-verified.
- `src/data/rfqNetwork.ts`'s `fanOutMakerSideOrder` became a validating fan-out: a single `get_config` + current-ledger read per pass, every maker response run through `validateQuote`, accepted quotes and named rejections returned separately.
- `src/ui/RfqPanel.tsx` renders only the accepted-quotes array (`grep -c 'validateQuote' src/ui/RfqPanel.tsx` = 0 — validation happens exclusively on the fan-out path); rejections are JSON-logged to the dev console for observability, never shown as rows.
- `tools/e2e/stub-maker.mjs` gained the five D-12 failure knobs (SLOW/MALFORMED/REFUSE/DRIFTED/WRONG_FEE), selected per-request via an `x-e2e-mode` header so one running server serves every mode in one pass; `tools/e2e/rfq-driver.mjs` proves all five cost zero wallet prompts and, for DRIFTED/WRONG_FEE, records the exact rejection reason.
- Live-verified twice: the happy path settles for real on Testnet with exactly one `signTransaction` prompt both before and after the validation gate landed, and the full six-scenario run (happy path + 5 knobs) passed end to end.

## Task Commits

1. **Task 1: validateQuote — pure, fail-closed quote validation** - `6acf820` (test)
2. **Task 2: Wire validation in front of the wallet — live get_config read and the panel's drop path** - `c173fac` (feat)
3. **Task 3: Stub-maker failure knobs and the driver assertions that exercise them** - `976db5c` (feat)

_Task 1 is a `test` commit because `npm test`'s pure-logic vitest suite is the task's whole verification surface (no live network step); Tasks 2-3 are `feat` because each includes a live Testnet E2E proof alongside the code change._

## Files Created/Modified

- `src/core/rfq/validate.ts` — `validateQuote`, `QuoteRejection`, `REJECT_REASON`, `ValidateContext`, `SwapConfig`
- `src/core/rfq/validate.test.ts` — fixture-driven suite, one negative case per `REJECT_REASON`, expiry-boundary + concurrency cases
- `src/data/rfqNetwork.ts` — `readSwapConfig()`, `fanOutMakerSideOrder` (now validating, returns `{ accepted, rejections }`)
- `src/data/rfqNetwork.test.ts` — TAKER-02 drop-semantics unit suite + `fanOutMakerSideOrder`'s mixed-pass/validation-drop composition
- `src/ui/RfqPanel.tsx` — consumes `fanOutMakerSideOrder`'s accepted array only; in-flight staleness guard (mirrors `useFairPrice.ts`); JSON-stringified rejection logging
- `tools/e2e/stub-maker.mjs` — `handleModedRequest` dispatch (SLOW/MALFORMED/REFUSE/DRIFTED/WRONG_FEE), hardened against writing to an already-aborted client socket
- `tools/e2e/rfq-driver.mjs` — `page.route()`-based mode injection, `runD12Scenario`, six-scenario report (`scenarios: [...]`)

## Decisions Made

- **The maker's auth-entry tree has exactly TWO sub-invocations, not three** (see `key-decisions` in frontmatter): only the maker_token transfers where "from" is the maker appear under the maker's own Address-credential entry; the taker_token transfer is authorized by the taker's separate SourceAccount credential and is invisible to this entry. `validate.ts`'s transfer checks reflect this empirically-verified two-leg shape.
- **WRONG_FEE signs genuinely for the TRUE fee, then doctors the claimed value** — the contract's own `FeeMismatch` check runs inside the recording-mode simulation itself, making it impossible to sign an entry over an already-wrong fee. See Deviations below for the discovery and fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] WRONG_FEE knob's original design could never produce a signed entry**
- **Found during:** Task 3, first live `rfq-driver.mjs` run exercising all six scenarios
- **Issue:** The initial implementation called `handleGetMakerSideOrder(params, feeBps + 1)`, signing the quote with an already-wrong `fee_bps`. But `rfq_swap::swap`'s own `FeeMismatch` check runs *inside* the recording-mode simulation the maker signs against — simulating a call with a mismatched `fee_bps` fails outright (`Api.isSimulationError`), so `signQuote` throws before any entry is produced. The JSON-RPC response the client received was therefore an error, dropped at the wire layer (TAKER-02) rather than reaching `validateQuote` — the driver observed `rejectionReason: null` instead of `fee_mismatch`.
- **Fix:** Sign genuinely for the TRUE live fee (mirroring the DRIFTED knob's already-correct pattern), then mutate only the *claimed* `order.feeBps` in the JSON response afterward. `validateQuote`'s fee check (which runs before the tree decode) catches the discrepancy between the claimed `order.feeBps` and the live `get_config` value regardless of what the entry itself was actually signed for.
- **Files modified:** `tools/e2e/stub-maker.mjs`
- **Verification:** Full driver re-run recorded `WRONG_FEE: rowAppeared=false walletPrompts=0 reason=fee_mismatch`
- **Committed in:** `976db5c`

**2. [Rule 3 - Blocking] SLOW knob risked crashing the stub-maker process**
- **Found during:** Task 3, reasoning about the SLOW knob's timing before/during live verification
- **Issue:** SLOW replies ~1.5s after the client's own `AbortSignal.timeout(3000)` has already fired, so the underlying socket may be closed by the time the delayed response is written. Writing to an already-destroyed `res` risked an unhandled `'error'` event taking down the entire stub-maker process mid-driver-run, which would fail every subsequent scenario in the same pass.
- **Fix:** Added `writableEnded`/`destroyed` guards plus try/catch around every response write in the moded-request dispatch, and a blanket `res.on('error', () => {})` no-op listener at the top of every request handler.
- **Files modified:** `tools/e2e/stub-maker.mjs`
- **Verification:** The full driver run completed the SLOW scenario cleanly (`rowAppeared=false walletPrompts=0`) with no process crash
- **Committed in:** `976db5c`

**3. [Rule 3 - Blocking] Raw-object console.debug argument unreadable by the E2E driver**
- **Found during:** Task 3, driver design (writing `runD12Scenario`'s reason-extraction, before the first live run)
- **Issue:** `RfqPanel.tsx`'s dropped-quotes logging (added in Task 2) passed the rejections array as a raw object second argument to `console.debug`. Playwright's `ConsoleMessage.text()` only serializes primitive args to readable text; a complex object argument renders as a `JSHandle@object` placeholder, so the driver's regex-based reason extraction would never match anything.
- **Fix:** `JSON.stringify` the payload before logging, so the console message text carries the full readable content.
- **Files modified:** `src/ui/RfqPanel.tsx` (amends a Task 2 file; folded into the Task 3 commit since it exists specifically to support Task 3's driver assertions)
- **Verification:** DRIFTED and WRONG_FEE scenarios correctly captured `tree_mismatch`/`fee_mismatch` from the console text
- **Committed in:** `976db5c`

---

**Total deviations:** 3 (1 code bug, 2 blocking fixes)
**Impact on plan:** All three were required for Task 3's own acceptance criteria (six passing scenarios with correctly recorded rejection reasons) to be met at all. No scope creep — each fix is scoped to exactly the file/behavior it corrects.

## Issues Encountered

- **A first full driver run's SLOW scenario hung for 20+ seconds** waiting for the "No quotes available" empty state, well past both the client's 3s fan-out timeout and the server's 4.5s delay. Isolated Playwright probes afterward confirmed BOTH the SLOW-intercepted fetch (aborts correctly at ~3050ms) and the stray unreachable maker's fetch (fails in ~30ms) behave correctly in isolation. The immediate re-run passed cleanly through all six scenarios with no code change in between. Not reproduced again across two subsequent full runs. Consistent with this codebase's own documented precedent of transient Testnet RPC latency (Plan 02-01's SUMMARY: "two `CAPTURE_AUTH_TREE=1` driver runs timed out ... transient Testnet RPC latency, not a code defect"). No fix applied — the isolated reproduction attempts could not pin a deterministic cause, and the re-run's clean pass across all six scenarios (twice) is stronger evidence than a single stall.
- **A pre-existing stray registry entry** (`http://127.0.0.1:4610`, first noted in Plan 02-01's SUMMARY) remains registered on the live `rfq_registry` for both XLM and USDC — confirmed still present via a direct registry read this session. Not introduced by this plan; harmless (`Promise.allSettled` drops the unreachable maker quickly), but worth flagging for anyone auditing "N makers found" counts on this deployment.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `src/core/rfq/validate.ts` is pure and argument-shaped exactly as UI-D1 requires, ready for the separate-repo taker SDK to lift unchanged.
- `fixtures/rfq-auth-tree.json`'s real captured shape (2 sub-invocations under the maker's own credential, not 3) is now the empirically-verified ground truth for any future work touching the auth-entry comparison logic — see the Decisions section above.
- Plan 02-03 (discovery refinement) can build on a desk where every quote reaching the panel has already survived the full TAKER-03 gate; no further validation work is needed for the taker path itself.
- The D-12 failure knobs (`tools/e2e/stub-maker.mjs`) are reusable infrastructure for any future phase that needs to exercise more maker-misbehavior scenarios — the `x-e2e-mode` header + `handleModedRequest` dispatch pattern extends cleanly.

---
*Phase: 02-desk-rfq-taker-path*
*Completed: 2026-09-08*

## Self-Check: PASSED

All 7 claimed created/modified files verified present on disk; all three task commit hashes
(`6acf820`, `c173fac`, `976db5c`) verified present in `git log --oneline --all`.
