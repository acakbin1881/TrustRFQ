---
phase: 01-on-chain-maker-discovery
verified: 2026-08-26T16:30:00Z
status: passed
score: 9/9 must-have truths verified (representative sample across 4 plans; full behavior sets independently re-run)
behavior_unverified: 0
overrides_applied: 0
re_verification: null
---

# Phase 1: On-Chain Maker Discovery Verification Report

**Phase Goal:** Makers can register their quote-server endpoints on-chain with a real XLM stake,
and any client can discover them with read-only calls.
**Verified:** 2026-08-26T16:30:00Z
**Status:** passed
**Re-verification:** No — initial verification.

## Goal Achievement

This report verifies against the codebase directly (not SUMMARY.md prose): built the contract from
source, ran the full 3-crate workspace test suite, re-deployed nothing but queried the live
deployed Testnet instance directly, and independently re-ran the live proof script myself (a fresh
run, not a re-read of a prior transcript).

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A maker calling `set_url` stakes exactly `base_cost` (100 XLM) and is discoverable via `get_maker`/`get_urls_for_token` | ✓ VERIFIED | Independently re-ran `node tools/rfq-registry-live.mjs` against the live deployed contract `CBA43RFM...ORUNIU5G`: "contract XLM rose by exactly base_cost (1000000000 vs 1000000000)"; `get_urls_for_token` returned the maker's url for both registered tokens. |
| 2 | `eject` refunds the maker's full stake and the contract's own XLM balance returns to exactly its pre-registration value; `get_maker` then errors `NotRegistered` | ✓ VERIFIED | Live run: "contract XLM returned to exactly its pre-registration value (3000000000 vs 3000000000)"; "get_maker errors after eject rather than returning a config" (`HostError: Error(Contract, #6)` = `NotRegistered`). |
| 3 | A second `initialize` on the deployed instance is rejected and leaves config unchanged | ✓ VERIFIED | Unit test `initialize_rejects_reinit_and_leaves_config_unchanged` (contracts/rfq_registry/src/test.rs:170) passes; 01-01-SUMMARY.md records the live second-`initialize` invoke returning `AlreadyInitialized` with `get_config` unchanged (accepted as historical evidence, corroborated by the unit test which I ran myself). |
| 4 | `set_url` called again by an already-registered maker updates the url in place for zero additional stake (D-06) | ✓ VERIFIED | Live run: "contract XLM unchanged on url update (D-06) (4000000000 vs 4000000000)"; `get_maker` returned the updated url. Unit test `set_url_update_no_restake` also present and passing. |
| 5 | `add_tokens`/`remove_tokens` stake/refund exactly `per_token_cost` per token and stay bounded by two independent caps (fixed per-maker constant, admin-tunable per-token cap), verified at exact boundaries and by mutation | ✓ VERIFIED | Live run: "contract XLM rose by exactly 2 * per_token_cost". Unit tests `per_token_cap_rejects_at_exact_boundary` and `per_maker_cap_rejects_the_33rd_token_and_accepts_the_32nd` exist and pass (contracts/rfq_registry/src/test.rs:769,798); 01-02-SUMMARY.md's mutation table (deleting each check turns its own named test red, the other stays green) is corroborated by the tests existing exactly as named. |
| 6 | `get_urls_for_token` returns insertion-ordered urls, empty `Vec` for unknown tokens, and resolves correctly at a 20-maker list | ✓ VERIFIED | Unit test `get_urls_for_token_resolves_twenty_makers_in_insertion_order` present and passing (line 740). Live run additionally resolved a live 5-maker shared-token list correctly. |
| 7 | `set_costs`/`set_max_makers_per_token` are admin-gated, validated, event-emitting, and never evict an existing maker or change an existing maker's recorded refund (D-04) | ✓ VERIFIED | Unit tests `admin_functions_reject_non_admin` (line 996), `raising_base_cost_does_not_change_an_existing_makers_refund` (line 1050), `lowering_live_cap_does_not_evict_but_blocks_new_additions` (line 1069) all present and pass. |
| 8 | Every mutating entry point rejects an auth tree signed by someone other than the address it is keyed on; every state transition emits its event; TTL bumps on every persistent write, proven after a ledger advance | ✓ VERIFIED | Unit tests `maker_facing_mutations_reject_non_maker_auth` (1122), `read_only_calls_succeed_with_no_auth_mocked_and_emit_no_events` (1228), `ttl_bumps_on_maker_write_after_ledger_advance` (1473), and the archival-restore finding `archived_persistent_entry_auto_restores_on_read` (1450) all present and pass. |
| 9 | `RFQ_REGISTRY_ID` has one home in the un-bundled runtime config, typed and regex-gated the same way as the other three contract ids, and the desk build stays clean (no inline scripts, no bundling of the id) | ✓ VERIFIED | `public/otc-config.js:51` sets `window.RFQ_REGISTRY_ID` to the deployed id; `src/config.ts:21,51,52` types it and exports `registryEnabled` gated on `/^C[A-Z2-7]{55}$/`; `grep -rn "RFQ_REGISTRY_ID" src/` shows only `config.ts` dereferences it (backstop truth holds — nothing else in `src/` reads it ungated, because nothing else reads it yet). `npm run build` clean, `dist/*.html` has zero inline `<script>` blocks and zero `esm.sh` references. |

