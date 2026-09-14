---
phase: 03-live-full-rfq-loop
plan: 02
subsystem: infra
tags: [stellar, soroban, rfq, csp, vercel, playwright, e2e, json-rpc]

# Dependency graph
requires:
  - phase: 03-live-full-rfq-loop
    provides: "Plan 03-01's deployed maker (https://trustrfq-maker-server.vercel.app, GDUXGYZPDZVZI4LYPAPNGW3MHPBAQB7WBPPFPOP4HUQZDRFQ6FT2YWT3) registered on the live rfq_registry with a real 120 XLM stake"
provides:
  - "CSP-01 closure: vercel.json connect-src allow-lists the maker's exact https origin, no wildcard"
  - "tools/e2e/rfq-driver.mjs LIVE mode (REAL_MAKER_ADDRESS-gated): resolveRealMaker/readRegisteredMaker learn the maker url from a genuine on-chain get_maker read, zero page.route interception, zero spawned child process"
  - "npm run e2e:rfq:live: the reproducible half of the E2E-02 evidence chain"
  - "Two independently-settled Testnet transactions proving the live loop end-to-end (local preview + Vercel branch preview)"
affects: [03-03, 03-04]

# Actuals (#2632) — pairs with the plan's estimate to calibrate future estimates.
actuals:
  tokens: 16000
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "readRegisteredMaker mirrors src/data/rfqNetwork.ts's simulateRead exactly (zero-balance source account, get_maker call, scValToNative) — the driver's on-chain read path is a direct port of the production read path, not a parallel reimplementation"
    - "LIVE mode is threaded through the existing driver via `if (!LIVE_MODE) { ... }` guards around every stub-only code path (both page.route registrations, the entire D-12/discovery/retry/trustline scenario sequence) rather than a separate code path — every guarded body is byte-identical to what shipped before this task, verified by diffing against the unmodified HEAD version while investigating the stub-lane regression run"
    - "installCspCapture: a deterministic addInitScript listener on `securitypolicyviolation`, read back via page.evaluate at the end of the run — turns 'the browser didn't complain' into an inspectable array instead of a console-string guess"

key-files:
  created:
    - .planning/phases/03-live-full-rfq-loop/deferred-items.md
  modified:
    - vercel.json
    - public/otc-config.js
    - tools/e2e/rfq-driver.mjs
    - package.json

key-decisions:
  - "readRegisteredMaker stringifies the on-chain i128 `staked` field before returning it — scValToNative decodes it as a BigInt, and JSON.stringify (Tally.writeReport) cannot serialize one; caught live as an unhandled rejection immediately AFTER a real settlement had already succeeded"
  - "Non-empty `cspViolations` from the Vercel branch-preview run is ACCEPTED as satisfying Task 3's checkpoint (human-approved 2026-09-14): all 6 entries are connect-src blocks against pre-existing dead/orphaned rfq_registry entries (the permanent 127.0.0.1:4610 stray plus localhost:4174/4175/4180 orphaned stub-maker registrations from earlier test runs on this shared live registry), never the maker's own origin. The desk's own discovery read returns the intersection of every URL ever registered for the pair, including these; the CSP correctly blocks the ones outside the allow-list (T-03-08's mitigation working as designed), while the real maker's fetch and settlement produced zero violations."
  - "The real-browser + real-Freighter-extension manual verification named in Task 3's how-to-verify was DEFERRED to Plan 03-04 (human decision, 2026-09-14), which already carries its own task for a recorded human Freighter run. Not performed in this session; see deferred-items.md."
  - "requirements-completed left empty for E2E-02, matching 03-01-SUMMARY's precedent: 03-03 (second direction) and 03-04 (merge-to-main + human Freighter evidence) both still list E2E-02 in their own frontmatter, so the milestone gate is not yet fully closed by this plan alone"

patterns-established:
  - "Diff-equivalence proof as a debugging technique: when a regression run failed identically on both the working-tree change AND the unmodified HEAD version of the same file (verified by temporarily swapping the file back to `git show HEAD:...`), that is sufficient evidence the failure predates the current task and is out of scope, without needing to root-cause the underlying environmental cause further"

requirements-completed: []

