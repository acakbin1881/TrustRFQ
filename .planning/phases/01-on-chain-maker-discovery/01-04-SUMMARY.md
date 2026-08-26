---
phase: 01-on-chain-maker-discovery
plan: 04
subsystem: contracts
tags: [soroban, rust, stellar, testnet, rfq_registry, deploy, config]

# Dependency graph
requires:
  - phase: 01-01
    provides: rfq_registry tracer contract, tools/rfq-registry-live.mjs skeleton, the
      Friendbot/simulate/assemble/submit helper shape to extend
  - phase: 01-02
    provides: add_tokens/remove_tokens/get_urls_for_token/add_protocols/remove_protocols
  - phase: 01-03
    provides: set_costs/set_max_makers_per_token, the full mutation-verified security surface,
      and the unit-test TTL-bump-on-write proof this plan's live check complements
provides:
  - The complete rfq_registry redeployed and initialized on Testnet at
    CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G, superseding the Plan 01-01 tracer
    instance
  - tools/rfq-registry-live.mjs extended to prove the full surface live: register -> D-06 update
    -> add_tokens (two real Testnet token addresses) -> discover by token -> get_maker -> eject
    with an exact full refund, plus a self-cleaning read-cost probe for get_urls_for_token
  - RFQ_REGISTRY_ID wired into public/otc-config.js and src/config.ts (registryEnabled), following
    the OTC_CONTRACT_ID/RFQ_SWAP_CONTRACT_ID pattern exactly
  - Corrected empirical finding on D-12: live TTL-bump-on-write cannot show a strict increase
    across two writes made close together in time on Testnet, because the network's creation-time
    TTL floor (120,960 ledgers) already exceeds the contract's bump threshold (17,280 ledgers) --
    only Plan 01-03's unit tests (via env.ledger().with_mut()) can force the threshold-crossing
    branch to actually fire
  - Measured get_urls_for_token's live RPC resource cost and confirmed max_makers_per_token = 100
    needs no retune before Phase 2 (human-confirmed at the checkpoint)
affects: [02 (desk taker path consumes RFQ_REGISTRY_ID and get_urls_for_token for discovery)]

# Actuals (#2632)
actuals:
  tokens: 7200
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read the maker's persistent ledger key out of a get_maker simulation's own resource
      footprint (transactionData.build().resources().footprint().readOnly()) rather than
      hand-encoding the DataKey enum-variant XDR -- confirmed working live, kept the hand-encoded
      makerKeyScVal + getContractData path only as a documented fallback"
    - "When a live-network TTL/timing assumption in a plan's task text conflicts with an already
      empirically-established finding from an earlier plan in the same phase, correct the
      assertion to match the network's real behavior and document why in both the script's header
      comment and the SUMMARY, rather than silently forcing a pass or blocking on an architectural
      checkpoint -- mirrors the precedent set by Plan 01-01's own TTL-window correction"
    - "Extrapolate a live RPC simulation resource measurement (small N) to the admin-tunable cap
      (large N) via a marginal-cost delta against a measured baseline, not the raw
      total-divided-by-N average, which overstates true per-unit cost by including fixed overhead"

key-files:
  created:
    - .planning/phases/01-on-chain-maker-discovery/01-04-SUMMARY.md
  modified:
    - tools/rfq-registry-live.mjs
    - public/otc-config.js
    - src/config.ts
    - CLAUDE.md (gitignored -- edits are on disk, not committed)

