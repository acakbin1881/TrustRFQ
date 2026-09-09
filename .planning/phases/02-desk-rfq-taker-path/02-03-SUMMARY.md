---
phase: 02-desk-rfq-taker-path
plan: 03
subsystem: rfq-taker
tags: [stellar, soroban, rfq, react, vitest, playwright, ranking]

# Dependency graph
requires:
  - phase: 02-desk-rfq-taker-path
    provides: "Plan 02-02's validation gate — src/core/rfq/validate.ts wired in front of the wallet prompt, tools/e2e/stub-maker.mjs's five D-12 failure knobs, tools/e2e/rfq-driver.mjs's six-scenario proof"
provides:
  - "src/core/rfq/discover.ts — pure, tie-stable price ranking + URL intersection + expiry filtering (intersectUrls, quotePrice, rankQuotes, bestQuote, dropExpired, fmtCountdown), lift-able into the separate-repo taker SDK unchanged"
  - "src/ui/RfqPanel.tsx — a real comparison surface: discovery-count line, ranked/preselected rows with live countdowns, manual refresh, and every declared empty/loading/error/overflow state"
  - "public/intent.css — [data-panel=\"rfq\"] row list, countdown chip, indicator line, 6-row scroll cap"
  - "tools/e2e/rfq-driver.mjs — ZERO_MAKERS/MULTI_QUOTE/EXPIRY_DROP scenarios proving discovery, ranking, and countdown-driven row removal live"
affects: [phase-3-real-maker-server]

# Actuals (#2632)
actuals:
  tokens: 13600
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "discover.ts follows src/core/oracle.ts's purity discipline (no network/window/wallet); bigint-scaled price comparison so equal prices never tie-break non-deterministically"
    - "Row selection tracked by the quote's own authEntry identity, not array index, so dropExpired removing an earlier row can never silently re-point the preselected action at a different quote"
    - "E2E driver network-substitution pattern: intercept only ONE named RPC function's simulateTransaction response (matched by scanning the decoded transaction XDR for the function-name bytes) and patch just its retval, leaving every other simulateTransaction call untouched — used when a live-network precondition (a genuine zero-maker registry state) is unreachable from the harness"

key-files:
  created:
    - src/core/rfq/discover.ts
    - src/core/rfq/discover.test.ts
  modified:
    - src/ui/RfqPanel.tsx
    - public/intent.css
    - tools/e2e/rfq-driver.mjs
    - tools/e2e/stub-maker.mjs

key-decisions:
  - "ZERO_MAKERS cannot be produced by removing our own maker's registration: a permanent stray registry entry (http://127.0.0.1:4610, first noted in Plan 02-01's SUMMARY, confirmed still present and dead) keeps the discovery intersection non-empty for this pair no matter what. Instead of chasing an unreachable true on-chain zero, the driver patches ONLY the registry's get_urls_for_token simulateTransaction responses to an empty vector via Playwright's route.fetch()+fulfill(), leaving every other RPC call (get_config, settlement probes) untouched — a test-harness-only substitution, documented as a deviation below."
  - "MULTI_QUOTE spawns a genuinely separate second stub-maker process (different STUB_MAKER_RATE/STUB_MAKER_PORT) rather than faking a second price in one process, so the ranking proof runs against two independently signed, genuinely different quotes."
  - "EXPIRY_DROP's SHORT_TTL is 30 seconds, not a shorter value: two earlier attempts at 6s/12s TTLs arrived already-expired and were rejected by validateQuote's own expired check before any row ever rendered (documented Testnet RPC latency, not a code defect). 30s trades scenario speed for reliability against that latency."

patterns-established:
  - "discover.ts owns the two decisions RfqPanel.tsx must not make itself: which maker URLs are common to both legs (intersectUrls) and what order quotes render in (rankQuotes) — the panel composes, it never re-implements the selection rule."

requirements-completed: [TAKER-01, TAKER-02]

coverage:
  - id: D1
    description: "discover.ts's intersection and ranking are pure, deterministic, tie-stable (equal prices preserve input order across repeated calls), and covered including empty/null/duplicate/boundary cases"
    requirement: "TAKER-01"
    verification:
      - kind: unit
        ref: "src/core/rfq/discover.test.ts (npx vitest run — all pass)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The taker sees a discovery-count line, compares ranked live quotes with per-row countdowns, and can refresh on demand; no maker identity reaches the screen and nothing re-runs the fan-out on a schedule"
    requirement: "TAKER-02"
    verification:
      - kind: e2e
        ref: "node tools/e2e/rfq-driver.mjs — MULTI_QUOTE scenario (rowCount=2, rowOrder=[3 USDC, 2 USDC], firstRowPreselected=true) + grep checks on RfqPanel.tsx (AddressSeal=0, useNow>=1, rankQuotes>=1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every declared UI state (empty pair, empty amount, zero makers, zero quotes, loading, error, overflow, expiry-drop) renders as the UI contract specifies, proven live"
    verification:
      - kind: e2e
        ref: "node tools/e2e/rfq-driver.mjs — ZERO_MAKERS (discoveryLineAbsent=true, emptyMakersCardPresent=true, outgoingQuoteRequests=0) + EXPIRY_DROP (initialRowCount=1, finalRowCount=0, walletPrompts=0)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The happy path and all five D-12 failure knobs still settle/reject correctly after the panel's full rewrite into a comparison surface"
    verification:
      - kind: e2e
        ref: "node tools/e2e/rfq-driver.mjs — 9 scenarios reported, happy path first, tx 90cd51d6307fe407c629aff051cd3e556be4e37233109d727783f2461fa491cc, promptsByType {REQUEST_ACCESS:1, SUBMIT_TRANSACTION:1}"
        status: pass
    human_judgment: false

