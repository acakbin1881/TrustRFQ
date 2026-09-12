---
phase: 02
slug: desk-rfq-taker-path
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-12
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time (all six PLAN.md files carry a `<threat_model>` block).
> Classification depth: ASVS L1 (grep-level evidence, plus this phase's own verifier run,
> code review delta, and mutation-verified tests).
>
> ID note: plan 02-06 reused IDs T-02-13..T-02-17, which plan 02-03 had already assigned.
> Rows below are qualified with their source plan; the 02-06 rows are additionally
> renumbered here as T-02-28..T-02-32 to keep this register unambiguous.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| permissionless `rfq_registry` -> discovered URL set | Any staked address can put any URL in front of the desk's fan-out; membership is a spam price, not vetting | Maker endpoint URLs (untrusted) |
| maker JSON-RPC response -> `getMakerSideOrder` | Beyond a truthiness check on `order`/`authEntry`, every field value is arbitrary attacker-chosen data | Quote fields, signed auth entry XDR (untrusted) |
| `validateQuote` -> `fanOutMakerSideOrder` loop | A verdict, and a failure to reach one, must stay scoped to the one quote that earned it | Per-quote accept/reject verdicts |
| per-pass `get_config` / ledger reads -> whole pass | Trusted on-chain reads with no safe fallback; a failure here stays fatal to the pass (fail-closed) | Fee bps, paused flag, latest ledger |
| validated quote -> taker's wallet | The one wallet prompt; the signed transaction embeds the maker's pre-signed entry over all economic terms | Transaction XDR for signature |
| desk build -> deployed CSP (`vercel.json`) | The deployed allow-list must not widen for developer-machine processes | Network origins |

---

## Threat Register

