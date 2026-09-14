---
phase: 03-live-full-rfq-loop
plan: 03
subsystem: infra
tags: [stellar, soroban, rfq, e2e, playwright, balance-deltas, evidence, json-rpc]

# Dependency graph
requires:
  - phase: 03-live-full-rfq-loop
    provides: "Plan 03-02's CSP-01 closure (maker origin allow-listed) and LIVE-mode driver scaffolding (readRegisteredMaker/resolveRealMaker/installCspCapture/runLiveDirection for xlm-usdc only)"
provides:
  - "D-09: the second LIVE direction (usdc-xlm) settling through the real deployed maker, driven via the desk's actual custom token listbox (selectToken), in the same browser session as the first direction"
  - "D-11: five exact stroop-level balance-delta assertions per settlement (taker/maker/feeCollector across both legs), derived from rfq_swap's own live get_config and Horizon's own fee_charged — never a tolerance"
  - "The committed, secret-free D-11 evidence artifact docs/evidence/live-rfq-run.json, produced by a canonical run against the real Vercel branch preview with two independently-Horizon-confirmed Testnet transactions"
affects: [03-04]

# Actuals (#2632) — pairs with the plan's estimate to calibrate future estimates.
actuals:
  tokens: 10700
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Passive network observation via page.on('response') (never page.route()/fulfill()) to read the maker's exact quoted order (feeBps, makerAmount, takerAmount as decimal strings) off a JSON body the browser already buffered — reusing the existing request/requestfinished counter pattern rather than introducing any form of interception into LIVE mode, which by design registers none"
    - "directionDescriptor as the single seam generalizing runLiveDirection from an XLM-is-always-the-sell-side assumption to any direction of the curated pair — sellCode/buyCode drive both the token-picker clicks (selectToken) and the delta math (expectedDeltasFor), so the two can never drift apart"
    - "toAtomic duplicated (not imported) from src/core/rfq/order.ts into the plain-Node driver script, matching the project's existing convention of mirroring src/ read/encode logic into tools/ scripts that have no TS loader (readRegisteredMaker already does this for simulateRead)"

key-files:
  created:
    - docs/evidence/live-rfq-run.json
  modified:
    - tools/e2e/rfq-driver.mjs
    - .planning/phases/03-live-full-rfq-loop/deferred-items.md

key-decisions:
  - "WalletContext.tsx restores the wallet connection from localStorage on every page load, including a page.reload() between directions — verified live (#connectBtn stayed hidden 34 straight polls after a reload). The between-directions reconnect logic detects which element actually renders (wallet chip vs. connect button) rather than blindly repeating the first connect sequence, which hung indefinitely against the always-already-connected fast path."
  - "Self-caught bug (Rule 1, fixed before Task 3 ran): the original draft read window.__cspViolations a second time, unconditionally, right before writing the report — after the per-direction reads inside the loop already had it. Against a reloading multi-direction run this would have double-counted the last direction's violations. Fixed by removing the redundant read; the per-direction capture (right after each settle, before that direction's own reload resets the page-scoped array) is sufficient and correct."
  - "Applied 03-02's human-approved cspViolations interpretation to the SAME recurring fact pattern in Task 3, rather than treating it as a fresh ambiguity needing a new checkpoint: the canonical Vercel run's cspViolations carries 12 entries (up from 03-02's 6 — one full set of the same pre-existing dead/orphaned rfq_registry entries per direction, since two directions each ran their own discovery pass), and zero of them reference the maker's own origin. Task 3 is type=\"auto\" in this plan (no checkpoint gate), and the underlying fact — a shared, permissionless live Testnet registry carries un-ejectable stray entries with no known keys, documented since Plan 02-01/02-03 — is unchanged from 03-02, so re-litigating the same interpretation with a fresh human ask would add no information."
  - "requirements-completed left empty for E2E-02, matching 03-01/03-02 precedent: Plan 03-04 still owns the merge-to-main gate and the deferred real-Freighter human-browser check named in 03-02's Task 3 how-to-verify, so the milestone requirement is not yet fully closed by this plan alone."

patterns-established:
  - "A directionDescriptor object (sellCode/buyCode/sellToken/buyToken/sellAmount) as the one seam a LIVE-mode driver threads through both its UI-interaction layer (selectToken) and its financial-assertion layer (expectedDeltasFor) — adding a third direction to a future curated pair means adding one descriptor, not touching either layer's logic."

requirements-completed: []