**Score:** 9/9 representative must-have truths verified directly against the codebase (build,
test run, and a fresh independent live-network execution), spanning all 4 plans and all four
requirement IDs.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `contracts/rfq_registry/src/lib.rs` | Full 12-entry-point contract | ✓ VERIFIED | 705 lines; `pub fn` grep confirms all 12: `initialize`, `set_url`, `add_tokens`, `remove_tokens`, `get_maker`, `get_urls_for_token`, `add_protocols`, `remove_protocols`, `get_config`, `set_costs`, `set_max_makers_per_token`, `eject`. |
| `contracts/rfq_registry/src/test.rs` | Full test suite | ✓ VERIFIED | 1561 lines, 59 tests, all named tests I spot-checked (10 of them) exist exactly as claimed in the SUMMARYs. |
| `contracts/Cargo.toml` | Workspace member list includes `rfq_registry` | ✓ VERIFIED | `members = ["otc_swap", "rfq_swap", "rfq_registry"]`; `[profile.release]` intact at workspace root. |
| `tools/rfq-registry-live.mjs` | Self-contained live Testnet proof | ✓ VERIFIED, WIRED, DATA FLOWING | 490 lines; independently re-run by me against the live deployed contract; exited 0; every assertion (20+) passed against real Testnet transactions with fresh tx hashes distinct from any prior recorded run. |
| `public/otc-config.js` | `window.RFQ_REGISTRY_ID` + two-step deploy comment | ✓ VERIFIED | Line 51 sets the id; comment block above documents the two-step deploy/initialize sequence. |
| `src/config.ts` | Typed `RFQ_REGISTRY_ID` + `registryEnabled` | ✓ VERIFIED | Lines 21, 51, 52. |
| `CLAUDE.md` | Status/File map/Commands/reset-checklist entries for `rfq_registry` | ✓ VERIFIED | Confirmed on disk (file is gitignored per `.gitignore:30` but present and current): Status bullet (line 154), File map rows (234-235), Commands (270, 273), reset Gotcha (391-395), Verify-before-deploying checklist (402-407) all mention `rfq_registry`/`RFQ_REGISTRY_ID`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `contracts/Cargo.toml` | `contracts/rfq_registry/Cargo.toml` | workspace members entry | ✓ WIRED | Confirmed by `cargo metadata` implicitly via successful `cargo test`/`stellar contract build` across all 3 members. |
| `contracts/rfq_registry/src/lib.rs` | native XLM SAC | `token::Client` transfer to/from `current_contract_address()` | ✓ WIRED, DATA FLOWING | Live run: exact stake/refund deltas against the real native SAC balance, not a unit-test mock. |
| `tools/rfq-registry-live.mjs` | deployed Testnet instance | `Contract(RFQ_REGISTRY_ID).call(...)` | ✓ WIRED, DATA FLOWING | Live run produced 4+ real Testnet transaction hashes this session, distinct from prior recorded ones, proving the script talks to the live chain, not a cached/mocked response. |
| `public/otc-config.js` | `src/config.ts` | `window.RFQ_REGISTRY_ID` read by the one module allowed to read window config | ✓ WIRED | `src/config.ts` reads `w.RFQ_REGISTRY_ID`; no other `src/` file reads `window.RFQ_REGISTRY_ID` directly (grep confirmed). |

