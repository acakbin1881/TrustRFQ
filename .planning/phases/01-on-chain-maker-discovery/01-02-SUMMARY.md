---
phase: 01-on-chain-maker-discovery
plan: 02
subsystem: contracts
tags: [soroban, rust, stellar, testnet, rfq_registry, mutation-testing]

# Dependency graph
requires:
  - phase: 01-01
    provides: rfq_registry contract (initialize/set_url/get_maker/get_config/eject), deployed on
      Testnet as the tracer slice; this plan's storage shape and conventions build directly on it
provides:
  - add_tokens/remove_tokens (per-token staking, bounded on two independent axes) and
    get_urls_for_token (the exact discovery read Phase 2's desk issues per pair)
  - add_protocols/remove_protocols (stake-free maker protocol declarations, capped at 8)
  - eject extended to delist the maker from every Token(t) list before removing its entry
  - Mutation-verified proof that both list-bound checks (MAX_TOKENS_PER_MAKER fixed constant,
    max_makers_per_token admin-tunable instance value) have teeth, and are independent of each
    other
affects: [01-03 (adds set_costs/set_max_makers_per_token; closes this plan's TODO on the live
  no-eviction assertion), 01-04 (redeploys this contract with the full entry-point surface)]

# Actuals (#2632)
actuals:
  tokens: 9000
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "checked_mul_count(amount, count): a per-count checked-multiply helper mirroring rfq_swap's
      mul_bps, mapped to Error::MathOverflow rather than a silent wrap"
    - "Two independent bounded-Vec checks in one function: a fixed code-constant cap on the
      calling maker's own list, and a live-read (never cached) admin-tunable cap on the shared
      per-token list, checked in two different places inside the same add_tokens loop"
    - "Index-based Vec::remove (never swap-remove) to keep get_urls_for_token's insertion order
      observable and stable across removals"
    - "Read-only discovery calls (get_urls_for_token) skip dangling references defensively
      instead of panicking, even though the lists are kept in sync by every mutating call"

key-files:
  created: []
  modified:
    - contracts/rfq_registry/src/lib.rs (add_tokens, remove_tokens, get_urls_for_token,
      add_protocols, remove_protocols, eject extended to delist, 4 new events,
      checked_mul_count helper)
    - contracts/rfq_registry/src/test.rs (39 tests total: 12 carried from Plan 01-01 plus 27 new
      in this plan, covering stake/refund exactness, ordering, rollback, empty/duplicate/
      unregistered rejection, both cap boundaries, and cap independence)

key-decisions:
  - "add_tokens/remove_tokens check duplicates by testing membership in the GROWING cfg.tokens as
    the loop proceeds, so an intra-call duplicate and a pre-existing duplicate are the exact same
    code path and the exact same error (D-05)"
  - "An abandoned Token(t) list (emptied by remove_tokens or eject) is deleted outright rather
    than stored as an empty Vec, so it stops paying rent"
  - "add_protocols/remove_protocols apply the SAME strict duplicate semantics as the token
    functions (D-05 names only the token functions; this is a planner decision recorded in the
    doc comment above add_protocols, per RESEARCH.md Open Question 2 and CONTEXT.md's
    Claude's-Discretion consistency bar) -- cheap to soften later, no storage shape change"
  - "Task 2's add_protocols/remove_protocols implementation shipped inside Task 1's commit
    (c9ab41b) rather than its own -- see Deviations. Task 2's own commit (16854af) carries only
    the tests that pin that already-implemented behavior."

requirements-completed: [REG-01, REG-02]

coverage:
  - id: D1
    description: "add_tokens/remove_tokens stake and refund exactly per_token_cost per token,
      keep MakerConfig.tokens and Token(Address) in sync; get_urls_for_token returns
      insertion-ordered urls for a registered token and an empty Vec for an unknown one; eject
      delists from every token list and refunds MakerConfig.staked in full"
    requirement: "REG-01"
    verification:
      - kind: unit
        ref: "contracts/rfq_registry/src/test.rs#add_tokens_stakes_and_lists_maker, #remove_tokens_refunds_and_delists, #eject_delists_from_every_token_and_refunds_full_stake, #get_urls_for_token_empty_for_unregistered_token, #remove_from_middle_preserves_order, #get_urls_for_token_resolves_twenty_makers_in_insertion_order"
        status: pass
    human_judgment: false
  - id: D2
    description: "add_protocols/remove_protocols work, are capped at 8, and move no stake"
    requirement: "REG-01"
    verification:
      - kind: unit
        ref: "contracts/rfq_registry/src/test.rs#add_protocols_and_remove_protocols_move_no_stake, #add_protocols_caps_at_eight_per_maker, #remove_protocols_preserves_order_of_survivors"
        status: pass
    human_judgment: false
  - id: D3
    description: "Both caps (MAX_TOKENS_PER_MAKER fixed constant, max_makers_per_token
      admin-tunable) reject at their exact boundary, are independent, and are mutation-verified
      (deleting either check turns its named test(s) red)"
    requirement: "REG-02"
    verification:
      - kind: unit
        ref: "contracts/rfq_registry/src/test.rs#per_token_cap_rejects_at_exact_boundary, #per_maker_cap_rejects_the_33rd_token_and_accepts_the_32nd, #per_maker_cap_rejects_a_batch_that_would_cross_the_boundary, #caps_are_independent_full_token_list_vs_full_maker_list, #caps_are_independent_maker_at_own_cap_rejected_even_with_empty_token_lists"
        status: pass
      - kind: other
        ref: "Manual mutation run this session: deleted the MAX_TOKENS_PER_MAKER check in add_tokens, ran `cargo test -p rfq_registry per_maker_cap`, both per_maker_cap_* tests failed; restored, re-ran full suite, 39/39 green. Deleted the max_makers_per_token check, ran `cargo test -p rfq_registry per_token_cap`, per_token_cap_rejects_at_exact_boundary failed (per_token_cap_accepts_exactly_one_more_at_cap_minus_one stayed green, as expected since it never reaches the boundary); restored, re-ran full suite, 39/39 green."
        status: pass
    human_judgment: false
  - id: D4
    description: "cargo test green across all three workspace members; stellar contract build
      succeeds; rfq_registry.wasm under 64KB; otc_swap.wasm hash unmoved"
    requirement: "REG-01, REG-02"
    verification:
      - kind: unit
        ref: "cargo test --manifest-path contracts/Cargo.toml (62/62: otc_swap 6 + rfq_swap 17 + rfq_registry 39)"
        status: pass
      - kind: other
        ref: "cd contracts && stellar contract build: rfq_registry.wasm 15,828 bytes (well under 64KB); shasum -a 256 target/wasm32v1-none/release/otc_swap.wasm == 83f60b854089d1a93644483968e04b5661fef3b6006966fdead4d1221b5a4df3 (unchanged)"
        status: pass
    human_judgment: false

duration: 1 session
completed: 2026-08-24
status: complete
---

# Phase 1 Plan 2: Token & Protocol Discovery Summary

**`rfq_registry` gained the capability the whole registry exists for: a maker can price-stake the tokens it quotes (`add_tokens`/`remove_tokens`), a client can discover makers by token in one free read (`get_urls_for_token`, insertion-ordered), a maker can declare the protocols it speaks at no stake cost, and both list-bound caps — a fixed per-maker constant and an admin-tunable per-token ceiling — are proven independent of each other by mutation testing, not just by inspection.**

## Performance

- **Duration:** single session
- **Completed:** 2026-08-24
- **Tasks:** 3 (all complete)
- **Files modified:** 2 (`contracts/rfq_registry/src/lib.rs`, `contracts/rfq_registry/src/test.rs`)
- **Tests:** 12 → 39 in `rfq_registry` (62 across the full workspace: `otc_swap` 6 + `rfq_swap` 17 + `rfq_registry` 39)

## Accomplishments

- **`add_tokens`/`remove_tokens`** (Task 1): a registered maker stakes exactly `per_token_cost`
  per token added, refunded exactly on removal; `MakerConfig.tokens` and the per-token
  `Token(Address)` reverse-index list stay in sync; D-05 strict duplicate semantics apply
  identically to a pre-existing duplicate and an intra-call duplicate within the same input `Vec`
  (both check membership against the same growing `cfg.tokens`); an abandoned `Token(t)` list is
  deleted outright rather than stored empty, so it stops paying rent; a failing multi-token call
  leaves both the maker's token list and the contract's SAC balance byte-identical to their
  pre-call state (Soroban's host-level all-or-nothing rollback, no manual unwind code written).
- **`get_urls_for_token`** (Task 1): free, unauthenticated, read-only discovery call — no auth, no
  writes, no TTL bump. Returns urls in the `Token(t)` list's own insertion order (index-based
  removal, never swap-remove, keeps this observable stable); an unregistered token returns an
  empty `Vec`, never an error; defensively skips any listed address whose `Maker` entry is
  missing rather than panicking. A 20-maker `Token(t)` list resolved correctly in the exact
  insertion order — the read-volume probe for the phase's flagged assumption about Soroban's
  per-transaction read-entry limit (assumption 3 in the plan's `flagged_assumptions`; still only
  measured via RPC simulation, not a submitted transaction).
- **`eject` extended** (Task 1): before removing `Maker(maker)`, iterates `MakerConfig.tokens` and
  removes the maker from every `Token(t)` list it appears in, deleting the key outright when the
  list becomes empty — no dangling address survives for `get_urls_for_token` to resolve. The
  refund stays `cfg.staked` in full, one transfer, unrecomputed from current cost values.
- **`add_protocols`/`remove_protocols`** (Task 2): the stake-free mirror of the token functions —
  same preamble (`require_auth`, empty-input, `NotRegistered`), same D-05-style strict duplicate
  semantics, capped at `MAX_PROTOCOLS_PER_MAKER` (8). The doc comment above `add_protocols` in
  `lib.rs` names D-08 and records explicitly that applying D-05's strict semantics to protocols
  is a planner decision extending, not required by, the locked decision.
- **Both caps hardened and mutation-verified** (Task 3): `setup_with_cap(cap)` and
  `fill_token_list(s, token, n)` test-harness helpers let the per-token cap be exercised at a
  small value (3) instead of registering 100 makers. Nine new boundary/independence tests cover:
  the per-token cap rejecting at the exact boundary and accepting `cap - 1` plus one; the
  per-maker cap rejecting the 33rd token, accepting the 32nd, and rejecting a single batch call
  that would cross 30→33 in full (`get_maker(maker).tokens.len()` unchanged at 30, not
  partially applied); two independence tests (a maker under its own cap blocked by a full
  `Token(t)` list, and a maker at its own cap blocked even when every target list is empty); a
  D-04 no-eviction shape test against the `initialize`-time cap with a `TODO(01-03)` naming the
  live `set_max_makers_per_token` extension; and a test that a maker at/above a lowered cap can
  still `remove_tokens`/`eject` normally.

## Task Commits

Each task was committed atomically:

1. **Task 1: A maker declares the tokens it quotes, and a client discovers it by token** —
   `c9ab41b` (feat) — `add_tokens`, `remove_tokens`, `get_urls_for_token`, `eject` extended to
   delist, 4 new events, `checked_mul_count` helper, 13 new tests (12 → 25)
2. **Task 2: A maker declares which protocols it speaks** — `16854af` (test) — 7 new tests
   pinning `add_protocols`/`remove_protocols` behavior (25 → 31). See Deviations: the
   implementation itself shipped in Task 1's commit.
3. **Task 3: Both caps hold at their exact boundary, and the boundary is live** — `f4fb4e6`
   (test) — `setup_with_cap`/`fill_token_list` harness helpers, 8 new boundary/independence
   tests (31 → 39), mutation-verified both cap check sites

## Files Created/Modified

- `contracts/rfq_registry/src/lib.rs` - `add_tokens`, `remove_tokens`, `get_urls_for_token`,
  `add_protocols`, `remove_protocols`, `eject` extended to delist, `TokensAdded`/`TokensRemoved`/
  `ProtocolsAdded`/`ProtocolsRemoved` events, `checked_mul_count` internal helper. 290 net new
  lines.
- `contracts/rfq_registry/src/test.rs` - 27 new tests (12 → 39), plus `setup_with_cap`,
  `fill_token_list`, `register_new_maker`, `token_addr` harness helpers. 402 net new lines.

## Decisions Made

- Duplicate detection for `add_tokens` checks membership in `cfg.tokens` as it grows during the
  same call, which is what makes a pre-existing duplicate and an intra-call duplicate collapse to
  one code path and one error (`TokenAlreadyAdded`) — no separate "seen this call" tracking
  structure needed.
- An abandoned `Token(t)` list (emptied by `remove_tokens` or `eject`) is deleted from storage
  outright rather than left as an empty `Vec`, matching the project's rent-discipline convention.
- `add_protocols`/`remove_protocols` extend D-05's strict duplicate semantics to protocols by
  planner discretion (RESEARCH.md Open Question 2), recorded explicitly in the doc comment above
  `add_protocols` so a future reader can find and, if the user disagrees, cheaply revisit it — no
  storage shape depends on the choice.
- **Mutation-verification results (recorded per the plan's `<verification>` requirement):**
  - Deleted the `MAX_TOKENS_PER_MAKER` check (`cfg.tokens.len() + tokens.len() >
    MAX_TOKENS_PER_MAKER`) in `add_tokens`. Ran `cargo test -p rfq_registry per_maker_cap`: both
    `per_maker_cap_rejects_the_33rd_token_and_accepts_the_32nd` and
    `per_maker_cap_rejects_a_batch_that_would_cross_the_boundary` failed (expected a rejection,
    got `Ok(())`). Restored the check; full suite re-ran green (39/39).
  - Deleted the `max_makers_per_token` check (`list.len() >= cap`) in the same function. Ran
    `cargo test -p rfq_registry per_token_cap`: `per_token_cap_rejects_at_exact_boundary` failed
    (expected `TokenListFull`, got `Ok(())`); `per_token_cap_accepts_exactly_one_more_at_cap_minus_one`
    stayed green, as expected since that test never reaches the boundary either way. Restored the
    check; full suite re-ran green (39/39).
  - Both checks are therefore proven to have teeth, and proven independent: deleting one leaves
    the other's dedicated tests passing.
- **20-maker `get_urls_for_token` observation (flagged assumption 3):** resolved correctly and
  quickly under `mock_all_auths()` test conditions (one `Token(t)` entry read plus 20 `Maker(a)`
  entry reads). This is a unit-test result, not a measurement of Soroban's live per-transaction
  read-entry ceiling at `max_makers_per_token = 100` — that remains for Plan 01-04's live check to
  establish, per the plan's own framing of this assumption.

## Deviations from Plan

### Process deviation (not a Rule 1-4 case — no user permission needed, documented for
transparency)

**1. Task 2's implementation code shipped inside Task 1's commit, not its own**
- **What happened:** While implementing Task 1 (`add_tokens`/`remove_tokens`/
  `get_urls_for_token`), the natural single edit to `lib.rs` that inserted the new methods into
  the `impl RfqRegistry` block was written in one pass that also included `add_protocols`/
  `remove_protocols` (Task 2's functions), because they sit in the same file region and share the
  exact same preamble shape the plan explicitly calls "the stake-free mirror." The edit was
  committed as part of Task 1's commit (`c9ab41b`) before Task 2's tests were written.
- **Impact:** No functional impact — every acceptance criterion for both tasks is still met, and
  both tasks are still individually verifiable in the git history (Task 1's commit message lists
  only the token functions it intended; Task 2's commit contains the tests that exercise the
  protocol functions actually written in Task 1's commit, plus the doc-comment requirement
  Task 2's acceptance criteria named). The two commits are not perfectly atomic to their named
  task boundaries as a result — Task 2's commit is test-only, referencing code that landed a
  commit earlier.
- **Not a Rule 1-4 case:** no bug was found, no missing functionality was added, no blocking
  issue was fixed, and no architectural change occurred. This is purely a commit-boundary
  granularity note for anyone reading `git log` expecting Task 2's commit to introduce
  `add_protocols`/`remove_protocols`.
- **Files affected:** `contracts/rfq_registry/src/lib.rs` (committed in `c9ab41b`),
  `contracts/rfq_registry/src/test.rs` (protocol tests committed separately in `16854af`).

**Total deviations:** 1 (process/commit-boundary, no functional or architectural impact).

## Known Stubs

None — every function in the plan's artifact/output spec is fully implemented and tested; no
placeholder values, hardcoded empties, or unwired data sources were introduced.

## Threat Flags

None — every new entry point (`add_tokens`, `remove_tokens`, `get_urls_for_token`,
`add_protocols`, `remove_protocols`) and the extended `eject` were already named in the plan's
`<threat_model>` STRIDE register (T-01-09 through T-01-16), and each disposition's mitigation is
implemented and unit-tested exactly as described there. No new trust boundary or unmitigated
surface was introduced.

## Issues Encountered

None. All 39 `rfq_registry` unit tests pass; the full 3-crate workspace suite (62 tests) is
green; `stellar contract build` succeeds for both crates; `rfq_registry.wasm` is 15,828 bytes
(well under the 64KB cap); `otc_swap.wasm`'s hash is unchanged at
`83f60b854089d1a93644483968e04b5661fef3b6006966fdead4d1221b5a4df3`.

## User Setup Required

None — no external service configuration required. This plan does not redeploy the contract
(that is Plan 01-04's job, once the full entry-point surface including Plan 01-03's admin
setters exists).

## Next Phase Readiness

- `add_tokens`/`remove_tokens`/`get_urls_for_token`/`add_protocols`/`remove_protocols` are
  implemented, tested, and mutation-verified against the two independent list-bound caps.
- **Open TODO for Plan 01-03 (`test::lowering_cap_does_not_evict_existing_makers_but_blocks_new_additions`):**
  once `set_max_makers_per_token` lands, extend that test to lower the cap on a LIVE instance
  after three makers are already registered (rather than only at `initialize` time), and assert
  all three survive, `get_urls_for_token` still returns three urls, and a fourth maker's
  `add_tokens` is rejected with `Err(Error::TokenListFull)`. This closes the D-04 no-eviction
  rule's live-cap half.
- Plan 01-03 adds `set_costs`/`set_max_makers_per_token` (the admin setters this plan's tests
  work around via `setup_with_cap` at `initialize` time only).
- Plan 01-04 redeploys `rfq_registry` with the full entry-point surface (this plan's functions
  plus Plan 01-03's setters) and extends `tools/rfq-registry-live.mjs` to prove
  `add_tokens`/`get_urls_for_token`/`add_protocols` against a real Testnet instance — Plan 01-01's
  live script only proved `set_url`/`get_maker`/`eject`.
- No blockers.

---
*Phase: 01-on-chain-maker-discovery*
*Completed: 2026-08-24*

## Self-Check: PASSED

- FOUND: contracts/rfq_registry/src/lib.rs
- FOUND: contracts/rfq_registry/src/test.rs
- FOUND commit: c9ab41b
- FOUND commit: 16854af
- FOUND commit: f4fb4e6
