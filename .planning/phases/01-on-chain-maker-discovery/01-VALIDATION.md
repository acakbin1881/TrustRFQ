---
phase: 1
slug: on-chain-maker-discovery
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-20
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | cargo test (Rust, soroban-sdk testutils) + vitest 4 (frontend units) |
| **Config file** | `contracts/Cargo.toml` (workspace root) / `vite.config.ts` |
| **Quick run command** | `cargo test --manifest-path contracts/rfq_registry/Cargo.toml` |
| **Full suite command** | `cargo test --manifest-path contracts/Cargo.toml && npm test` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cargo test --manifest-path contracts/rfq_registry/Cargo.toml`
- **After every plan wave:** Run `cargo test --manifest-path contracts/Cargo.toml && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-T1 (tracer) | 01-01 | 1 | REG-01, REG-02, REG-03 | T-01-01, T-01-02, T-01-03, T-01-04, T-01-05, T-01-06 | Re-init guard; `maker.require_auth()` first in every mutating fn; refund from `MakerConfig.staked`; no `upgrade` entry point; `otc_swap` wasm hash gate; `MAX_URL_BYTES` bound | unit + live CLI | `cargo test --manifest-path contracts/Cargo.toml` | ✅ (created by 01-01-T1) | ✅ green |
| 01-01-T2 | 01-01 | 1 | REG-03 | T-01-03, T-01-SC | Contract-side XLM balance returns to its exact pre-registration value after `eject` | integration (live Testnet) | `node tools/rfq-registry-live.mjs` | ✅ (created by 01-01-T2) | ✅ green |
| 01-02-T1 | 01-02 | 2 | REG-01, REG-02 | T-01-11, T-01-12, T-01-13, T-01-14, T-01-15, T-01-16 | All-or-nothing rollback on mid-loop failure; `NotRegistered` gate; checked stake math; `eject` delists everywhere; events on transitions | unit | `cargo test --manifest-path contracts/Cargo.toml -p rfq_registry` | ✅ (created 01-01-T1) | ✅ green |
| 01-02-T2 | 01-02 | 2 | REG-01, REG-02 | T-01-14, T-01-16 | Stake-free protocol list; `NotRegistered` gate; strict duplicate semantics | unit | `cargo test --manifest-path contracts/Cargo.toml -p rfq_registry` | ✅ | ✅ green |
| 01-02-T3 | 01-02 | 2 | REG-02, REG-03 | T-01-09, T-01-10 | Two independent bounds, each mutation-verified | unit | `cargo test --manifest-path contracts/Cargo.toml -p rfq_registry` | ✅ | ✅ green |
| 01-03-T1 | 01-03 | 3 | REG-01, REG-02 | T-01-18, T-01-20, T-01-21, T-01-22, T-01-24 | `require_admin` on both setters; no admin path to escrowed stake; cap lowering evicts nobody; refund from `staked` survives a cost retune | unit | `cargo test --manifest-path contracts/Cargo.toml -p rfq_registry` | ✅ | ✅ green |
| 01-03-T2 | 01-03 | 3 | REG-03 | T-01-17, T-01-18, T-01-19 | Re-init guard changes nothing; funded-attacker rejection table across all six maker fns and both admin setters; nine event tests | unit (un-mocked auth) | `cargo test --manifest-path contracts/Cargo.toml -p rfq_registry` | ✅ | ✅ green |
| 01-03-T3 | 01-03 | 3 | REG-02, REG-03 | T-01-23 | TTL bumped on every persistent write, asserted after a ledger advance; archival behavior established empirically | unit (testutils ledger) | `cargo test --manifest-path contracts/Cargo.toml` | ✅ | ✅ green |
| 01-04-T1 | 01-04 | 4 | REG-03 | T-01-25, T-01-28, T-01-31 | Two-step deploy then `initialize`; no key file written; `liveUntilLedgerSeq` increases on write | integration (live Testnet) | `node tools/rfq-registry-live.mjs` | ✅ (created 01-01-T2) | ✅ green |
| 01-04-T2 | 01-04 | 4 | CFG-01 | T-01-26, T-01-27, T-01-29, T-01-30 | `registryEnabled` regex gate; id stays un-bundled; no inline script in `dist/*.html`; reset checklist entry | unit + build | `npm run typecheck && npm test` | ✅ (existing vitest suites) | ✅ green |
| 01-04-T3 | 01-04 | 4 | REG-03, CFG-01 | T-01-26, T-01-31 | Human confirms the config id equals the deployed id and decides on `max_makers_per_token` tuning | manual (blocking checkpoint) | — | — | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All Wave 0 gaps are closed inside Plan 01-01, Wave 1 — the phase's first task creates the test
infrastructure it then verifies against.

- [x] `contracts/Cargo.toml` — `rfq_registry` added to `members` (Plan 01-01 Task 1)
- [x] `contracts/rfq_registry/Cargo.toml` — member manifest (Plan 01-01 Task 1)
- [x] `contracts/rfq_registry/src/test.rs` — unit-test module scaffolding with the `Setup<'a>`
      harness and the coverage-boundary comment (Plan 01-01 Task 1)
- [x] `tools/rfq-registry-live.mjs` — live Testnet integration check (Plan 01-01 Task 2)

*Existing infrastructure (cargo workspace + vitest) covers everything else; no test file needs to
exist before Wave 1 begins.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Testnet register → discover → eject incl. TTL bump | REG-01..03 | Requires funded Testnet accounts + deployed contract | Run the phase's live-check script (rfq-live-swap.mjs pattern) after deploy |
| `RFQ_REGISTRY_ID` wired into runtime config | CFG-01 | window.* runtime config is not bundled/tested | Grep `public/otc-config.js` + `src/config.ts`; `npm run typecheck` green |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-26

---

## Validation Audit 2026-08-26

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All 12 mapped task verifications re-confirmed green at audit time: `cargo test --manifest-path
contracts/Cargo.toml` 83/83 (otc_swap 6 + rfq_registry 60 + rfq_swap 17, including the post-review
CR-01/WR-01/WR-02 fix tests), `npm test` 109/109 + `npm run typecheck` clean, and
`tools/rfq-registry-live.mjs` executed green three independent times this phase (executor, human
checkpoint, verifier). The two Manual-Only rows were both exercised: the live check by three real
runs, the config wiring by the human-approved 01-04 checkpoint.
