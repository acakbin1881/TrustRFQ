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