key-decisions:
  - "Redeployed rfq_registry rather than reusing the Plan 01-01 tracer instance: new id
    CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G, wasm sha256
    3450546a340fcc5f7fbc7834408f7363ba56abc430afb06383e88f32bba8fa42, same admin/stake_token/
    base_cost/per_token_cost/max_makers_per_token as the tracer (D-01/D-02/D-03 unchanged) -- the
    tracer wasm had no add_tokens/get_urls_for_token/admin setters"
  - "D-12 corrected: TTL-bump-on-write cannot be proven live as a strict increase across two
    close-together writes, because Testnet's own creation-time floor (minPersistentTTL =
    120,960 ledgers) already exceeds PERSISTENT_TTL_THRESHOLD (17,280), so every subsequent
    extend_ttl call is a correct no-op until ~103,680 ledgers (~144h) decay -- infeasible inside
    one script run. The live script now asserts what IS observable (unchanged, never decreased,
    stays above threshold); the extend_to-firing branch remains Plan 01-03's unit-test-only proof"
  - "max_makers_per_token stays at 100, no retune: get_urls_for_token measured at ~91k marginal
    instructions/maker (5-maker delta against a ~1.18M-instruction baseline), extrapolating to
    ~10.3M instructions at the full cap -- ~2.6% of Testnet's 400,000,000 txMaxInstructions budget
    (read live via the ContractComputeV0 config-setting ledger entry). Human confirmed this
    conclusion at the Task 3 checkpoint"
  - "The second real Testnet token address for add_tokens is the demo USDC SAC
    (CDKTFWDMHMWLVWG53XVUZS2KDTDCUDLYXOSFGDFYN5ZUS2GFVWUUAARY, derived from the issuer already used
    by tools/mint-usdc.mjs) rather than a freshly deployed asset -- add_tokens only stores the
    Address, it never calls a function on the listed token contract, so an already-existing,
    already-legitimate SAC satisfies 'real Testnet token address' without extra deploy work"

requirements-completed: [REG-03, CFG-01]

coverage:
  - id: D1
    description: "The complete rfq_registry (all entry points from Plans 01-01 through 01-03) is
      redeployed and initialized on Testnet with the D-01/D-02/D-03 parameters, verified via
      get_config before any live check ran"
    requirement: "REG-03"
    verification:
      - kind: other
        ref: "stellar contract invoke --id CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G -- get_config -> base_cost=1000000000, per_token_cost=100000000, max_makers_per_token=100, admin=GB3WSGXR5GBMJ7HSBWTBWSWGI3A5AJGD4Y254XBI2P6AKS5N2VIXV7HI"
        status: pass
    human_judgment: false
  - id: D2
    description: "node tools/rfq-registry-live.mjs proves, in one command against the real host,
      the full register -> D-06 update -> add_tokens -> discover-by-token -> get_maker -> eject
      cycle with exact contract-side balance equalities and a self-cleaning read-cost probe"
    requirement: "REG-03"
    verification:
      - kind: integration
        ref: "node tools/rfq-registry-live.mjs against CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G (this session's own run: register c835026f..., update 8d05e9a8..., add_tokens 15e1effa..., eject f5f50f8a..., all 20 checks PASS)"
        status: pass
      - kind: integration
        ref: "Human-run confirmation at the Task 3 checkpoint: register 935b14b8..., update d7c89cff..., add_tokens ae2ca992..., eject da718706..., all 20 assertions PASS"
        status: pass
    human_judgment: false
  - id: D3
    description: "RFQ_REGISTRY_ID is wired into public/otc-config.js (with the two-step deploy
      comment) and typed + regex-gated in src/config.ts as registryEnabled, matching the
      OTC_CONTRACT_ID/RFQ_SWAP_CONTRACT_ID pattern; no CSP change needed"
    requirement: "CFG-01"
    verification:
      - kind: unit
        ref: "npm run typecheck (clean); npm test (8/8 suites, 109/109 passing, unchanged)"
        status: pass
      - kind: other
        ref: "npm run build clean; grep -l '<script>' dist/*.html empty; grep -r esm.sh dist/ empty"
        status: pass
    human_judgment: false
  - id: D4
    description: "A human confirmed the deployed contract id matches the config id, inspected the
      deploy/initialize transactions on stellar.expert, re-checked get_config, and decided
      max_makers_per_token needs no retune before Phase 2"
    requirement: "REG-03"
    verification: []
    human_judgment: true
    rationale: "Comparing a live config value against a deployed id, and deciding whether an
      admin-tunable cap needs retuning ahead of a future phase, are exactly the kind of
      trust-establishing judgment calls this phase's threat model (T-01-26, T-01-31) reserves for
      a human rather than automation."

duration: 1 session (spanning Task 1 deploy/live-check, Task 2 config wiring, the blocking
  checkpoint, and this closeout)
completed: 2026-08-26
status: complete
---

# Phase 1 Plan 4: Redeploy, Prove Live, and Wire the Config Summary

**The complete `rfq_registry` (all entry points from Plans 01-01 through 01-03) is redeployed and
initialized on Testnet at `CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G`, proven
end-to-end by a one-command live script (register → discover by token → eject with full refund),
and `RFQ_REGISTRY_ID` now has one home in the un-bundled runtime config — closing out Phase 1.**