coverage:
  - id: D1
    description: "LIVE_DIRECTIONS defaults to both xlm-usdc and usdc-xlm, driven sequentially in one browser session against one funded taker; selectToken drives the desk's real custom token listbox; fundTakerUsdc mints demo USDC so the taker can sell it in the second direction; between directions the page is reloaded and the wallet auto-reconnects from localStorage"
    requirement: E2E-02
    verification:
      - kind: e2e
        ref: "npm run e2e:rfq:live against the local preview — exit 0, directions.length=2 with direction values xlm-usdc/usdc-xlm, two distinct 64-hex txHash values, both settleEventError=false, counts.promptsByType.SUBMIT_TRANSACTION=2, npm run e2e:rfq (stub lane) still exercises its own D-12/discovery/retry/trustline scenarios unaffected by the LIVE-mode-only changes"
        status: pass
      - kind: other
        ref: "node --check tools/e2e/rfq-driver.mjs; npm run build clean (tsc --noEmit && vite build, zero inline scripts)"
        status: pass
    human_judgment: false
  - id: D2
    description: "snapshotBalances/readSwapConfig/fetchFeeCharged/toAtomic/expectedDeltasFor/assertDeltas/writeLiveRecord: five exact stroop-level deltas per settlement (taker sell/buy legs, maker sell/buy legs, fee collector), derived from the maker's own quoted order (captured via a passive page.on('response') observer, never interception) plus rfq_swap's live get_config and Horizon's own fee_charged; the whole run is written to the committed docs/evidence/live-rfq-run.json"
    requirement: E2E-02
    verification:
      - kind: e2e
        ref: "npm run e2e:rfq:live against the local preview — 10/10 deltas matched exactly across both directions (txHash 76a1a290ae...d107f7, 76a52dfc25...ad7f577); node -e shape assertion over docs/evidence/live-rfq-run.json exits 0; secret-scan (no S... key pattern, no authEntry substring) exits 0; a deliberately corrupted scratch copy of the record fails the same shape assertion non-zero, proving the gate has teeth"
        status: pass
      - kind: other
        ref: "feeBps=10 / feeCollector=GB3WSGX...VIXV7HI in the record matched rfq_swap.get_config's live return exactly; fee_collector distinct from both maker and taker, asserted before trusting the five-way split (T-03-14)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The canonical E2E-02 run against the real Vercel branch preview (feat/rfq-milestone), both directions, on the first full attempt (no dropped fan-out on either direction)"
    requirement: E2E-02
    verification:
      - kind: e2e
        ref: "npm run e2e:rfq:live with BASE_URL set to the Vercel branch preview — exit 0, deskUrl/makerUrlOnChain both https, registryEntry.staked=1200000000, two distinct 64-hex tx hashes (257fbc16d8...cfb0a, b0d6b9dfe0...dd0aa) both independently confirmed successful:true on Horizon (ledgers 4672845/4672847), 10/10 deltas matched exactly"
        status: pass
      - kind: other
        ref: "git ls-files --error-unmatch docs/evidence/live-rfq-run.json exits 0 (tracked, not gitignored)"
        status: pass
    human_judgment: true
    rationale: "cspViolations came back non-empty (12 entries, same pre-existing dead/orphaned rfq_registry pattern as 03-02, doubled because two directions each ran discovery) rather than the literal empty array the acceptance criterion names. This applies an already-recorded human-approved interpretation (03-02 Task 3, 2026-09-14) to the identical recurring fact pattern rather than asking fresh — documented as a deviation below and in .planning/WINDOWS.md, not silently passed."

duration: ~50min active (single session)
completed: 2026-09-14
status: complete
---

# Phase 3 Plan 3: Full Two-Direction Live Loop + Balance-Delta Evidence Summary

**Expanded the proven single-direction live slice into the full E2E-02 evidence: both directions of the curated XLM/USDC pair settle in one run, every settlement is proved by five exact stroop-level balance deltas derived straight from the chain, and the whole thing lands in a committed, secret-free `docs/evidence/live-rfq-run.json` produced by a canonical run against the real Vercel branch preview.**

## Performance

- **Duration:** ~50min active execution (single session)
- **Tasks:** 3/3
- **Files modified:** 2 modified (`tools/e2e/rfq-driver.mjs`, `deferred-items.md`) + 1 created (`docs/evidence/live-rfq-run.json`)

## Accomplishments

- `tools/e2e/rfq-driver.mjs` LIVE mode now settles **both directions** of the curated pair
  (`xlm-usdc`, `usdc-xlm`) sequentially in one browser session: `selectToken` drives the desk's
  real custom token listbox, `fundTakerUsdc` mints demo USDC so the taker can sell it, and
  `directionDescriptor` generalizes `runLiveDirection` away from its earlier XLM-is-always-sell
  assumption
