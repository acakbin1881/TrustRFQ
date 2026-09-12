---
phase: 02
slug: desk-rfq-taker-path
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-29
validated: 2026-09-12
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (JS/TS) + cargo test (contracts, unchanged this phase) |
| **Config file** | vite.config.ts (vitest inherits Vite aliases — load-bearing for the buffer alias) |
| **Quick run command** | `npx vitest run src/core/rfq/` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/core/rfq/`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-T1 | 02-01 | 1 | TAKER-01, TAKER-02, TAKER-04 | T-02-01, T-02-06 | Maker auth entry attached before the enforcing simulation; taker signer exposes only `signTransaction` | e2e (live Testnet) | `node tools/e2e/rfq-driver.mjs` | ✅ | ✅ green |
| 01-T2 | 02-01 | 1 | TAKER-06 | T-02-02 | Order encoding pinned byte-for-byte with amount and fee tamper guards | unit (fixture) | `npx vitest run src/core/rfq/order.test.ts` | ✅ | ✅ green |
| 02-T1 | 02-02 | 2 | TAKER-03, TAKER-05 | T-02-07, T-02-08, T-02-09, T-02-11 | Fail-closed validation: economics, fee vs `get_config`, expiry, token allow-list, invocation-tree match | unit (fixture-driven, mutation-verified) | `npx vitest run src/core/rfq/validate.test.ts` | ✅ | ✅ green |
| 02-T2 | 02-02 | 2 | TAKER-02, TAKER-03 | T-02-10 | Unreachable / non-2xx / unparseable / error / entry-less / timed-out responses all drop | unit (network stubbed) | `npx vitest run src/data/rfqNetwork.test.ts` | ✅ | ✅ green |
| 02-T3 | 02-02 | 2 | TAKER-03 | T-02-07, T-02-08, T-02-10 | Every D-12 failure mode costs zero wallet prompts, with the rejection reason recorded | e2e (live Testnet) | `node tools/e2e/rfq-driver.mjs` | ✅ | ✅ green |
| 03-T1 | 02-03 | 3 | TAKER-01, TAKER-02 | T-02-14, T-02-17 | Tie-stable ranking; expiry-equals-now kept, matching the contract's strictly-greater test | unit | `npx vitest run src/core/rfq/discover.test.ts` | ✅ | ✅ green |
| 03-T2 | 02-03 | 3 | TAKER-01, TAKER-02 | T-02-13, T-02-15, T-02-16 | No maker identity rendered; no scheduled re-fan-out; list capped at 6 rows | build + source assertions | `npm run build` | ✅ | ✅ green |
| 03-T3 | 02-03 | 3 | TAKER-01, TAKER-02 | T-02-13, T-02-17 | Zero-makers, multi-quote ordering, and expiry-drop measured in the report | e2e (live Testnet) | `node tools/e2e/rfq-driver.mjs` | ✅ | ✅ green |
| 04-T1 | 02-04 | 4 | TAKER-05 | T-02-18, T-02-19, T-02-20 | Equal price counts as not-worse; at most one automatic retry; unfetched balances never assert a trustline | unit (mutation-verified) | `npx vitest run src/core/rfq/retry.test.ts` | ✅ | ✅ green |
| 04-T2 | 02-04 | 4 | TAKER-04, TAKER-05 | T-02-21, T-02-22 | Trustline step imported unchanged; busy guard covers the retry; no fourth reference to the OTC settlement hook | build + source assertions | `npm run build` | ✅ | ✅ green |
| 04-T3 | 02-04 | 4 | TAKER-04, TAKER-05 | T-02-18, T-02-19 | Trustline prompt precedes the swap prompt; all three price-guard outcomes observed | e2e (live Testnet) | `node tools/e2e/rfq-driver.mjs` | ✅ | ✅ green |
| 05-T1 | 02-05 | 5 | E2E-01 | T-02-25, T-02-27 | Stub maker ejects on every exit path; no test-only code under `src/` | e2e (live Testnet) | `npm run e2e:rfq` | ✅ | ✅ green |
| 05-T2 | 02-05 | 5 | CSP-01 | T-02-23, T-02-24 | `connect-src` unchanged at five sources; `script-src` gains no inline allowance; no inline script in the build | build + source assertions | `npm run build` | ✅ | ✅ green |
| 05-T3 | 02-05 | 5 | CSP-01, E2E-01 | T-02-26 | Panel matches the design contract; console policy-violation count observed | manual (human-verify checkpoint) | see 02-05 checkpoint steps | n/a | ✅ performed 2026-09-11 |
| 06-T1 | 02-06 | 6 | TAKER-02 | T-02-07 (value-level malformed maker amounts) | All four maker/request `toAtomic` reads guarded: a non-numeric amount rejects that ONE quote as `malformed_field`, never throws | unit (mutation-verified, RED observed first) | `npx vitest run src/core/rfq/validate.test.ts` | ✅ | ✅ green |
| 06-T2 | 02-06 | 6 | TAKER-02 | T-02-07, T-02-10 | Per-quote backstop catch in `fanOutMakerSideOrder` isolates an unclassified throw; per-pass `get_config` read stays fail-closed | unit (structural mutation probe) | `npx vitest run src/data/rfqNetwork.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Statuses set by `/gsd-validate-phase` 2026-09-12: full suite re-run this session (`npm test` — 13 files,
192 tests, all green), `npm run build` clean with zero inline scripts and zero esm.sh references in
`dist/`, and the `useSettlement` invariant grep at exactly 3 lines. E2e rows rest on the recorded live
runs in each plan's SUMMARY (latest: two full 12/12 `npm run e2e:rfq` censuses 2026-09-11, settle txs
`feef0989…` and `c7dc430f…`, plus the deliberate failure-injection run that exited non-zero and still
ejected its stub maker).