## Performance

- **Duration:** 1 session (Task 1 deploy + live-check extension, Task 2 config wiring + CLAUDE.md,
  the blocking Task 3 checkpoint, and this closeout)
- **Completed:** 2026-08-26
- **Tasks:** 3 (all complete, including the blocking human-verify checkpoint)
- **Files modified:** 4 (`tools/rfq-registry-live.mjs`, `public/otc-config.js`, `src/config.ts`,
  `CLAUDE.md` — the last is gitignored and not committed)

## Accomplishments

- **Redeployed the complete contract** (Task 1): rebuilt `contracts/rfq_registry` (now exporting
  all 12 entry points), redeployed via the deliberate two-step sequence (`stellar contract deploy`
  with no constructor args, then a separate `stellar contract invoke -- initialize`), and confirmed
  `get_config` reports the exact D-01/D-02/D-03 values before proceeding (T-01-25 mitigation). New
  id `CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G`, wasm sha256
  `3450546a340fcc5f7fbc7834408f7363ba56abc430afb06383e88f32bba8fa42`, superseding the Plan 01-01
  tracer instance (`CCJDJKXBZRVYOB2QD4A6UYNJRGNC27I6TZLC22DXNYHQXWXDIO6FYYM6`, kept only as a
  historical record in that plan's own SUMMARY). `otc_swap.wasm` hash confirmed unchanged
  (`83f60b854089d1a93644483968e04b5661fef3b6006966fdead4d1221b5a4df3`); full workspace
  `cargo test` green (82/82: `otc_swap` 6 + `rfq_swap` 17 + `rfq_registry` 59).
- **Extended `tools/rfq-registry-live.mjs`** to the full REG-03 live check: register (`set_url`) →
  D-06 in-place update → `add_tokens` with two real Testnet token addresses (the native XLM SAC
  and the demo USDC SAC) → `get_urls_for_token` discovery on both → `get_maker` (staked = base_cost
  + 2×per_token_cost, two tokens) → `eject` (contract balance returns to exactly its
  pre-registration value, maker's net loss equals only the accumulated `feeCharged`) →
  re-confirmation that both discovery lists are empty afterward. Also added a self-cleaning
  read-cost probe: five throwaway makers register on one shared token, `get_urls_for_token`'s
  simulated resource usage is logged, then all five are ejected.
- **Resolved RESEARCH.md Assumption A3**: the maker's persistent `Maker(Address)` ledger key is
  pulled straight out of a `get_maker` simulation's own resource footprint
  (`transactionData.build().resources().footprint().readOnly()`) rather than hand-encoded XDR.
  Verified working live this session; the hand-encoded `makerKeyScVal` + `getContractData` path
  stays in the file as the documented fallback, unused in the actual run.
- **Corrected the D-12 live-TTL assertion** (a genuine deviation, see below): the plan's task text
  called for asserting `liveUntilLedgerSeq` strictly increases between two writes. Running the
  script against the live deployment showed it does not — Testnet's creation-time floor
  (`minPersistentTTL` = 120,960 ledgers) already exceeds `PERSISTENT_TTL_THRESHOLD` (17,280), so a
  second write's `extend_ttl` call stays a correct no-op until the entry's remaining TTL first
  decays below the threshold (~103,680 ledgers, ~144 hours) — not achievable inside one script run.
  Rewrote the assertion and the file's header comment to prove what IS observable live (unchanged,
  never decreased, stays comfortably above the archival threshold), leaving the threshold-crossing
  branch to Plan 01-03's unit test (`ttl_bumps_on_maker_write_after_ledger_advance`, which forces
  it via `env.ledger().with_mut()`).
- **Measured the discovery read ceiling** (the flagged assumption from Plan 01-02): at 5 makers on
  one shared token, `get_urls_for_token` used 1,638,594 instructions (a ~1.18M-instruction baseline
  for an empty list measured separately this session, giving a marginal cost of ~91,022
  instructions/maker). Extrapolated to the full `max_makers_per_token = 100` cap: ≈10.3M
  instructions, ≈2.6% of Testnet's 400,000,000 `txMaxInstructions` budget (read live via the
  `ContractComputeV0` config-setting ledger entry, not assumed). Comfortable headroom — the human
  confirmed no retune is needed before Phase 2 at the Task 3 checkpoint.