coverage:
  - id: D1
    description: "vercel.json connect-src gains the maker's exact https origin (https://trustrfq-maker-server.vercel.app), no scheme/host wildcard, script-src byte-for-byte unchanged; public/otc-config.js's Testnet-reset checklist now points at the maker repo's npm run bootstrap re-registration step"
    requirement: E2E-02
    verification:
      - kind: unit
        ref: "node -e CSP assertion (connect-src contains MAKER_ORIGIN, no wildcard source, script-src unchanged) — exit 0"
        status: pass
      - kind: other
        ref: "npm run build (tsc --noEmit && vite build) — dist/otc.html has 3 script tags, all carrying a src attribute, zero inline scripts; npm test — 13 files, 192 tests, all pass"
        status: pass
    human_judgment: false
  - id: D2
    description: "tools/e2e/rfq-driver.mjs LIVE mode: REAL_MAKER_ADDRESS-gated, spawns no stub-maker child process, registers zero page.route interception, learns the maker's url exclusively from an on-chain get_maker read (readRegisteredMaker/resolveRealMaker), and settles one real XLM->USDC swap through the browser"
    requirement: E2E-02
    verification:
      - kind: e2e
        ref: "npm run e2e:rfq:live against a local vite preview — exit 0, report mode=LIVE, makerUrlOnChain=https://trustrfq-maker-server.vercel.app/api/rpc, registryEntry.staked=1200000000, directions[0].txHash=b99aef1cf14c282136ffdffbdd9c672e6dfc558bfdc613eb0aac526adc4b706e (64-hex), counts.promptsByType.SUBMIT_TRANSACTION=1, attempts non-empty with makersFound/rowCount on every attempt"
        status: pass
      - kind: other
        ref: "node --check tools/e2e/rfq-driver.mjs; shape assertion (no hardcoded maker origin in non-comment code, REAL_MAKER_ADDRESS + get_maker present); grep -c page.route unchanged at 4 (before vs after this task's diff)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The live loop settles from a real Vercel branch-preview deployment of feat/rfq-milestone with the CSP header genuinely served and the maker origin reachable with zero violations against it"
    requirement: E2E-02
    verification:
      - kind: e2e
        ref: "curl -sI <preview>/otc | grep content-security-policy — connect-src lists the maker origin; npm run e2e:rfq:live against the preview — exit 0, settled tx b3d35358ca0c671a7eab70e47d9746ded290d5869bb0bb8cb5b403a852cc1575, independently confirmed successful:true on Horizon (ledger 4672184)"
        status: pass
      - kind: manual_procedural
        ref: "Task 3 checkpoint approval, 2026-09-14: \"approved: preview=https://trustrfq-git-feat-rfq-milestone-acakbin1418-9430s-projects.vercel.app tx=b3d35358ca0c671a7eab70e47d9746ded290d5869bb0bb8cb5b403a852cc1575 csp=clean-for-maker-origin\" — explicitly accepting the non-empty-but-maker-origin-clean cspViolations interpretation and deferring the real-Freighter-browser check to 03-04"
        status: pass
    human_judgment: true
    rationale: "The cspViolations interpretation (accepting non-empty-but-maker-origin-clean as satisfying the checkpoint) and the decision to defer the real-browser+real-Freighter check to 03-04 both required a human judgment call this session could only surface, not make unilaterally."

duration: ~1h10m active (across two work sessions spanning a checkpoint pause)
completed: 2026-09-14
status: complete
---

# Phase 3 Plan 2: CSP Closure + Live-Maker Driver Mode Summary

**Closed CSP-01 by allow-listing the maker's exact origin, taught `tools/e2e/rfq-driver.mjs` a `REAL_MAKER_ADDRESS`-gated LIVE mode that discovers the maker on-chain and spawns/patches nothing, and settled two independent real Testnet swaps (local preview + Vercel branch preview) proving the loop end-to-end.**

## Performance

- **Duration:** ~1h10m active execution (spans a checkpoint pause for human review)
- **Started:** 2026-09-14T10:59:00Z (approx)
- **Completed:** 2026-09-14T11:20:00Z (approx)
- **Tasks:** 3/3
- **Files modified:** 4 (+1 new deferred-items.md)

## Accomplishments

- `vercel.json` `connect-src` now allow-lists `https://trustrfq-maker-server.vercel.app` literally — no scheme- or host-wildcard, `script-src` untouched
- `public/otc-config.js`'s `RFQ_REGISTRY_ID` comment block extended with the maker repo's `npm run bootstrap` re-registration pointer for a future Testnet reset (D-12)
- `tools/e2e/rfq-driver.mjs` gained a LIVE mode: `readRegisteredMaker`/`resolveRealMaker` learn the maker's URL exclusively from a genuine on-chain `get_maker` simulation (mirroring `src/data/rfqNetwork.ts`'s production read path), `runLiveDirection` drives the happy path with every fan-out attempt recorded, `installCspCapture` deterministically captures `securitypolicyviolation` events, and a warm-up OPTIONS request measures cold-start risk (`warmupMs`)
- `npm run e2e:rfq:live` (new script) settled **two independent, real Testnet transactions** through the browser:
  - Local preview: `b99aef1cf14c282136ffdffbdd9c672e6dfc558bfdc613eb0aac526adc4b706e`
  - Vercel branch preview (`feat/rfq-milestone`): `b3d35358ca0c671a7eab70e47d9746ded290d5869bb0bb8cb5b403a852cc1575` (independently confirmed `successful: true`, ledger 4672184, via Horizon)
