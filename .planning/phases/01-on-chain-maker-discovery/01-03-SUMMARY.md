---
phase: 01-on-chain-maker-discovery
plan: 03
subsystem: contracts
tags: [soroban, rust, stellar, testnet, rfq_registry, mutation-testing, ttl, archival]

# Dependency graph
requires:
  - phase: 01-02
    provides: add_tokens/remove_tokens/get_urls_for_token/add_protocols/remove_protocols on
      rfq_registry, plus the setup_with_cap/fill_token_list test harness and the TODO(01-03) note
      this plan closes
provides:
  - set_costs/set_max_makers_per_token admin entry points, gated by require_admin, validated,
    event-emitting, and proven never to disturb an already-registered maker's refund
  - The D-04 no-eviction rule proven against a LIVE cap change (not just initialize-time)
  - The full REG-03 security surface: a re-init guard proven to change nothing, a funded-attacker
    rejection table across all six maker-facing mutating calls plus both admin setters, and one
    event test per state transition (9 events) plus a no-auth-mocked read-only test
  - REG-02's TTL-bump-on-write proven after a ledger advance for all three storage classes
    (Maker, Token, instance), and the archival-restore behavior of the pinned soroban-sdk 26.x
    test Env established empirically rather than assumed
  - Four independent mutation-verification results confirming the rejection/bump suite has teeth
affects: [01-04 (redeploys rfq_registry with the full entry-point surface: this plan's setters
  plus every earlier plan's functions; extends tools/rfq-registry-live.mjs to prove
  set_costs/set_max_makers_per_token and TTL-bump-on-write against a real Testnet instance)]

# Actuals (#2632)
actuals:
  tokens: 8000
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Admin setter shape copied from rfq_swap exactly: require_admin(&env) first statement,
      then validation, then instance write, then bump_instance, then publish"
    - "Live-read-never-cached admin-tunable value: add_tokens re-reads max_makers_per_token from
      instance storage on every call, so a live cap lowering blocks growth without evicting"
    - "Table-driven rejection tests: an [(&str, Vec<Val>); N] array of (fn_name, args) pairs
      driving MockAuthInvoke + a MockAuth signed by a funded attacker/non-admin, dispatched
      through the matching try_* client method"
    - "TTL-bump proof pattern: capture get_ttl(), advance env.ledger().with_mut() until remaining
      TTL is below the bump threshold (not expired), perform a second write, assert the TTL
      strictly increased -- asserting immediately after a fresh write proves nothing"
    - "Archival-restore probe: a throwaway #[test] establishes SDK-version-specific test-Env
      behavior empirically (advance past get_ttl(), read through the client, observe panic vs.
      success) before writing the permanent assertion, rather than assuming a testutils API shape"

key-files:
  created: []
  modified:
    - contracts/rfq_registry/src/lib.rs (set_costs, set_max_makers_per_token; no other production
      code changed -- the TTL bump call sites Task 3 audited were already correct from Plans
      01-01/01-02)
    - contracts/rfq_registry/src/test.rs (59 tests total: 39 carried from Plan 01-02 plus 20 new
      in this plan -- cost/cap setter behavior, the re-init guard, two rejection tables, nine
      event tests, a no-auth-mocked read test, the archival-restore finding, and three
      TTL-bump-on-write tests)