- **Wired `RFQ_REGISTRY_ID` into the runtime config** (Task 2): `public/otc-config.js` gained
  `window.RFQ_REGISTRY_ID` with a comment carrying both deploy commands and the D-01/D-02/D-03
  argument values (the two-step sequence is called out explicitly, since collapsing it would leave
  the re-init guard nothing to guard); `src/config.ts` gained the typed `RFQ_REGISTRY_ID` export
  and `registryEnabled`, gated on the same `/^C[A-Z2-7]{55}$/` pattern as `settlementEnabled` /
  `fairPriceEnabled` / `rfqEnabled`. Confirmed `vercel.json`'s `connect-src` needs no change (it
  already allows `https://soroban-testnet.stellar.org`, which is all registry reads use).
- **Task 3 (blocking checkpoint): APPROVED by the human.** They independently re-ran
  `node tools/rfq-registry-live.mjs`; all 20 assertions passed against their own run (register tx
  `935b14b8…`, update tx `d7c89cff…`, add_tokens tx `ae2ca992…`, eject tx `da718706…`, contract
  balance returned exactly to its pre-registration value, maker's net loss equal to fees only).
  They accepted the recommendation on check 5: no `max_makers_per_token` retune before Phase 2.

## Task Commits

Each task was committed atomically:

1. **Task 1: Deploy the finished registry and prove the whole cycle on live Testnet** -
   `dc4b932` (feat) — redeploy + initialize on Testnet, extended `tools/rfq-registry-live.mjs`
   with the D-12 correction and the read-cost probe
2. **Task 2: Give RFQ_REGISTRY_ID one home, and put it on the reset checklist** - `0dc9094`
   (feat) — `public/otc-config.js`, `src/config.ts`; `CLAUDE.md` updated on disk but gitignored
3. **Task 3: Confirm the deployed registry and the reset path** - human-verify checkpoint,
   approved (no code changes; verification-only, documented in this SUMMARY and via the plan's own
   checkpoint transcript)

**Plan metadata:** (this commit)

## Files Created/Modified

- `tools/rfq-registry-live.mjs` — extended from the Plan 01-01 tracer script to the full surface:
  D-06 update, `add_tokens`/`get_urls_for_token` discovery legs, the corrected D-12 TTL assertion,
  the footprint-derived TTL key reader (with the hand-encoded fallback retained), and the
  self-cleaning read-cost probe
- `public/otc-config.js` — `window.RFQ_REGISTRY_ID` plus the two-step deploy+initialize comment
- `src/config.ts` — `RFQ_REGISTRY_ID?: string` on the `Window` interface, plus the
  `RFQ_REGISTRY_ID` / `registryEnabled` exports
- `CLAUDE.md` (gitignored, not committed) — Status bullet for `rfq_registry`, File map rows for
  `contracts/rfq_registry/` and `tools/rfq-registry-live.mjs`, Commands entries, the Testnet-reset
  Gotcha extended to name `RFQ_REGISTRY_ID`, and the "Verify before deploying" checklist's test
  count and wasm-hash-gate scope updated to all three contracts

## Decisions Made

- Redeployed rather than reused the tracer instance (new id/wasm hash — see frontmatter
  `key-decisions`).
- Corrected the D-12 live-TTL assertion to match observed network behavior instead of the plan's
  literal "strictly increases" text — see Deviations below.
- Kept `max_makers_per_token` at 100 (human-confirmed at the checkpoint) based on the measured
  ~2.6%-of-budget read cost at the cap.
- Used the already-deployed demo USDC SAC as the second `add_tokens` address rather than deploying
  a fresh throwaway asset, since `add_tokens` never calls a function on the listed token.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `add_tokens`'s `Vec<Address>` argument needs an explicit `ScVec`, not a bare JS array**
- **Found during:** Task 1, first live run
- **Issue:** `registry.call('add_tokens', maker.toScVal(), [tokenA.toScVal(), tokenB.toScVal()])`
  passed a plain JS array as the second contract argument. `Contract.call` does not auto-convert a
  bare array to an `ScVal`, so `TransactionBuilder` threw at XDR-encode time (`XDR Write Error: ...
  has union name undefined, not ScVal`) before the transaction ever reached simulation.
- **Fix:** Wrapped the token list in `xdr.ScVal.scvVec([...])` explicitly, both for the main run's
  two-token call and the read-cost probe's one-token call.
- **Files modified:** `tools/rfq-registry-live.mjs`
- **Verification:** Re-ran the script; `add_tokens` transactions built, simulated, and submitted
  successfully.
- **Committed in:** `dc4b932` (Task 1 commit)

**2. [Rule 1 - Bug] The plan's D-12 "TTL strictly increases across two writes" assertion does not hold on live Testnet**
- **Found during:** Task 1, second live run (after fixing #1)
- **Issue:** The plan's task text called for reading `liveUntilLedgerSeq` after `set_url` and again
  after `add_tokens`, asserting the second value is strictly greater. The live run showed both
  reads identical (`before=4465871 after=4465871`), a real assertion failure. Investigation
  (informed by Plan 01-01's own prior finding on this exact TTL floor) confirmed the mechanism:
  Testnet floors a freshly-created persistent entry's TTL at `minPersistentTTL` (120,960 ledgers)
  once, at creation. That floor is not recomputed per-write; the contract's own `bump_maker`
  `extend_ttl(threshold=17280, extend_to=518400)` call only actually moves the value once the
  entry's remaining TTL first decays below 17,280 ledgers — which requires ~103,680 ledgers
  (~144 hours at Testnet's ~5s ledger close) to elapse from a fresh registration. That is not
  achievable inside a single script run, and is exactly the constraint Plan 01-03's own SUMMARY
  had already flagged as out of live-check reach (its unit tests prove that branch via
  `env.ledger().with_mut()` instead).
- **Fix:** Rewrote the assertion to prove what IS observable live: a second write while remaining
  TTL still exceeds the threshold leaves `liveUntilLedgerSeq` unchanged (never decreased — the
  write did not corrupt or shorten the entry's rent) and the entry stays comfortably above the
  archival threshold. Rewrote the file's header comment to document the corrected mechanism and
  point to Plan 01-03's unit test as the sole owner of the threshold-crossing branch.
- **Files modified:** `tools/rfq-registry-live.mjs`
- **Verification:** Re-ran the script twice (once by this session, once independently by the human
  at the checkpoint); all D-12-related checks pass both times with the corrected assertion.
- **Committed in:** `dc4b932` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 syntax bug caught immediately by the SDK's own XDR
encoder; 1 Rule 1 empirical correction to a live-network assumption baked into the plan's task
text, resolved the same way Plan 01-01 resolved an identical TTL-floor surprise).
**Impact on plan:** Both fixes were necessary for the live script to run at all and to assert
something true. No scope creep, no architectural change, no contract code touched.

## Issues Encountered

None beyond the two deviations above. The read-cost measurement, the config wiring, and the
checkpoint all proceeded as planned.

## User Setup Required

None — no external service configuration required. The `stellar` CLI's `deployer` identity was
already funded and available on this machine.

## Next Phase Readiness

- `rfq_registry`'s complete entry-point surface (`initialize`/`set_url`/`add_tokens`/
  `remove_tokens`/`get_urls_for_token`/`add_protocols`/`remove_protocols`/`get_maker`/`get_config`/
  `set_costs`/`set_max_makers_per_token`/`eject`) is deployed, initialized, and proven live at
  `CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G` — this is the id Phase 2's desk taker
  path will read via `RFQ_REGISTRY_ID`/`registryEnabled` in `src/config.ts`.
- `get_urls_for_token`'s read cost at the full 100-maker cap is measured and safely inside
  Testnet's resource budget; Phase 2 does not need to plan around a cap retune.
- The `<flagged_assumptions>` item about REG-03's "unclassified edge probe row" (carried from Plans
  01-02 and 01-03) is discharged in substance by this plan's live proof and the prior plans' full
  test surface; still worth a manual look at `/gsd-verify-work` per the original note.
- Phase 1 (on-chain maker discovery) is now complete: all four plans (01-01 tracer, 01-02
  token/protocol discovery, 01-03 admin pricing + security surface, 01-04 this redeploy + config
  wiring) are done, and REG-01/REG-02/REG-03/CFG-01 are all satisfied.
- No blockers for Phase 2.

---
*Phase: 01-on-chain-maker-discovery*
*Completed: 2026-08-26*
