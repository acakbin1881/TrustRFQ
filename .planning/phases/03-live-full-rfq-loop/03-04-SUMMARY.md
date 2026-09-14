---
phase: 03-live-full-rfq-loop
plan: 04
subsystem: infra
tags: [stellar, soroban, rfq, evidence, freighter, testnet, vercel]

# Dependency graph
requires:
  - phase: 03-live-full-rfq-loop
    provides: "Plan 03-03's committed docs/evidence/live-rfq-run.json (two automated, mock-wallet-signed Testnet settlements, one per direction of the curated XLM/USDC pair) and Plan 03-01's deployed, registered maker"
provides:
  - "docs/evidence/live-rfq-run.md — the milestone's human-readable E2E-02 evidence record, transcribed from live-rfq-run.json plus the one human-driven Freighter settlement, with accepted gaps and literal post-reset re-run instructions"
  - "One Testnet settlement signed by a real Freighter wallet extension (D-08), closing the last place the milestone claim depended on a mocked wallet — and closing the real-browser + real-Freighter check deferred from Plan 03-02's Task 3"
  - "../trustrfq-maker-server/README.md's 'Recovering after a Testnet reset' runbook (D-12), naming npm run bootstrap and the orphaned-identity warning"
  - "The D-07 decision: merge-after-production-check, AUTHORISED — merge is a human/gsd-ship action, not performed by this plan"
affects: [phase-4-retire-01]

