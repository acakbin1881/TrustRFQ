---
phase: 01-on-chain-maker-discovery
plan: 01
subsystem: contracts
tags: [soroban, rust, stellar, testnet, rfq_registry, cargo-workspace]

# Dependency graph
requires:
  - phase: none (first plan of Phase 1)
    provides: contracts/rfq_swap (Phase 0) as the pattern analog for storage/TTL/error/event conventions
provides:
  - rfq_registry Soroban contract (initialize/set_url/get_maker/get_config/eject) as the third
    Cargo workspace member, deployed and proven on Testnet
  - tools/rfq-registry-live.mjs, a repeatable live-Testnet proof of register->discover->eject
  - Confirmed assumption: a contract needs no extra auth to be the `from` of its own SAC transfer
    (RESEARCH.md Assumption A1) -- proven by the live `eject` refund leg
  - Confirmed assumption: plain `initialize` + explicit re-init guard works correctly where
    `rfq_swap` used `__constructor` (RESEARCH.md Pitfall 1)
  - Confirmed: adding a third workspace member does not move `otc_swap`'s deployed wasm hash
affects: [01-02, 01-03, 01-04 (redeploys this contract with the full entry-point surface)]

# Actuals (#2632)
actuals:
  tokens: 9200
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Plain #[contractimpl] initialize() with an explicit env.storage().instance().has(&DataKey::Admin) guard, instead of __constructor, when a requirement names initialize as a callable entry point and demands a re-init-guard test"
    - "Contract-as-escrow: token::Client::transfer with env.current_contract_address() as `to` (stake) or `from` (refund); the refund leg needs no extra require_auth beyond the maker's own call-scoped auth"
    - "Persistent per-key storage bumped on every write via a bump_<entity> helper mirroring bump_instance, with no contract-side keep-alive entry point"

key-files:
  created:
    - contracts/rfq_registry/Cargo.toml
    - contracts/rfq_registry/src/lib.rs
    - contracts/rfq_registry/src/test.rs
    - tools/rfq-registry-live.mjs
  modified:
    - contracts/Cargo.toml (members list gains "rfq_registry")

key-decisions:
  - "rfq_registry uses a plain callable initialize() with an explicit AlreadyInitialized guard, deliberately diverging from rfq_swap's __constructor, because REG-01 names initialize as an entry point and REG-03 requires a re-init-guard test"
  - "No upgrade entry point on rfq_registry: the contract escrows every maker's stake as its own SAC balance, so an admin-invokable wasm swap would be a standing route to spend funds that are not the admin's (phase prohibition)"
  - "Deployed Testnet instance: CCJDJKXBZRVYOB2QD4A6UYNJRGNC27I6TZLC22DXNYHQXWXDIO6FYYM6, wasm sha256 822722d2f25e09cb1344a1e6547eb927e62f3b6fc37f12c29b544fa5f6a3ec4c, admin GB3WSGXR5GBMJ7HSBWTBWSWGI3A5AJGD4Y254XBI2P6AKS5N2VIXV7HI, stake_token (native XLM SAC) CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC, base_cost 1_000_000_000 (100 XLM), per_token_cost 100_000_000 (10 XLM), max_makers_per_token 100"
  - "Finding, not a bug: Testnet's STATE_ARCHIVAL minPersistentTTL (120,960 ledgers) already exceeds PERSISTENT_TTL_THRESHOLD (17,280) on entry creation, so bump_maker's extend_ttl call is a correct no-op on the very first write; live-check assertion corrected to match observed network floor instead of the higher PERSISTENT_TTL_EXTEND_TO value"

patterns-established:
  - "Pattern: plain initialize() + explicit re-init guard for contracts whose requirements literally name a callable initialize and demand a runtime re-init test (contrast with __constructor, still correct for rfq_swap)"
  - "Pattern: gate any Cargo workspace member addition on the sibling deployed contract's wasm hash staying byte-identical before considering the change safe"

requirements-completed: [REG-01, REG-02, REG-03]

