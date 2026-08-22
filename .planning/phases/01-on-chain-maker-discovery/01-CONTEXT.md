# Phase 1: On-Chain Maker Discovery - Context

**Gathered:** 2026-08-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Build, test, and deploy the `rfq_registry` contract on Testnet: a stake-gated on-chain phone
book where makers register their quote-server endpoints, and any client can discover them with
read-only calls. Wire `RFQ_REGISTRY_ID` into the runtime config following the `OTC_CONTRACT_ID`
pattern. Requirements: REG-01, REG-02, REG-03, CFG-01. The desk taker path that CONSUMES the
registry is Phase 2, not this phase.

</domain>

<decisions>
## Implementation Decisions

### Deploy parameters (Testnet)
- **D-01:** Initial stake costs: `base_cost` = 100 XLM, `per_token_cost` = 10 XLM (in stroops at
  initialize time: 1_000_000_000 and 100_000_000). Rationale: prices spam while staying trivially
  affordable against Friendbot's 10,000 XLM funding.
- **D-02:** `max_makers_per_token` = 100 (the spec §5 example value).
- **D-03:** Admin = the existing `deployer` CLI identity
  (`GB3WSGXR5GBMJ7HSBWTBWSWGI3A5AJGD4Y254XBI2P6AKS5N2VIXV7HI`), same identity that admins
  `rfq_swap`. No new identity is created.
- **D-04:** BOTH knobs are admin-tunable post-deploy: `set_costs(base_cost, per_token_cost)` AND
  `set_max_makers_per_token(max)`. The spec sketch omits setters but RFQ-D7 requires tunable
  costs; the user explicitly chose to make the list cap tunable too. Rule: lowering
  `max_makers_per_token` never evicts existing entries; it only blocks NEW additions while a
  token's list length is at or above the cap. — **Reversibility:** costly — the setter surface is
  part of the deployed contract interface; removing a setter later means a new wasm + contract id
  and a registry re-deploy with state migration.

### Registration lifecycle
- **D-05:** Strict duplicate semantics (AirSwap Registry-faithful): `add_tokens` with a token
  already in the maker's list is a hard error; `remove_tokens` of a token not in the list is a
  hard error. No state change, no funds move on error.
- **D-06:** `set_url` on an already-registered maker updates the URL in place with NO additional
  stake. Only the FIRST `set_url` call stakes `base_cost` and creates the `MakerConfig`.
- **D-07:** `add_tokens` (or any maker mutation other than `set_url`) from an unregistered
  account is a hard error (e.g. `NotRegistered`). Registration order is fixed: `set_url` first.
- **D-08:** `remove_protocols` is added alongside `add_protocols` (stake-free, symmetric
  interface). This is a deliberate, recorded extension beyond the spec §5 sketch. —
  **Reversibility:** reversible — additive interface surface, no storage shape change.

### Input validation (on-chain)
- **D-09:** URL validation: non-empty and max 256 bytes. No scheme check in the contract
  (https enforcement is client-side and maker-docs-side; garbage URLs are already priced by the
  stake and unreachable makers are dropped by the desk fan-out in Phase 2).
- **D-10:** Fixed per-maker list caps as code constants: max 32 tokens per maker, max 8 protocols
  per maker. Every Vec in storage is explicitly bounded (spec: unbounded Vec growth bricks
  Soroban contracts against read limits).

### Live Testnet check (REG-03)
- **D-11:** The live check is `tools/rfq-registry-live.mjs`, mirroring the
  `tools/rfq-live-swap.mjs` pattern: self-contained, Friendbot-funded throwaway maker actor, no
  key file, plain `node` invocation (no npm script). It proves register (`set_url` +
  `add_tokens`) -> discover (`get_urls_for_token`, `get_maker`) -> `eject` with full refund,
  asserting exact balance deltas.
- **D-12:** TTL proof depth: the live script proves TTL-bump-on-write by reading the entry's
  `liveUntilLedgerSeq` via RPC `getLedgerEntries` before and after a write and asserting it
  increased. Archival lapse + restore is simulated in unit tests via testutils ledger
  manipulation, NOT waited out on the live network.

### Claude's Discretion
- Re-registering after `eject` is allowed as a fresh registration (no ban state, no extra
  storage).
- `initialize`/`set_costs` reject non-positive costs; empty-Vec calls error; duplicate entries
  within a single call's Vec error (consistent with D-05 strict semantics).
- Event design: emit events on every state transition (spec §7.6); exact event names/topics are
  planner/implementer discretion, modeled on `rfq_swap`'s `#[contractevent]` usage.
