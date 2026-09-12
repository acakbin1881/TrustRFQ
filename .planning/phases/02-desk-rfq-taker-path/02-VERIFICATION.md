---
phase: 02-desk-rfq-taker-path
verified: 2026-09-12T15:10:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "Unreachable, slow, or malformed makers are silently dropped (ROADMAP SC1) — one bad maker never prevents the other makers' quotes from arriving (per-maker fan-out isolation against a value-level malformed field, not only a transport-level one)"
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "vercel.json connect-src gains every maker-server origin the desk queries (ROADMAP SC5 clause; CSP-01)"
    addressed_in: "Phase 3"
    evidence: >
      02-CONTEXT.md D-11 (locked during phase 2 discuss-phase, before planning): "CSP stays a
      CURATED allow-list: each real maker origin is added to vercel.json connect-src by hand at
      deploy time... Phase 2 makes NO production CSP change (no real makers yet; the localhost
      stub runs only where Vercel headers do not apply); Phase 3 adds the first real origin."
      Phase 3's ROADMAP goal is explicit: "a real registered maker quoting from its own server is
      discovered and settled by the desk on Testnet, end-to-end, with nothing stubbed." Confirmed
      again this pass: `git status --short` shows no pending change to `vercel.json`, matching
      02-05's original byte-for-byte-unchanged finding.
---

# Phase 2: Desk RFQ Taker Path Verification Report