key-decisions:
  - "set_costs/set_max_makers_per_token are the ONLY two admin entry points this contract has;
    the header comment and a phase prohibition both record that no withdraw/sweep/drain/upgrade
    exists, because the contract's SAC balance is maker stake held in escrow"
  - "The D-04 no-eviction rule is enforced by reading max_makers_per_token fresh from instance
    storage on every add_tokens call, never a cached snapshot -- verified by mutation (snapshotting
    the cap turns the no-eviction test red)"
  - "A cost retune (set_costs) never changes what an already-registered maker is refunded, because
    eject/remove_tokens read MakerConfig.staked (what was actually paid), never a recomputation
    from the current cost values -- pinned by raising_base_cost_does_not_change_an_existing_makers_refund"
  - "Archival finding: on the pinned soroban-sdk 26.x test Env, reading a persistent entry through
    the client after the ledger advances past its own get_ttl() succeeds and returns the correct
    data. The test host auto-restores an archived entry the instant it appears in a later call's
    footprint; no explicit testutils restore call exists or is needed. This is a test-Env-only
    guarantee -- tools/rfq-registry-live.mjs remains the sole owner of the live-network claim
    (real minPersistentTTL enforcement, a real RestoreFootprintOp)."
  - "No missing TTL bump was found when every mutating entry point's call sites were audited --
    Plans 01-01/01-02 already bumped every persistent key they wrote. Task 3's contribution is the
    proof (three ledger-advance tests) and one mutation-verified check, not a lib.rs fix."

requirements-completed: [REG-01, REG-02, REG-03]

coverage:
  - id: D1
    description: "set_costs/set_max_makers_per_token are admin-gated, validated, and
      event-emitting; a non-admin caller is rejected and get_config() is unchanged"
    requirement: "REG-01"
    verification:
      - kind: unit
        ref: "contracts/rfq_registry/src/test.rs#set_costs_updates_config_and_emits_event, #set_max_makers_per_token_updates_config_and_emits_event, #set_costs_rejects_non_positive_values_and_changes_nothing, #set_max_makers_per_token_rejects_zero_and_changes_nothing, #admin_functions_reject_non_admin"
        status: pass
    human_judgment: false
  - id: D2
    description: "Lowering max_makers_per_token on a LIVE instance never evicts an existing
      maker (three survive a cap drop to 2, all still resolve, all still remove_tokens/eject
      correctly); a cost retune never changes an already-registered maker's refund"
    requirement: "REG-01"
    verification:
      - kind: unit
        ref: "contracts/rfq_registry/src/test.rs#lowering_live_cap_does_not_evict_but_blocks_new_additions, #raising_base_cost_does_not_change_an_existing_makers_refund"
        status: pass
    human_judgment: false
  - id: D3
    description: "REG-03 security surface: re-init guard changes nothing, all six maker-facing
      mutating entry points plus both admin setters reject a funded attacker/non-admin, nine
      state transitions each emit their event, and the three read-only calls need no auth and
      emit nothing"
    requirement: "REG-03"
    verification:
      - kind: unit
        ref: "contracts/rfq_registry/src/test.rs#initialize_rejects_reinit_and_leaves_config_unchanged, #maker_facing_mutations_reject_non_maker_auth, #admin_functions_reject_non_admin, #set_url_first_call_emits_maker_registered, #set_url_second_call_emits_url_updated, #add_tokens_emits_tokens_added, #remove_tokens_emits_tokens_removed, #add_protocols_emits_protocols_added, #remove_protocols_emits_protocols_removed, #eject_emits_maker_ejected, #set_costs_updates_config_and_emits_event, #set_max_makers_per_token_updates_config_and_emits_event, #read_only_calls_succeed_with_no_auth_mocked_and_emit_no_events"
        status: pass
    human_judgment: false
  - id: D4
    description: "TTL bumps on every persistent write path (Maker, Token, instance), proven
      after a ledger advance rather than on a fresh entry; the archival-restore behavior of the
      pinned SDK is a recorded, executable fact"
    requirement: "REG-02"
    verification:
      - kind: unit
        ref: "contracts/rfq_registry/src/test.rs#ttl_bumps_on_maker_write_after_ledger_advance, #ttl_bumps_on_token_write_after_ledger_advance, #ttl_bumps_on_instance_write_after_ledger_advance, #archived_persistent_entry_auto_restores_on_read"
        status: pass
    human_judgment: false
  - id: D5
    description: "Four independent mutation checks confirm the suite has teeth: a deleted
      maker.require_auth(), a deleted require_admin, a snapshotted (never re-read) cap, and a
      deleted bump_maker each turn a named test red"
    requirement: "REG-03"
    verification:
      - kind: other
        ref: "See Decisions Made / Mutation-verification results below for the exact deleted
          line and the exact test that went red, for all four checks"
        status: pass
    human_judgment: false
  - id: D6
    description: "cargo test green across all three workspace members; stellar contract build
      succeeds; rfq_registry.wasm under 64KB; otc_swap.wasm hash unmoved"
    requirement: "REG-01, REG-02, REG-03"
    verification:
      - kind: unit
        ref: "cargo test --manifest-path contracts/Cargo.toml (82/82: otc_swap 6 + rfq_swap 17 + rfq_registry 59)"
        status: pass
      - kind: other
        ref: "cd contracts && stellar contract build: rfq_registry.wasm 17,662 bytes (under 64KB); shasum -a 256 target/wasm32v1-none/release/otc_swap.wasm == 83f60b854089d1a93644483968e04b5661fef3b6006966fdead4d1221b5a4df3 (unchanged)"
        status: pass
    human_judgment: false