| Threat ID | Plan | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|------|----------|-----------|----------|-------------|------------|--------|
| T-02-01 | 02-01 | Tampering | `settle.ts` settleQuote | high | mitigate | Maker's signed entry attached BEFORE enforcing-mode simulate (`buildSwapOp` pre-attaches `auth`; ordering asserted in source comments and acceptance criteria) | closed |
| T-02-02 | 02-01 | Tampering | `order.ts` encoding | high | mitigate | Alphabetical symbol-key ScMap encoding pinned by golden vectors (`fixtures/rfq-order-vectors.json`, `order.test.ts` green; untouched by 02-06) | closed |
| T-02-03 | 02-01 | Spoofing | `rfqNetwork.discoverMakerUrls` | medium | mitigate | Registry membership grants no trust; every discovered quote passes full validation; discovery is a read-only simulation on the already-allowed RPC origin | closed |
| T-02-04 | 02-01 | Information disclosure | RFQ lane modules | low | mitigate | Zero off-chain persistence (D-03); grep-verified: no database client import under `src/core/rfq/` or `src/data/rfqNetwork.ts` | closed |
| T-02-05 | 02-01 | Repudiation | in-panel settlement confirmation | low | accept | No off-chain settlement record by decision D-03; the chain + tx hash is the record (IDX-01 deferred) | closed (accepted) |
| T-02-06 | 02-01 | Elevation of privilege | `settle.ts` signer surface | medium | mitigate | RFQ signer interface exposes `signTransaction` only; grep-verified zero `signAuthEntry` references under `src/core/rfq/` | closed |
| T-02-07 | 02-02 | Tampering | `validate.ts` invocation-tree comparison | critical | mitigate | `buildInvocationTree` decode + full comparison (credential address, root source/function, signed args, sub-invocation count, transfer from/to/amount) anchored to `fixtures/rfq-auth-tree.json`; DRIFTED E2E knob proves teeth | closed |
| T-02-08 | 02-02 | Tampering | `feeBps` handling | high | mitigate | Cross-checked against a live `get_config` read per fan-out pass, never cached or maker-supplied; mutation-verified; WRONG_FEE knob | closed |
| T-02-09 | 02-02 | Spoofing | token identity in `validate.ts` | high | mitigate | Both token legs resolve through `tokenForSac` against the curated allow-list (3 call sites); off-list addresses rejected | closed |
| T-02-10 | 02-02 | Denial of service | fan-out timeout | medium | mitigate | Per-request `AbortSignal.timeout(3000)` (`rfqNetwork.ts:79`); no automatic periodic re-fan-out (D-05); SLOW knob | closed |
| T-02-11 | 02-02 | Elevation of privilege | fail-open validation paths | high | mitigate | Every unrecognised shape returns a rejection; one negative test per `REJECT_REASON`; extended by 02-06 to value-level malformation (`malformed_field`) | closed |
| T-02-12 | 02-02 | Tampering | `paused` contract state | low | mitigate | `get_config().paused` read on the same pass rejects before any prompt (6 references in `validate.ts`) | closed |
| T-02-13 | 02-03 | Spoofing | discovery line in `RfqPanel.tsx` | medium | mitigate | Discovery line states a count only — no maker identity, URL, stake, or endorsement language (D-02, D-07) | closed |
| T-02-14 | 02-03 | Tampering | preselected row in `discover.ts` | medium | mitigate | Deterministic, tie-stable ranking over bigint-scaled prices; identical-output-across-two-calls test | closed |
| T-02-15 | 02-03 | Denial of service | `rankQuotes` + rendered list | low | mitigate | `MAX_VISIBLE_ROWS = 6` with `visibleQuotes.slice` (`RfqPanel.tsx:43,136`); on-chain `max_makers_per_token` caps discovery at 100 | closed |
| T-02-16 | 02-03 | Denial of service | refresh path | medium | mitigate | Only a taker action re-runs the fan-out; no scheduled re-quote (D-05) | closed |
| T-02-17 | 02-03 | Tampering | countdown and expiry filtering | medium | mitigate | `dropExpired` matches the contract's strictly-greater-than test (client never stricter than chain); EXPIRY_DROP scenario | closed |
| T-02-18 | 02-04 | Tampering | `retryDecision` in `retry.ts` | high | mitigate | Auto-retry only at equal-or-better price; strictly worse price forces explicit re-confirmation; mutation-verified equal-price branch; RETRY_WORSE scenario | closed |
| T-02-19 | 02-04 | Denial of service | retry loop | medium | mitigate | At most one automatic retry (`attemptsAlready >= 1` guard ahead of price comparison, `retry.ts:96`); mutation-verified | closed |
| T-02-20 | 02-04 | Spoofing | `needsTrustline` on unfetched balances | medium | mitigate | Null balance map returns false (never asserts an unfetched fact); in-flow `ensureTrustline` reads Horizon at accept time as the authoritative check | closed |
| T-02-21 | 02-04 | Elevation of privilege | trustline transaction | medium | mitigate | `ensureTrustline` imported unchanged from the audited OTC path (`core/fill`); no second `changeTrust` construction site (grep-verified imports) | closed |
| T-02-22 | 02-04 | Tampering | concurrent accept clicks | medium | mitigate | Busy-ref guard covers the whole accept sequence including retry; desk-wide 3-line `useSettlement` invariant re-asserted | closed |
| T-02-23 | 02-05 | Tampering | `vercel.json` CSP | high | mitigate | No origin added this phase; `connect-src` still lists exactly its five pre-existing sources; file diff empty (re-confirmed 2026-09-12: zero pending diff) | closed |
| T-02-24 | 02-05 | Tampering | built bundle | high | mitigate | Build asserted to contain zero inline script blocks and no external module CDN reference (re-confirmed at the 02-06 post-merge build gate) | closed |
| T-02-25 | 02-05 | Denial of service | live Testnet registry | medium | mitigate | Stub maker ejects on every exit path including scenario failure and uncaught exception; verified by a deliberate-failure run | closed |
| T-02-26 | 02-05 | Repudiation | census reporting | medium | mitigate | Headline artefact is the on-chain tx hash; interface counts stay per-scenario regression detail, never protocol evidence (POS-D1) | closed |
| T-02-27 | 02-05 | Spoofing | test-only paths in shipped bundle | high | mitigate | D-10: desk discovers the stub through the ordinary registry read path; no loopback literal under `src/` (source assertions carried into the build) | closed |
| T-02-28 | 02-06 (plan id T-02-13) | Denial of service | `validateQuote` economics reads + fan-out loop | high | mitigate | THE 02-06 gap: `tryToAtomic` guard at all four maker/request numeric conversions returning `malformed_field`; per-quote try/catch backstop in the loop; mixed-pass regression observed RED pre-fix and mutation-verified from both sides | closed |
| T-02-29 | 02-06 (plan id T-02-14) | Tampering | new catch paths in `validate.ts` | high | mitigate | Explicit rejections reached BEFORE the pre-existing tree catch; every prior `tree_mismatch` / `undecodable_entry` case keeps its original reason (suite green, detail string pinned) | closed |
| T-02-30 | 02-06 (plan id T-02-15) | Elevation of privilege | fail-open in new guard paths | critical | mitigate | Every new path returns a rejection; no catch appends to `accepted` or substitutes a default numeric value; asserted per hostile value in the test table | closed |
| T-02-31 | 02-06 (plan id T-02-16) | Denial of service | per-pass `readSwapConfig` / `getLatestLedger` | medium | accept | A failed on-chain read still fails the whole pass by design (fee/paused gates have no fallback); pinned by the rejecting-config-read test so future widening of the per-quote catch fails a test | closed (accepted) |
| T-02-32 | 02-06 (plan id T-02-17) | Information disclosure | rejection `detail` strings with raw error text | low | accept | Text reaches only the panel's `console.debug` line and the E2E report; inputs are the maker's own response and the desk's own request amount; no key or session material in scope | closed (accepted) |
| T-02-SC | all six | Tampering | package-manager installs | low | accept | Zero new packages across the entire phase (02-RESEARCH.md Package Legitimacy Audit: not applicable in every plan); no install task existed to gate; adding one re-opens this row | closed (accepted) |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-02-01 | T-02-05 | No off-chain settlement record by decision D-03; the chain plus the transaction hash is the record; read-back convenience is IDX-01, deferred and unscheduled | Plan 02-01 (locked decision D-03) | 2026-09-12 |
| AR-02-02 | T-02-31 | Per-pass `get_config` / ledger read failure stays fatal to the whole pass: the fee and paused gates have no fallback value, and silently skipping them would be worse than showing no quotes; pinned by a fail-closed regression test | Plan 02-06 (design invariant) | 2026-09-12 |
| AR-02-03 | T-02-32 | Rejection detail strings carry raw error text only to `console.debug` and the E2E report; inputs are maker-supplied or desk-own values, never key or session material | Plan 02-06 | 2026-09-12 |
| AR-02-04 | T-02-SC | Zero package-manager installs in the entire phase; no install task existed to gate; any new dependency re-opens the row and requires the legitimacy checkpoint | All six plans | 2026-09-12 |

*Accepted risks do not resurface in future audit runs.*

---

## Deferred (not open, not accepted here)

| Item | Where it went |
|------|---------------|
| CSP `connect-src` maker-origin clause of CSP-01 | Locked to Phase 3 by decision D-11 (02-CONTEXT.md) before any real maker origin existed; 02-05 and this audit both confirmed `vercel.json` unchanged. Tracked as a Phase 3 requirement, not a Phase 2 threat. |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-12 | 33 | 33 | 0 | /gsd-secure-phase orchestrator (ASVS L1 short-circuit: register authored at plan time, grep-level evidence + phase verifier 5/5 + code-review delta + 192 unit tests incl. mutation checks) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-12