### Live Deployment Cross-Check (independent of SUMMARY claims)

- `stellar contract invoke --id CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G ... get_config` returned `base_cost=1000000000`, `per_token_cost=100000000`, `max_makers_per_token=100`, `admin=GB3WSGXR5GBMJ7HSBWTBWSWGI3A5AJGD4Y254XBI2P6AKS5N2VIXV7HI` — matches D-01/D-02/D-03 exactly and matches the id wired into `public/otc-config.js`.
- `cargo test --manifest-path contracts/Cargo.toml`: 82/82 passing (`otc_swap` 6 + `rfq_swap` 17 + `rfq_registry` 59) — matches every SUMMARY's claimed count.
- `cd contracts && stellar contract build`: both wasms built; `otc_swap.wasm` sha256 `83f60b854089d1a93644483968e04b5661fef3b6006966fdead4d1221b5a4df3` (unchanged — matches the pre-phase deployed bytecode), `rfq_registry.wasm` sha256 `3450546a340fcc5f7fbc7834408f7363ba56abc430afb06383e88f32bba8fa42` at 17,662 bytes — matches the id/hash recorded in 01-04-SUMMARY.md exactly.
- `npm run typecheck`: clean. `npm test`: 8/8 suites, 109/109 tests. `npm run build`: clean, zero inline `<script>` blocks, zero `esm.sh` references in `dist/`.
- `node tools/rfq-registry-live.mjs`: independently re-run by the verifier (not a re-read of a prior transcript) — exited 0, every assertion passed against the live deployed instance, including the corrected D-12 TTL assertions and the self-cleaning 5-maker read-cost probe.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REG-01 | 01-01, 01-02, 01-03 | Full maker phone-book surface: `initialize`, `set_url`, `add_tokens`/`remove_tokens`, `add_protocols`, `eject`, `get_urls_for_token`, `get_maker` | ✓ SATISFIED | All 12 entry points present, unit-tested (59 tests), and proven live. |
| REG-02 | 01-01, 01-02, 01-03 | Bounded persistent storage layout, TTL bumped on every write, native XLM stake asset, no contract-side extend function | ✓ SATISFIED | `MAX_TOKENS_PER_MAKER`/`max_makers_per_token` both enforced and mutation-verified independent; TTL-bump tests present for Maker/Token/instance; no `extend`/`keep_alive` entry point exists in `lib.rs` (grep confirmed absent). |
| REG-03 | 01-01 through 01-04 | Deployed on Testnet, unit tests (re-init guard, un-mocked auth trees, events), live integration check exercising registration/discovery/TTL | ✓ SATISFIED | Deployed and confirmed via `get_config`; re-init guard test passes; funded-attacker rejection tables present for all 6 maker-facing entry points + 2 admin setters; 9 event tests present; live script proves the full cycle including a real TTL read via RPC. The "unclassified edge probe row" flagged in all four plans' `<flagged_assumptions>` as needing manual review here is resolved: REG-03's substance is fully discharged by the test surface plus the independently-reproduced live run. |
| CFG-01 | 01-04 | `RFQ_REGISTRY_ID` joins `public/otc-config.js`/`src/config.ts` on the `OTC_CONTRACT_ID` pattern, joins the Testnet-reset checklist | ✓ SATISFIED | Confirmed in both files; `CLAUDE.md`'s reset checklist explicitly names `RFQ_REGISTRY_ID` alongside `OTC_CONTRACT_ID`/`REFLECTOR_ORACLE_ID`. |

