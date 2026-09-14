---
phase: 03-live-full-rfq-loop
verified: 2026-09-14T17:30:00Z
status: passed
score: 4/4 ROADMAP success criteria verified
behavior_unverified: 0
overrides_applied: 0
gaps_closed:
  - truth: "The run is recorded (maker address, registry entry, quote, tx hash) so it is reproducible after a quarterly Testnet reset (ROADMAP Success Criterion 4; 03-04 must_haves backstop truth: 'A reader who has never seen this project can reproduce the live loop from the record alone after a quarterly Testnet reset')"
    original_finding: "tools/e2e/rfq-driver.mjs:263 (openTakerUsdcTrustline) hardcoded the demo-issuer secret path as a developer-specific absolute literal (`/Users/acakbin1881/Projects/TrustRFQ/demo-keys.json`) instead of `path.join(REPO_ROOT, 'demo-keys.json')`, the convention every other read site in the same file (lines 282, 291, 303, 367) already used. Called unconditionally on every invocation, this broke `npm run e2e:rfq:live` — the exact command docs/evidence/live-rfq-run.md's own 'Post-reset re-run instructions' tell a future reader to run — for anyone but the original author on the original machine. Originally found by this phase's own code review (03-REVIEW.md CR-01, 2026-09-14) and confirmed independently by this verification's first pass."
    closed_by: "Commit `ad3d10c` (\"fix(03): use REPO_ROOT-relative demo-keys.json path in openTakerUsdcTrustline\"), applied after the first verification pass. Re-inspected: line 263 now reads `readFileSync(path.join(REPO_ROOT, 'demo-keys.json'), 'utf8')`, matching lines 282/291/303/367 exactly. `grep -n \"readFileSync('/Users\" tools/e2e/rfq-driver.mjs` returns zero matches. `node --check tools/e2e/rfq-driver.mjs` exits 0 (syntax valid)."
deferred:
  - truth: "Merge feat/rfq-milestone into main, then run one live settle against the production URL and append a third transaction hash to docs/evidence/live-rfq-run.md (D-07's optional post-merge verification, condition of the 'merge-after-production-check' authorisation)"
    addressed_in: "Human / /gsd-ship (explicitly not owned by any Phase 3 plan)"
    evidence: "03-04-PLAN.md Task 4 acceptance criteria: 'The merge itself is performed by the developer or by /gsd-ship; this checkpoint records the authorisation, it does not push anything.' 03-04-SUMMARY.md Next Phase Readiness: 'D-07 is AUTHORISED but not yet executed... NOT by this plan or any future execute-phase run of Phase 3 (Phase 3 is otherwise fully complete).' This action is outside the four ROADMAP success criteria for Phase 3 and is not required for the phase goal itself, so it is recorded here as a deferred/open follow-up rather than a phase-blocking gap."
---

# Phase 3: Live Full RFQ Loop Verification Report

