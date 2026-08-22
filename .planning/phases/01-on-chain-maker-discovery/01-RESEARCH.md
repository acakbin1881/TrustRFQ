# Phase 1: On-Chain Maker Discovery - Research

**Researched:** 2026-08-20
**Domain:** Soroban smart contracts (Rust), stake-gated on-chain registry, Stellar Testnet deployment/verification tooling
**Confidence:** HIGH

## Summary

This phase is a contract-only phase: build `rfq_registry`, a stake-gated "phone book" that mirrors
AirSwap's `Registry.sol` in Soroban, following the exact pattern already proven in this repo by
`contracts/rfq_swap`. There is no new technology to evaluate — the stack, TTL model, testing
harness, and even the Cargo workspace shape are all fixed by the sibling `rfq_swap` crate that
shipped in the previous session. The work is almost entirely "port the AirSwap Registry shape into
this repo's established Soroban conventions, correctly."

The one place this phase must deliberately **diverge** from `rfq_swap`'s own precedent is
initialization: `rfq_swap` uses a `__constructor` (host-guaranteed single call, no re-init check
needed), but REG-01 names a callable `initialize(...)` entry point and REG-03 explicitly requires a
**unit test for a re-init guard** — a guard that would be structurally unnecessary (and untestable
as a runtime check) if `initialize` were a constructor. The registry should therefore use a plain
`#[contractimpl]` `initialize` function with an explicit `already-initialized` check, deployed via a
two-step `deploy` then `invoke -- initialize` (not constructor args at deploy time). This is
flagged in detail under Common Pitfalls.

Everything else — storage layout, TTL bump-on-write, bounded `Vec`s, error enum shape, event
design, un-mocked-auth test style, the Friendbot live-check script pattern, and the `RFQ_REGISTRY_ID`
config wiring — has a direct, already-working precedent in this repo to copy. No new npm or Cargo
dependencies are introduced by this phase.

**Primary recommendation:** Add `contracts/rfq_registry/` as a third Cargo workspace member,
structurally identical in crate layout to `contracts/rfq_swap/`; implement `MakerConfig` +
`DataKey::{Maker,Token}` persistent storage exactly per spec §5; use a plain `initialize` function
(not `__constructor`) with an explicit re-init guard; gate every stake movement through
`token::Client` transfers to/from `env.current_contract_address()`; rely on Soroban's built-in
all-or-nothing invocation rollback for early-return errors (no manual unwind logic needed); write
`tools/rfq-registry-live.mjs` as a structural copy of `tools/rfq-live-swap.mjs`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REG-01 | Maker can register/manage itself: `initialize`, `set_url`, `add_tokens`/`remove_tokens`, `add_protocols`, `eject`, `get_urls_for_token`, `get_maker` | Full interface + stake/refund mechanics documented under Architecture Patterns and Code Examples; deploy/invoke sequencing addressed under Common Pitfalls (initialize vs constructor) |
| REG-02 | Bounded, persistent storage: native XLM stake via SAC, admin-tunable costs, `Token(Address)->Vec<Address>` capped at `max_makers_per_token`, `Maker(Address)->MakerConfig`, TTL bumped on every write, no contract-side extend fn | Storage Types / TTL sections below; DataKey enum and bump-helper pattern given in Code Examples |
| REG-03 | Deployed on Testnet, unit tests (re-init guard, auth on every mutation, bounded-list rejection, events on state transitions), live Testnet check: register→discover→eject incl. TTL-bump-on-write | Validation Architecture section; live-check pattern in Code Examples, sourced from `tools/rfq-live-swap.mjs` |
| CFG-01 | `RFQ_REGISTRY_ID` joins `public/otc-config.js` + `src/config.ts` following the `OTC_CONTRACT_ID`/`RFQ_SWAP_CONTRACT_ID` pattern | Exact diff given in Code Examples, verified against current file contents this session |

</phase_requirements>

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Deploy parameters (Testnet)**
- D-01: `base_cost` = 100 XLM (1,000,000,000 stroops), `per_token_cost` = 10 XLM (100,000,000
  stroops) at `initialize` time.
- D-02: `max_makers_per_token` = 100.
- D-03: Admin = the existing `deployer` CLI identity
  (`GB3WSGXR5GBMJ7HSBWTBWSWGI3A5AJGD4Y254XBI2P6AKS5N2VIXV7HI`), same as `rfq_swap`'s admin. No new
  identity.
- D-04: Both `set_costs(base_cost, per_token_cost)` and `set_max_makers_per_token(max)` are
  admin-tunable post-deploy. Lowering `max_makers_per_token` never evicts existing entries, only
  blocks new additions once a token's list is at/above the cap. Reversibility: costly (setter
  surface is part of the deployed interface).

**Registration lifecycle**
- D-05: Strict duplicate semantics: `add_tokens` with an already-present token is a hard error;
  `remove_tokens` of an absent token is a hard error. No partial state change, no funds move on
  error.
- D-06: `set_url` on an already-registered maker updates in place with NO additional stake. Only
  the FIRST `set_url` call stakes `base_cost` and creates `MakerConfig`.
- D-07: Any maker mutation other than `set_url` from an unregistered account is a hard error
  (`NotRegistered`). `set_url` must be called first.
- D-08: `remove_protocols` is added alongside `add_protocols` (stake-free, symmetric). Deliberate
  extension beyond the spec §5 sketch. Reversible (additive, no storage shape change).

**Input validation (on-chain)**
- D-09: URL validation: non-empty, max 256 bytes. No scheme check on-chain (client/maker-docs
  concern).
- D-10: Fixed per-maker list caps as code constants: max 32 tokens/maker, max 8 protocols/maker.
  All storage `Vec`s explicitly bounded.

**Live Testnet check (REG-03)**
- D-11: `tools/rfq-registry-live.mjs` mirrors `tools/rfq-live-swap.mjs`: self-contained,
  Friendbot-funded throwaway maker actor, no key file, plain `node` invocation (no npm script).
  Proves register (`set_url` + `add_tokens`) → discover (`get_urls_for_token`, `get_maker`) →
  `eject` with full refund, asserting exact balance deltas.
- D-12: TTL proof depth: read `liveUntilLedgerSeq` via RPC `getLedgerEntries` before/after a write
  and assert it increased. Archival lapse + restore is simulated in unit tests via testutils ledger
  manipulation, NOT waited out on the live network.