**Phase Goal:** A taker in the desk can select a curated pair, see live firm quotes from
registered makers, and settle one with a single wallet signature, proven end-to-end against a
local stub maker settling for real on Testnet.
**Verified:** 2026-09-12T15:10:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (plan 02-06, commits `ccbd4bc`, `e068c75`, merged via
`fd8cc5f` on `feat/rfq-milestone`)

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Connected taker sees live quotes from makers discovered via the registry (two `get_urls_for_token` reads + client-side intersection); unreachable/slow/malformed makers silently dropped, per-maker | ✓ VERIFIED (gap closed) | `src/data/rfqNetwork.ts:44-51` (`discoverMakerUrls`) unchanged and still correct. Transport-level drop unchanged (`getMakerSideOrder`, lines 69-95). The previously-open hole is now closed: `src/core/rfq/validate.ts` adds a module-private `tryToAtomic()` guard (lines 94-104) wrapping all FOUR maker/request `toAtomic` conversions (lines 187, 194, 285, 292), each returning `reject('malformed_field', …)` instead of letting `BigInt()`'s raw `SyntaxError` escape. `src/data/rfqNetwork.ts:140-150` adds a per-quote `try/catch` backstop inside `fanOutMakerSideOrder`'s loop, scoped to only the `validateQuote` call and its two verdict branches — the shared `Promise.all` (per-pass `get_config`/ledger reads) is untouched and still fails the whole pass on error, matching the module's own fail-closed header comment. Read the actual source (not just the SUMMARY) and confirmed line-for-line. |
| 2 | A quote with mismatched `feeBps`, drifted economics, or a mismatched decoded `authEntry` invocation tree is rejected before any wallet prompt; order encoding is deterministic and pinned by golden vectors | ✓ VERIFIED | Unchanged from prior verification: `src/core/rfq/validate.ts:224-338` (fee/paused/expiry/tree checks). `fixtures/rfq-order-vectors.json` + `order.test.ts` byte-identical (10 tests, unmodified, still green). Independently confirmed `grep -c "BigInt(whole" src/core/rfq/order.ts` = 1, `order.ts` untouched by 02-06 as claimed. |
| 3 | Accepting a quote settles on Testnet with exactly one Freighter `signTransaction` prompt (no `signAuthEntry` on taker path); desk confirms via `getTransaction` + swap event | ✓ VERIFIED | Unchanged: `src/core/rfq/settle.ts` untouched by 02-06 (file mtime/content unchanged). Human-verify checkpoint (02-05-PLAN.md Task 3) approved 2026-09-11 stands: tx `c8efe29c8855dab7f6d58d786202d6ebcf10ff6b5b6f4c43c3340f1db6993206`. |
| 4 | A taker missing the makerToken trustline is prompted to add it before settlement; an expired-entry failure auto-refreshes the quote and retries once | ✓ VERIFIED | Unchanged: `src/core/rfq/retry.ts` untouched by 02-06. `retry.test.ts` still green as part of the 192-test full-suite run performed this pass. |
| 5 | `npm run e2e:census`-style extended flow settles for real via mock Freighter + local stub maker on Testnet, with maker origins added to `connect-src`, zero CSP violations, no `unsafe-inline` | ⚠️ PARTIAL (one clause deferred, see Deferred Items) | `tools/e2e/` harness unchanged by 02-06 (deliberately — the plan's own verification section states "`npm run e2e:rfq` is deliberately NOT required by this plan... per-quote isolation is fully and deterministically provable at the unit layer"). Prior live runs (12/12 scenarios, two tx hashes) stand as the E2E-01 evidence; `vercel.json` still byte-unchanged this pass (confirmed via `git status --short`). "maker origins added to connect-src" remains deliberately deferred to Phase 3 per D-11 — unchanged disposition from the prior verification. |

**Score:** 5/5 truths verified (or verified-with-documented-deferral); the one previously blocking
gap (truth 1's per-maker isolation under a value-level malformed field) is closed and independently
re-derived from the source, not just the plan's claims.

### Deferred Items

Item not yet met but explicitly addressed in a later milestone phase (Step 9b filtering) — carried
forward unchanged from the prior verification pass.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | `vercel.json connect-src` gains real maker-server origins | Phase 3 | D-11 (02-CONTEXT.md), Phase 3 ROADMAP goal ("nothing stubbed"), confirmed again this pass: no pending `vercel.json` diff in `git status --short` |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/rfq/validate.ts` | Fail-closed quote validation, total for every input | ✓ VERIFIED (upgraded) | All four maker/request `toAtomic` conversions now guarded by `tryToAtomic()`; new `malformed_field` REJECT_REASON member added additively (grep-verified no exhaustive consumer switch exists). `npm run build` type-checks the new union member against every consumer. |
| `src/core/rfq/validate.test.ts` | Value-level malformed-field regression coverage | ✓ VERIFIED | New `malformed_field` describe block (non-numeric takerAmount/makerAmount, absent takerAmount, wrong-JSON-type) plus an `economics_mismatch` describe block for interpretable-but-wrong values (empty string, negative, hex-prefixed), confirmed present at lines 205-259 of the file. |
| `src/data/rfqNetwork.ts` | Per-quote isolation at the fan-out call site | ✓ VERIFIED | `fanOutMakerSideOrder`'s loop (lines 138-151) wraps only the `validateQuote` call and its two verdict branches in try/catch; the per-pass `Promise.all` (config + ledger reads) is untouched, confirmed by direct read. |
| `src/data/rfqNetwork.test.ts` | Mixed-pass regression + fail-closed counterweight | ✓ VERIFIED | Confirmed present: "a pass mixing one maker with a non-numeric takerAmount and three valid makers isolates the bad quote to one rejection" (line 201), a structural mutation-check test (line 243), and "rejects the whole pass when the per-pass get_config read fails" (line 275). |
| All other phase artifacts (`order.ts`, `discover.ts`, `retry.ts`, `settle.ts`, `RfqPanel.tsx`, `wire.ts`, golden-vector fixtures, `tools/e2e/*`) | Unchanged since prior verification | ✓ VERIFIED (regression check) | Confirmed present on disk, file-modification timestamps predate 02-06's commits, no diff against the prior verification's artifact table. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `src/data/rfqNetwork.ts` | `src/core/rfq/validate.ts` | `validateQuote` per-quote in fan-out loop | ✓ WIRED AND ISOLATED (was: wired but not isolated) | Now guarded by a per-quote try/catch; independently confirmed by direct code read plus a passing structural mutation test that proves the catch is load-bearing (not dead code) by mocking `validateQuote` to throw for an unclassified reason. |
| `src/core/rfq/validate.ts` | `src/core/rfq/order.ts` | `toAtomic` via `tryToAtomic` guard | ✓ WIRED | All four call sites route through the new guard; `order.ts` itself is unmodified (confirmed `grep -c "BigInt(whole" src/core/rfq/order.ts` = 1). |
| `src/App.tsx` | `src/ui/RfqPanel.tsx` | import + render | ✓ WIRED | Unchanged since prior verification. |
| `package.json` | `tools/e2e/run-all.mjs` | `e2e:rfq` script | ✓ WIRED | Unchanged since prior verification. |
| `src/core/rfq/settle.ts` | Freighter `signTransaction` | `RfqWalletSigner.signTransaction` | ✓ WIRED | Unchanged since prior verification. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Targeted regression: the three gap-closure test files | `npx vitest run src/data/rfqNetwork.test.ts src/core/rfq/validate.test.ts src/core/rfq/order.test.ts` | 3 files, 50/50 tests passed | ✓ PASS |
| Full vitest suite (regression gate) | `npm test -- --run` | 13 files, 192/192 tests passed (up from 182 at the prior verification, matching the +10 tests the SUMMARY claims) | ✓ PASS |
| Production build | `npm run build` | `tsc --noEmit && vite build` exits 0, `dist/otc.html` produced | ✓ PASS |
| Debt-marker scan on the four 02-06-modified files | `grep -n -E "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` | No matches | ✓ PASS |
| `vercel.json` unchanged (D-11 deferral still holds) | `git status --short` | No pending diff on `vercel.json` | ✓ PASS |

### Probe Execution

Not applicable — this phase has no `scripts/*/tests/probe-*.sh` convention. Per the orchestrator's
explicit instruction, the live 12-scenario Testnet E2E lane (`npm run e2e:rfq`) was NOT re-run for
this re-verification: per-quote isolation is deterministically proven at the unit layer (mutation
tests confirm both guard layers are independently load-bearing), and the live lane consumes Testnet
actors for no new evidence relevant to the gap closed. The prior verification's live-run and
human-verify records stand unchanged.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TAKER-01 | 02-01, 02-03 | Discovery via two registry reads + intersection | ✓ SATISFIED | Unchanged since prior verification: `discoverMakerUrls` (rfqNetwork.ts) |
| TAKER-02 | 02-01, 02-03, 02-06 | Parallel fan-out, 2-3s timeout, drop malformed (per-maker, both transport- and value-level) | ✓ SATISFIED (upgraded from partial) | Transport-level drop unchanged; value-level isolation closed by 02-06, independently re-derived from source in this pass, not solely from SUMMARY claims |
| TAKER-03 | 02-02 | Fail-closed local validation before wallet prompt | ✓ SATISFIED | `validate.ts` now total for every input value (never throws); 02-06 strengthens rather than weakens this guarantee |
| TAKER-04 | 02-01, 02-04 | Single-signature settlement | ✓ SATISFIED | Unchanged since prior verification |
| TAKER-05 | 02-02, 02-04 | Trustline pre-flight + curated allow-list only | ✓ SATISFIED | Unchanged since prior verification |
| TAKER-06 | 02-01 | Deterministic canonical order encoding, golden-vector pinned | ✓ SATISFIED | Confirmed untouched by 02-06 (`order.ts`, fixtures byte-identical) |
| CSP-01 | 02-05 | `connect-src` gains maker origins; zero violations; no `unsafe-inline` | ⚠️ PARTIALLY SATISFIED, deferred | Unchanged: zero-violation/no-unsafe-inline posture held; maker-origin clause deliberately deferred to Phase 3 per D-11 |
| E2E-01 | 02-05 | Stub maker + taker driver, full RFQ flow, settles for real | ✓ SATISFIED | Unchanged since prior verification: `npm run e2e:rfq`, 12/12 scenarios, two independent live runs recorded with tx hashes |

**Note (carried forward, still INFO not a blocker):** `.planning/REQUIREMENTS.md`'s tracking table
(lines 151-158) still shows TAKER-01, TAKER-06, CSP-01, and E2E-01 as "Pending" in its summary table
even though the requirement-text checkboxes above that table (lines 59-92) mark TAKER-02 through
TAKER-05 as `[x]` complete and TAKER-01/06/CSP-01/E2E-01 as `[ ]` unchecked — this is inconsistent
with those same requirements' own SUMMARY frontmatter (`requirements-completed` entries exist for
TAKER-01, TAKER-06, CSP-01, E2E-01 across 02-01/02-03/02-05). This is a documentation-staleness
issue in REQUIREMENTS.md, not a functional gap. Flagged as INFO, unchanged from the prior
verification.

### Anti-Patterns Found

None blocking. `grep` across the four 02-06-modified files found no TBD/FIXME/XXX/TODO/HACK/
PLACEHOLDER markers.

Two WARNING-level findings surfaced by the independent code-review delta (`02-REVIEW.md`, updated
2026-09-12 after 02-06) are noted for completeness but do not block the phase goal:
- **WR-04:** `fanOutMakerSideOrder`'s backstop catch labels every uncaught exception as
  `malformed_field`, even one unrelated to a malformed value. This is a diagnostic-precision nit,
  not a functional break — the isolation guarantee (one bad maker costs one quote) holds regardless
  of the label's precision.
- **WR-05:** The `ctx.request.takerAmount` guard (the desk's own request, not the maker's response)
  has zero direct test coverage — only the `order.*` fields are tampered in the new test cases. The
  guard itself is present in the source (confirmed by direct read) and mutation-verified indirectly
  via the mixed-pass and structural tests, but a typo in this specific branch would not be caught by
  CI today.

Neither finding contradicts the phase's must-haves or ROADMAP success criteria; both are logged as
WARNING (not CRITICAL) by the independent review and are appropriately deferred as polish rather
than reopened as phase gaps.

### Code Review Cross-Reference (02-REVIEW.md, updated after 02-06)

| Finding | Severity | This verification's disposition |
|---------|----------|----------------------------------|
| CR-01: malformed maker response poisons the entire fan-out pass | Critical (was open) | **RESOLVED**, confirmed independently by direct code read of `validate.ts` and `rfqNetwork.ts` in this pass — the gap from the prior verification is closed |
| CR-02: maker fetches not covered by deployed CSP `connect-src` | Critical | Deferred to Phase 3 per D-11 — unchanged disposition, not a phase-2 gap |
| WR-01, WR-02, WR-03 | Warning | Carried forward unchanged from the prior verification, non-blocking UX/robustness polish |
| WR-04, WR-05 (NEW, 02-06 delta) | Warning | Non-blocking, see Anti-Patterns section above |
| IN-01, IN-02 and two new INFO items from the 02-06 delta | Info | Documentation/coverage-completeness notes only, not gaps |

### Human Verification Required

None outstanding. The one human-verify checkpoint this phase carried (02-05-PLAN.md Task 3, real
browser + real Freighter) was already completed and approved by the developer on 2026-09-11, with
tx `c8efe29c8855dab7f6d58d786202d6ebcf10ff6b5b6f4c43c3340f1db6993206` confirmed on Horizon. 02-06
touched no UI, wallet, or settlement code path, so this checkpoint's scope is unaffected and does
not need to be re-run.

### Gaps Summary

No gaps remain. The prior verification's one blocking gap — CR-01, `validateQuote`'s reliance on
unguarded `BigInt()` conversion of maker-controlled numeric strings crashing the entire
`fanOutMakerSideOrder` pass — is closed by plan 02-06 (commits `ccbd4bc`, `e068c75`). This
verification did not trust the plan's SUMMARY claims: it read `src/core/rfq/validate.ts` and
`src/data/rfqNetwork.ts` directly, confirmed all four maker/request `toAtomic` call sites are now
guarded by a module-private `tryToAtomic()` helper returning `reject('malformed_field', …)` instead
of throwing, confirmed the per-quote `try/catch` backstop in `fanOutMakerSideOrder`'s loop is scoped
correctly (it does not swallow the per-pass `Promise.all` reads, which must still fail the whole
pass), independently ran the targeted test files (50/50 passing) and the full suite (192/192,
matching the SUMMARY's claimed count exactly), and confirmed the build is clean. The independent
`02-REVIEW.md` code-review delta reached the same conclusion by its own separate re-trace.

The CSP maker-origin clause (part of ROADMAP SC5 / CSP-01) remains a deliberately deferred item, not
a gap — D-11 locked it to Phase 3 during this phase's own discuss-phase step, before any real maker
origin existed to add, and `vercel.json` is confirmed still byte-unchanged this pass.

The phase goal — a taker in the desk can select a curated pair, see live firm quotes from
registered makers (now genuinely isolated per-maker against both transport- and value-level
malformation), and settle one with a single wallet signature, proven end-to-end against a local
stub maker settling for real on Testnet — is achieved.

---

_Verified: 2026-09-12T15:10:00Z_
_Verifier: Claude (gsd-verifier)_