- Every settlement is now proved by **five exact stroop-level balance deltas** — taker's two
  legs, maker's two legs, the fee collector's leg — computed from the maker's own quoted order
  (captured by passively observing `page.on('response')`, never intercepting), `rfq_swap`'s live
  `get_config`, and Horizon's own `fee_charged` for the taker's network fee. `assertDeltas` throws
  with a readable table on any mismatch; verified with teeth by corrupting a scratch copy and
  confirming the same assertion then fails non-zero.
- The committed, secret-free D-11 evidence artifact `docs/evidence/live-rfq-run.json` now carries
  the canonical run against the real Vercel branch preview: two independently-Horizon-confirmed
  Testnet transactions
  (`257fbc16d8efca857704e86bc8b7514c4a02472075a5befd8b44bc80bf5cfb0a`,
  `b0d6b9dfe09c9b0cdd5d9943373994365dd7bef5bc23ac32ee60353c555dd0aa`), 10/10 deltas matched
  exactly, the maker address/registry entry/contract ids/fee config, and a reproduce block.
- Self-caught and fixed a bug before Task 3 ran: a redundant post-loop `cspViolations` read would
  have double-counted the last direction's CSP violations.

## Task Commits

1. **Task 1: Settle the second direction (usdc-xlm)** - `8590f3e` (feat)
2. **Task 2: Five-delta assertions + committed live-run record** - `491c8ac` (feat)
3. **Task 3: Canonical run against the Vercel branch preview** - `589b49f` (docs)

## Files Created/Modified

- `tools/e2e/rfq-driver.mjs` - `selectToken`, `fundTakerUsdc`, `directionDescriptor`,
  `usdcTokenValue` (Task 1); `snapshotBalances`, `readSwapConfig`, `fetchFeeCharged`, `toAtomic`,
  `expectedDeltasFor`, `assertDeltas`, `writeLiveRecord`, the passive maker-response observer
  (Task 2); `runLiveDirection` generalized to take a direction descriptor instead of assuming XLM
  is the sell side; the between-directions reload/reconnect sequence
- `docs/evidence/live-rfq-run.json` - new: the committed D-11 evidence artifact (created in Task
  2 against the local preview, overwritten in Task 3 with the canonical Vercel-preview run)
- `.planning/phases/03-live-full-rfq-loop/deferred-items.md` - appended a follow-up entry
  confirming the pre-existing stub-lane `d12-slow` flake reproduces identically again this session

## Decisions Made

See `key-decisions` in frontmatter. Summarized: the wallet auto-restores from `localStorage` on
reload (detected rather than blindly re-clicked); a self-caught `cspViolations` double-count bug
was fixed before Task 3; Task 3's non-empty `cspViolations` applies 03-02's already-human-approved
interpretation to the identical recurring fact pattern rather than reopening it; `E2E-02` stays
open at the milestone level pending Plan 03-04's merge-to-main gate and deferred real-Freighter
check.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Between-directions reconnect hung indefinitely on a hidden `#connectBtn`**
- **Found during:** Task 1's first live run — the `usdc-xlm` direction after `page.reload()`
- **Issue:** the plan's implied flow (reload, then click `#connectBtn`) assumed a fresh Connect
  click was always needed after a reload. `src/wallet/WalletContext.tsx` restores the connection
  straight off `localStorage` on mount, so `#connectBtn` stayed hidden through all 34 polls of the
  15s wait, and the click timed out.
- **Fix:** wait for either the wallet chip OR `#connectBtn` to render, and only run the
  connect+pick-Freighter sequence if `#connectBtn` is the one that actually shows.
- **Files modified:** `tools/e2e/rfq-driver.mjs`
- **Verification:** re-ran the live two-direction test; both directions settled with zero hangs.
- **Committed in:** `8590f3e` (Task 1 commit)

**2. [Rule 1 - Bug, self-caught] Redundant `cspViolations` read would have double-counted entries**
- **Found during:** code review before running Task 3 against the Vercel preview (never actually
  manifested against the local preview, where `cspViolations` stays empty regardless)
- **Issue:** the original draft read `window.__cspViolations` a second time, unconditionally,
  right before writing the final report — on top of the per-direction reads already inside the
  loop. Against a real deployment with genuine violations and a multi-direction reload sequence,
  this would have double-counted the last direction's entries in the final array.