### Claude's Discretion
- Re-registering after `eject` is allowed as a fresh registration (no ban state, no extra storage).
- `initialize`/`set_costs` reject non-positive costs; empty-Vec calls error; duplicate entries
  within a single call's Vec error (consistent with D-05 strict semantics).
- Event design: emit events on every state transition (spec §7.6); exact event names/topics are
  planner/implementer discretion, modeled on `rfq_swap`'s `#[contractevent]` usage.
- Error enum numbering, storage key enum shape (struct-wrapped composite keys per the
  one-value-per-variant gotcha), and TTL constants: model on `contracts/rfq_swap/src/lib.rs`.

### Deferred Ideas (OUT OF SCOPE)
- Registry indexer/HTTP cache for instant discovery UX (spec §5 mentions it; IDX-01 unscheduled;
  chain reads are the source of truth for this milestone).
- Mainnet admin hardening (multisig + upgrade timelock, spec §7.6): out of scope while Testnet-only.

</user_constraints>

## Architectural Responsibility Map

This project is a client-only SPA with **no server tier** (CLAUDE.md Stack: "no server runtime").
The two tiers that matter for this phase are the Soroban contract (which is simultaneously the
"backend" business logic AND the persistent datastore — Soroban has no separation between the two)
and the browser/Node client that issues read-only RPC simulations against it.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Maker registration & mutation (`set_url`/`add_tokens`/`remove_tokens`/`add_protocols`/`remove_protocols`/`eject`) | Database/Storage (Soroban contract) | — | Soroban contracts co-locate logic and persistent state; there is no separate backend to own this |
| Stake custody (XLM held in the contract's own SAC balance) | Database/Storage (Soroban contract) | — | The contract *is* the escrow; no external custodian |
| Admin config (`set_costs`, `set_max_makers_per_token`) | Database/Storage (Soroban contract, instance storage) | — | Same reasoning; admin-gated instance-storage writes |
| Read-only discovery (`get_urls_for_token`, `get_maker`) | Database/Storage (Soroban contract) | Browser/Client (RPC simulation call site) | The chain is the source of truth; the client is a pure read-only caller with no caching layer in this phase (IDX-01 deferred) |
| Runtime config wiring (`RFQ_REGISTRY_ID`) | Browser/Client (`src/config.ts` + `public/otc-config.js`) | — | Config is deliberately un-bundled and read only in the SPA; no build step involved |
| Live Testnet verification (`tools/rfq-registry-live.mjs`) | Browser/Client-equivalent (Node script using `@stellar/stellar-sdk`) | — | Exercises the exact RPC/simulate/submit path a future browser client will use, headless |

**Sanity check for the planner:** nothing in this phase touches `src/` UI or data-layer code (per
CONTEXT.md's Integration Points: "No `src/` UI or data-layer changes in this phase"). Any task that
proposes touching `src/ui/` or `src/data/` in Phase 1 is out of scope — that's Phase 2's job
(TAKER-01..06).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `soroban-sdk` | `26` (workspace pin; resolves to a 26.x lockfile version) [VERIFIED: contracts/Cargo.toml:6] | Contract runtime, storage, auth, `#[contracttype]`/`#[contractevent]` macros | Already the sole dependency of both `otc_swap` and `rfq_swap`; adding `rfq_registry` as a third workspace member reuses the same pin, no new dependency resolution |
| `@stellar/stellar-sdk` | `^16.0.1` [VERIFIED: package.json] | JS/Node client for the live-check script (`tools/rfq-registry-live.mjs`): tx building, `simulateTransaction`, `getLedgerEntries`/`getContractData` | Already a pinned project dependency, used identically by `tools/rfq-live-swap.mjs` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `stellar-cli` | 27.0.0 [VERIFIED: `stellar --version` output this session] | `stellar contract build`/`deploy`/`invoke` | Build/deploy/admin-invoke workflow, same as `rfq_swap` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain `initialize` fn + re-init guard | `__constructor` (rfq_swap's own pattern) | Constructor makes re-init structurally impossible but is NOT separately invokable, conflicting with REG-01's literal `initialize(...)` entry point and REG-03's explicit re-init-guard *test* requirement (see Common Pitfalls) |
| Instance storage for `Admin`/`StakeToken`/costs/`max_makers_per_token` | Persistent storage | Instance storage is the documented fit ("admin addresses, global config" per the soroban skill); matches `rfq_swap`'s `Config` pattern exactly and these values change rarely, together |

**Installation:** No new packages to install. `rfq_registry` joins the existing Cargo workspace;
the live-check script imports from the already-installed `@stellar/stellar-sdk`.

**Version verification:** `soroban-sdk` registry latest is `27.0.6` [VERIFIED: `cargo search
soroban-sdk` output this session], while the workspace pins `"26"`. This is a **pre-existing** pin
from the `rfq_swap` phase, not something to change here — bumping it would re-resolve
`Cargo.lock` and risk moving `otc_swap`'s deployed wasm hash (the exact hazard CLAUDE.md's Gotchas
section warns about). Out of scope for this phase; `cargo test --manifest-path contracts/Cargo.toml`
already passes 17/17 against the pinned version [VERIFIED: ran this session, all green].

## Package Legitimacy Audit

**Not applicable.** This phase introduces zero new external packages (npm or Cargo). `rfq_registry`
depends only on the already-workspace-pinned `soroban-sdk`; `tools/rfq-registry-live.mjs` imports
only the already-installed `@stellar/stellar-sdk`. The Package Legitimacy Gate is skipped by design,
not by omission.

## Architecture Patterns

### System Architecture Diagram

```
 Maker actor (throwaway Friendbot keypair, or a future maker's key)
      |
      | 1. set_url(maker, url)            -- require_auth(); stakes base_cost XLM on FIRST call
      | 2. add_tokens(maker, [tok...])    -- require_auth(); stakes per_token_cost XLM each
      | 3. add_protocols(maker, [id...])  -- require_auth(); stake-free
      v
 +--------------------------- rfq_registry contract ---------------------------+
 |                                                                              |
 |  Instance storage (admin-tunable, changes rarely, all together)             |
 |    Admin | StakeToken | BaseCost | PerTokenCost | MaxMakersPerToken         |
 |                                                                              |
 |  Persistent storage (bumped TTL on every write; per-maker / per-token)      |
 |    Maker(Address) -> MakerConfig{url, protocols, tokens, staked}            |
 |    Token(Address) -> Vec<Address>   (capped at MaxMakersPerToken)           |
 |                                                                              |
 |  Escrow: contract's own SAC balance of the stake_token (native XLM)         |
 |    token::Client(stake_token).transfer(maker -> contract)   on stake        |
 |    token::Client(stake_token).transfer(contract -> maker)   on refund       |
 +------------------------------------------------------------------------------+
      ^                                                    |
      | 4. eject(maker) -- require_auth(); full refund,    | read-only, no auth,
      |    removes maker from EVERY Token(t) list it is in | free RPC simulation
      |                                                    v
      |                                     +-------------------------------+
      +------------------------------------ | get_urls_for_token(token)     |
                                             | get_maker(maker)              |
                                             +-------------------------------+
                                                        ^
                                                        | Client (future Phase 2 desk,
                                                        | or tools/rfq-registry-live.mjs
                                                        | today) — plain RPC simulate,
                                                        | no auth, no gas beyond fee
                                                        |
                                             Taker / discovery client
```

### Recommended Project Structure
```
contracts/
├── Cargo.toml                    # workspace root; add "rfq_registry" to members
├── otc_swap/                     # unchanged
├── rfq_swap/                     # unchanged
└── rfq_registry/                 # NEW — mirrors rfq_swap/ layout exactly
    ├── Cargo.toml                #   package manifest, no [profile.release] (lives at root)
    └── src/
        ├── lib.rs                #   contract: MakerConfig, DataKey, errors, events, impl
        └── test.rs               #   #[cfg(test)] mod test; (declared at bottom of lib.rs)
tools/
└── rfq-registry-live.mjs         # NEW — structural copy of rfq-live-swap.mjs
public/
└── otc-config.js                 # + window.RFQ_REGISTRY_ID
src/
└── config.ts                     # + RFQ_REGISTRY_ID export + registryEnabled flag
```

### Pattern 1: Instance storage for global admin-tunable config
**What:** `Admin`, `StakeToken`, `BaseCost`, `PerTokenCost`, `MaxMakersPerToken` all live in
instance storage, bumped together on every admin write.
**When to use:** Small, rarely-changing, contract-wide values — exactly `rfq_swap`'s `Config`
pattern (`admin`, `fee_bps`, `fee_collector`, `paused` all in instance storage).
**Example:**
```rust
// Source: modeled on contracts/rfq_swap/src/lib.rs:175-185 [VERIFIED: contracts/rfq_swap/src/lib.rs:175-185]
pub fn initialize(
    env: Env, admin: Address, stake_token: Address,
    base_cost: i128, per_token_cost: i128, max_makers_per_token: u32,
) -> Result<(), Error> {
    if env.storage().instance().has(&DataKey::Admin) {
        return Err(Error::AlreadyInitialized);
    }
    if base_cost <= 0 || per_token_cost <= 0 {
        return Err(Error::InvalidCost);
    }
    let s = env.storage().instance();
    s.set(&DataKey::Admin, &admin);
    s.set(&DataKey::StakeToken, &stake_token);
    s.set(&DataKey::BaseCost, &base_cost);
    s.set(&DataKey::PerTokenCost, &per_token_cost);
    s.set(&DataKey::MaxMakersPerToken, &max_makers_per_token);
    bump_instance(&env);
    Ok(())
}
```

### Pattern 2: Persistent storage bumped on every write, no contract-side extend function
**What:** `Maker(Address)` and `Token(Address)` entries get `extend_ttl` called every time they are
written, and NEVER get a dedicated "keep alive" entry point — per spec §5, "no contract-side extend
function is needed at all, since anyone can extend any entry's TTL with a bare
`ExtendFootprintTTLOp`" [CITED: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md §5].
**When to use:** Every mutating call that touches a `Maker` or `Token` entry.
**Example:**
```rust
// Source: modeled on contracts/rfq_swap/src/lib.rs:391-395 bump_instance() pattern,
// adapted to persistent per-key storage [VERIFIED: contracts/rfq_swap/src/lib.rs:391-395]
const PERSISTENT_TTL_THRESHOLD: u32 = 17_280;   // ~1 day at 5s/ledger
const PERSISTENT_TTL_EXTEND_TO: u32 = 518_400;  // ~30 days

fn bump_maker(env: &Env, key: &DataKey) {
    env.storage().persistent().extend_ttl(key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND_TO);
}
```

### Pattern 3: Stake via the contract's own SAC balance (no custom escrow logic)
**What:** The contract holds stake by simply being the `to` address of a `token::Client::transfer`
call, and refunds by being the `from` address. No separate escrow bookkeeping struct is needed
beyond `MakerConfig.staked` (a running total, for the exact refund amount on `eject`).
**When to use:** Every stake/refund movement (`set_url` first call, `add_tokens`, `remove_tokens`,
`eject`).
**Example:**
```rust
// Source: modeled on contracts/rfq_swap/src/lib.rs:246-255 token::Client usage
// [VERIFIED: contracts/rfq_swap/src/lib.rs:246-255]
let contract_addr = env.current_contract_address();
token::Client::new(&env, &stake_token(&env)).transfer(&maker, &contract_addr, &base_cost);
// ...refund direction on eject:
token::Client::new(&env, &stake_token(&env)).transfer(&contract_addr, &maker, &cfg.staked);
```
Note: `maker.require_auth()` alone is sufficient to authorize the outbound `transfer(maker ->
contract)` leg — the SAC's own `transfer` requires `from.require_auth()` internally, which is
satisfied by the contract's `require_auth()` call on the *same* address earlier in the invocation
(this is standard Soroban auth-tree behavior: one `require_auth()` per address per top-level
invocation covers all sub-invocations authorized by that address). The refund leg
(`contract -> maker`) needs NO additional auth: the contract is the `from`, and a contract
authorizes its own transfers implicitly by virtue of being `env.current_contract_address()`
(no `require_auth()` call needed for a contract acting as itself) [ASSUMED — standard Soroban
contract-as-signer behavior, not verified against an official doc this session; verify at
implementation time by running the un-mocked-auth `eject` test].

### Pattern 4: Rely on host-level all-or-nothing rollback — no manual unwind
**What:** If any `add_tokens`/`remove_tokens` iteration hits a bounded-list or duplicate error
partway through a multi-token call, an early `Err` return is sufficient. Soroban rolls back **all**
storage writes made during a top-level invocation the moment it errors or panics.
**When to use:** Every mutating function in this contract — this is why D-05's "no state change, no
funds move on error" is achievable with straightforward early returns, no manual state snapshot/
restore code.
**Example:**
```
// Confirmed: "When an error is returned from a Soroban contract function, anything the
// function has done is rolled back... all those changes are reverted and will not be persisted."
// [CITED: soroban.stellar.org/docs/basic-tutorials/errors]
```
This means the natural implementation of `add_tokens` — loop over the input `Vec`, push into
`cfg.tokens`, push into the per-token `Vec<Address>` list, `return Err(...)` the instant a cap or
duplicate is hit — is already correct. No rollback bookkeeping needed.

### Anti-Patterns to Avoid
- **Manual "checked-then-write" two-pass loops to avoid partial writes:** Unnecessary complexity
  given Pattern 4. A single pass with early `Err` returns is both simpler and correct.
- **Struct-wrapping `Maker(Address)` or `Token(Address)`:** The `CancelKey` gotcha in `rfq_swap`
  only applies when a `#[contracttype]` enum variant needs to carry TWO values
  [VERIFIED: contracts/rfq_swap/src/lib.rs:87-97, 109-121 — `Cancelled(CancelKey)` wraps a
  2-field struct because `#[contracttype]` enum variants hold at most one value]. `Maker(Address)`
  and `Token(Address)` each carry exactly one `Address` and compile fine as plain single-value
  variants — do not add unnecessary struct wrapping.
- **Using `__constructor` for `initialize`:** See Common Pitfalls below — this directly conflicts
  with REG-01's named entry point and REG-03's re-init-guard test requirement.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stake escrow / balance tracking | A custom ledger of "who staked how much" separate from token balances | `token::Client::transfer` to/from `env.current_contract_address()`, with `MakerConfig.staked` as the only bookkeeping (needed for exact refund) | The contract's own SAC balance IS the escrow; a parallel accounting system is redundant state that can drift from the real balance |
| Rollback-on-error logic | Manual state snapshot/restore around multi-step mutations | Soroban's built-in all-or-nothing invocation rollback (Pattern 4) | Confirmed by official docs; hand-rolled unwind is both unnecessary and a source of bugs if the snapshot misses a field |
| TTL "keep-alive" cron inside the contract | A `ping()`/`keep_alive()` entry point that walks all entries | Bump-on-write (Pattern 2) + an off-chain ops cron issuing bare `ExtendFootprintTTLOp` for cold entries | Spec §5 explicitly rejects a contract-side extend function; anyone can extend any entry's TTL from outside the contract |
| Duplicate/bounds checking via a `Map` or `Set` type | A `Map<Address, bool>` "seen" set to dedupe an input `Vec` | `Vec::contains()` / `Vec::first_index_of()` [CITED: docs.rs/soroban-sdk Vec methods] against both the existing `cfg.tokens`/`cfg.protocols` and, for intra-call duplicates, against the growing target `Vec` itself as you push | Soroban `Vec` already exposes `contains`; a `Map` is unneeded machinery for lists capped at 32/8 items |

**Key insight:** This contract's entire job is bookkeeping over data Soroban already manages for
you (token balances via SAC, entry lifetime via TTL, invocation atomicity via the host). The
implementation surface that actually needs custom logic is narrow: bounded-list caps, strict
duplicate semantics, and the stake-refund arithmetic.

## Common Pitfalls

### Pitfall 1: Using `__constructor` for `initialize` (breaks REG-01 and REG-03)
**What goes wrong:** `rfq_swap` uses Soroban's `__constructor` pattern (host-guaranteed single call,
args passed at `stellar contract deploy -- --admin ... --fee-bps ...`) specifically because it
"removes the re-initialization attack class entirely" [VERIFIED: contracts/rfq_swap/src/lib.rs:171-185,
quoting the doc comment: "Using a constructor rather than an `initialize` entry point removes the
re-initialization attack class entirely: the host guarantees a single call and never re-runs it on
`upgrade`."]. If `rfq_registry` copies this pattern, there is **no separately-invokable
`initialize` function** — but REG-01 names `initialize(admin, stake_token, base_cost,
per_token_cost, max_makers_per_token)` as a required entry point
[VERIFIED: .planning/REQUIREMENTS.md:22-25, quoting: "`initialize(admin, stake_token, base_cost,
per_token_cost, max_makers_per_token)`"], and REG-03 requires a unit test asserting a "re-init
guard" [VERIFIED: .planning/REQUIREMENTS.md:31-34] — a runtime check that has nothing to guard
against, and nothing to invoke a second time, if `initialize` is a constructor.
**Why it happens:** `rfq_swap` is the most recent, most-referenced pattern in this repo, and the
CONTEXT.md canonical refs explicitly point the planner at `rfq_swap/src/lib.rs` for "storage key
enum shape... TTL constants" — it's an easy over-generalization to also copy the constructor
pattern.
**How to avoid:** Implement `initialize` as a plain `#[contractimpl]` method with an explicit
`if env.storage().instance().has(&DataKey::Admin) { return Err(Error::AlreadyInitialized); }`
guard (the "Alternative" shown in the soroban skill's Reinitialization Attacks section
[CITED: .claude/skills/soroban/SKILL.md:1468-1474]). Deploy is then a **two-step** CLI sequence:
`stellar contract deploy --wasm ...` (no constructor args) followed by
`stellar contract invoke --id <ID> -- initialize --admin ... --stake-token ... --base-cost ...
--per-token-cost ... --max-makers-per-token ...`, mirroring the spec §5 sketch's plain-method
signature rather than `rfq_swap`'s deploy-time constructor invocation.
**Warning signs:** If the plan's deploy commands pass `--admin`/`--stake-token`/etc. directly to
`stellar contract deploy` (constructor-style, like the `rfq_swap` README block does), the re-init
guard test in REG-03 has nothing to exercise.

### Pitfall 2: Bounding the per-maker list is not the same check as bounding the per-token list
**What goes wrong:** D-10's "max 32 tokens per maker" (checked against `cfg.tokens.len()`) and
REG's "`max_makers_per_token` = 100" (checked against the `Token(t)` list's `len()`) are two
**independent** bounds enforced in two different places inside the same `add_tokens` loop. Missing
either one either lets a single maker spam its own `tokens` `Vec` unboundedly, or lets a single
popular token's maker list grow past the admin-tunable cap.
**Why it happens:** Both bounds get checked "per token being added," so it is easy to write one
`if` and assume it covers both.
**How to avoid:** In `add_tokens`, check `cfg.tokens.len() + tokens.len() > MAX_TOKENS_PER_MAKER`
(a fixed code constant, D-10) up front, AND check each individual `Token(t)` list's `len() >=
max_makers_per_token(&env)` (an admin-tunable instance-storage value, D-02/D-04) inside the
per-token loop, before pushing.
**Warning signs:** A unit test that only exercises one of the two caps and calls it "bounded-list
rejection" covered — REG-03 names this requirement in the singular but the phase actually needs
both bounds tested.

### Pitfall 3: `set_costs`/`set_max_makers_per_token` changing the picture for *existing* registrations
**What goes wrong:** D-04's rule ("lowering `max_makers_per_token` never evicts existing entries;
it only blocks NEW additions") must be enforced at the `add_tokens` check site (`>=` comparison
against the *current* cap value, read fresh on each call), not baked into `MakerConfig` at
registration time. If the cap check instead stores a per-maker or per-token "cap at time of
registration" snapshot, lowering the cap later has no effect on new additions to an
already-populated token list, which is the wrong behavior per D-04.
**Why it happens:** It's tempting to think of the cap as fixed at registration; it is actually a
live, mutable ceiling re-read on every `add_tokens` call.
**How to avoid:** Always call `max_makers_per_token(&env)` fresh inside `add_tokens` (an instance
storage read, cheap), never cache it in persistent per-token/per-maker state.
**Warning signs:** A test that sets the cap, registers up to it, then lowers the cap and expects
existing makers to be evicted (wrong per D-04) versus a test that lowers the cap and confirms new
additions are blocked while the token list's current occupants are untouched (correct).

### Pitfall 4: Forgetting that `String` byte-length, not char-length, is what D-09 bounds
**What goes wrong:** D-09 says "max 256 bytes." `soroban_sdk::String::len()` returns the string's
length [CITED: docs.rs/soroban-sdk String], and Soroban strings are stored as raw bytes host-side —
for the ASCII URLs this contract expects there is no practical char/byte distinction, but a
validation function written as `url.len() > 256` should be understood as a byte check, not
character count, if it is ever compared against a Rust `&str`'s own `.len()` for a golden-vector
test.
**Why it happens:** Rust engineers reflexively reach for `str::len()` semantics; `soroban_sdk::String`
is a distinct host-managed type with its own `len()`.
**How to avoid:** Validate directly on the `soroban_sdk::String` parameter's own `.len()` (returns
`u32`), and treat empty (`len() == 0`) and oversize (`len() > 256`) as the two `UrlInvalid`
conditions per D-09.
**Warning signs:** A validation helper written against `String::from_str(&env, s).len()` roundtrips
correctly but a validation helper reasoning about a `&str` slice length before conversion drifts if
non-ASCII bytes are ever involved (out of scope for v1 but worth getting the types right regardless).

## Code Examples

### `MakerConfig` and `DataKey` (spec-faithful, no struct-wrapping needed)
```rust
// Source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md §5
// [CITED: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md:474-499]
#[contracttype]
#[derive(Clone)]
pub struct MakerConfig {
    pub url: String,
    pub protocols: Vec<u32>,
    pub tokens: Vec<Address>,
    pub staked: i128,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    StakeToken,
    BaseCost,
    PerTokenCost,
    MaxMakersPerToken,
    Maker(Address),  // persistent -> MakerConfig
    Token(Address),  // persistent -> Vec<Address>, capped at MaxMakersPerToken
}
```

### Runtime config wiring (CFG-01) — exact diff against verified current file contents
```typescript
// src/config.ts — add inside the `declare global { interface Window { ... } }` block,
// after RFQ_SWAP_CONTRACT_ID [VERIFIED: src/config.ts:11-22, current window interface members
// quoted verbatim: "OTC_CONTRACT_ID?: string; REFLECTOR_ORACLE_ID?: string;
// RFQ_SWAP_CONTRACT_ID?: string;"]
RFQ_REGISTRY_ID?: string;

// ...and after the RFQ_SWAP_CONTRACT_ID export block [VERIFIED: src/config.ts:40-44, current
// export pattern quoted verbatim: "export const RFQ_SWAP_CONTRACT_ID = (w.RFQ_SWAP_CONTRACT_ID
// || '').trim(); export const rfqEnabled = /^C[A-Z2-7]{55}$/.test(RFQ_SWAP_CONTRACT_ID);"]
export const RFQ_REGISTRY_ID = (w.RFQ_REGISTRY_ID || '').trim();
export const registryEnabled = /^C[A-Z2-7]{55}$/.test(RFQ_REGISTRY_ID);
```
```javascript
// public/otc-config.js — add after the RFQ_SWAP_CONTRACT_ID block [VERIFIED: public/otc-config.js:28-35,
// current pattern quoted verbatim: "window.RFQ_SWAP_CONTRACT_ID =
// 'CCNP7626WIJVWVTBPLPG6QM77TY6JBU42D4PYONUFTDEPIIW6ZFJQIDT';"]
// RFQ maker/discovery registry (rfq_registry). Deployed <date>; no UI reads it yet (Phase 2).
//   cd contracts && stellar contract build
//   stellar contract deploy --wasm target/wasm32v1-none/release/rfq_registry.wasm \
//     --source-account deployer --network testnet
//   stellar contract invoke --id <ID> --source-account deployer --network testnet \
//     -- initialize --admin <G...> --stake-token <native SAC C...> \
//     --base-cost 1000000000 --per-token-cost 100000000 --max-makers-per-token 100
window.RFQ_REGISTRY_ID = '<fill after deploy>';
```

### Live-check TTL proof (D-12) — reading `liveUntilLedgerSeq`
```javascript
// Source: @stellar/stellar-sdk rpc.Server.getContractData(contract, key, durability)
// [CITED: developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLedgerEntries —
// "liveUntilLedgerSeq ... may be zero if the entry is no longer live"]
import { rpc } from '@stellar/stellar-sdk';
const { Durability } = rpc.Server; // Durability.Persistent is the default keyspace
// before a write:
const before = await server.getContractData(CONTRACT_ID, makerKeyScVal, rpc.Durability.Persistent);
// ...perform a set_url / add_tokens call...
const after = await server.getContractData(CONTRACT_ID, makerKeyScVal, rpc.Durability.Persistent);
// assert after.liveUntilLedgerSeq > before.liveUntilLedgerSeq
```
Building `makerKeyScVal` requires the exact `DataKey::Maker(Address)` XDR encoding the contract
uses — construct it the same way `tools/rfq-live-swap.mjs` builds `orderScVal` (sorted-symbol-key
`ScMap`, or here a single-variant enum ScVal), or simpler: derive it by round-tripping through a
`simulateTransaction` of `get_maker` and inspecting the footprint's read keys, which sidesteps
hand-encoding the enum discriminant entirely. [ASSUMED — the exact enum-variant XDR shape for a
single-address `DataKey::Maker(Address)` variant was not verified against a worked example this
session; verify by running the live script against a real deployed instance and inspecting the
simulation's footprint before hand-encoding it.]

### Simulating TTL expiry/restore in unit tests (D-12's unit-test half)
```rust
// Source: developers.stellar.org/docs/build/guides/archival/test-ttl-extension
// [CITED: developers.stellar.org/docs/build/guides/archival/test-ttl-extension — confirmed
// function names: env.ledger().with_mut(|li| { li.sequence_number = value; }),
// env.storage().persistent().get_ttl(&key) (test-only, SDK v21+),
// env.storage().persistent().extend_ttl(&key, threshold, extension)]
let ttl_before = env.storage().persistent().get_ttl(&key);
env.ledger().with_mut(|li| {
    li.sequence_number += ttl_before + 1; // past the entry's live-until point
});
// A persistent entry now archived; reading it directly in this state panics unless the
// transaction's footprint includes it for auto-restore. Testutils exercise this by re-declaring
// the key in the footprint and confirming the subsequent read/write succeeds (restore), OR by
// asserting the read panics if the test intentionally omits restore. [ASSUMED — exact
// testutils API for forcing footprint-based auto-restore inside a unit test (as opposed to a
// live-network RestoreFootprintOp) was not found via a worked code sample this session; the
// GitHub issue "Imitate state archival invariants in testutils · Issue #1162 ·
// stellar/rs-soroban-sdk" surfaced in search and suggests this exact behavior may be
// SDK-version-sensitive — verify against the pinned soroban-sdk 26.x behavior directly via a
// throwaway test before relying on it for REG-03's archival test. See Open Questions #1.]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `rfq_swap`'s `__constructor` for re-init safety | `rfq_registry`'s plain `initialize` + explicit guard | This phase (deliberate, requirement-driven divergence) | The two contracts in this workspace now demonstrate BOTH valid Soroban initialization patterns; document the reason in `rfq_registry`'s header comment so a future reader doesn't "fix" it to match `rfq_swap` |

**Deprecated/outdated:** Nothing else in this domain has moved; `soroban-sdk` 26.x is one major
behind the crates.io latest (27.0.6) but bumping is explicitly out of scope for this phase (see
Standard Stack).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A contract acting as the `from` of its own `token::Client::transfer` (the `eject` refund leg) needs no `require_auth()` call, distinct from a G-account `from` | Architecture Patterns, Pattern 3 | If wrong, the refund transfer in `eject` would need an extra auth step that doesn't exist in the SAC interface for a contract-as-signer — likely surfaces immediately as a failing `eject` unit test, low actual risk since it's caught by `cargo test` before deploy |
| A2 | The exact testutils mechanism for forcing footprint-based auto-restore of an archived persistent entry inside a Rust unit test (as opposed to on live Testnet) | Code Examples, "Simulating TTL expiry/restore in unit tests" | If the exact API differs from what's sketched, the archival-restore half of REG-03's "archival/restore (TTL) behavior" unit test may need a different construction; caught immediately by `cargo test`, and the live-check script (D-12) covers the write-bumps-TTL half independently, so REG-03's live-network requirement is not at risk even if this exact unit-test technique needs adjustment |
| A3 | The exact `DataKey::Maker(Address)` single-variant enum XDR encoding needed to hand-build a `getContractData` ledger key from the JS live-check script | Code Examples, "Live-check TTL proof" | If wrong, the live-check script's TTL-read step fails at the XDR-construction stage; the suggested workaround (derive the key from a `simulateTransaction` footprint instead of hand-encoding) sidesteps this risk entirely and should be preferred by the implementer |

## Open Questions

1. **Exact archival-simulation testutils call for a genuinely archived (not just TTL-low)
   persistent entry inside `cargo test`**
   - What we know: `env.ledger().with_mut(|li| { li.sequence_number = ...})` advances the ledger;
     `get_ttl`/`extend_ttl` exist and are test-only-gated to SDK v21+; reading an archived entry
     without restoring it panics [CITED: developers.stellar.org/docs/build/guides/archival/test-ttl-extension].
   - What's unclear: whether soroban-sdk 26.x's test `Env` auto-restores an archived persistent
     entry the instant it appears in a subsequent call's footprint (mirroring live-network
     Protocol-23 behavior), or requires an explicit testutils restore call.
   - Recommendation: the planner should schedule this as a small time-boxed spike inside the unit
     test wave — write one throwaway `#[test]` that advances the ledger past a written entry's TTL
     and asserts the actual panic/restore behavior on the pinned SDK version, before writing the
     "real" archival test REG-03 asks for. This is a 15-minute discovery, not a blocker, since
     `cargo test` gives immediate ground truth either way.