- Confirmed the CSP header is genuinely served on the branch preview and the maker's origin is present in `connect-src`

## Task Commits

1. **Task 1: Add maker origin to CSP allow-list, extend reset checklist** - `035bc16` (feat)
2. **Task 2: Teach the RFQ driver a live-maker mode that spawns nothing and patches nothing** - `38ff089` (feat)

Task 3 was a `checkpoint:human-verify` (gate="blocking") — no code artifact of its own; approved 2026-09-14 with two explicit interpretive decisions (see Deviations below). This plan-completion metadata is captured in the commit that follows this SUMMARY.

## Files Created/Modified

- `vercel.json` - `connect-src` gains the maker's exact origin
- `public/otc-config.js` - Testnet-reset checklist extended with the maker repo's re-bootstrap pointer
- `tools/e2e/rfq-driver.mjs` - LIVE mode: `readRegisteredMaker`, `resolveRealMaker`, `installCspCapture`, `runLiveDirection`, `usdcSacId`; every existing stub-lane code path guarded with `if (!LIVE_MODE)`, unchanged internally
- `package.json` - new `e2e:rfq:live` script
- `.planning/phases/03-live-full-rfq-loop/deferred-items.md` - new: two out-of-scope/deferred findings from this plan's verification (stub-lane regression environmental flake; real-Freighter check deferred to 03-04)

## Decisions Made

See `key-decisions` in frontmatter. Summarized: stringify the on-chain `staked` BigInt at the read boundary (bug fix, caught live); accept a non-empty-but-maker-origin-clean `cspViolations` result as satisfying Task 3 (human-approved interpretation); defer the real-browser+real-Freighter manual check to Plan 03-04; leave `requirements-completed` empty for E2E-02 since 03-03/03-04 still carry open scope against it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `readRegisteredMaker`'s on-chain `staked` field crashed report serialization**
- **Found during:** Task 2, first live run against the local preview (after a genuine settlement had already succeeded)
- **Issue:** `scValToNative` decodes the contract's i128 `staked` field as a native BigInt; `JSON.stringify` (used by `Tally.writeReport`) cannot serialize a BigInt, and the process crashed with an unhandled rejection immediately after a real Testnet settlement completed.
- **Fix:** `readRegisteredMaker` now returns `{ ...entry, staked: entry.staked.toString() }` at the read boundary, rather than patching every later call site.
- **Files modified:** `tools/e2e/rfq-driver.mjs`
- **Verification:** Re-ran the same live command; report wrote cleanly with `registryEntry.staked: "1200000000"`.
- **Committed in:** `38ff089` (Task 2 commit)

**2. [Rule 1 - Bug, self-caught] New comment prose accidentally inflated the `page.route` occurrence count**
- **Found during:** Task 2's own acceptance criterion (`grep -c "page.route"` must be unchanged from before this task)
- **Issue:** Three new header/inline comments describing the LIVE-mode guards used the literal substring "page.route" in prose, moving the grep count from 4 to 7 even though no new route registration was added.
- **Fix:** Reworded the three comments to say "request interception" instead of "page.route", restoring the count to 4.
- **Files modified:** `tools/e2e/rfq-driver.mjs`
- **Verification:** `grep -c "page.route" tools/e2e/rfq-driver.mjs` → 4, matching the pre-task baseline (`git show HEAD~2:tools/e2e/rfq-driver.mjs | grep -c page.route`).
- **Committed in:** `38ff089` (Task 2 commit)

### Interpretive Decisions (human-approved at the Task 3 checkpoint)

**3. Non-empty `cspViolations` accepted as satisfying the "zero CSP violations" criterion**
- **Found during:** Task 3, the live run against the Vercel branch preview
- **What was observed:** the report's `cspViolations` array carried 6 entries, ALL `connect-src` blocks:
  ```json
  [
    { "blockedURI": "http://127.0.0.1:4610/", "violatedDirective": "connect-src" },
    { "blockedURI": "http://localhost:4174/", "violatedDirective": "connect-src" },
    { "blockedURI": "http://localhost:4175/", "violatedDirective": "connect-src" },
    { "blockedURI": "http://localhost:4174/", "violatedDirective": "connect-src" },
    { "blockedURI": "http://localhost:4174/", "violatedDirective": "connect-src" },
    { "blockedURI": "http://localhost:4180/", "violatedDirective": "connect-src" }
  ]
  ```
  `documentURI` on every entry was the preview's own `/otc` page.