**Phase Goal:** The milestone definition of done: a real registered maker quoting from its own
server is discovered and settled by the desk on Testnet, end-to-end, with nothing stubbed.
**Requirement:** E2E-02
**Verified:** 2026-09-14T17:30:00Z (initial pass 16:30:00Z; re-verified after gap closure)
**Status:** passed
**Re-verification:** Yes — the single gap found in the initial pass was closed by commit `ad3d10c`
and re-checked directly against the current file before this status was set.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A maker registered on `rfq_registry` with a real stake is discovered by the desk with no hardcoded URL anywhere in the flow | ✓ VERIFIED | `tools/e2e/rfq-driver.mjs`'s `readRegisteredMaker` performs a genuine `get_maker` simulation against `RFQ_REGISTRY_ID` (line 506) — no `page.route` interception, no spawned child, no env-var/constant URL in LIVE mode (confirmed by grep: driver contains `REAL_MAKER_ADDRESS` + `get_maker`, and the origin string does not appear outside comments). Maker `GDUXGYZPDZVZI4LYPAPNGW3MHPBAQB7WBPPFPOP4HUQZDRFQ6FT2YWT3` staked 1,200,000,000 stroops (120 XLM), both SAC tokens listed, per `docs/evidence/live-rfq-run.json`'s `registryEntry`. |
| 2 | The maker's own server returns a live signed quote over the Stellar RFQ v1 wire protocol, and the desk validates and accepts it | ✓ VERIFIED | Sibling repo `trustrfq-maker-server` (independently confirmed present, git history intact: commits `5d41596`, `c151338`, `484936f`) implements `getMakerSideOrder` at a real Vercel https origin, signs with `authorizeEntry` over a RECORDING-mode simulation. Both automated directions and the manual Freighter run produced accepted quote rows and settled transactions (tx hashes below), independently confirmed successful on Horizon by the orchestrator (ledgers 4658066, 4672184, 4673408, 4672845, 4672847). |
| 3 | The swap settles on Testnet end-to-end: tx hash, swap event, and all four balance deltas confirm the exact quoted amounts plus the maker-paid fee | ✓ VERIFIED | Both automated directions carry five (superset of the required four) exact stroop-level deltas each in `docs/evidence/live-rfq-run.json`, all `measured === expected`; the manual Freighter run's deltas are independently derived and shown in `docs/evidence/live-rfq-run.md`. `.settle__err` absence and Horizon `successful: true` confirm the swap event was read back on every settle. Fee (10 bps) derived live from `rfq_swap.get_config`, not a constant. |
| 4 | The run is recorded (maker address, registry entry, quote, tx hash) so it is reproducible after a quarterly Testnet reset | ✓ VERIFIED | The record itself (`docs/evidence/live-rfq-run.json` + `.md`) is complete and honestly marks reset-survival as unproven until an actual reset happens (`backstop`). The mechanism issue found in the first verification pass — `tools/e2e/rfq-driver.mjs:263` hardcoding a single-developer absolute path inside `openTakerUsdcTrustline`, called unconditionally on every run — is now fixed by commit `ad3d10c`: the line reads `path.join(REPO_ROOT, 'demo-keys.json')`, identical to every other read site in the file (lines 282, 291, 303, 367). Re-inspected directly: `grep -n "readFileSync('/Users" tools/e2e/rfq-driver.mjs` returns zero matches, `node --check tools/e2e/rfq-driver.mjs` exits 0. The reproduction path this record names (`npm run e2e:rfq:live`) no longer depends on any machine-specific literal. |