2. **Whether `remove_protocols`/`add_protocols` need the SAME strict intra-call-duplicate and
   bounded-list rejection tests as `add_tokens`/`remove_tokens`**
   - What we know: D-08 adds `remove_protocols` "stake-free, symmetric" to `add_protocols`; D-10
     caps protocols at 8 per maker; Claude's Discretion notes duplicate entries within a single
     call's Vec error "consistent with D-05 strict semantics" — D-05 itself only names
     `add_tokens`/`remove_tokens` explicitly.
   - What's unclear: whether the user intends the exact same strict-duplicate-rejection semantics
     for protocols, or whether protocols (being stake-free) can tolerate softer handling (e.g.
     silently ignore an already-present protocol ID).
   - Recommendation: apply the same strict semantics to protocols as tokens for consistency (one
     validation code path, one mental model), since Claude's Discretion explicitly invokes "D-05
     strict semantics" as the consistency bar. Flag this as a locked assumption in the plan so it's
     easy to challenge if the user disagrees.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust toolchain (`rustc`, `wasm32v1-none` target) | Building `rfq_registry` | ✓ | rustc 1.96.1 [VERIFIED: `rustc --version` this session] | — |
| Stellar CLI | Build/deploy/invoke | ✓ | 27.0.0 [VERIFIED: `stellar --version` this session] | — |
| `deployer` identity, funded on Testnet | Deploy + `initialize` admin calls | ✓ | Address `GB3WSGXR5GBMJ7HSBWTBWSWGI3A5AJGD4Y254XBI2P6AKS5N2VIXV7HI` [VERIFIED: `stellar keys address deployer` this session — matches D-03 exactly] | — |
| Cargo workspace (`contracts/Cargo.toml`) | Adding `rfq_registry` as a member | ✓ | resolver "2", `soroban-sdk = "26"` pinned [VERIFIED: contracts/Cargo.toml:1-6] | — |
| Existing `cargo test` suite green | Baseline before adding the new crate | ✓ | 17/17 `rfq_swap` tests passed [VERIFIED: ran `cargo test --manifest-path contracts/Cargo.toml` this session] | — |
| Friendbot (Testnet funding) | Live-check script actors | ✓ (assumed reachable; same endpoint `tools/rfq-live-swap.mjs` already depends on) | `https://friendbot.stellar.org` | — |
| `@stellar/stellar-sdk` | Live-check script | ✓ | `^16.0.1` [VERIFIED: package.json] | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — everything this phase needs is already present and
verified working in this environment.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Rust unit tests via `cargo test` + `soroban-sdk` testutils (`mock_all_auths`, `MockAuth`/`MockAuthInvoke`, `Ledger` trait for time/sequence manipulation) |
| Config file | `contracts/Cargo.toml` (workspace) + `contracts/rfq_registry/Cargo.toml` (new member, mirrors `contracts/rfq_swap/Cargo.toml`) |
| Quick run command | `cargo test --manifest-path contracts/Cargo.toml -p rfq_registry` |
| Full suite command | `cargo test --manifest-path contracts/Cargo.toml` (all three crates: `otc_swap` 6 + `rfq_swap` 17 + new `rfq_registry` tests) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REG-01 | `set_url` first call stakes `base_cost`, creates `MakerConfig` | unit | `cargo test --manifest-path contracts/Cargo.toml -p rfq_registry set_url` | ❌ Wave 0 |
| REG-01 | `set_url` on already-registered maker updates URL, no additional stake (D-06) | unit | same binary, new `#[test] fn set_url_update_no_restake` | ❌ Wave 0 |
| REG-01 | `add_tokens`/`remove_tokens` from an unregistered maker errors `NotRegistered` (D-07) | unit | new `#[test] fn add_tokens_rejects_unregistered` | ❌ Wave 0 |
| REG-01 | `eject` refunds full stake, removes maker from every `Token(t)` list | unit | new `#[test] fn eject_refunds_and_delists` | ❌ Wave 0 |
| REG-02 | `Token(Address)->Vec<Address>` capped at `max_makers_per_token`; growth past cap rejected | unit | new `#[test] fn token_list_rejects_growth_past_cap` | ❌ Wave 0 |
| REG-02 | TTL bumped on every write | unit | new `#[test] fn write_bumps_ttl` using `get_ttl`/`extend_ttl` per Code Examples | ❌ Wave 0 |
| REG-03 | Re-init guard: second `initialize` call errors | unit | new `#[test] fn initialize_rejects_reinit` | ❌ Wave 0 |
| REG-03 | Auth required on every mutating call (un-mocked auth trees where meaningful) | unit | new `#[test]`s modeled on `rfq_swap`'s `admin_functions_reject_non_admin` pattern [VERIFIED: contracts/rfq_swap/src/test.rs:501-547] | ❌ Wave 0 |
| REG-03 | Events emitted on every state transition | unit | new `#[test]`s using `env.events()` assertions | ❌ Wave 0 |
| REG-03 | Live Testnet check: register → discover → eject, TTL-bump-on-write proof | integration (manual invocation) | `node tools/rfq-registry-live.mjs` | ❌ Wave 0 |
| CFG-01 | `RFQ_REGISTRY_ID` typed + parsed correctly | unit (existing pattern, if the project adds a config test) | N/A — no existing `config.test.ts`; visually verify against the `rfqEnabled`/`registryEnabled` regex pattern already covering `RFQ_SWAP_CONTRACT_ID` | — (no test file convention exists for `config.ts` today; not a gap this phase needs to close) |