duration: ~1h10min (tasks 1-2: ~11min on 2026-09-08; interrupted; task 3 continuation: ~1h on 2026-09-09, dominated by live Testnet E2E runs)
completed: 2026-09-09
status: complete
---

# Phase 2 Plan 3: Discovery, Ranking & Full State Coverage Summary

**The RFQ panel becomes a real comparison surface — a pure tie-stable price ranker (`discover.ts`), ranked rows with live countdowns and manual refresh, and nine live-Testnet driver scenarios (happy path, five D-12 knobs, plus ZERO_MAKERS/MULTI_QUOTE/EXPIRY_DROP) proving discovery, ranking, and countdown-driven row removal actually work end to end.**

## Performance

- **Duration:** ~11 min for Tasks 1-2 (2026-09-08); execution was then interrupted mid-Task-3 and resumed in a fresh continuation session on 2026-09-09 (~1h, mostly live Testnet E2E round trips and two bug-fix/re-run cycles)
- **Completed:** 2026-09-09
- **Tasks:** 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- `src/core/rfq/discover.ts`: pure, no-network/no-window/no-wallet module — `intersectUrls` (defensive against null/undefined, no URL normalization by deliberate documented choice), `quotePrice`/`rankQuotes`/`bestQuote` (bigint-scaled price comparison so equal prices are exactly-equal and ties preserve input order across repeated calls), `dropExpired` (keeps a quote whose expiry equals now, mirroring the contract's strictly-greater-than check), `fmtCountdown` (mm:ss collapsing to the exact string "Expired").
- `src/ui/RfqPanel.tsx` rewritten into a full comparison surface: a one-line maker-count indicator (never framed as endorsement), `rankQuotes`-ordered rows with the best preselected and selection tracked by quote identity (not array index), a per-row countdown riding the shared `useNow` clock, a manual "Refresh quotes" action, the `amountTooLarge` over-cap guard wired in front of any fan-out, and every declared empty/loading/error/overflow state.
- `public/intent.css`'s `[data-panel="rfq"]` block extended with `.rfq-row`/`.rfq-countdown`/`.rfq-indicator` and the 6-row scroll cap, composing existing `.order`/`.legbox`/`.badge` primitives only.
- `tools/e2e/rfq-driver.mjs` gained three new live scenarios on top of the six from Plan 02-02: ZERO_MAKERS (registry-RPC-patch technique, since a permanent stray registry entry makes a genuine on-chain zero unreachable for this pair), MULTI_QUOTE (a second stub-maker process at a different rate, proving best-price-first ordering with the best row preselected before any click), and EXPIRY_DROP (a genuinely signed 30s-TTL quote counting down to "Expired" and leaving the list with zero clicks and zero wallet prompts).
- All nine scenarios run green on Testnet: happy path settles (tx `90cd51d6307fe407c629aff051cd3e556be4e37233109d727783f2461fa491cc`, `promptsByType {REQUEST_ACCESS:1, SUBMIT_TRANSACTION:1}`), the five D-12 knobs still cost zero wallet prompts, and the three new scenarios record their measured values exactly as the plan's acceptance criteria specify.

## Task Commits

1. **Task 1: discover.ts — pure intersection, stable price ranking, and expiry filtering** — `0c4c546` (test)
2. **Task 2: The panel becomes a comparison surface — indicator, ranked rows, countdowns, refresh, and every declared state** — `8320714` (feat)
3. **Task 3: Driver scenarios for the discovery and expiry paths** — `cc2b738` (feat)

_Execution was interrupted after Task 2's commit (a fresh executor picked up Task 3 mid-flight); see "Continuation" under Issues Encountered._

## Files Created/Modified

- `src/core/rfq/discover.ts` — `intersectUrls`, `quotePrice`, `rankQuotes`, `bestQuote`, `dropExpired`, `fmtCountdown`
- `src/core/rfq/discover.test.ts` — ranking/stability/empty/boundary coverage
- `src/ui/RfqPanel.tsx` — discovery line, ranked rows, countdown chips, refresh action, full state coverage
- `public/intent.css` — `[data-panel="rfq"]` row list, countdown chip, indicator line, scroll cap
- `tools/e2e/rfq-driver.mjs` — ZERO_MAKERS, MULTI_QUOTE, EXPIRY_DROP scenarios (nine total)
- `tools/e2e/stub-maker.mjs` — `SHORT_TTL` mode, overridable `STUB_MAKER_RATE`/`STUB_MAKER_PORT`

## Decisions Made

See `key-decisions` in frontmatter: the ZERO_MAKERS RPC-patch technique (a permanent stray registry entry makes a genuine on-chain zero unreachable for this pair), MULTI_QUOTE's genuinely-separate second maker process, and EXPIRY_DROP's 30s SHORT_TTL (shorter values arrived already-expired given documented Testnet RPC latency).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] EXPIRY_DROP's row-visible wait matched the wrong text shape**
- **Found during:** Continuation session, first live re-run of the (partially-committed) Task 3 driver
- **Issue:** The wait for a row carrying a short countdown used `hasText: /^00:\d\d$/`, an anchored regex expecting the countdown chip's ENTIRE text to be the bare `mm:ss` string. But `RfqPanel.tsx` renders the chip as `Expires in {mm:ss}` (the `label` built at `RfqPanel.tsx:251`) — the anchored regex could never match that text, so the wait stalled for its full 20s timeout every run.
- **Fix:** Changed the regex to an unanchored substring match, `/Expires in 00:\d\d/`, against the actual rendered text.
- **Files modified:** `tools/e2e/rfq-driver.mjs`
- **Verification:** Re-run advanced past the row-visible wait on the next attempt (surfaced the second bug below instead)
- **Committed in:** `cc2b738`

