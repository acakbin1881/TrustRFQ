---
phase: 1
slug: on-chain-maker-discovery
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| (filled by planner) | | | REG-01, REG-02, REG-03, CFG-01 | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `contracts/rfq_registry/src/test.rs` — unit-test module scaffolding for REG-03
- [ ] Workspace member entry in `contracts/Cargo.toml` (existing infrastructure otherwise covers the phase)

*Existing infrastructure (cargo workspace + vitest) covers all phase requirements once the member crate exists.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Testnet register → discover → eject incl. TTL bump | REG-01..03 | Requires funded Testnet accounts + deployed contract | Run the phase's live-check script (rfq-live-swap.mjs pattern) after deploy |
| `RFQ_REGISTRY_ID` wired into runtime config | CFG-01 | window.* runtime config is not bundled/tested | Grep `public/otc-config.js` + `src/config.ts`; `npm run typecheck` green |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