### Sampling Rate
- **Per task commit:** `cargo test --manifest-path contracts/Cargo.toml -p rfq_registry`
- **Per wave merge:** `cargo test --manifest-path contracts/Cargo.toml` (full workspace, all 3 crates)
- **Phase gate:** Full suite green, `stellar contract build` succeeds for all crates, wasm stays
  well under the 64KB cap (`rfq_swap.wasm` is 10,399 bytes today [VERIFIED: `ls -la
  contracts/target/wasm32v1-none/release/*.wasm` this session] — `rfq_registry` will be a similar
  order of magnitude), and `node tools/rfq-registry-live.mjs` passes on Testnet before
  `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `contracts/rfq_registry/Cargo.toml` — new member manifest (copy `rfq_swap`'s shape, package
      name `rfq_registry`, no `[profile.release]` block per the workspace-root-only rule)
- [ ] `contracts/rfq_registry/src/lib.rs` + `src/test.rs` — the contract and its test suite, from
      scratch
- [ ] `contracts/Cargo.toml` — add `"rfq_registry"` to `members`; re-run `cargo test
      --manifest-path contracts/Cargo.toml` and confirm `otc_swap.wasm` still hashes to
      `83f60b85...` after the workspace member addition (the exact hazard CLAUDE.md's Gotchas
      section documents for adding workspace members)
- [ ] `tools/rfq-registry-live.mjs` — new live-check script, from scratch (mirrors
      `tools/rfq-live-swap.mjs` structurally)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | No wallet-based user auth in this phase; identity IS the Stellar `Address` via `require_auth()` |
| V3 Session Management | No | Stateless contract calls, no sessions |
| V4 Access Control | Yes | `require_auth()` on every mutating maker call (self-service, the caller can only mutate their own `Maker(Address)` entry); `require_admin()`-style check (mirroring `rfq_swap`'s `require_admin` helper [VERIFIED: contracts/rfq_swap/src/lib.rs:387-389]) on `set_costs`/`set_max_makers_per_token` |
| V5 Input Validation | Yes | URL non-empty + ≤256 bytes (D-09); bounded `Vec`s (D-10); strict duplicate rejection (D-05); non-positive cost rejection (Claude's Discretion) — all enforced in-contract, not client-side |
| V6 Cryptography | No | No signature verification beyond the host's own `require_auth()` machinery; no custom crypto in this contract |

### Known Threat Patterns for Soroban registry contracts

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Reinitialization (attacker calls `initialize` a second time to seize admin) | Tampering / Elevation of Privilege | Explicit re-init guard (see Common Pitfalls, Pitfall 1) — this is the exact REG-03 requirement |
| Missing auth on a mutating call (any maker mutates another maker's entry) | Tampering | `maker.require_auth()` as the FIRST line of every mutating function, matching the address the storage key is keyed on |
| Unbounded `Vec` growth (either per-maker tokens/protocols or per-token maker list) | Denial of Service | Fixed code-constant caps (D-10) + admin-tunable cap with live re-read (D-04, Pitfall 3) — "unbounded `Vec` growth is how Soroban contracts brick themselves against read limits" [CITED: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md:511] |
| Stake accounting drift (refund amount doesn't match what was actually staked) | Tampering / Repudiation | `MakerConfig.staked` as the single source of truth for refund amount, updated atomically with every stake/unstake transfer inside the same invocation (relies on Pattern 4's all-or-nothing rollback to keep it consistent even on partial-loop errors) |
| Non-admin calling `set_costs`/`set_max_makers_per_token` | Elevation of Privilege | `require_admin()` helper, tested with an unauthenticated/wrong-signer `MockAuth` the way `rfq_swap`'s `admin_functions_reject_non_admin` test does [VERIFIED: contracts/rfq_swap/src/test.rs:501-547] |
| Arbitrary contract call via `stake_token` set to a malicious token at `initialize` time | Tampering | Out of scope for maker/taker interactions (unlike `rfq_swap`'s `maker_token`/`taker_token`, `stake_token` is set ONCE by the trusted admin at `initialize`, not per-call by an untrusted party) — no per-call allowlist needed here, unlike the `rfq_swap`/`otc_swap` token-substitution hazard documented in spec §7.3 |

## Sources

### Primary (HIGH confidence)
- `contracts/rfq_swap/src/lib.rs` (read in full this session) — the direct implementation pattern
  for storage, TTL, auth, errors, events, admin gating
- `contracts/rfq_swap/src/test.rs` (read in full this session) — the un-mocked-auth test style,
  mutation-verified argument-binding pattern, fund-every-actor rule
- `contracts/Cargo.toml`, `contracts/rfq_swap/Cargo.toml` (read this session) — workspace shape to
  mirror for the new crate
- `tools/rfq-live-swap.mjs` (read in full this session) — the live-check script structure to mirror
- `src/config.ts`, `public/otc-config.js` (read in full this session) — exact current contents for
  the CFG-01 diff
- `docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md` §5, §7.6, §8, §10, §11
  (read this session) — the registry interface sketch and its design rationale
- `.planning/phases/01-on-chain-maker-discovery/01-CONTEXT.md`, `.planning/REQUIREMENTS.md`,
  `.planning/STATE.md` (read this session) — locked decisions and requirement text
- Commands run and verified this session: `cargo test --manifest-path contracts/Cargo.toml` (17/17
  green), `rustc --version`, `stellar --version`, `stellar keys address deployer`, `cargo search
  soroban-sdk`, `ls contracts/target/wasm32v1-none/release/*.wasm`

### Secondary (MEDIUM confidence)
- [developers.stellar.org/docs/build/guides/archival/test-ttl-extension](https://developers.stellar.org/docs/build/guides/archival/test-ttl-extension) — TTL testutils API (`get_ttl`, `extend_ttl`, `with_mut`)
- [developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival) — persistent entry archival/restore semantics, minimum TTL
- [developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLedgerEntries](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLedgerEntries) — `liveUntilLedgerSeq` field confirmation
- [docs.rs/soroban-sdk/latest/soroban_sdk/struct.Vec.html](https://docs.rs/soroban-sdk/latest/soroban_sdk/struct.Vec.html) — `Vec::remove`, `first_index_of`, `contains`, `push_back`, `len`, `is_empty` signatures
- [soroban.stellar.org/docs/basic-tutorials/errors](https://soroban.stellar.org/docs/basic-tutorials/errors) — all-or-nothing rollback on error/panic confirmation
- `.claude/skills/soroban/SKILL.md` (this repo's installed skill; read relevant sections this
  session) — Storage Types, Reinitialization Attacks, TTL/Archival Vulnerabilities, Testing
  Time-Dependent Logic

### Tertiary (LOW confidence)
- WebSearch results on AirSwap `Registry.sol`'s exact Solidity member names (`obligationCost`,
  `tokenCost`, `stakerURLs`, event names) — used only to confirm the naming lineage narrative, not
  as a source for any Rust code in this document; `rfq_registry`'s actual interface is fully
  specified by REG-01 and spec §5, not by the Solidity original
- GitHub issue "Imitate state archival invariants in testutils · Issue #1162 ·
  stellar/rs-soroban-sdk" (surfaced in search, not read in full) — flagged as a reason to
  time-box-verify the archival unit-test technique (Open Question 1) rather than trust it blindly

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, everything already pinned and verified working in
  this environment this session
- Architecture: HIGH — direct, read-in-full precedent (`rfq_swap`) for every pattern except the
  deliberate `initialize`-vs-`__constructor` divergence, which is itself requirement-driven and
  explained in detail
- Pitfalls: HIGH for Pitfalls 1-4 (each grounded in a requirement citation or a verified file
  read); MEDIUM for the two archival/XDR-encoding Assumptions (A2, A3), which are flagged as
  spikeable in Open Questions rather than blocking

**Research date:** 2026-08-20
**Valid until:** 2026-09-19 (30 days — Soroban protocol line and this repo's own established
patterns are stable; re-verify sooner only if Testnet resets, per CLAUDE.md's quarterly-reset note)