duration: multi-session (interrupted twice by environment sleep/network cuts; no rework required)
completed: 2026-08-26
status: complete
---

# Phase 1 Plan 3: Admin Spam Pricing & Security Surface Summary

**`rfq_registry` closes out: admin-tunable spam pricing (`set_costs`, `set_max_makers_per_token`)
that never evicts an existing maker or changes an existing refund, a funded-attacker rejection
table proving every mutating entry point actually checks its `require_auth`/`require_admin`, an
event test per state transition, and TTL-bump-on-write proven after a real ledger advance with the
`soroban-sdk` 26.x archival-restore behavior established by experiment rather than assumed — four
independent mutation checks confirm every one of these guards has teeth.**

## Performance

- **Duration:** multi-session (two environment interruptions — a machine sleep cut mid-mutation-check
  and a two-day network outage — both resumed cleanly from committed/verified state with no rework)
- **Completed:** 2026-08-26
- **Tasks:** 3 (all complete)
- **Files modified:** 2 (`contracts/rfq_registry/src/lib.rs`, `contracts/rfq_registry/src/test.rs`)
- **Tests:** 39 → 59 in `rfq_registry` (82 across the full workspace: `otc_swap` 6 + `rfq_swap` 17
  + `rfq_registry` 59)

## Accomplishments

- **`set_costs`/`set_max_makers_per_token`** (Task 1): both admin-gated (`require_admin` first
  statement), validated (`InvalidCost`/`InvalidCap` on non-positive/zero input, changing nothing on
  rejection), event-emitting (`CostsSet`/`MaxMakersSet` on pinned topics), and confirmed to be the
  ONLY two admin entry points — no `withdraw`/`sweep`/`drain`/`upgrade` exists, recorded in the
  contract header comment. A cost retune never changes an existing maker's refund
  (`MakerConfig.staked` is the frozen source of truth). The D-04 no-eviction rule was extended from
  Plan 01-02's `initialize`-time-cap shape to a genuinely LIVE cap change: three makers survive
  `set_max_makers_per_token(2)` on a populated list, all three still resolve via
  `get_urls_for_token`, and each still `remove_tokens`/`eject`s correctly, while a fourth maker's
  growth is blocked with `TokenListFull`.
- **REG-03 security surface** (Task 2): a re-init guard test that asserts BOTH the
  `AlreadyInitialized` error AND that `get_config()` still reports the first call's `admin` and
  costs (a guard that writes before it checks would still fail here). Two table-driven rejection
  tests mirroring `rfq_swap`'s `admin_functions_reject_non_admin` shape: all six maker-facing
  mutating entry points under a FUNDED attacker's auth tree, and both admin setters under a FUNDED
  non-admin — funding the interloper first so a passing test can only be explained by the auth
  check, never an empty balance (the exact false-green `rfq_swap` shipped once, per CLAUDE.md's
  Gotcha). Nine event tests, one per emitted event type, each asserting the exact XDR-encoded
  event record. One test proves the three read-only calls (`get_maker`, `get_urls_for_token`,
  `get_config`) succeed and emit nothing on an `Env` that never calls `mock_all_auths()` at all.