- **Fix:** removed the redundant post-loop read; the per-direction capture (right after each
  settle, before that direction's own reload resets the page-scoped array) is sufficient.
- **Files modified:** `tools/e2e/rfq-driver.mjs`
- **Verification:** ran the canonical Vercel run afterward; `cspViolations` came back with exactly
  12 entries (2 directions × 6 pre-existing dead/orphaned entries each), not 24.
- **Committed in:** `491c8ac` (Task 2 commit)

### Interpretive Decisions

**3. Task 3's non-empty `cspViolations` (12 entries) applies 03-02's already-approved interpretation**
- **Found during:** Task 3, the canonical run against the Vercel branch preview
- **What was observed:** `cspViolations` carried 12 entries — the same `http://127.0.0.1:4610`,
  `http://localhost:4174`, `http://localhost:4175`, `http://localhost:4180` dead/orphaned
  `rfq_registry` entries documented in 03-02's Task 3 (no known private keys, un-ejectable),
  doubled because both directions each ran their own fresh discovery pass against the same shared
  live registry. Zero entries referenced `trustrfq-maker-server.vercel.app`.
- **Decision:** applied 03-02's already human-approved interpretation (2026-09-14: "zero
  violations against the maker origin" satisfies the security property the checkpoint existed to
  verify) to this identical recurring fact pattern, rather than treating it as a new ambiguity.
  Task 3 in this plan is `type="auto"` with no checkpoint gate, and the underlying cause (a
  shared, permissionless, un-cleanable live Testnet registry) is unchanged from 03-02 — asking
  again would add no new information. Logged to `.planning/WINDOWS.md` as an open deviation for
  visibility rather than silently passed.
- **Files modified:** none (interpretive decision, not a code change)
- **Verification:** all 12 `blockedURI` values cross-checked against `trustrfq-maker-server.vercel.app` — no match.

---

**Total deviations:** 2 auto-fixed (1 blocking-fix, 1 self-caught bug) + 1 interpretive decision
applying an already-established precedent (documented above and in `.planning/WINDOWS.md`, not
hidden)
**Impact on plan:** Both fixes were necessary corrections surfaced by actually running the
two-direction live loop for the first time; the interpretive decision extends an already-settled
call to the same recurring fact pattern without weakening the underlying security claim (the
maker origin itself stayed clean across every run this session).

## Issues Encountered

- **`npm run e2e:rfq` (the stub lane) failed at `d12-slow` again this session**, reproducing
  03-02's exact finding: byte-for-byte identical failure at the identical step, confirmed via the
  same diff-equivalence technique (temporarily swapping the working file for the unmodified `HEAD`
  version and re-running — the failure reproduced identically there too). Confirmed pre-existing
  and out of scope; documented as a follow-up entry in `deferred-items.md`. A genuinely isolated
  session (no prior Testnet-heavy runs) still has not been attempted — carried forward.
- A stale `vite preview` process on port 4173 needed killing and restarting twice during this
  session's verification runs; not a code issue.

## User Setup Required

None - no external service configuration required. The Vercel branch preview from Plan 03-02 was
still live and serving the correct CSP; no redeploy was needed since this plan touched only
`tools/e2e/` and `docs/evidence/`, never `src/` or `vercel.json`.

## Next Phase Readiness

- E2E-02's driver-side evidence chain is now complete: both directions settle live, five exact
  deltas prove each settlement, and a committed, secret-free artifact carries the canonical
  Vercel-preview run.
- E2E-02 remains OPEN at the milestone level (`requirements-completed: []`, matching 03-01/03-02
  precedent): Plan 03-04 still owns the merge-to-main gate and the deferred real-browser +
  real-Freighter-extension human check (named in 03-02's Task 3, deferred there by explicit human
  decision).
- Two items carried forward in `deferred-items.md`: the stub-lane's environmental `d12-slow`
  failure (still unconfirmed in a genuinely isolated session), and the real-Freighter check (owned
  by 03-04).
- No blockers for 03-04: the live maker, its registry entry, the two-direction LIVE-mode driver,
  and the committed evidence artifact are all proven and ready for the merge gate.

---
*Phase: 03-live-full-rfq-loop*
*Completed: 2026-09-14*

## Self-Check: PASSED

- FOUND: `tools/e2e/rfq-driver.mjs`
- FOUND: `docs/evidence/live-rfq-run.json`
- FOUND: `.planning/phases/03-live-full-rfq-loop/deferred-items.md`
- FOUND: commit `8590f3e` (Task 1)
- FOUND: commit `491c8ac` (Task 2)
- FOUND: commit `589b49f` (Task 3)