- **Root cause:** the desk's own discovery read (`get_urls_for_token`) returns the intersection of every URL ever registered on the live `rfq_registry` for the XLM/USDC pair, including two classes of dead entries: the permanent, un-ejectable stray `http://127.0.0.1:4610` (documented in this file's own header comment since Plan 02-03, no known private key) and orphaned `localhost:4174/4175/4180` stub-maker registrations from earlier test runs on this same shared live registry (their `Keypair.random()` secrets were held only in crashed processes' memory, never persisted, so nothing can eject them). The CSP correctly blocks every one of these because they are not the allow-listed maker origin — this is T-03-08's mitigation ("a hostile registry entry pointing at an unlisted origin is blocked by the browser before any request leaves") working exactly as designed. **The maker's own origin (`https://trustrfq-maker-server.vercel.app`) produced zero violations** — its fetch and the resulting settlement both went through cleanly.
- **Decision:** did NOT filter discovery results or attempt to eject the stray/orphaned entries — both are explicitly out of bounds (LIVE mode must register zero request interception per Task 2's own success criterion, and no key exists for any of the dead entries). Surfaced the full finding at the Task 3 checkpoint. Human approved with `csp=clean-for-maker-origin`, explicitly accepting "zero violations for the maker origin; non-empty only for pre-existing dead/orphaned registry entries" as satisfying the checkpoint.
- **Files modified:** none (interpretive decision, not a code change)
- **Verification:** the 6-entry list above, cross-checked against every `blockedURI` — none references `trustrfq-maker-server.vercel.app`.

**4. Real-browser + real-Freighter-extension manual check deferred to Plan 03-04**
- **Found during:** Task 3's `how-to-verify`, step 5 (open the preview in a real browser with a real Freighter wallet and watch DevTools)
- **Decision:** deferred to Plan 03-04, which already carries its own task for a recorded human Freighter run against the live loop. Not performed in this session.
- **Files modified:** none
- **Committed in:** `.planning/phases/03-live-full-rfq-loop/deferred-items.md` documents this deferral (see that file's second entry)

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs, caught live during verification, zero scope creep) + 2 human-approved interpretive decisions at the Task 3 checkpoint (documented above, not hidden)
**Impact on plan:** Both bug fixes were necessary corrections surfaced by running the actual live loop against a real remote server for the first time; the interpretive decisions resolve genuine ambiguity in how a shared, polluted live Testnet registry interacts with a literal "zero violations" acceptance criterion, without weakening the underlying security claim (the maker origin itself is clean).

## Issues Encountered

- **`npm run e2e:rfq` (the stub lane) failed at the `d12-slow` scenario during this task's required regression run**, with `net::ERR_CONNECTION_REFUSED` in the console log. Investigated by temporarily swapping the working file back to the unmodified `git show HEAD:tools/e2e/rfq-driver.mjs` version and re-running: the identical failure reproduced at the identical step, proving this predates this task's changes and is environmental (most likely: repeated back-to-back Testnet-heavy runs — two LIVE-mode runs plus two STUB-lane attempts — exhausting some shared rate limit within one session), not a code defect introduced here. Documented in `deferred-items.md`; not fixed, per the executor's scope-boundary rule (only fix issues directly caused by the current task's changes).
- A stale `vite preview` process was already bound to port 4173 from a prior session and serving 404s; killed and restarted cleanly before any verification ran.

## User Setup Required

None - no external service configuration required. The plan pushed `feat/rfq-milestone` to origin (preview-only; production still tracks `main` and was not touched) and used the already-linked `vercel` CLI (via `npx`) to resolve and inspect the branch preview.

## Next Phase Readiness

- CSP-01 is closed: the maker origin is allow-listed and proven reachable from both a local preview and the real Vercel branch preview.
- `npm run e2e:rfq:live` is ready for Plan 03-03's second direction (`LIVE_DIRECTIONS`) and `LIVE_RECORD` evidence file work — `runLiveDirection` already only implements `xlm-usdc`, by design, leaving the second direction to that plan.
- E2E-02 remains OPEN at the milestone level (`requirements-completed: []`, matching 03-01-SUMMARY's precedent): this plan proves the CSP + live-driver half, but 03-03 (second direction, `LIVE_RECORD`) and 03-04 (merge-to-main gate + the deferred real-Freighter human run) still carry open scope against the same requirement ID.
- Two open items carried forward in `deferred-items.md`: the stub-lane's environmental `d12-slow` failure (re-run in isolation to confirm it clears), and the real-browser+real-Freighter check (owned by 03-04).
- No blockers for 03-03: the live maker, its registry entry, and the LIVE-mode driver scaffolding are all proven and ready to extend.

---
*Phase: 03-live-full-rfq-loop*
*Completed: 2026-09-14*