coverage:
  - id: D1
    description: "rfq_registry contract (initialize/set_url/get_maker/get_config/eject) added as the third Cargo workspace member, with otc_swap.wasm hash unchanged"
    requirement: "REG-01"
    verification:
      - kind: unit
        ref: "cargo test --manifest-path contracts/Cargo.toml (35/35 passing: otc_swap 6 + rfq_swap 17 + rfq_registry 12)"
        status: pass
      - kind: other
        ref: "shasum -a 256 contracts/target/wasm32v1-none/release/otc_swap.wasm == 83f60b854089d1a93644483968e04b5661fef3b6006966fdead4d1221b5a4df3"
        status: pass
    human_judgment: false
  - id: D2
    description: "Bounded persistent storage (MakerConfig/Config/DataKey), stake escrow via the contract's own native-XLM SAC balance, TTL bumped on every write"
    requirement: "REG-02"
    verification:
      - kind: unit
        ref: "contracts/rfq_registry/src/test.rs#set_url_stakes_and_creates_config, #set_url_update_no_restake, #eject_refunds_full_stake_and_removes_entry"
        status: pass
    human_judgment: false
  - id: D3
    description: "Deployed on Testnet; unit tests for re-init guard, auth-gating, D-06 zero-restake; live Friendbot round trip register->discover->eject with exact balance deltas"
    requirement: "REG-03"
    verification:
      - kind: unit
        ref: "contracts/rfq_registry/src/test.rs#initialize_rejects_reinit_and_leaves_config_unchanged, #set_url_rejects_non_maker_auth"
        status: pass
      - kind: integration
        ref: "node tools/rfq-registry-live.mjs against CCJDJKXBZRVYOB2QD4A6UYNJRGNC27I6TZLC22DXNYHQXWXDIO6FYYM6 (register tx 4075c5b6..., update tx cdb6c071..., eject tx b7217f0b...)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A second initialize() call against the live deployed instance is rejected with AlreadyInitialized and leaves get_config unchanged"
    requirement: "REG-03"
    verification:
      - kind: integration
        ref: "stellar contract invoke -- initialize (second call) against CCJDJKXBZRVYOB2QD4A6UYNJRGNC27I6TZLC22DXNYHQXWXDIO6FYYM6 -> Error(Contract, #1); get_config unchanged"
        status: pass
    human_judgment: false

duration: 86min
completed: 2026-08-24
status: complete
---

# Phase 1 Plan 1: rfq_registry Tracer Slice Summary

**A stake-gated `rfq_registry` Soroban contract (initialize/set_url/get_maker/get_config/eject) is deployed and proven end-to-end on Testnet: a Friendbot-funded maker registers, is discovered read-only, updates its URL for zero extra stake, and recovers its full 100 XLM on eject — with `otc_swap`'s deployed wasm hash unmoved.**

## Performance

- **Duration:** 86 min (spanning the deploy/initialize session and this verification/closeout session)
- **Started:** 2026-08-24T11:14:20Z
- **Completed:** 2026-08-24T12:40:00Z
- **Tasks:** 2 (both complete)
- **Files modified:** 5 (`contracts/Cargo.toml`, `contracts/rfq_registry/Cargo.toml`, `contracts/rfq_registry/src/lib.rs`, `contracts/rfq_registry/src/test.rs`, `tools/rfq-registry-live.mjs`)

## Accomplishments