**2. [Rule 1 - Bug] `page.waitForFunction`'s options object was passed in the wrong argument position**
- **Found during:** Continuation session, second live re-run (after fixing bug 1)
- **Issue:** `page.waitForFunction(fn, { timeout: 25000 })` — Playwright's signature is `(pageFunction, arg, options)`; the options object landed in the `arg` position and was silently ignored, so the call fell back to Playwright's 30000ms default timeout. Compounding this, the row appears with nearly the FULL 30s `SHORT_TTL_SEC` still remaining (the row-visible wait matches on first render, before meaningful time has ticked away), so even the intended 25000ms budget was too tight to reliably observe a full 30-second countdown reach zero. The observed failure ("Timeout 30000ms exceeded") matched the silently-applied default exactly.
- **Fix:** Passed `undefined` as the second (arg) argument and moved the options object to the correct third position, with the timeout raised to 40000ms to comfortably clear the 30s TTL plus rendering/network latency.
- **Files modified:** `tools/e2e/rfq-driver.mjs`
- **Verification:** Full nine-scenario driver run passed clean: `EXPIRY_DROP: initialRowCount=1 finalRowCount=0`, `walletPrompts:0`
- **Committed in:** `cc2b738`

---

**Total deviations:** 2 (both bugs in Task 3's own partial work, found and fixed during the live verification the plan already required)
**Impact on plan:** Both fixes were required for Task 3's own acceptance criteria (nine passing scenarios with measured values) to be met at all. No scope creep — both are scoped to the exact two lines that were wrong.

## Issues Encountered

- **Continuation from an interrupted session.** Tasks 1 and 2 were committed in the original session (`0c4c546`, `8320714`, both 2026-09-08). Task 3 was left mid-flight with uncommitted edits to `tools/e2e/rfq-driver.mjs` and `tools/e2e/stub-maker.mjs` — the ZERO_MAKERS/MULTI_QUOTE/EXPIRY_DROP scenarios and their supporting header-comment documentation of the registry-RPC-patch technique and the SHORT_TTL history were already fully written and well-documented, but had never been run to a passing state. This continuation verified the partial work was sound in design (the ZERO_MAKERS RPC-patch approach and MULTI_QUOTE's separate-process technique both worked on the first live run), found and fixed the two bugs above, then re-ran to a clean nine-scenario pass before committing.
- **A pre-existing stray registry entry** (`http://127.0.0.1:4610`, first noted in Plan 02-01's SUMMARY, still confirmed present) makes a genuine zero-maker on-chain state unreachable for the XLM/USDC pair on this deployment — worked around via the RPC-patch technique documented above; not a defect introduced by this plan.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The RFQ taker path (Plans 02-01 through 02-03) is now feature-complete against TAKER-01/02/03/04/05/06: discovery, validated fan-out, ranked comparison, countdown-driven expiry, and single-signature settlement all proven live on Testnet.
- `src/core/rfq/discover.ts` is pure and argument-shaped exactly as UI-D1 requires, ready for the separate-repo taker SDK to lift unchanged.
- `tools/e2e/rfq-driver.mjs`'s nine-scenario report (happy path + 5 D-12 knobs + 3 discovery/ranking/expiry scenarios) is now the standing regression proof for the whole RFQ taker desk surface; the registry-RPC-patch pattern it introduces (intercept one named RPC function's response by scanning the decoded XDR for the function name, patch only that field) is reusable for any future scenario that needs to fake an otherwise-unreachable on-chain precondition.

---
*Phase: 02-desk-rfq-taker-path*
*Completed: 2026-09-09*

## Self-Check: PASSED

All 6 claimed created/modified files verified present on disk; all three task commit hashes
(`0c4c546`, `8320714`, `cc2b738`) verified present in `git log --oneline --all`.