- **TTL bump + archival behavior** (Task 3): a throwaway probe (written, run, and deleted per the
  plan's own instruction) answered RESEARCH.md's Open Question 1: on the pinned `soroban-sdk`
  26.x test `Env`, reading a persistent entry through the client after the ledger advances past its
  own `get_ttl()` succeeds and returns the correct data — the test host auto-restores on read, no
  explicit testutils restore call exists or is needed. That finding is now a permanent test
  (`archived_persistent_entry_auto_restores_on_read`), and the file's coverage-boundary comment was
  updated to state it. Three TTL-bump tests (one each for `Maker`, `Token`, instance storage) each
  capture `get_ttl()`, advance the ledger until the remaining TTL drops below the bump threshold,
  perform a second write, and assert the TTL strictly increased — the "bump immediately after a
  fresh write" trap the plan warned against was avoided throughout. Auditing every mutating entry
  point's bump call sites found no missing bump: Plans 01-01/01-02 had already wired every write
  path correctly, so Task 3's `lib.rs` diff is empty — its contribution is the proof, not a fix.

## Task Commits

Each task was committed atomically:

1. **Task 1: The admin can retune the spam price without a redeploy** — `a2b9985` (feat) —
   `set_costs`, `set_max_makers_per_token`, the live-cap no-eviction test, the cost-retune-refund
   test; closed Plan 01-02's `TODO(01-03)`. Landed in a prior session; verified unchanged.
2. **Task 2: The contract refuses everything it should — auth, re-init, and events** — `bf74c8a`
   (test) — re-init guard, both rejection tables, nine event tests, the no-auth-mocked read test,
   plus the 10 event-fixture snapshot files this repo tracks alongside its tests.
3. **Task 3: Persistent entries stay alive — TTL bump on write, and what archival does** —
   `5e703ac` (test) — the archival-restore finding, three TTL-bump tests, plus 4 snapshot files.

## Files Created/Modified

- `contracts/rfq_registry/src/lib.rs` — `set_costs`, `set_max_makers_per_token` (Task 1 only; Task
  2 and Task 3 needed zero production-code changes — every check, event, and bump they tested was
  already correct).
- `contracts/rfq_registry/src/test.rs` — 20 new tests across Tasks 1–3 (39 → 59), plus the
  `Instance`/`Persistent`/`Ledger` testutils imports Task 3 needed for TTL manipulation. 741 net
  new lines across the plan.
- 14 new snapshot files under `contracts/rfq_registry/test_snapshots/test/` (10 event-fixture
  snapshots from Task 2, 4 TTL/archival snapshots from Task 3) — this repo tracks test snapshots
  (70 pre-existing before this plan), so these are checked in alongside their tests.

## Decisions Made

- **Mutation-verification results (four independent checks, per the plan's `<verification>`
  requirement):**
  - Deleted `maker.require_auth()` from `set_url`. Ran the full suite:
    `set_url_rejects_non_maker_auth` went red (expected a rejection, got success). Restored;
    full suite re-ran green.
  - Deleted `require_admin(&env)` from `set_costs`. Ran
    `cargo test -p rfq_registry admin_functions_reject_non_admin`: the test failed at its
    `set_costs must reject a non-admin caller` assertion. Restored; full suite re-ran green
    (55/55 at that point in the plan).
  - Task 1's live-cap mutation (carried from the prior session, reconfirmed): snapshotting
    `max_makers_per_token` outside the `add_tokens` per-call loop (instead of re-reading it fresh
    on every call) turns the no-eviction test red — a stale cap would let growth continue past the
    live-lowered limit. Restored to a live instance read.
  - Deleted the `bump_maker(&env, &key)` call from `set_url`'s existing-maker (`Some(mut cfg)`)
    branch. Ran `cargo test -p rfq_registry ttl_bumps_on_maker_write_after_ledger_advance`: the
    test failed its `ttl_after_second_write > ttl_before_second_write` assertion (the TTL stayed
    at its pre-advance value instead of jumping back to
    `PERSISTENT_TTL_EXTEND_TO`). Restored; full suite re-ran green (59/59).
- The archival-restore finding is treated as a fact about the pinned test `Env`, not a live-network
  claim: `tools/rfq-registry-live.mjs` remains the sole owner of proving TTL-bump-on-write and any
  real archival/restore behavior against the actual Testnet host (D-12).

## Deviations from Plan

None — plan executed exactly as written. Task 1 and its two mutation checks (require_auth,
require_admin) had already landed correctly by the time this session picked the plan back up;
this session's own work (finishing Task 2's mutation check, all of Task 3, the SUMMARY, and
tracking closeout) required no auto-fixes, no missing functionality, and no architectural changes.

