---
phase: 02-desk-rfq-taker-path
plan: 05
subsystem: rfq-taker
tags: [stellar, soroban, rfq, playwright, e2e, csp, security-audit]

# Dependency graph
requires:
  - phase: 02-desk-rfq-taker-path
    provides: "Plans 02-01 through 02-04's complete RFQ taker path (discovery, validation, ranking, trustline pre-flight, price-guarded retry) and tools/e2e/rfq-driver.mjs's 12-scenario live proof this plan folds into the one documented census entry point"
provides:
  - "tools/e2e/run-all.mjs --lane otc|rfq|all — one documented entry point for both censuses; --lane rfq/all spawn tools/e2e/rfq-driver.mjs with the RUN_ID/PAIR env convention driver() already uses and a deterministic REPORT path"
  - "package.json's e2e:rfq script (--lane rfq shorthand)"
  - "tools/e2e/rfq-driver.mjs's module-scope uncaughtException/unhandledRejection handler — the stub maker now ejects on all three documented exit paths (success, scenario failure, uncaught exception)"
  - "CSP posture audit (T-02-23/T-02-24): vercel.json provably unchanged, dist/ inline-script-free and esm.sh-free, otc_swap wasm hash reconfirmed unmoved"
  - "README.md's extended RFQ census walkthrough + the by-hand maker-origin CSP curation rule"
affects: [phase-3-real-maker-server]

# Actuals (#2632)
actuals:
  tokens: 3751
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "run-all.mjs's --lane selector wraps the pre-existing OTC prep+driver sequence in a function unchanged (same statements, same order, same output format) so the default (no-flag) invocation is provably identical to before this phase"
    - "The RFQ lane funds/manages its own taker actor and stub maker internally (D-10) rather than reusing prepare-keys.mjs's OTC-actor mechanism — no OTC-style key prep runs for --lane rfq"
    - "Summary-line discipline: the RFQ lane's headline is the on-chain tx hash; the scenario roll-call is per-scenario regression detail, never framed as a performance/usability aggregate (POS-D1)"

key-files:
  created: []
  modified:
    - tools/e2e/run-all.mjs
    - tools/e2e/rfq-driver.mjs
    - package.json
    - README.md

key-decisions:
  - "Did not thread a persisted/reused taker key through the RFQ lane (unlike the OTC lane's e2e-keys.json convention) — tools/e2e/rfq-driver.mjs already self-funds a fresh Keypair.random() taker via Friendbot every run, proven reliable across many live sessions in 02-01..02-04; adding a second persistence mechanism was assessed as unnecessary risk to a working, thoroughly-live-tested 12-scenario flow for no acceptance-criterion benefit. RUN_ID/PAIR/REPORT env-var threading (what the plan's action text actually requires for 'the same convention') is implemented without touching taker key generation."
  - "get_urls_for_token continuing to list localhost:4174/4175 after a completed run is NOT evidence this plan's own eject is broken — verified directly via get_maker on the run's own maker addresses (Error(Contract, #6) NotRegistered = ejected, full refund) for three separate live runs (one success, one deliberately failed). The lingering URLs come from pre-existing orphaned registry entries under different addresses that happen to reuse tools/e2e/stub-maker.mjs's fixed default ports — the same documented cruft as the 127.0.0.1:4610 stray entry first noted in 02-01-SUMMARY.md, not a regression from this plan."

patterns-established:
  - "Deliberate-failure verification pattern for exit-path acceptance criteria: temporarily mutate one assertion to an impossible value, run live, confirm non-zero exit + resource cleanup via get_maker, revert the mutation before committing — used here to prove T-02-25 without leaving any test-only code in the committed diff."

requirements-completed: []