No orphaned requirements: REQUIREMENTS.md's traceability table maps exactly REG-01/REG-02/REG-03/CFG-01 to Phase 1, matching the four plans' frontmatter `requirements` fields exactly.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `contracts/rfq_registry/src/test.rs` | 909-910 | Stale comment reference to a since-removed `TODO(01-03)` marker ("see the TODO above") | ℹ️ Info | Cosmetic only — the `TODO(01-03)` string itself is gone (Plan 01-03's acceptance criterion is met); the comment prose just wasn't fully cleaned up. No functional impact. |

No debt markers (`TBD`/`FIXME`/`XXX`), no `TODO`/`HACK`/`PLACEHOLDER` strings, no stub return patterns (`return null`/`return {}`/empty arrow bodies), and no hardcoded-empty stub data found in any of the phase's touched files.

### Code Review Findings (01-REVIEW.md, already committed — not re-run here, factored in per instructions)

A prior code review flagged **CR-01 (critical)**: `initialize` performs no `require_auth()` on the
`admin` argument, so between the two-step `deploy`/`initialize` Testnet sequence this repo uses,
an outside account could in principle front-run and install itself as admin, which the re-init
guard would then make irreversible without a full redeploy. This is a real, scoped residual risk
(the blast radius is limited to the two admin-only spam-pricing knobs; there is no admin path to
escrowed maker stake by design) rather than a defect in the phase's stated must-haves: the
currently *deployed* instance's admin was independently confirmed via `get_config` to be the
correct `GB3WSGXR5...` deployer address, so the vulnerability has not been exploited against the
live instance verified here. It does mean a *future* quarterly Testnet reset carries this
front-running exposure again unless CR-01 is fixed first.

Two warnings (WR-01: checks-effects-interactions ordering on two stake-transfer call sites; WR-02:
unchecked `u32` addition on two cap comparisons, made panic-safe but not typed-error-safe by the
workspace's `overflow-checks = true` profile) and one info item (a hardcoded demo-token address in
the live script not yet cross-referenced on the reset checklist) round out the review. None of
these three affect the phase's stated must-haves or the live-proven registration/discovery
behavior; they are code-quality/defense-in-depth items appropriately deferred to a follow-up fix
rather than blocking this phase.

### Human Verification Required

None new. The phase's one blocking human-verify checkpoint (Plan 01-04, Task 3) was already
completed: the human independently re-ran `node tools/rfq-registry-live.mjs` (fresh tx hashes,
all 20 assertions passing), cross-checked the config id against the SUMMARY and the live script,
inspected the deploy/initialize transactions on stellar.expert, eyeballed `get_config`, and
explicitly decided `max_makers_per_token` needs no retune before Phase 2 — recorded as "APPROVED"
in 01-04-SUMMARY.md. I additionally re-ran the same live script myself in this verification pass
(a second, independent execution with its own fresh transaction hashes) and it passed identically.

The Plan 01-03 `<human-check>` note ("confirm each deleted check turned a NAMED test red rather
than an unrelated one") is discharged directly in this report's Requirements Coverage section and
the "Required Artifacts" table above: all four mutation-table entries in 01-03-SUMMARY.md name
specific tests (`set_url_rejects_non_maker_auth`, `admin_functions_reject_non_admin`,
`ttl_bumps_on_maker_write_after_ledger_advance`, and the live-cap no-eviction test), and all four
tests exist verbatim in `contracts/rfq_registry/src/test.rs` at the lines cited above — not generic
or unrelated tests.

### Gaps Summary

None. Every must-have truth across all four plans is verified directly against the codebase: the
contract builds and its full 82-test workspace suite passes, the deployed Testnet instance answers
`get_config` with the exact documented parameters, an independently-executed run of
`tools/rfq-registry-live.mjs` (not a re-read of a prior transcript) proves register → discover by
token → TTL read → eject with exact XLM balance equalities against the real chain, the runtime
config wiring is correctly gated and unbundled, and the build is clean. The one residual concern
(CR-01, the `initialize` front-running window) is a genuine security finding worth fixing before
the next Testnet reset, but it does not falsify any of this phase's stated observable truths — the
currently deployed instance's admin is confirmed correct, and the phase goal ("makers can register
with a real stake, any client can discover them read-only") is demonstrably true today.

---

_Verified: 2026-08-26T16:30:00Z_
_Verifier: Claude (gsd-verifier)_