- `rfq_registry` joined the Cargo workspace as its third member (`contracts/Cargo.toml` `members = ["otc_swap", "rfq_swap", "rfq_registry"]`), with `otc_swap.wasm` re-verified byte-identical (`83f60b85...`) after the change.
- Implemented `initialize` (plain function + explicit re-init guard, deliberately diverging from `rfq_swap`'s `__constructor`), `set_url` (first-call stake, in-place update on repeat per D-06), `get_maker`, `get_config`, and `eject` (full refund, no `upgrade` entry point by design).
- 12 new unit tests (35 total across the workspace) covering the re-init guard, non-positive cost/zero-cap rejection, D-06 zero-restake, invalid-url rejection, non-maker-auth rejection, full-refund eject, and re-registration after eject.
- Deployed to Testnet in a two-step sequence (upload+create, then a separate `initialize` invoke) at contract id `CCJDJKXBZRVYOB2QD4A6UYNJRGNC27I6TZLC22DXNYHQXWXDIO6FYYM6`, wasm sha256 `822722d2f25e09cb1344a1e6547eb927e62f3b6fc37f12c29b544fa5f6a3ec4c` (confirmed byte-identical between the local `stellar contract build` output and `stellar contract fetch` against the live instance).
- Confirmed the deployed instance rejects a second `initialize` call with `AlreadyInitialized` and leaves `get_config` unchanged.
- Wrote and ran `tools/rfq-registry-live.mjs`: a self-contained, Friendbot-funded live proof of register (`set_url`) -> discover (`get_maker`) -> update (`set_url` again, D-06) -> eject, asserting exact native-XLM balance deltas via the native SAC's own `balance` read. All checks pass; deliberately breaking one assertion was confirmed to make the run exit non-zero (then restored).

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "a maker registers and is refunded" — one path only** - `d25b7a4` (feat) — third workspace member, contract implementation, 12 unit tests, deployed and initialized on Testnet
2. **Task 2: Turn the round trip into a repeatable, asserting live check** - `f94e277` (feat) — `tools/rfq-registry-live.mjs`, plus two bug fixes discovered while running it live (see Deviations)

**Plan metadata:** (this commit)

## Files Created/Modified

- `contracts/rfq_registry/Cargo.toml` - Third workspace member manifest, structurally identical to `rfq_swap`'s
- `contracts/rfq_registry/src/lib.rs` - The contract: `MakerConfig`/`Config`/`DataKey`/`Error` types, `initialize`/`set_url`/`get_maker`/`get_config`/`eject`, header comment recording the deliberate `initialize`-vs-`__constructor` divergence and the deliberate absence of an `upgrade` entry point
- `contracts/rfq_registry/src/test.rs` - 12 unit tests plus a coverage-boundary comment pointing at the live script for what mocked auth cannot prove
- `contracts/Cargo.toml` - `members` gains `"rfq_registry"`; `[profile.release]` untouched at the root
- `tools/rfq-registry-live.mjs` - Self-contained Friendbot live proof; structural copy of `tools/rfq-live-swap.mjs`

## Decisions Made

- Deployed Testnet instance: contract id `CCJDJKXBZRVYOB2QD4A6UYNJRGNC27I6TZLC22DXNYHQXWXDIO6FYYM6`; wasm sha256 `822722d2f25e09cb1344a1e6547eb927e62f3b6fc37f12c29b544fa5f6a3ec4c`; admin `GB3WSGXR5GBMJ7HSBWTBWSWGI3A5AJGD4Y254XBI2P6AKS5N2VIXV7HI`; `stake_token` (native XLM SAC) `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`; `base_cost` 1,000,000,000 stroops (100 XLM); `per_token_cost` 100,000,000 stroops (10 XLM); `max_makers_per_token` 100. **Plan 01-04 redeploys this contract with the full entry-point surface and will need this id/hash for a before/after comparison.**
- Testnet transaction hashes:
  - Upload wasm: `276bdab042c0e1f9648883948c478fff0193a24b14ba3e3b91f8c2347c2ef882`
  - Create contract: `d2b50f71beb6c745822e9e5b4212203f8258404aeb06e2b4de40813a51cbad2e`
  - Initialize: `d549918be5aa978078a1206bcf33a322b492f04f96d7759327a06a78f9eebaf1`
  - Live-check `set_url` (register): `4075c5b6b61d616d74de61ee57ed2c19e4c966677a2876d6883395254173cdca`
  - Live-check `set_url` (update, D-06): `cdb6c07179c292a1d3e336604a418666910f99cad8ee89e83f21953cea3af3f9`
  - Live-check `eject`: `b7217f0b378b90318419c0e1b1ce3829dacdb4f715f269e3e471ccd3000accb9`
- `rfq_registry` ships with no `upgrade` entry point (unlike `rfq_swap`): the contract escrows every registered maker's stake, and an admin-invokable wasm swap would be a permanent route to spend funds that are not the admin's — recorded in the header comment as intentional, not a gap.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `tools/rfq-registry-live.mjs` referenced `xdr` and `Durability` without importing them**
- **Found during:** Task 2, first live run
- **Issue:** The script (already drafted from a prior interrupted session) used `xdr.ScVal.scvVec(...)` in `makerKeyScVal` and `Durability.Persistent` in `makerLiveUntil`, but neither `xdr` nor `Durability` were destructured/imported from `@stellar/stellar-sdk`. Both functions would throw `ReferenceError` the first time they ran.
- **Fix:** Added `xdr` to the top-level import and `Durability` to the `const { Server, Api, assembleTransaction, Durability } = rpc;` destructure (confirmed via `node -e` inspection of the installed SDK that `Durability` lives at `rpc.Durability`, not `rpc.Server.Durability`).
- **Files modified:** `tools/rfq-registry-live.mjs`
- **Verification:** Script ran end-to-end without a `ReferenceError`.
- **Committed in:** `f94e277` (Task 2 commit)

**2. [Rule 1 - Bug] D-12 TTL assertion window did not match live Testnet behavior**
- **Found during:** Task 2, first live run
- **Issue:** The assertion expected the freshly-created `Maker` entry's `liveUntilLedgerSeq` to sit ~518,400 ledgers (`PERSISTENT_TTL_EXTEND_TO`) past the current ledger. The observed delta was 120,959 ledgers. Investigation confirmed Testnet's own `STATE_ARCHIVAL` config floors a freshly-created persistent entry's TTL at the network's `minPersistentTTL` (120,960 ledgers), which already exceeds this contract's `PERSISTENT_TTL_THRESHOLD` (17,280) — so `bump_maker`'s `extend_ttl` call is a correct, harmless no-op on the very first write (there is no "remaining TTL below threshold" for it to act on). This exact finding was already anticipated in the script's own header comment from the prior session, but the numeric assertion had not been updated to match.
- **Fix:** Rewrote the check to assert the observed network-floor value (`ttlDelta` within ±10 of 120,960) instead of the unreachable `PERSISTENT_TTL_EXTEND_TO` window, and expanded the inline comment to explain why this still proves the entry is genuine, rent-bearing persistent storage rather than a live-check bug. Proving the higher-threshold `extend_to` branch actually firing would require an entry that has decayed near `PERSISTENT_TTL_THRESHOLD` first, which live Testnet cannot be made to do inside one script run — noted as a limitation, not a gap to close in this plan.
- **Files modified:** `tools/rfq-registry-live.mjs`
- **Verification:** Re-ran the live script; all checks pass, including the corrected TTL check (`delta=120959` against expected `~120960`).
- **Committed in:** `f94e277` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs in the live-check script surfaced by actually running it against Testnet).
**Impact on plan:** Both fixes were necessary for the live-check script to run and to assert something true. No scope creep; no contract code was touched by either fix.