coverage:
  - id: D1
    description: "One documented command (npm run e2e:rfq) runs the full RFQ taker census headlessly against a locally spawned stub maker and settles for real on Stellar Testnet, exiting non-zero and still ejecting the stub maker on any scenario failure or uncaught exception (E2E-01)"
    requirement: "E2E-01"
    verification:
      - kind: e2e
        ref: "npm run e2e:rfq — two full live runs, 12/12 scenarios each, tx feef0989fe7114ccbfe37817e9b42309d4c1ed63178a09e1ac5035e324d49152 and c7dc430fe676d10f4f2e2d4998fd6749fc37112d5a68df668a5a25a3e04fa57c; a third run with the DRIFTED knob's expectedReason deliberately mutated to an impossible value exited non-zero (status=failed) and still ejected its maker (get_maker on GBMYLRSBDNM5KEIV6IXETEEOLI5VR6MP3BKI4ST26DQHTJUCWT77FJPC -> Error(Contract, #6) NotRegistered)"
        status: pass
      - kind: e2e
        ref: "npm run e2e:census (no --lane flag, default otc) — two live runs; first hit a transient Supabase-realtime flake (maker/taker status=failed, unrelated to this plan's diff — driver.mjs/lib.mjs/prepare-keys.mjs untouched), retry passed clean: status=ok both sides, same summary-line format as before this plan, tx 55459c0335f70e1a9715cafeeb5bb81051fd51facf90137d4d02b4dfd66a1b2c"
        status: pass
    human_judgment: false
  - id: D2
    description: "The deployed content-security-policy is provably unchanged this phase, the build stays inline-script/CDN-free, and the standing otc_swap wasm-hash guard is reconfirmed (CSP-01, no-change-is-correct posture per D-11)"
    requirement: "CSP-01"
    verification:
      - kind: other
        ref: "git diff --stat -- vercel.json (empty); grep -c localhost vercel.json (0); grep -c \"script-src 'self' 'wasm-unsafe-eval'\" vercel.json (1); connect-src still exactly 5 sources; grep -c '<script>' dist/otc.html (0); grep -rc esm.sh dist/ (0 everywhere)"
        status: pass
      - kind: unit
        ref: "cargo test --manifest-path contracts/Cargo.toml — 83/83 (otc_swap 6 + rfq_registry 60 + rfq_swap 17); stellar contract build reconfirms otc_swap.wasm sha256 83f60b854089d1a93644483968e04b5661fef3b6006966fdead4d1221b5a4df3 (unmoved)"
        status: pass
      - kind: other
        ref: "Observed browser-console CSP-violation count across all three live RFQ census runs this session: 0 (grep across tools/e2e/out/console-rfq-*.log for content-security-policy/csp/\"refused to\" — no matches); recorded as an observation per the plan's own verification:backstop framing (CSP-01 Assumption 2), not asserted as coverage of the deployed policy under a preview server that applies no headers at all"
        status: pass
    human_judgment: false
  - id: D3
    description: "Human verification of the RFQ panel against 02-UI-SPEC.md — Task 3, a blocking checkpoint:human-verify"
    verification:
      - check: "Real browser + real Freighter on Testnet, 2026-09-11: RFQ section renders in the desk's visual language; quote row showed 200 USDC for 100 XLM with ticking countdown, best row preselected, no maker address/URL exposed; empty amount disables the primary action; Accept produced exactly ONE Freighter prompt; settlement confirmed on-chain (tx c8efe29c8855dab7f6d58d786202d6ebcf10ff6b5b6f4c43c3340f1db6993206, taker demo-USDC 0 -> 200); tx-hash link opened a successful explorer transaction; compose/incoming/sent visually unaffected"
        status: pass
    human_judgment: true
    rationale: "Explicit checkpoint task per the plan; requires a real browser + real Freighter wallet exercising visual/interaction properties (nav label, spacing, countdown ticking, exactly-one-prompt settlement) that no headless assertion covers. Everything it depends on (the full taker path + this plan's Tasks 1-2) is already live-verified and passing."

duration: ~80min (live Testnet E2E runs dominate: 3x npm run e2e:rfq at ~2.5-5min each, 2x npm run e2e:census, cargo test + stellar contract build)
completed: 2026-09-11
status: complete
---

# Phase 2 Plan 5: E2E Census Wiring + CSP Posture Audit Summary

**`tools/e2e/run-all.mjs` gains a `--lane otc|rfq|all` selector (default `otc`, byte-for-byte unchanged behaviour) folding the RFQ taker census into the one documented entry point, plus a live-reconfirmed CSP posture audit proving `vercel.json` moved by zero bytes this phase — both proven live on Testnet, and Task 3's human verification of the panel passed on 2026-09-11 (approved; settlement tx c8efe29c…).**

## Performance

- **Duration:** ~80 min (dominated by live Testnet E2E runs: three full `npm run e2e:rfq` passes, two `npm run e2e:census` passes, `cargo test` + `stellar contract build`)
- **Completed:** 2026-09-11 (all 3 tasks; Task 3 human-verified and approved)
- **Tasks:** 3 of 3 (Task 3 was the blocking `checkpoint:human-verify`, approved by the developer)
- **Files modified:** 4 (`tools/e2e/run-all.mjs`, `tools/e2e/rfq-driver.mjs`, `package.json`, `README.md`)

## Accomplishments