---

## Wave 0 Requirements

Each file below is created by the task that first needs it, inside the plan named — this phase
leads with a tracer slice rather than a separate scaffolding wave, so the test files land with the
code they pin rather than ahead of it.

- [x] `src/core/rfq/order.test.ts` — golden vectors for TAKER-06 (deterministic Order encoding) — Plan 02-01 Task 2
- [x] `fixtures/rfq-order-vectors.json` — vectors pinning the sorted-symbol-key ScVal map encoding — Plan 02-01 Task 2
- [x] `fixtures/rfq-auth-tree.json` — captured real maker auth-entry invocation tree (resolves RESEARCH Assumption A1) — Plan 02-01 Task 2
- [x] `src/core/rfq/validate.test.ts` — quote and auth-entry validation for TAKER-03/TAKER-05 — Plan 02-02 Task 1 (extended by 02-06 with the `malformed_field` and `economics_mismatch` describe blocks)
- [x] `src/data/rfqNetwork.test.ts` — fan-out drop semantics for TAKER-02 — Plan 02-02 Task 2 (extended by 02-06 with the mixed-pass isolation, structural mutation probe, and fail-closed counterweight)
- [x] `src/core/rfq/discover.test.ts` — intersection and tie-stable ranking for TAKER-01 — Plan 02-03 Task 1
- [x] `src/core/rfq/retry.test.ts` — price guard and trustline predicate for TAKER-05 — Plan 02-04 Task 1
- [x] `tools/e2e/stub-maker.mjs` + `tools/e2e/rfq-driver.mjs` — the live-Testnet check for E2E-01 — Plan 02-01 Task 1, extended in 02-02/02-03/02-04, folded into the census in 02-05 (`npm run e2e:rfq`)

*Existing vitest infrastructure covers the framework; only new test files are needed.*

**Note on `src/core/rfq/settle.test.ts`:** 02-RESEARCH.md's test map proposes it for "unit for pure
helpers (ScVal encode)". That helper lives in `src/core/rfq/order.ts` and is covered by
`order.test.ts`; `settleQuote` itself is chain I/O whose real proof is the live driver run, as the
same table states. Deliberately consolidated, not dropped (recorded in Plan 02-01's planner
assumptions).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Last Performed |
|----------|-------------|------------|-------------------|----------------|
| Real-Testnet settlement via extended e2e:census | E2E-01 | Needs live Testnet + preview server + stub maker; not a unit test | `npm run e2e:rfq` (spawns its own preview server; see `tools/e2e/run-all.mjs`) | ✅ 2026-09-11 — two 12/12 runs + failure-injection run (02-05 SUMMARY D1) |
| Zero CSP violations in production build | CSP-01 | Browser-console observation against deployed headers (preview server applies no headers) | Load built desk in browser, check console for CSP reports | ✅ 2026-09-11 — 0 violations across three live census consoles (02-05 SUMMARY D2, recorded as observation, not deployed-policy proof) |
| RFQ panel vs 02-UI-SPEC.md design contract, exactly-one-prompt settlement | CSP-01, E2E-01 | Visual/interaction properties (nav label, ticking countdown, Freighter prompt count) need a real browser + real wallet | 02-05 Task 3 checkpoint steps | ✅ 2026-09-11 — real Freighter, settle tx `c8efe29c…` (02-05 SUMMARY D3) |

These are supplementary layers: every requirement in this phase also carries at least one automated
verification (see the per-task map), so none of these rows is the sole coverage for a requirement.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — every task in Plans 02-01 through 02-06 carries at least one `<automated>` command; the sole exception is 02-05's human-verify checkpoint, which is a visual check with no automatable equivalent (performed 2026-09-11)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — the longest run without one is zero
- [x] Wave 0 covers all MISSING references — every `❌` file in the per-task map is created by the task that needs it, inside the plan named above
- [x] No watch-mode flags — every command is `vitest run`, `npm test`, `npm run build`, or a node script
- [x] Feedback latency < 30s for the unit lanes (`npx vitest run src/core/rfq/`); the live-Testnet driver runs are minutes by nature and are sampled per plan, not per task
- [x] `nyquist_compliant: true` set in frontmatter — set by `/gsd-validate-phase` 2026-09-12

**Approval:** per-task map filled by plan-phase 2026-09-03; audited and signed off by
`/gsd-validate-phase` 2026-09-12 after all six plans (02-01 … 02-06) completed.

---

## Validation Audit 2026-09-12

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

No MISSING or PARTIAL requirement coverage: every Wave 0 test file exists, the full suite runs green
(13 files / 192 tests, re-run this session), `npm run build` is clean with zero inline scripts and
zero esm.sh references in `dist/`, and the `useSettlement` invariant grep returns exactly 3 lines.
The audit's only findings were documentation staleness, fixed in place: the per-task map predated
execution (all rows ⬜ pending), and Plan 02-06 (the VERIFICATION gap-closure wave, executed
2026-09-12) had no rows — 06-T1/06-T2 added, both unit-lane and mutation-verified per the
02-06-SUMMARY's recorded RED-first observations. No auditor subagent was needed.