## Issues Encountered

- This plan's Task 1 work (contract implementation, 12 unit tests, workspace wiring, Testnet deploy + initialize) had already been committed (`d25b7a4`) and the deployment already performed by an earlier, interrupted execution session before this session began. This session verified every Task 1 acceptance criterion against the live deployed instance (config readback, re-init rejection, wasm-hash match between local build and `stellar contract fetch`) rather than re-doing the work, then completed Task 2 (writing/fixing/running `tools/rfq-registry-live.mjs`) and this closeout.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `rfq_registry` is live on Testnet with the tracer entry-point surface (`initialize`/`set_url`/`get_maker`/`get_config`/`eject`) proven end-to-end; the three RESEARCH.md assumptions this phase's architecture rests on (plain `initialize` + guard, contract-as-refund-source needing no extra auth, workspace-member addition not moving `otc_swap`'s hash) are all confirmed, not just modeled.
- Plan 01-02/01-03 can build directly on this contract's storage shape and conventions (`add_tokens`, `add_protocols`, `set_costs`, `set_max_makers_per_token`, `get_urls_for_token`).
- Plan 01-04 will redeploy this contract with the full entry-point surface: the contract id (`CCJDJKXBZRVYOB2QD4A6UYNJRGNC27I6TZLC22DXNYHQXWXDIO6FYYM6`) and wasm hash (`822722d2...`) recorded above are the "before" side of that comparison.
- No blockers.

---
*Phase: 01-on-chain-maker-discovery*
*Completed: 2026-08-24*