- `tools/e2e/run-all.mjs` gained `--lane otc|rfq|all`. The default (`otc`, no flag) path is a pure wrap of the pre-existing prep+driver sequence — same statements, same order, same console output — so `npm run e2e:census` is provably unchanged. `--lane rfq`/`all` spawn `tools/e2e/rfq-driver.mjs` with `RUN_ID`/`PAIR` env vars (the same convention the OTC `driver()` helper already uses) and a deterministic `REPORT` path, print a headline transaction-hash summary line plus a per-scenario roll-call (never an interface-metric aggregate, per POS-D1), and propagate a non-zero exit on any scenario failure.
- `package.json` gained `e2e:rfq` (`--lane rfq` shorthand).
- `tools/e2e/rfq-driver.mjs` gained a module-scope `uncaughtException`/`unhandledRejection` handler so the stub maker is now ejected on all three exit paths the plan calls out — success and scenario failure were already covered by `main()`'s own `try`/`catch`; the third (a truly uncaught error escaping that block) is new.
- CSP posture audit: `vercel.json`'s diff is empty, `connect-src` still lists exactly its five pre-existing sources, `script-src` gained no inline allowance, `dist/` is inline-script-and-CDN-free, and `cargo test` + a fresh `stellar contract build` reconfirm `otc_swap.wasm`'s hash is unmoved (`83f60b85…`) — a phase that touched no contract left the standing repo guard exactly where it was.
- `README.md`'s "Run the headless end-to-end" section now documents `npm run e2e:rfq` / `--lane all` (replacing a stale direct `node tools/e2e/rfq-driver.mjs` invocation whose "9 scenarios" comment had drifted behind the real count of 12), plus the standing rule that a real maker origin joins `connect-src` by hand at deploy time, one origin at a time.

## Task Commits

1. **Task 1: Fold the RFQ lane into the census entry point** — `5515b25` (feat)
2. **Task 2: CSP posture audit and the phase artifact record** — `958a479` (docs)

Task 3 (checkpoint:human-verify, gate="blocking") was verified by the developer on 2026-09-11 and **approved**: real browser + real Freighter, 100 XLM -> 200 USDC settled on-chain (tx `c8efe29c8855dab7f6d58d786202d6ebcf10ff6b5b6f4c43c3340f1db6993206`), exactly one wallet prompt, working explorer link, other sections visually unaffected.

Three real-world findings surfaced during the manual verification (none required code changes, all worth knowing):

1. **Stub maker's default port (4174) collides with vite preview's auto-bump.** `npm run preview -- --port 4173` silently bumps to 4174 when 4173 is occupied, which is exactly the stub maker's default; the maker then registers on-chain but crashes on EADDRINUSE *after* registration (setup registers before `startHttp()`), leaving a dead registry entry. Workaround: `STUB_MAKER_PORT=4180 node tools/e2e/stub-maker.mjs`. A future tweak could bind first and register second, or default the port away from vite's range.
2. **The panel's empty state can't distinguish maker errors from timeouts.** A maker that *responds quickly with a JSON-RPC error* (here: recording-sim `Error(Contract, #10)` — SAC insufficient balance) renders the same "No registered maker responded in time" copy as a dead maker. Cosmetic, but it sent the manual verification down a network-debugging path when the actual cause was economic.
3. **Quote capacity is bounded by the maker's inventory, invisibly.** The stub maker (RATE=2, 1000 demo-USDC inventory) can sign at most a 500-XLM sell; a 1000-XLM request fails inside the maker's own recording-mode signing simulation (the SAC transfer actually executes there). This is the settlement guarantee working as designed — a maker literally cannot sign a quote it cannot fill — but a real maker server will want to advertise or clamp its size limits.

## Files Created/Modified

- `tools/e2e/run-all.mjs` — `--lane otc|rfq|all` selector; `runOtcLane()`/`runRfqLane()` helpers; headline-tx-hash summary line for the RFQ lane
- `tools/e2e/rfq-driver.mjs` — `RUN_ID`-aware `REPORT` default; module-scope `uncaughtException`/`unhandledRejection` eject handler; header-comment documentation of the 02-05 wiring
- `package.json` — `e2e:rfq` script
- `README.md` — extended E2E walkthrough (e2e:rfq/--lane all, corrected scenario count) + the by-hand maker-origin CSP curation note

## Decisions Made

See `key-decisions` in frontmatter: (1) the RFQ lane's taker/maker actors stay self-funded inside `rfq-driver.mjs`/`stub-maker.mjs` rather than adopting `prepare-keys.mjs`'s OTC-actor persistence pattern, since the existing self-funding mechanism is already proven reliable across four prior plans' live sessions and the plan's actual requirement (RUN_ID/PAIR env-var threading) doesn't need it; (2) the lingering `localhost:4174`/`4175` entries in `get_urls_for_token` after a completed run are pre-existing orphaned-port cruft (same class as the documented `127.0.0.1:4610` stray entry), not evidence of a broken eject — confirmed directly via `get_maker` on this plan's own runs' specific maker addresses.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] README's RFQ scenario count had drifted from 9 to the real 12**
- **Found during:** Task 2, editing the "Run the headless end-to-end" section the plan explicitly scoped this task to
- **Issue:** The pre-existing walkthrough's comment read "RFQ lane: spawns the stub maker, 9 scenarios" — stale since Plan 02-04 added RETRY_EQUAL/RETRY_WORSE/TRUSTLINE (12 total), a drift that predates this plan but sits inside the exact section Task 2's action text scoped in ("the RFQ census walkthrough lands beside the existing E2E walkthrough").
- **Fix:** Corrected to 12 while rewriting the section for the new `e2e:rfq`/`--lane all` commands.
- **Files modified:** `README.md`
- **Verification:** Matches the live `SCENARIOS 12 (expected 12)` line from every `npm run e2e:rfq` run this session.
- **Committed in:** `958a479`