**Score:** 4/4 ROADMAP success criteria verified

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Merge to `main` + post-merge production settle + third tx hash appended to the evidence record (D-07's optional post-merge verification) | Human / `/gsd-ship` | 03-04-PLAN.md Task 4 explicitly scopes the merge itself out of any plan/executor action; 03-04-SUMMARY.md states Phase 3 is "otherwise fully complete" without it. Not one of the four ROADMAP success criteria for Phase 3. `main` (`38e9c94`) and `feat/rfq-milestone` (still ahead by more than a dozen commits, including the gap-closure fix) confirmed still unmerged at verification time — consistent with the SUMMARY's own account, not a surprise finding. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `../trustrfq-maker-server/` (sibling repo) | Standalone maker quote server, deployed, registered | ✓ VERIFIED | Confirmed present at `/Users/acakbin1881/Projects/trustrfq-maker-server`, independent git history (3 commits), `maker-keys.json` present locally but NOT in `git ls-files` (secret custody claim holds) |
| `../trustrfq-maker-server/README.md` | "Recovering after a Testnet reset" runbook | ✓ VERIFIED | Section present at line 69, names `npm run bootstrap` and the reset-survival property |
| `vercel.json` | `connect-src` allow-lists the maker origin, no wildcard | ✓ VERIFIED | Line 18: `connect-src` includes `https://trustrfq-maker-server.vercel.app` literally; no `*` or bare-scheme source; `script-src` unchanged |
| `package.json` | `e2e:rfq:live` script | ✓ VERIFIED | Present: `"e2e:rfq:live": "node tools/e2e/rfq-driver.mjs"` |
| `tools/e2e/rfq-driver.mjs` | LIVE mode: on-chain discovery, no interception, two-direction settle, five-delta assertions, machine-independent reproduction path | ✓ VERIFIED | LIVE-mode logic (readRegisteredMaker/resolveRealMaker/runLiveDirection/snapshotBalances/assertDeltas) all present and exercised by the evidence record. `openTakerUsdcTrustline` (line 263) now resolves its key file via `REPO_ROOT`, matching every other read site in the file — the CR-01 defect from the first verification pass is closed (commit `ad3d10c`). |
| `docs/evidence/live-rfq-run.json` | Committed, secret-free, D-11 machine-readable record | ✓ VERIFIED | 131 lines, both directions, 10/10 deltas exact, no secret-key pattern, tracked in git (not ignored) |
| `docs/evidence/live-rfq-run.md` | Human-readable milestone record, ≥60 lines, all sections | ✓ VERIFIED | 269 lines, all required sections present (maker, registry entry, pricing, automated run, latency, manual run, accepted gaps, post-reset instructions, self-check), no secret-key pattern found |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `tools/e2e/rfq-driver.mjs` | `rfq_registry.get_maker` | `readRegisteredMaker` simulation | ✓ WIRED | Confirmed at line 506; only source of the maker URL in LIVE mode |
| `vercel.json` | deployed maker origin | `connect-src` allow-list entry | ✓ WIRED | Confirmed literal origin present, no wildcard |
| `tools/e2e/rfq-driver.mjs` | `rfq_swap.get_config` | live `fee_bps`/`fee_collector` read for delta math | ✓ WIRED | `feeBps: 10`, `feeCollector` present in evidence record, matches contract's live config per SUMMARY cross-check |
| `docs/evidence/live-rfq-run.md` | `docs/evidence/live-rfq-run.json` | every automated-run figure transcribed | ✓ WIRED | Cross-checked: maker address, hashes, deltas, registry entry all match verbatim between the two files |
| `docs/evidence/live-rfq-run.md` | `../trustrfq-maker-server/scripts/bootstrap.mjs` | post-reset instructions name `npm run bootstrap` | ✓ WIRED | Confirmed at line 238 |
| `tools/e2e/rfq-driver.mjs` (`openTakerUsdcTrustline`) | `demo-keys.json` | `path.join(REPO_ROOT, ...)` resolution, machine-independent | ✓ WIRED | Fixed by commit `ad3d10c`; re-inspected directly, matches the other four read sites' convention |

### Behavioral Spot-Checks / Probe Execution

Not re-run end-to-end in this verification session (would mutate on-chain state / spend Testnet
funds unnecessarily). The orchestrator independently confirmed on Horizon, outside this session's
own tool calls, that all five referenced transaction hashes (`adc55ed5…`, `b3d35358…`, `6ed3a2c6…`,
plus the two 03-03 canonical-run hashes `257fbc16…` and `b0d6b9df…`) are successful, real Testnet
transactions with correct ledgers and — for the human Freighter run — exact 10 bps maker-paid fee
deltas. Regression gate (`npm test` 192/192, `cargo test` 83/83) confirmed passing this session per
the orchestrator's provided context. For the gap-closure re-check specifically: `node --check
tools/e2e/rfq-driver.mjs` was run directly by this verifier and exits 0, and a direct grep for the
prior hardcoded literal returns zero matches.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|--------------|-------------|--------------|--------|----------|
| E2E-02 | 03-01, 03-02, 03-03, 03-04 (all four declare it) | Live full loop: desk discovers a registered maker via `rfq_registry`, receives a live quote from the maker's own server, settles on Testnet end-to-end, run recorded | ✓ SATISFIED | All four ROADMAP success criteria verified. REQUIREMENTS.md's "Complete" marking for E2E-02 is now confirmed accurate (the first verification pass had found this premature pending the CR-01 fix; the fix is now confirmed applied). |

No orphaned requirements found: REQUIREMENTS.md maps only E2E-02 to Phase 3, and all four plans declare it in `requirements:` frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `tools/e2e/rfq-driver.mjs` | 263 (historical) | Hardcoded developer-specific absolute path | 🛑 Blocker → **CLOSED** | Found by this phase's own code review (03-REVIEW.md CR-01) and by this verification's first pass; fixed by commit `ad3d10c`, re-confirmed closed on direct inspection. Kept here for audit trail, not counted against the current score. |
| `../trustrfq-maker-server/scripts/bootstrap.mjs` | 168-180 | USDC inventory mint not gated on current balance despite being logged "(idempotent)" | ⚠️ Warning | Re-running the documented recovery command (`npm run bootstrap`) mints additional USDC every time. Does not block E2E-02's four success criteria; still worth fixing as a follow-up. |
| `../trustrfq-maker-server/src/config.ts` / `signing.ts` | 38 / 100 | No bounds check on `SPREAD_BPS`; a value >10000 silently produces a negative signed `makerAmount` | ⚠️ Warning | Configuration-time footgun, not taker-exploitable |
| `../trustrfq-maker-server/api/rpc.ts` | 91-97 | Unclassified exceptions returned to any caller verbatim (wide-open CORS + no sanitization) | ⚠️ Warning | Information-disclosure smell, accepted-risk-adjacent but goes slightly beyond what was accepted |
| `../trustrfq-maker-server/scripts/live-proof.mjs` | 105-115 | Floating-point balance parsing in a script whose whole purpose is exact-stroop evidence | ⚠️ Warning | Contradicts the codebase's own "never float for money" convention; low practical risk at current amounts but philosophically inconsistent with the rest of the evidence chain |

(Full list, including 2 more warnings and 3 info items, in `.planning/phases/03-live-full-rfq-loop/03-REVIEW.md`; the remaining warnings are non-blocking robustness/documentation items, not re-litigated here since none of them contradict a must-have.)

### Human Verification Required

None. All items that required human judgment (cold-start latency, production-secret custody, the manual Freighter run, the D-07 merge decision) were already resolved via designed `checkpoint:human-verify`/`checkpoint:decision` gates during execution, and are independently corroborated by the orchestrator's own Horizon lookups. The CR-01 gap from the first verification pass was a clear-cut code defect (not an ambiguity) and has been closed and directly re-inspected.

### Gaps Summary

All four ROADMAP success criteria for Phase 3 are now achieved. A real, independently-verified
maker server is discovered exclusively through on-chain registry reads, returns genuinely signed
quotes, and settles on Testnet with exact balance deltas across two automated directions plus one
human-driven Freighter-signed transaction — five real Testnet transactions in total, all confirmed
successful on Horizon outside this session's own tooling.

The initial verification pass found one blocking gap: `tools/e2e/rfq-driver.mjs:263` hardcoded an
absolute path specific to the original author's machine inside `openTakerUsdcTrustline`, called
unconditionally on every run, breaking the reproducibility criterion for anyone else. This was
independently confirmed by this verifier and had already been flagged by the phase's own code
review (03-REVIEW.md CR-01). Commit `ad3d10c` closes it: the line now reads
`path.join(REPO_ROOT, 'demo-keys.json')`, matching every other read site in the same file.
Re-inspected directly in this pass: the prior literal is gone (`grep` for it returns zero matches)
and the file's syntax is still valid (`node --check` exits 0). No regression was introduced by the
fix (a one-line, mechanically identical change to four already-working sibling call sites).

The D-07 merge-to-main + post-merge production check remains an explicitly deferred, human/
`/gsd-ship`-owned follow-up, unchanged from the first pass — it is not one of the four ROADMAP
success criteria and does not affect this phase's passed status.

---

*Verified: 2026-09-14T17:30:00Z*
*Verifier: Claude (gsd-verifier)*