## Known Stubs

None — every function named in the plan's artifact/output spec (`set_costs`,
`set_max_makers_per_token`) is fully implemented and tested; no placeholder values or unwired data
sources were introduced.

## Threat Flags

None — every entry point this plan touches (`set_costs`, `set_max_makers_per_token`) and every
security property this plan tests (re-init, six maker-facing auth checks, nine events, TTL bump)
was already named in the plan's `<threat_model>` STRIDE register (T-01-17 through T-01-24, T-01-SC),
and each disposition's mitigation is implemented and mutation-verified exactly as described there.
No new trust boundary or unmitigated surface was introduced.

## Issues Encountered

Two environment interruptions cut this plan's execution mid-stream (a machine sleep immediately
after confirming the `set_costs` `require_admin` mutation result, and a separate two-day network
outage). Neither caused any rework: both times, disk state (commits, working-tree diffs, and test
results) was independently re-verified before continuing, and the orchestrator's own
verification (`git log`, `git status --short`, `cargo test`) confirmed nothing was lost or
duplicated across the interruption. All 59 `rfq_registry` unit tests pass; the full 3-crate
workspace suite (82 tests) is green; `stellar contract build` succeeds for both crates;
`rfq_registry.wasm` is 17,662 bytes (well under the 64KB cap); `otc_swap.wasm`'s hash is unchanged
at `83f60b854089d1a93644483968e04b5661fef3b6006966fdead4d1221b5a4df3`.

## User Setup Required

None — no external service configuration required. This plan does not redeploy the contract; that
is Plan 01-04's job, once the full entry-point surface (all prior plans plus this plan's setters)
is final.

## Next Phase Readiness

- `rfq_registry`'s full entry-point surface for this phase is implemented, tested, and
  mutation-verified: `initialize`, `set_url`, `get_maker`, `get_config`, `eject` (01-01);
  `add_tokens`, `remove_tokens`, `get_urls_for_token`, `add_protocols`, `remove_protocols` (01-02);
  `set_costs`, `set_max_makers_per_token` (this plan).
- Plan 01-04 redeploys `rfq_registry` with this complete surface and extends
  `tools/rfq-registry-live.mjs` to prove `set_costs`/`set_max_makers_per_token` and
  TTL-bump-on-write against a real Testnet instance — this plan's live-network TTL claim is
  currently proven only for `set_url`/`get_maker`/`eject` by the existing live script (per D-12,
  the write-bumps-TTL half is a live-network property; this plan proves it against the test `Env`
  only).
- The `<flagged_assumptions>` item about REG-03's "unclassified edge probe row" is discharged in
  substance by this plan's full test surface (re-init guard, six-function rejection table, nine
  event tests) — still worth a manual look at `/gsd-verify-work` per the plan's own note.
- No blockers.

---
*Phase: 01-on-chain-maker-discovery*
*Completed: 2026-08-26*

## Self-Check: PASSED

- FOUND: contracts/rfq_registry/src/lib.rs
- FOUND: contracts/rfq_registry/src/test.rs
- FOUND commit: a2b9985
- FOUND commit: bf74c8a
- FOUND commit: 5e703ac