---

**Total deviations:** 1 (a documentation drift correction, in-scope for the section being edited)
**Impact on plan:** No scope creep — the fix is inside the exact walkthrough section Task 2's action text names, not a broader README rewrite.

## Issues Encountered

- **Port collision with a concurrent worktree's preview server (environmental, not a plan defect).** Port 4173 was already bound by a *different* git worktree's `vite preview` process (confirmed via `lsof` + `ps` — cwd pointed at `agent-a6963f255e4559026`, not this worktree) serving unrelated content (404 on `/otc.html`). Per the destructive-git-prohibition discipline this worktree must never touch another agent's process, so this worktree's own build was served on an alternate free port (4180) instead, and every live E2E run used `BASE_URL=http://localhost:4180/otc.html` (both `tools/e2e/rfq-driver.mjs` and `tools/e2e/lib.mjs`'s `cfgFromEnv()` already support this override — no code change needed). This worktree's own throwaway preview server (pid 43248) was stopped after verification completed. This is purely a side effect of this machine running multiple concurrent worktrees against the same fixed default port (documented precedent: 02-04-SUMMARY.md's own port-collision findings for the stub-maker's fixed 4174/4175/4177 ports); the human resuming at Task 3 should use whatever port is actually free at that time and adjust `BASE_URL` in the plan's own step 1 command accordingly if 4173 is still occupied by another worktree.
- **First `npm run e2e:census` run hit a transient Supabase-realtime flake** (maker driver: "thread for run … not found in 'sent'"), unrelated to this plan's diff (`driver.mjs`, `lib.mjs`, `prepare-keys.mjs` are all untouched by this plan). A second run passed clean with the identical output shape. Consistent with this codebase's own documented precedent of transient live-dependency flakiness (02-01-SUMMARY.md, 02-02-SUMMARY.md).
- **The pre-existing stray/orphaned registry entries** (`http://127.0.0.1:4610`, first noted in 02-01-SUMMARY.md, plus additional orphaned entries under `localhost:4174`/`4175` from earlier interrupted sessions predating this plan) remain on the live `rfq_registry`. Not introduced by this plan and out of scope to clean up (no known private key for any of them); verified via `get_maker` that none of THIS plan's own runs' maker addresses are among them.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**This plan is NOT complete.** Task 3 (`checkpoint:human-verify`, `gate="blocking"`) is next: a human must run `npm run build && npm run preview -- --port 4173`, run `node tools/e2e/stub-maker.mjs` in a second terminal, open the desk in a real browser with a real Freighter wallet on Testnet, and verify the RFQ panel against `02-UI-SPEC.md`'s ten numbered checks (nav label, panel spacing/visual language, discovery line, ranked/preselected rows with live countdowns, refresh behaviour, disabled-on-empty-amount state, exactly-one-signature settlement with a linked tx hash, and that the other three desk sections still work). Everything that checkpoint depends on — the full taker path (Plans 02-01 through 02-04) and this plan's own census/CSP work — is already live-verified and passing; nothing here blocks that verification from succeeding.

Once Task 3 is approved, the orchestrator should: run the plan's overall `<verification>` block one more time if desired, update `STATE.md`/`ROADMAP.md`/`REQUIREMENTS.md` (mark `E2E-01`/`CSP-01` complete — this SUMMARY deliberately left `requirements-completed: []` empty pending that final gate), and record the plan as fully `complete`.

---
*Phase: 02-desk-rfq-taker-path*
*Completed: 2026-09-11 (Tasks 1-2; Task 3 pending human verification)*

## Self-Check: PASSED

Both claimed modified files' diffs verified present in their respective commits (`5515b25` for
`tools/e2e/run-all.mjs`/`tools/e2e/rfq-driver.mjs`/`package.json`, `958a479` for `README.md`); both
commit hashes verified present via `git log --oneline -5`. Live Testnet tx hashes
(`feef0989…`, `c7dc430f…`, `55459c03…`) and `get_maker`/`cargo test`/`stellar contract build`
outputs quoted above were captured directly from this session's own command output, not recalled
from memory.
