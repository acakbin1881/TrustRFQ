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
| (filled by planner) | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/core/rfq/order.test.ts` — golden-vector stubs for TAKER-06 (deterministic Order encoding)
- [ ] `src/core/rfq/validate.test.ts` — quote/authEntry validation stubs for TAKER-03
- [ ] `src/core/rfq/discovery.test.ts` — registry-intersection stubs for TAKER-01
- [ ] `fixtures/rfq-order-vectors.json` — golden vectors pinning the sorted-symbol-key ScVal map encoding

*Existing vitest infrastructure covers the framework; only new test files are needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-Testnet settlement via extended e2e:census | E2E-01 | Needs live Testnet + preview server + stub maker; not a unit test | `npm run preview -- --port 4173` then `npm run e2e:census` |
| Zero CSP violations in production build | CSP-01 | Browser-console observation against deployed headers | Load built desk in browser, check console for CSP reports |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