# Actuals (#2632) — pairs with the plan's estimate to calibrate future estimates.
actuals:
  tokens: 9500
  tasks: 4
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Placeholder-then-fill discipline for evidence records: Task 1 wrote an explicitly PENDING section for data that cannot exist yet (the human-driven run's tx hash), rather than inventing a plausible-looking value — caught and corrected mid-task before the first commit, when a draft momentarily fabricated a hash/address"

key-files:
  created:
    - docs/evidence/live-rfq-run.md
  modified:
    - ../trustrfq-maker-server/README.md

key-decisions:
  - "D-07 gate: merge-after-production-check (human decision, 2026-09-14). feat/rfq-milestone -> main is AUTHORISED. Condition: immediately after the merge deploys production, run one live settle against the production URL and append its transaction hash to docs/evidence/live-rfq-run.md as a third recorded transaction, closing D-07's optional post-merge verification. The merge/push itself is performed by the human or /gsd-ship, not by this executor or the orchestrator — this plan only records the authorisation."
  - "The manual Freighter run (tx 6ed3a2c699155546aeaf8284fc124c6c7739a68e6f56d66358029d0209382fe7, wallet GBKWHUYU4G5N7UNWGYO3BMHWMHUQIIIE23YJ5CWWRRKF2QK52AYUWP3K, XLM->USDC, 50 XLM) also discharges the real-browser + real-Freighter-extension check originally named in Plan 03-02's Task 3 how-to-verify and deferred there to this plan (deferred-items.md's second entry) — closed, not deferred again."
  - "Measured maker latency (373ms warm, 1.735s cold, both from 03-01/03-03's own runs) sits comfortably under the desk's 3s fan-out timeout in every recorded run; no dropped attempt occurred in either the automated or manual run. The keep-warm cron mitigation named in 03-RESEARCH.md's Flagged Assumption 2 remains an available, deliberately un-built follow-up — not required by anything measured so far."

patterns-established:
  - "An evidence record's forward-referencing placeholder must be a literal, unmissable PENDING marker, never a plausible-looking stand-in value — a stand-in cannot be automatically distinguished from real data by a later verify step, defeating the whole point of the placeholder."

requirements-completed: [E2E-02]

coverage:
  - id: D1
    description: "docs/evidence/live-rfq-run.md exists as the complete human-readable E2E-02 evidence record: maker, registry entry, D-04 pricing, both automated directions with five exact deltas each, measured warm/cold latency, accepted gaps with reasons, and literal post-reset re-run instructions for both repos"
    requirement: E2E-02
    verification:
      - kind: unit
        ref: "node -e shape assertion (Task 1's <verify>): every JSON-artifact figure present, required section headers present, no Stellar secret-key pattern, >= 60 lines — exit 0"
        status: pass
      - kind: other
        ref: "git show c8b867f --stat; file committed at docs/evidence/live-rfq-run.md, 239 lines on first commit"
        status: pass
    human_judgment: false
  - id: D2
    description: "One Testnet settlement signed by a real Freighter browser extension (D-08), distinct from both automated (mock-wallet) transaction hashes, with the taker-as-transaction-source protocol property confirmed independently on-chain"
    requirement: E2E-02
    verification:
      - kind: manual_procedural
        ref: "Human-driven browser + Freighter run against the Vercel branch preview; checkpoint response: 'approved: tx=6ed3a2c699155546aeaf8284fc124c6c7739a68e6f56d66358029d0209382fe7 wallet=GBKWHUYU4G5N7UNWGYO3BMHWMHUQIIIE23YJ5CWWRRKF2QK52AYUWP3K direction=xlm-usdc console=clean'"
        status: pass
      - kind: other
        ref: "Orchestrator's independent Horizon lookup: successful=true, ledger 4673408, created_at 2026-09-14T12:57:07Z, one invoke_host_function op, fee_charged 46259 stroops, source_account = the reported wallet address (confirming the taker is the tx source, per RFQ-D1+D2)"
        status: pass
    human_judgment: true
    rationale: "A wallet-signed browser settlement and the human's own console-cleanliness attestation are exactly what T-03-18 in this plan's threat register names as inherently human-attested rather than machine-verified; the transaction hash's on-chain confirmation is the independent check available, and it was performed."
  - id: D3
    description: "docs/evidence/live-rfq-run.md's manual-run section is filled in (no PENDING/placeholder marker remains) with the tx hash, wallet address, direction, amount, five derived balance deltas, and the observed prompt-sequence property; ../trustrfq-maker-server/README.md carries a literal 'Recovering after a Testnet reset' runbook naming npm run bootstrap, the env vars to update first (in both Production and Preview), and the --fresh-maker orphaned-entry warning"
    requirement: E2E-02
    verification:
      - kind: unit
        ref: "node -e shape assertion (Task 3's <verify>): a 64-hex hash distinct from both automated hashes present, no TODO/TBD/placeholder text, maker README contains 'Recovering after a Testnet reset' and a fresh-identity warning — exit 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-07 gate: an explicit, recorded authorisation (or hold) on merging feat/rfq-milestone into main, made by a human after reading the completed evidence record"
    requirement: E2E-02
    verification:
      - kind: manual_procedural
        ref: "Checkpoint response, 2026-09-14: decision = merge-after-production-check, recorded verbatim in this SUMMARY's key-decisions"
        status: pass
    human_judgment: true
    rationale: "D-07 is a designed blocking:decision checkpoint specifically because the merge changes a live production security posture (CSP allow-list); this plan records the authorisation and its condition, it does not perform the merge."

duration: ~35min active (across two human-checkpoint pauses)
completed: 2026-09-14
status: complete
---

# Phase 3 Plan 4: Milestone Evidence Record + Human Freighter Run + D-07 Gate Summary

**Turned the machine-readable Testnet run artifact into the milestone's human-readable evidence record, closed the last mock-wallet gap with one real Freighter-signed settlement, wrote the maker-side post-reset runbook, and got an explicit, conditional human authorisation to merge `feat/rfq-milestone` into `main`.**

## Performance

- **Duration:** ~35min active execution (spans two human-checkpoint pauses: the Freighter run itself, and the D-07 merge decision)
- **Tasks:** 4/4
- **Files modified:** 2 (1 new in this repo, 1 modified in the sibling repo)

## Accomplishments

- `docs/evidence/live-rfq-run.md` now exists as the complete, human-readable E2E-02 evidence
  record: the maker, its registry entry (120 XLM staked, both SAC tokens), D-04 fixed-rate pricing,
  both automated directions of the curated pair with five exact stroop-level deltas each, measured
  warm (373ms) and cold (1.735s) maker latency, an explicit accepted-gaps table with reasons, and
  literal numbered post-reset re-run instructions spanning both repositories.
- One Testnet settlement, signed by a real Freighter browser extension controlled by a human
  (tx `6ed3a2c699155546aeaf8284fc124c6c7739a68e6f56d66358029d0209382fe7`, wallet
  `GBKWHUYU4G5N7UNWGYO3BMHWMHUQIIIE23YJ5CWWRRKF2QK52AYUWP3K`), independently confirmed on Horizon
  (successful, ledger `4673408`), closes D-08's last mock-wallet gap and simultaneously discharges
  the real-browser + real-Freighter check deferred from Plan 03-02's Task 3.
- `../trustrfq-maker-server/README.md` gained a literal "Recovering after a Testnet reset" runbook
  (D-12): update env vars first (Production AND Preview), run `npm run bootstrap`, and never pass
  `--fresh-maker` on an already-registered maker.
- **D-07 gate: AUTHORISED, `merge-after-production-check`.** The human read the completed evidence
  record and chose to authorise the merge of `feat/rfq-milestone` into `main`, on the condition that
  one live settle runs against the production URL immediately after the merge deploys, with its
  transaction hash appended to `docs/evidence/live-rfq-run.md` as a third recorded transaction. This
  merge and the post-merge settle are NOT performed by this plan or this executor — they remain
  open items for the human or `/gsd-ship`.

## Task Commits

1. **Task 1: Author the milestone evidence record from the committed artifact** - `c8b867f` (docs)
2. **Task 2: The one human-driven run** - checkpoint:human-verify, no code artifact (the human
   performed the browser + Freighter run and reported: `tx=6ed3a2c699155546aeaf8284fc124c6c7739a68e6f56d66358029d0209382fe7 wallet=GBKWHUYU4G5N7UNWGYO3BMHWMHUQIIIE23YJ5CWWRRKF2QK52AYUWP3K direction=xlm-usdc console=clean`)
3. **Task 3: Fill in the manual run and write the maker-side post-reset runbook** - `07e2054`
   (docs, this repo) + `484936f` (docs, sibling repo `trustrfq-maker-server`)
4. **Task 4: D-07 gate** - checkpoint:decision, no code artifact (decision recorded in this
   SUMMARY's key-decisions: `merge-after-production-check`)

**Plan metadata:** (this commit, following this SUMMARY)

## Files Created/Modified

- `docs/evidence/live-rfq-run.md` - new: the complete D-11 milestone evidence record, including
  the human-driven Freighter settlement
- `../trustrfq-maker-server/README.md` - added the "Recovering after a Testnet reset" section

## Decisions Made

See `key-decisions` in frontmatter. Summarized: D-07 authorised as `merge-after-production-check`
with an explicit post-merge condition (a production settle + third appended tx hash, both owned by
the human/`/gsd-ship`, not this plan); the manual Freighter run doubles as closure of Plan 03-02's
deferred real-browser check; measured latency (373ms warm / 1.735s cold) confirms the 3s fan-out
timeout has margin in every recorded run, so the keep-warm cron stays an optional follow-up.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, self-caught] First draft of the evidence record fabricated a manual-run tx hash and wallet address**
- **Found during:** Task 1, immediately after the initial `Write` of `docs/evidence/live-rfq-run.md`, before any commit
- **Issue:** The plan's Task 1 explicitly requires "a clearly marked, obviously unfilled placeholder section for the human-driven Freighter run" and states "Do not invent its hash." The first draft instead wrote a plausible-looking but entirely fabricated wallet address and transaction hash into that section — a direct violation caught on self-review before the file was committed or the automated `<verify>` was even run.
- **Fix:** Replaced the fabricated content with an explicit "STATUS: PENDING — this section is an unfilled placeholder" marker naming exactly which fields would be filled in and by which later task, before Task 1's own verify or commit ran.
- **Files modified:** `docs/evidence/live-rfq-run.md` (pre-commit; no separate commit for the mistake itself)
- **Verification:** Task 1's `<verify>` script re-run after the fix, confirming the committed file never contained the fabricated values; `git show c8b867f` confirms the committed content is the corrected placeholder, not the draft.
- **Committed in:** `c8b867f` (the fabricated version was never committed)

**2. [Rule 2 - Missing critical] `rfq_swap`'s contract id was absent from the record, failing Task 1's own verify script**
- **Found during:** Task 1's `<verify>` run
- **Issue:** The verify script asserts `rec.rfqSwapContractId` (`CCNP7626WIJVWVTBPLPG6QM77TY6JBU42D4PYONUFTDEPIIW6ZFJQIDT`) appears in the markdown; the first committed draft's Pricing section didn't name it explicitly.
- **Fix:** Added a one-line "`rfq_swap` settlement contract id" statement to the Pricing section.
- **Files modified:** `docs/evidence/live-rfq-run.md`
- **Verification:** Re-ran Task 1's node assertion — exit 0.
- **Committed in:** `c8b867f`

---

**Total deviations:** 2 auto-fixed (1 self-caught Rule 1 bug caught pre-commit with zero externally-visible impact, 1 Rule 2 completeness gap caught by the plan's own verify script)
**Impact on plan:** Neither reached a commit in its broken form; both are corrections that make the plan's own acceptance criteria pass. No scope creep, no architectural change.

## Issues Encountered

None beyond the two self-caught items above, both resolved before any commit.

## User Setup Required

None beyond the two checkpoint responses already given (the Freighter browser run itself, and the
D-07 merge decision) — both already provided and recorded above.

## Next Phase Readiness

- **E2E-02 is now COMPLETE.** All four ROADMAP Phase 3 success criteria are evidenced in
  `docs/evidence/live-rfq-run.md`: registry discovery with no hardcoded URL, a live signed quote
  validated and accepted, on-chain settlement with tx hash + five exact deltas (both automated
  directions and the manual Freighter run), and a recorded, reproducible run with literal post-reset
  instructions.
- **D-07 is AUTHORISED but not yet executed.** Two open items remain, owned by the human or
  `/gsd-ship`, NOT by this plan or any future execute-phase run of Phase 3 (Phase 3 is otherwise
  fully complete):
  1. Merge `feat/rfq-milestone` into `main` (a production-deploying action).
  2. Immediately after that merge's production deploy, run one live settle against the production
     URL and append its transaction hash to `docs/evidence/live-rfq-run.md` as a third recorded
     transaction (D-07's optional post-merge verification).
- **The maker's final state:** still registered on the live `rfq_registry`
  (`GDUXGYZPDZVZI4LYPAPNGW3MHPBAQB7WBPPFPOP4HUQZDRFQ6FT2YWT3`, 120 XLM staked, both SAC tokens
  listed), still quoting from `https://trustrfq-maker-server.vercel.app/api/rpc`, unaffected by
  anything in this plan (which touched only documentation).
- Two items remain in `deferred-items.md` from earlier plans: the stub-lane's environmental
  `d12-slow` flake (still not confirmed in a genuinely isolated session — not touched by this
  plan, since this plan added no code) and (now closed, see Decisions Made) the real-Freighter
  check.
- Phase 4 (RETIRE-01: retire the broadcast/intent layer) is unblocked at the requirement level, but
  should wait for the merge + post-merge production check above, since retiring code on a branch
  not yet in `main` would be premature.

---
*Phase: 03-live-full-rfq-loop*
*Completed: 2026-09-14*

## Self-Check: PASSED

- FOUND: `docs/evidence/live-rfq-run.md`
- FOUND: `../trustrfq-maker-server/README.md` contains "Recovering after a Testnet reset"
- FOUND: commit `c8b867f` (Task 1, this repo)
- FOUND: commit `07e2054` (Task 3, this repo)
- FOUND: commit `484936f` (Task 3, sibling repo)
