---
phase: 02
slug: desk-rfq-taker-path
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-29
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
| 01-T1 | 02-01 | 1 | TAKER-01, TAKER-02, TAKER-04 | T-02-01, T-02-06 | Maker auth entry attached before the enforcing simulation; taker signer exposes only `signTransaction` | e2e (live Testnet) | `node tools/e2e/rfq-driver.mjs` | ❌ created by this task | ⬜ pending |
| 01-T2 | 02-01 | 1 | TAKER-06 | T-02-02 | Order encoding pinned byte-for-byte with amount and fee tamper guards | unit (fixture) | `npx vitest run src/core/rfq/order.test.ts` | ❌ created by this task | ⬜ pending |
| 02-T1 | 02-02 | 2 | TAKER-03, TAKER-05 | T-02-07, T-02-08, T-02-09, T-02-11 | Fail-closed validation: economics, fee vs `get_config`, expiry, token allow-list, invocation-tree match | unit (fixture-driven, mutation-verified) | `npx vitest run src/core/rfq/validate.test.ts` | ❌ created by this task | ⬜ pending |
| 02-T2 | 02-02 | 2 | TAKER-02, TAKER-03 | T-02-10 | Unreachable / non-2xx / unparseable / error / entry-less / timed-out responses all drop | unit (network stubbed) | `npx vitest run src/data/rfqNetwork.test.ts` | ❌ created by this task | ⬜ pending |
| 02-T3 | 02-02 | 2 | TAKER-03 | T-02-07, T-02-08, T-02-10 | Every D-12 failure mode costs zero wallet prompts, with the rejection reason recorded | e2e (live Testnet) | `node tools/e2e/rfq-driver.mjs` | ✅ extended | ⬜ pending |
| 03-T1 | 02-03 | 3 | TAKER-01, TAKER-02 | T-02-14, T-02-17 | Tie-stable ranking; expiry-equals-now kept, matching the contract's strictly-greater test | unit | `npx vitest run src/core/rfq/discover.test.ts` | ❌ created by this task | ⬜ pending |
| 03-T2 | 02-03 | 3 | TAKER-01, TAKER-02 | T-02-13, T-02-15, T-02-16 | No maker identity rendered; no scheduled re-fan-out; list capped at 6 rows | build + source assertions | `npm run build` | ✅ existing | ⬜ pending |
| 03-T3 | 02-03 | 3 | TAKER-01, TAKER-02 | T-02-13, T-02-17 | Zero-makers, multi-quote ordering, and expiry-drop measured in the report | e2e (live Testnet) | `node tools/e2e/rfq-driver.mjs` | ✅ extended | ⬜ pending |
| 04-T1 | 02-04 | 4 | TAKER-05 | T-02-18, T-02-19, T-02-20 | Equal price counts as not-worse; at most one automatic retry; unfetched balances never assert a trustline | unit (mutation-verified) | `npx vitest run src/core/rfq/retry.test.ts` | ❌ created by this task | ⬜ pending |
| 04-T2 | 02-04 | 4 | TAKER-04, TAKER-05 | T-02-21, T-02-22 | Trustline step imported unchanged; busy guard covers the retry; no fourth reference to the OTC settlement hook | build + source assertions | `npm run build` | ✅ existing | ⬜ pending |
| 04-T3 | 02-04 | 4 | TAKER-04, TAKER-05 | T-02-18, T-02-19 | Trustline prompt precedes the swap prompt; all three price-guard outcomes observed | e2e (live Testnet) | `node tools/e2e/rfq-driver.mjs` | ✅ extended | ⬜ pending |
| 05-T1 | 02-05 | 5 | E2E-01 | T-02-25, T-02-27 | Stub maker ejects on every exit path; no test-only code under `src/` | e2e (live Testnet) | `npm run e2e:rfq` | ❌ created by this task | ⬜ pending |
| 05-T2 | 02-05 | 5 | CSP-01 | T-02-23, T-02-24 | `connect-src` unchanged at five sources; `script-src` gains no inline allowance; no inline script in the build | build + source assertions | `npm run build` | ✅ existing | ⬜ pending |
| 05-T3 | 02-05 | 5 | CSP-01, E2E-01 | T-02-26 | Panel matches the design contract; console policy-violation count observed | manual (human-verify checkpoint) | see 02-05 checkpoint steps | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Each file below is created by the task that first needs it, inside the plan named — this phase
leads with a tracer slice rather than a separate scaffolding wave, so the test files land with the
code they pin rather than ahead of it.

- [ ] `src/core/rfq/order.test.ts` — golden vectors for TAKER-06 (deterministic Order encoding) — Plan 02-01 Task 2
- [ ] `fixtures/rfq-order-vectors.json` — vectors pinning the sorted-symbol-key ScVal map encoding — Plan 02-01 Task 2
- [ ] `fixtures/rfq-auth-tree.json` — captured real maker auth-entry invocation tree (resolves RESEARCH Assumption A1) — Plan 02-01 Task 2
- [ ] `src/core/rfq/validate.test.ts` — quote and auth-entry validation for TAKER-03/TAKER-05 — Plan 02-02 Task 1
- [ ] `src/data/rfqNetwork.test.ts` — fan-out drop semantics for TAKER-02 — Plan 02-02 Task 2
- [ ] `src/core/rfq/discover.test.ts` — intersection and tie-stable ranking for TAKER-01 — Plan 02-03 Task 1
- [ ] `src/core/rfq/retry.test.ts` — price guard and trustline predicate for TAKER-05 — Plan 02-04 Task 1
- [ ] `tools/e2e/stub-maker.mjs` + `tools/e2e/rfq-driver.mjs` — the live-Testnet check for E2E-01 — Plan 02-01 Task 1, extended in 02-02/02-03/02-04, folded into the census in 02-05

*Existing vitest infrastructure covers the framework; only new test files are needed.*

**Note on `src/core/rfq/settle.test.ts`:** 02-RESEARCH.md's test map proposes it for "unit for pure
helpers (ScVal encode)". That helper lives in `src/core/rfq/order.ts` and is covered by
`order.test.ts`; `settleQuote` itself is chain I/O whose real proof is the live driver run, as the
same table states. Deliberately consolidated, not dropped (recorded in Plan 02-01's planner
assumptions).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-Testnet settlement via extended e2e:census | E2E-01 | Needs live Testnet + preview server + stub maker; not a unit test | `npm run preview -- --port 4173` then `npm run e2e:census` |
| Zero CSP violations in production build | CSP-01 | Browser-console observation against deployed headers | Load built desk in browser, check console for CSP reports |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — every task in Plans 02-01 through 02-05 carries at least one `<automated>` command; the sole exception is 02-05's human-verify checkpoint, which is a visual check with no automatable equivalent
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — the longest run without one is zero
- [x] Wave 0 covers all MISSING references — every `❌` file in the per-task map is created by the task that needs it, inside the plan named above
- [x] No watch-mode flags — every command is `vitest run`, `npm test`, `npm run build`, or a node script
- [x] Feedback latency < 30s for the unit lanes (`npx vitest run src/core/rfq/`); the live-Testnet driver runs are minutes by nature and are sampled per plan, not per task
- [ ] `nyquist_compliant: true` set in frontmatter — set by `/gsd-validate-phase` after execution, not by the planner

**Approval:** per-task map filled by plan-phase 2026-09-03; sign-off pending execution.
