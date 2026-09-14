# Deferred Items — Phase 3 (live-full-rfq-loop)

Out-of-scope discoveries logged per the executor's deviation rules (not fixed —
pre-existing, unrelated to the task that surfaced them).

## 03-02 Task 2: stub-lane (`npm run e2e:rfq`) fails at `d12-slow`, reproduces on unmodified HEAD

- **Found during:** Task 2's required regression run (`npm run e2e:rfq` after adding LIVE mode
  to `tools/e2e/rfq-driver.mjs`).
- **Symptom:** The happy path settles for real, then the very next scenario (`d12-slow`) times
  out after 20s waiting for the "No quotes available" empty card. Console log shows six
  `net::ERR_CONNECTION_REFUSED` entries.
- **Confirmed pre-existing and out of scope:** the driver at `HEAD` (commit `5515b25`, i.e.
  `git show HEAD:tools/e2e/rfq-driver.mjs`), with none of this plan's LIVE-mode changes applied,
  reproduces the identical failure at the identical step on this same machine in the same
  session. This was verified directly: the working-tree LIVE-mode file was backed up, replaced
  with the committed `HEAD` version, run, and the failure was byte-for-byte the same
  (`FAILED at step "d12-slow": locator.waitFor: Timeout 20000ms exceeded`), before the LIVE-mode
  file was restored.
- **Diff-based equivalence proof (why this task's changes are not the cause):** every stub-lane
  code path this task touches — the two `page.route` registrations, all D-12/discovery/retry/
  trustline scenario functions — was wrapped in `if (!LIVE_MODE) { ... }` with the interior
  body copy-pasted verbatim (confirmed via `git diff`); nothing inside those bodies was edited.
  With `REAL_MAKER_ADDRESS` unset, `LIVE_MODE` is `false` and every one of those blocks executes
  exactly the code that shipped before this task.
- **Likely cause (not investigated further, out of scope):** repeated back-to-back E2E/live runs
  against the same shared Testnet RPC endpoint and friendbot within one session (this task alone
  drove two full LIVE-mode runs plus two STUB-lane attempts in quick succession) — a resource/
  rate-limit condition on shared Testnet infrastructure, not a code defect in this repo.
- **Status:** deferred, not fixed. `npm run e2e:rfq` should be re-run in isolation (its own
  session, no prior back-to-back Testnet-heavy runs) before this is treated as a real defect.

### 03-03 follow-up: reproduced identically three more times, still HEAD-equivalent

- **Found during:** Plan 03-03's own required regression runs (`npm run e2e:rfq`), both against
  the working-tree LIVE-mode changes and against the unmodified pre-03-03 `HEAD` (same
  diff-equivalence technique as above: the working file was backed up, replaced with
  `git show HEAD:tools/e2e/rfq-driver.mjs`, run, restored).
- **Symptom:** byte-for-byte identical — `FAILED at step "d12-slow": locator.waitFor: Timeout
  20000ms exceeded` waiting for `.empty` with "No quotes available", with `net::ERR_CONNECTION_
  REFUSED` (or, in this session's second attempt, a bare timeout with no console errors) at the
  same step every time. Confirmed on THREE separate `npm run e2e:rfq` invocations this session
  (one against unmodified `HEAD`, two against the working tree after 03-03's Task 1/2/3 commits),
  all in the same step, none reached any D-12 scenario past the happy path.
- **Still out of scope for 03-03:** this task's changes touch only the `LIVE_MODE` branches
  (guarded by `if (LIVE_MODE) { ... }`/`if (!LIVE_MODE) { ... }`); the stub lane's D-12 loop body
  is untouched. The diff-equivalence proof from 03-02 was re-run and still holds.
- **Not yet tried:** a genuinely isolated session (fresh shell, zero prior Testnet-heavy runs in
  the preceding minutes) has still not been attempted — every run so far, in both 03-02 and
  03-03, followed at least one LIVE-mode run in the same session. This remains the next step
  before treating the pattern as anything other than shared-Testnet-infrastructure contention.
- **Status:** still deferred. Carried forward to whichever plan next needs a clean stub-lane
  regression signal.

## 03-02 Task 3: real-browser + real-Freighter manual verification deferred to 03-04

- **Found during:** Task 3's checkpoint (`npm run e2e:rfq:live` against the Vercel branch
  preview, human-approved 2026-09-14).
- **What happened:** the automated evidence for Task 3 was gathered in full — CSP header
  confirmed served on the preview (`connect-src` lists the maker origin), the mocked-Freighter
  live driver settled a genuinely new Testnet tx
  (`b3d35358ca0c671a7eab70e47d9746ded290d5869bb0bb8cb5b403a852cc1575`) against the deployed
  preview, and `cspViolations` came back non-empty but exclusively against pre-existing
  dead/orphaned registry entries, never the maker origin (see the SUMMARY's "Deviations from
  Plan" for the full 6-entry list and interpretation). The one item Task 3's `how-to-verify`
  asked for that automation cannot substitute for — opening the preview in an actual browser
  with the real Freighter extension installed, connecting, and watching the DevTools console
  live — was NOT performed in this session.
- **Human decision (2026-09-14):** deferred to Plan 03-04, which already carries its own task
  for a human-driven, recorded real-Freighter run. Not a gap in this plan's scope; it is simply
  scheduled later in the phase rather than duplicated here.
- **Status:** deferred, not skipped. Plan 03-04 owns closing this out.
