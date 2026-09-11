---
phase: 02-desk-rfq-taker-path
verified: 2026-09-11T15:10:00Z
status: gaps_found
score: 4/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Unreachable, slow (>3s), or malformed makers are silently dropped (ROADMAP SC1) — one bad maker never prevents the other makers' quotes from arriving (TAKER-02 must-have, 02-02-PLAN.md)"
    status: partial
    reason: >
      Transport-layer malformation (non-2xx, unparseable JSON, JSON-RPC error member, missing
      order/authEntry) is correctly dropped per-maker in src/data/rfqNetwork.ts's
      getMakerSideOrder, and this is test-covered (src/data/rfqNetwork.test.ts). But a maker
      response that PASSES that shallow check and then carries a malformed VALUE in an
      economically meaningful field (e.g. a non-numeric order.takerAmount or order.makerAmount)
      is not isolated: src/core/rfq/validate.ts calls toAtomic(order.takerAmount) (line 168-169)
      and toAtomic(order.makerAmount) (line 250) directly on maker-controlled strings with no
      try/catch, and toAtomic (src/core/rfq/order.ts:22) does BigInt(whole || '0') which throws a
      raw SyntaxError on non-numeric input. validateQuote itself has no top-level try/catch, and
      its call site in src/data/rfqNetwork.ts:140 (inside fanOutMakerSideOrder's for-loop) is also
      unguarded, so the thrown exception propagates out of fanOutMakerSideOrder entirely. The one
      try/catch that does exist is in src/ui/RfqPanel.tsx:216, which catches it as a generic
      "Couldn't refresh quotes" toast and discards the WHOLE PASS — every other maker's genuinely
      valid, correctly signed quote is silently thrown away along with the malformed one. Since
      rfq_registry registration is permissionless (stake-gated, not identity-gated per Phase 1),
      any registered maker — malicious or merely buggy — can deny quotes to every taker for a
      pair on every refresh this way. This directly contradicts both ROADMAP SC1's "malformed
      makers are silently dropped" (singular/per-maker) framing and validate.ts's own header
      comment ("an unrecognised shape... is a rejection, never a default-accept"). Independently
      confirmed by 02-REVIEW.md's CR-01 (critical); no test in validate.test.ts or
      rfqNetwork.test.ts exercises a value-level (as opposed to transport-level) malformed field,
      so the gap is real and unexercised, not just theoretical.
    artifacts:
      - path: "src/core/rfq/validate.ts"
        issue: "toAtomic() calls on maker-controlled order.takerAmount/order.makerAmount (lines 168-169, 250) are not wrapped in try/catch; an uncaught throw escapes validateQuote"
      - path: "src/data/rfqNetwork.ts"
        issue: "fanOutMakerSideOrder's per-quote loop (line 138-143) calls validateQuote without a try/catch, so one throwing quote fails the entire Promise-returning function, not just that quote"
    missing:
      - "Wrap validateQuote's body (or at minimum every maker-controlled numeric-field read) in a try/catch that returns reject('undecodable_entry', ...) for that one quote"
      - "And/or wrap the validateQuote call site inside fanOutMakerSideOrder's for-loop in a try/catch that converts a thrown error into a per-quote FanOutRejection instead of failing the whole pass"
      - "A regression test: a maker response with a non-numeric takerAmount or makerAmount alongside N other well-formed maker responses in the same fan-out pass, asserting the well-formed quotes still arrive"
deferred:
  - truth: "vercel.json connect-src gains every maker-server origin the desk queries (ROADMAP SC5 clause; CSP-01)"
    addressed_in: "Phase 3"
    evidence: >
      02-CONTEXT.md D-11 (locked during phase 2 discuss-phase, before planning): "CSP stays a
      CURATED allow-list: each real maker origin is added to vercel.json connect-src by hand at
      deploy time... Phase 2 makes NO production CSP change (no real makers yet; the localhost
      stub runs only where Vercel headers do not apply); Phase 3 adds the first real origin."
      Phase 3's ROADMAP goal is explicit: "a real registered maker quoting from its own server is
      discovered and settled by the desk on Testnet, end-to-end, with nothing stubbed" — which is
      the first point a real maker origin exists to add. 02-05-SUMMARY.md confirms vercel.json is
      provably byte-for-byte unchanged this phase (git diff --stat empty), matching D-11 exactly,
      not an oversight. README.md:500-501 documents this as a known, deploy-time limitation rather
      than a hidden gap.
---

# Phase 2: Desk RFQ Taker Path Verification Report

**Phase Goal:** A taker in the desk can select a curated pair, see live firm quotes from
registered makers, and settle one with a single wallet signature, proven end-to-end against a
local stub maker settling for real on Testnet.
**Verified:** 2026-09-11T15:10:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Connected taker sees live quotes from makers discovered via the registry (two `get_urls_for_token` reads + client-side intersection); unreachable/slow/malformed makers silently dropped | ⚠️ PARTIAL / FAILED (per-maker isolation) | `src/data/rfqNetwork.ts:44-51` (`discoverMakerUrls`, two reads + `Set` intersection) VERIFIED. Transport-level drop (non-2xx/unparseable/timeout/missing fields) VERIFIED at `rfqNetwork.ts:69-95`, test-covered (`rfqNetwork.test.ts`). But a value-level malformed field (e.g. non-numeric `takerAmount`) crashes the WHOLE fan-out pass, not just that maker's quote — see gap above (CR-01, confirmed by direct code read). |
| 2 | A quote with mismatched `feeBps`, drifted economics, or a mismatched decoded `authEntry` invocation tree is rejected before any wallet prompt; order encoding is deterministic and pinned by golden vectors | ✓ VERIFIED | `src/core/rfq/validate.ts:156-294` implements economics/fee/paused/expiry/entry-expiry/tree checks, each returning a `reject(...)` before the function returns; 22 tests in `validate.test.ts`, mutation-verified (fee_bps inequality check disabling turned 2 tests red, per 02-02-SUMMARY.md). `fixtures/rfq-order-vectors.json` + `src/core/rfq/order.test.ts` pin `orderScValBase64` byte-for-byte, assert determinism across calls and tamper-sensitivity (amount/feeBps changes change the encoding). `fixtures/rfq-auth-tree.json` is a real captured Testnet invocation tree, not hand-written. |
| 3 | Accepting a quote settles on Testnet with exactly one Freighter `signTransaction` prompt (no `signAuthEntry` on taker path); desk confirms via `getTransaction` + swap event | ✓ VERIFIED | `src/core/rfq/settle.ts`: `RfqWalletSigner` exposes exactly one method (`signTransaction`); maker's pre-signed entry attached BEFORE enforcing-mode `simulateTransaction` (Pitfall 2 ordering); `readSwapEvent` polls `getEvents` for `SwapExecuted`. `grep -rn useSettlement src/` confirms RFQ path never touches the OTC `useSettlement` hook (App.tsx invariant intact). Human-verify checkpoint (02-05-PLAN.md Task 3) approved 2026-09-11 in a real browser with real Freighter: tx `c8efe29c8855dab7f6d58d786202d6ebcf10ff6b5b6f4c43c3340f1db6993206`, exactly one wallet prompt, taker demo-USDC 0 → 200, confirmed on Horizon. |
| 4 | A taker missing the makerToken trustline is prompted to add it before settlement; an expired-entry failure auto-refreshes the quote and retries once | ✓ VERIFIED | `src/core/rfq/retry.ts` exports `needsTrustline`, `retryDecision`, `isExpiredAuthFailure`; `settle.ts:182` calls `ensureTrustline` before building the swap tx (trustline op ordered first). E2E `TRUSTLINE` scenario recorded `promptSequence: ["changeTrust","invokeHostFunction"]`, settled live (02-04-SUMMARY.md). `retry.test.ts` covers equal/better/worse price boundary and the "never retry twice" bound. |
| 5 | `npm run e2e:census` extended flow settles for real via mock Freighter + local stub maker on Testnet, with maker origins added to `connect-src`, zero CSP violations, no `'unsafe-inline'` | ⚠️ PARTIAL (one clause deferred, see Deferred Items) | `package.json`'s `e2e:rfq` script → `tools/e2e/run-all.mjs --lane rfq` → `tools/e2e/rfq-driver.mjs`'s 12 scenarios (5 D-12 failure knobs + MULTI_QUOTE + TRUSTLINE + RETRY_EQUAL + RETRY_WORSE + baseline + more), self-funding stub maker registers/ejects on the live registry each run. 02-05-SUMMARY.md records two full live runs, 12/12 each, tx `feef0989...` and `c7dc430f...`, plus a deliberate-failure run proving non-zero exit + cleanup. `vercel.json` provably unchanged (`git diff --stat` empty), `dist/*.html` has 0 inline scripts and 0 esm.sh references. **"maker origins added to connect-src" is NOT done** — deliberately, per D-11 (locked at discuss-phase): deferred to Phase 3, which is the first point a real (non-localhost) maker origin exists to add. See Deferred Items. |

**Score:** 4/5 truths verified; truth 1 has a proven gap (per-maker fan-out isolation breaks under a value-level malformed field); truth 5's CSP clause is deferred, not failed, per documented rationale.

### Deferred Items

Item not yet met but explicitly addressed in a later milestone phase (Step 9b filtering).

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | `vercel.json connect-src` gains real maker-server origins | Phase 3 | D-11 (02-CONTEXT.md), Phase 3 ROADMAP goal ("nothing stubbed"), 02-05-SUMMARY.md's confirmed zero-diff on `vercel.json` |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/rfq/wire.ts` | JSON-RPC 2.0 wire types | ✓ VERIFIED | Present, imported by `order.ts`, `validate.ts`, `rfqNetwork.ts` |
| `src/core/rfq/order.ts` | Canonical order encoding + golden vectors | ✓ VERIFIED | `toAtomic`, `orderScValBase64` pinned byte-for-byte by `fixtures/rfq-order-vectors.json` |
| `src/core/rfq/validate.ts` | Fail-closed quote validation | ⚠️ SUBSTANTIVE BUT NOT FULLY FAIL-CLOSED | Exists, wired, well-tested for its documented reject reasons; but see gap — an unguarded exception path breaks the "reject the one quote" guarantee its own header comment promises |
| `src/core/rfq/discover.ts` | Ranking/intersection pure module | ✓ VERIFIED | 106 lines, tie-stable ranking tested (`discover.test.ts`) |
| `src/core/rfq/retry.ts` | Price-guarded retry + trustline predicate | ✓ VERIFIED | Exports match plan (`retryDecision`, `isExpiredAuthFailure`, `needsTrustline`); mutation-verified per 02-04-SUMMARY.md |
| `src/core/rfq/settle.ts` | Chain settlement, one signature | ✓ VERIFIED | `RfqWalletSigner` one-method interface; live tx confirmed |
| `src/data/rfqNetwork.ts` | Fan-out + registry reads | ✓ VERIFIED, wired | Sole network entry point for RFQ; imported by `RfqPanel.tsx` |
| `src/ui/RfqPanel.tsx` | Thin desk shell | ✓ VERIFIED, wired | Imported and rendered in `src/App.tsx:200` behind `address &&` guard |
| `public/intent.css` `[data-panel="rfq"]` | RFQ panel styling | ✓ VERIFIED | Present in both `App.tsx:199` and `intent.css:627+` (D-01 invariant holds) |
| `fixtures/rfq-order-vectors.json` / `fixtures/rfq-auth-tree.json` | Golden vectors | ✓ VERIFIED | 35 / 61 lines, referenced by `order.test.ts` / `validate.ts`, not stubs |
| `tools/e2e/stub-maker.mjs`, `tools/e2e/rfq-driver.mjs`, `tools/e2e/run-all.mjs` | E2E harness | ✓ VERIFIED, wired | `package.json`'s `e2e:rfq` script invokes `run-all.mjs --lane rfq`; 12 scenarios confirmed live-run in SUMMARYs |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `src/App.tsx` | `src/ui/RfqPanel.tsx` | import + render | ✓ WIRED | Line 32 import, line 200 render |
| `src/ui/RfqPanel.tsx` | `src/data/rfqNetwork.ts` | `fanOutMakerSideOrder`, `discoverMakerUrls`, `simulateRead` | ✓ WIRED | Line 30 import, called at lines 76, 191 |
| `src/data/rfqNetwork.ts` | `src/core/rfq/validate.ts` | `validateQuote` per-quote in fan-out loop | ⚠️ WIRED BUT NOT ISOLATED | Called without a try/catch guard — see gap |
| `package.json` | `tools/e2e/run-all.mjs` | `e2e:rfq` script | ✓ WIRED | `"e2e:rfq": "node tools/e2e/run-all.mjs --lane rfq"` |
| `src/core/rfq/settle.ts` | Freighter `signTransaction` | `RfqWalletSigner.signTransaction` | ✓ WIRED | Confirmed live, human-approved settlement tx |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full vitest suite | `npm test -- --run` | 13 files, 182/182 tests passed | ✓ PASS |
| RFQ core isolation (`useSettlement` never reaches `App.tsx`) | `grep -rn "useSettlement" src/` | 3 hits: definition + `ThreadView.tsx` import/call only | ✓ PASS |
| Debt-marker scan on phase files | `grep -n -E "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` across all 11 RFQ source/tool files | No matches | ✓ PASS |

### Probe Execution

Not applicable — this phase has no `scripts/*/tests/probe-*.sh` convention; verification instead relied on the developer-supplied context (live E2E already run, human-verify checkpoint approved) plus direct code inspection, per the orchestrator's explicit instruction not to re-run the live 12-scenario Testnet E2E (cost/actor consumption). `npm test` (182/182) was run directly in this verification pass as a cheap, safe regression check.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TAKER-01 | 02-01, 02-03 | Discovery via two registry reads + intersection | ✓ SATISFIED | `discoverMakerUrls` (rfqNetwork.ts); ranking/tie-stability tested (discover.test.ts) |
| TAKER-02 | 02-01, 02-03 | Parallel fan-out, 2-3s timeout, drop malformed | ⚠️ PARTIALLY SATISFIED | Transport-level drop works; value-level malformed field breaks per-maker isolation (see gap) |
| TAKER-03 | 02-02 | Fail-closed local validation before wallet prompt | ✓ SATISFIED (for the documented reject paths) | `validate.ts`, 22 tests, mutation-verified |
| TAKER-04 | 02-01, 02-04 | Single-signature settlement | ✓ SATISFIED | `settle.ts`, live tx, human-verify approved |
| TAKER-05 | 02-02, 02-04 | Trustline pre-flight + curated allow-list only | ✓ SATISFIED | `retry.ts`'s `needsTrustline`, `tokenForSac` allow-list checks in `validate.ts`/`settle.ts` |
| TAKER-06 | 02-01 | Deterministic canonical order encoding, golden-vector pinned | ✓ SATISFIED | `order.ts` + `order.test.ts` + `fixtures/rfq-order-vectors.json` |
| CSP-01 | 02-05 | `connect-src` gains maker origins; zero violations; no `unsafe-inline` | ⚠️ PARTIALLY SATISFIED, deferred | Zero-violation/no-unsafe-inline posture held; maker-origin clause deliberately deferred to Phase 3 per D-11 |
| E2E-01 | 02-05 | Stub maker + taker driver, full RFQ flow, settles for real | ✓ SATISFIED | `npm run e2e:rfq`, 12/12 scenarios, two independent live runs recorded with tx hashes |

**Note:** `.planning/REQUIREMENTS.md`'s tracking table (lines 151-158) still shows TAKER-01, TAKER-02, TAKER-06, CSP-01, and E2E-01 as "Pending" even though every one of them has a `requirements-completed` entry in some plan's SUMMARY frontmatter (02-01 completes TAKER-01/02/04/06; 02-03 completes TAKER-01/02; 02-05 completes E2E-01/CSP-01). This is a documentation-staleness issue in REQUIREMENTS.md, not a functional gap — flagged as INFO, not a blocker.

### Anti-Patterns Found

None in the 11 phase-modified source/tool files scanned (no TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers).

### Code Review Cross-Reference (02-REVIEW.md)

| Finding | Severity | This verification's disposition |
|---------|----------|----------------------------------|
| CR-01: malformed maker response poisons the entire fan-out pass | Critical | **Confirmed independently by direct code read** (validate.ts/rfqNetwork.ts) — promoted to a phase gap above, blocks `gaps_found` status |
| CR-02: maker fetches not covered by deployed CSP `connect-src` | Critical | Confirmed as real, but is the intentional, documented D-11 scope decision — treated as a **deferred item to Phase 3**, not a phase-2 gap (matches developer's own framing: documented deploy-time rule, Testnet preview unaffected) |
| WR-01: no balance refresh after trustline/settle | Warning | Non-blocking UX polish; does not affect settlement correctness or the phase goal. Not included as a gap. |
| WR-02: `busy.current` guard doesn't block `refreshQuotes` re-entrance itself | Warning | Currently masked by the disabled Refresh button; not exploitable via the shipped UI. Not included as a gap. |
| WR-03: unconditional re-quote fetch on every settlement failure | Warning | Minor inefficiency/latency, not a correctness or security issue. Not included as a gap. |
| IN-01, IN-02 | Info | Documentation/portability notes only. Not included as gaps. |

### Human Verification Required

None outstanding. The one human-verify checkpoint this phase carried (02-05-PLAN.md Task 3, real browser + real Freighter) was already completed and approved by the developer on 2026-09-11, with tx `c8efe29c8855dab7f6d58d786202d6ebcf10ff6b5b6f4c43c3340f1db6993206` confirmed on Horizon (taker demo-USDC 0 → 200, exactly one wallet prompt).

### Gaps Summary

The phase's happy-path — discovery, validation, single-signature settlement, trustline pre-flight,
price-guarded retry, and the full local-stub-maker E2E proof — is genuinely built, wired, and
proven live on Testnet, including a real-browser human-verify checkpoint the developer already
approved. Golden-vector discipline for the signature boundary (TAKER-06) and the fail-closed
validation gate (TAKER-03) are both real and adversarially tested, matching the code review's own
assessment.

The one blocking gap is CR-01: `validateQuote`'s reliance on unguarded `BigInt()` conversion of
maker-controlled numeric strings means a single malformed (not just malicious — could be a buggy
maker implementation) quote value crashes the entire `fanOutMakerSideOrder` pass, silently
discarding every other maker's valid quote along with it. This directly contradicts ROADMAP SC1's
"malformed makers are silently dropped" (which implies per-maker isolation, and which the module's
own header comment promises: "a rejection, never a default-accept" — scoped, not global). Because
`rfq_registry` registration is permissionless and stake-gated rather than identity-gated, this is a
realistic availability/DoS vector against every taker for a pair, not a hypothetical edge case, and
it is not covered by any existing test (both `validate.test.ts` and `rfqNetwork.test.ts` only
exercise transport-level malformation, e.g. unparseable JSON — never a value-level bad field inside
an otherwise well-formed response). The fix is small and scoped (wrap the per-quote validation
call, or the numeric-field reads inside it, in a try/catch that converts a throw into a per-quote
rejection) and does not require replanning the phase's architecture.

The CSP maker-origin clause (part of ROADMAP SC5 / CSP-01) is NOT a gap — it was deliberately
deferred to Phase 3 via a decision (D-11) locked during this phase's own discuss-phase step, before
any real maker origin existed to add, and Phase 3's own ROADMAP goal is the first point a real
maker server exists. This is filed as a deferred item, not a gap, per Step 9b.

---

_Verified: 2026-09-11T15:10:00Z_
_Verifier: Claude (gsd-verifier)_