- Error enum numbering, storage key enum shape (struct-wrapped composite keys per the
  one-value-per-variant gotcha), and TTL constants: model on `contracts/rfq_swap/src/lib.rs`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Protocol / registry design
- `docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md` §5 — the registry
  interface sketch, `MakerConfig` shape, storage layout, TTL/rent posture, client-side pair
  intersection. §7.6 — contract-level security checklist (re-init guard, checked math, events).
  §8 — testing strategy (un-mocked auth trees, archival test, live integration). §10 — recorded
  decisions incl. RFQ-D7 (XLM stake, admin-tunable costs, bounded lists).

### Existing contract patterns to mirror
- `contracts/rfq_swap/src/lib.rs` — error enum style, `Config`/admin pattern, TTL constants,
  `#[contractevent]` events, struct-wrapped composite storage keys (`CancelKey` gotcha:
  `#[contracttype]` enum variants hold at most ONE value), header-comment invariants convention.
- `contracts/rfq_swap/src/test.rs` — 17-test suite shape: un-mocked auth tests, mutation-verified
  bindings, fund-every-actor rule for rejection tests.
- `contracts/Cargo.toml` — workspace root: new member joins here; `[profile.release]` MUST stay
  in this file (Cargo silently ignores profile blocks in members); `otc_swap` wasm hash
  `83f60b85...` must remain byte-identical after any workspace change.

### Config wiring (CFG-01)
- `public/otc-config.js` — the `window.*` un-bundled runtime config; `RFQ_REGISTRY_ID` joins
  here next to `OTC_CONTRACT_ID` / `RFQ_SWAP_CONTRACT_ID` / `REFLECTOR_ORACLE_ID`.
- `src/config.ts` — the one typed reader of `window.*`; add the typed field following the
  existing pattern.

### Live-check pattern
- `tools/rfq-live-swap.mjs` — the self-contained Friendbot live-proof pattern
  `tools/rfq-registry-live.mjs` mirrors.

### Project instructions
- `CLAUDE.md` — build/test commands (`cargo test --manifest-path contracts/Cargo.toml`,
  `cd contracts && stellar contract build`, target `wasm32v1-none`), verify-before-deploy
  checklist, Testnet-reset checklist convention.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `rfq_swap` contract source: admin/config storage, instance-TTL top-up constants, event macros,
  error-enum conventions all transfer directly to `rfq_registry`.
- Cargo workspace (`contracts/Cargo.toml`): `rfq_registry` becomes the third member; shared
  `[workspace.dependencies]` already pins `soroban-sdk`.
- `tools/rfq-live-swap.mjs`: Friendbot actor bootstrap, RPC helpers, balance-delta assertions.
- Stellar CLI 27 at `~/.local/bin/stellar`, native aarch64 toolchain, `deployer` identity funded
  on Testnet.

### Established Patterns
- Mutation-verified tests: unbind a checked field in the contract AND the test helper, confirm
  the test goes red (caught a false-green test in `rfq_swap`).
- Deployed-bytecode-matches-source discipline: adding a workspace member can re-resolve
  `Cargo.lock`; gate `otc_swap`'s wasm hash (`83f60b85...`) through the change.
- Runtime config is deliberately un-bundled so a quarterly Testnet reset is a one-file edit;
  `RFQ_REGISTRY_ID` joins that reset checklist (with `OTC_CONTRACT_ID`, `REFLECTOR_ORACLE_ID`,
  and the registry's fellow new id `RFQ_SWAP_CONTRACT_ID`).

### Integration Points
- `contracts/Cargo.toml` members list (new crate `contracts/rfq_registry/`).
- `public/otc-config.js` + `src/config.ts` (CFG-01).
- No `src/` UI or data-layer changes in this phase; the desk consumes the registry in Phase 2.

</code_context>

<specifics>
## Specific Ideas

- The registry stays a "deliberately boring phone book" (spec §5): validation is minimal and
  structural (lengths, caps, registration order), never semantic (no on-chain URL scheme
  parsing).
- Stake is a spam price, not a slashing bond: `eject` always refunds the full stake
  (`base_cost` + `per_token_cost` x tokens registered at their paid rates).

</specifics>

<deferred>
## Deferred Ideas

- Registry indexer/HTTP cache for instant discovery UX (spec §5 mentions it; IDX-01 is an open
  question, unscheduled; chain reads are the source of truth for this milestone).
- Mainnet admin hardening (multisig + upgrade timelock, spec §7.6): out of scope while Testnet-only.

</deferred>

---

*Phase: 1-On-Chain Maker Discovery*
*Context gathered: 2026-08-19*
