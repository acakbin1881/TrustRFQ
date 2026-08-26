---
phase: 01-on-chain-maker-discovery
reviewed: 2026-08-26T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - contracts/Cargo.toml
  - contracts/rfq_registry/Cargo.toml
  - contracts/rfq_registry/src/lib.rs
  - contracts/rfq_registry/src/test.rs
  - tools/rfq-registry-live.mjs
  - public/otc-config.js
  - src/config.ts
  - CLAUDE.md
findings:
  critical: 1
  warning: 2
  info: 1
  total: 4
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-08-26T00:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Reviewed the `rfq_registry` Soroban contract (stake-gated maker directory), its unit-test suite,
the live-Testnet proof script, and the two runtime-config touch points that expose the new
contract id to the frontend. The stake accounting is careful and mostly correct: `eject` and
`remove_tokens` both refund exactly `MakerConfig.staked`/the per-token rate recorded at
registration time, never a recomputation from the live (admin-retunable) cost, and the two
independent bounded-list caps (`MAX_TOKENS_PER_MAKER` fixed constant vs. admin-tunable
`max_makers_per_token`) are checked in the right places with good boundary-value test coverage
(exact-boundary, cross-boundary-batch, and lowered-live-cap-does-not-evict tests all present).

The one finding that changes the correctness verdict is the `initialize` re-init guard itself:
the guard correctly blocks a *second* call once the instance is initialized, but `initialize`
performs no `require_auth()` at all, and the project's own deploy instructions run `deploy` and
`initialize` as two separate transactions. That is the textbook "front-run the initializer"
window — anyone watching the mempool between those two transactions can call `initialize` first
with their own `admin` address and permanently lock out the intended deployer, since the guard
that was added specifically to protect re-init from tampering also makes the hijack irreversible.
This is scoped to admin-controlled spam-price knobs (there is deliberately no admin path to
escrowed stake), but it is a real integrity gap in the exact area this review was asked to focus
on ("re-init protection"), so it is filed as a blocker rather than a warning.

Two secondary findings: two of the four external-token-transfer call sites order the transfer
before the corresponding state write (`set_url`'s first-registration branch and `add_tokens`'s
final `MakerConfig` persist), unlike `remove_tokens`/`eject` which correctly write state first —
a checks-effects-interactions violation that is currently inert only because `stake_token` is
assumed to be a non-reentrant SAC. And two of the bounded-list-cap comparisons use plain `u32`
addition instead of the `checked_*` pattern used everywhere else in this same file for stake
arithmetic, which is an inconsistency rather than a currently-exploitable bug (the workspace's
`overflow-checks = true` release profile makes it panic-safe, just not typed-error-safe).

## Critical Issues

### CR-01: `initialize` has no auth check, so the first caller — not necessarily the deployer — becomes permanent admin

**File:** `contracts/rfq_registry/src/lib.rs:218-243`
**Issue:** `initialize` takes an arbitrary `admin: Address` parameter and never calls
`admin.require_auth()` (or requires any signer at all) before storing it and setting the
already-initialized guard:

```rust
pub fn initialize(
    env: Env,
    admin: Address,
    stake_token: Address,
    base_cost: i128,
    per_token_cost: i128,
    max_makers_per_token: u32,
) -> Result<(), Error> {
    if env.storage().instance().has(&DataKey::Admin) {
        return Err(Error::AlreadyInitialized);
    }
    ...
    s.set(&DataKey::Admin, &admin);
    ...
}
```

This is confirmed by the contract's own test suite: `read_only_calls_succeed_with_no_auth_mocked_and_emit_no_events`
(`contracts/rfq_registry/src/test.rs:1242-1244`) explicitly notes "`initialize` calls no
`require_auth` at all — whoever calls it first becomes admin". The header comment
(`contracts/rfq_registry/src/lib.rs:13-25`) documents that this contract deliberately uses a
plain `initialize()` instead of a `__constructor` so that the re-init guard is testable — but
that same design choice reopens the classic "front-run the initializer" window that a
`__constructor` closes for free (a constructor is host-guaranteed to run exactly once, atomically
with deploy, so there is no gap for anyone else to call it in). Here, `public/otc-config.js:41-50`
and the header comment both confirm the actual deploy flow is **two separate transactions**:

```
stellar contract deploy --wasm target/wasm32v1-none/release/rfq_registry.wasm ...
stellar contract invoke --id <NEW ID> ... -- initialize --admin GB3WSGXR5... ...
```

Once the contract is deployed (and therefore has a public contract id and, on a public network, a
confirmed deploy transaction that reveals the wasm/id), any account can submit its own
`initialize` call with a higher fee, race it ahead of the deployer's own `initialize` invocation,
and become permanent admin — the very re-init guard being tested here then makes this
unrecoverable, since the deployer's follow-up `initialize` call fails with `AlreadyInitialized`
and there is deliberately no `upgrade` entry point to install a corrected admin. The blast radius
is scoped to the two admin-only spam-price knobs (`set_costs`, `set_max_makers_per_token`) — there
is no admin path to escrowed maker stake by design — but a hijacked admin can still grief the
registry into uselessness (e.g. setting `base_cost` absurdly high, permanently blocking new
registrations) with no recovery path.

**Fix:** Close the front-running window. The cleanest fix consistent with "REG-03 requires a test
asserting a re-init guard" is to keep the plain `initialize` (so the re-init-guard test stays
meaningful) but pin the only account allowed to call it to whoever deploys the contract, verified
via `require_auth` on the caller rather than trusting the `admin` argument itself:

```rust
pub fn initialize(
    env: Env,
    admin: Address,
    stake_token: Address,
    base_cost: i128,
    per_token_cost: i128,
    max_makers_per_token: u32,
) -> Result<(), Error> {
    if env.storage().instance().has(&DataKey::Admin) {
        return Err(Error::AlreadyInitialized);
    }
    // The caller must be the account that will become admin: a signature is
    // required, so a front-runner cannot install ITSELF as admin without also
    // being able to produce admin's signature.
    admin.require_auth();
    ...
}
```

This does not fully eliminate front-running risk (anyone can still race to call `initialize`
naming *themselves* as admin and sign for it), but it removes the specific attack of an outsider
installing themselves as admin using the *intended* admin's address, and — combined with
requiring the deployer to submit `deploy` and `initialize` back-to-back with the fee bumped on the
second — is the standard mitigation. If tighter guarantees are wanted, consider deploying via a
factory contract that deploys-and-initializes atomically in one transaction (no gap at all), which
is the pattern that gives `rfq_swap`'s `__constructor` its safety without losing testability of
the specific re-init-guard assertion (the guard test would then target the factory-invoked path).

## Warnings

### WR-01: Stake transferred from the maker before the corresponding `MakerConfig` write, unlike the refund paths

**File:** `contracts/rfq_registry/src/lib.rs:264-291` (registration branch of `set_url`),
`contracts/rfq_registry/src/lib.rs:349-356` (`add_tokens`)
**Issue:** In `set_url`'s first-registration branch, the stake `transfer` happens before the new
`MakerConfig` is written to persistent storage:

```rust
None => {
    let cost = base_cost(&env);
    let contract_addr = env.current_contract_address();
    token::Client::new(&env, &stake_token(&env)).transfer(&maker, &contract_addr, &cost);
    let cfg = MakerConfig { url: url.clone(), protocols: Vec::new(&env), tokens: Vec::new(&env), staked: cost };
    env.storage().persistent().set(&key, &cfg);   // <- state written AFTER the external call
    ...
}
```

`add_tokens` has the same ordering for the maker's own `MakerConfig` (the per-token `Token(t)`
lists are written earlier, inside the loop, but the maker's own `staked`/`tokens` update is not
persisted until after the transfer):

```rust
let cost = checked_mul_count(per_token_cost(&env), tokens.len())?;
token::Client::new(&env, &stake_token(&env)).transfer(&maker, &contract_addr, &cost);
cfg.staked = cfg.staked.checked_add(cost).ok_or(Error::MathOverflow)?;
env.storage().persistent().set(&key, &cfg);   // <- state written AFTER the external call
```

By contrast, `remove_tokens` (`contracts/rfq_registry/src/lib.rs:412-418`) and `eject`
(`contracts/rfq_registry/src/lib.rs:632-639`) both correctly write all state *before* invoking the
external token transfer. This inconsistency means the two functions that pull funds *from* the
maker follow the riskier ordering, while the two that push funds *to* the maker follow the safer
one. Today this is inert because `stake_token` is assumed to be a plain, non-reentrant Stellar
Asset Contract, but a SAC address is admin-supplied at `initialize` time with no on-chain check
that it behaves like one — if a custom (non-SAC) token contract were ever configured, either
deliberately or by admin error/compromise, a reentrant `transfer` implementation could call back
into `set_url`/`add_tokens` for the same maker while the outer call's `MakerConfig` write is still
pending, letting the maker (or the token contract) trigger a double stake collection that the
final overwrite would then silently under-record in `MakerConfig.staked`, permanently trapping the
excess in the contract with no refund path.

**Fix:** Reorder both sites to checks-effects-interactions, matching `remove_tokens`/`eject`:
write the `MakerConfig` (and, for `add_tokens`, do it after the per-token list writes) before
calling `token::Client::transfer`, e.g. in `set_url`:

```rust
None => {
    let cost = base_cost(&env);
    let contract_addr = env.current_contract_address();
    let cfg = MakerConfig { url: url.clone(), protocols: Vec::new(&env), tokens: Vec::new(&env), staked: cost };
    env.storage().persistent().set(&key, &cfg);
    bump_maker(&env, &key);
    token::Client::new(&env, &stake_token(&env)).transfer(&maker, &contract_addr, &cost);
    MakerRegistered { maker, url, staked: cost }.publish(&env);
}
```

### WR-02: Bounded-list cap comparisons use unchecked `u32` addition instead of the codebase's own `checked_*` pattern

**File:** `contracts/rfq_registry/src/lib.rs:325` (`add_tokens`), `contracts/rfq_registry/src/lib.rs:485` (`add_protocols`)
**Issue:**

```rust
if cfg.tokens.len() + tokens.len() > MAX_TOKENS_PER_MAKER {   // line 325
    return Err(Error::TooManyTokens);
}
...
if cfg.protocols.len() + protocols.len() > MAX_PROTOCOLS_PER_MAKER {   // line 485
    return Err(Error::TooManyProtocols);
}
```

Both additions are plain `u32 + u32` with no `checked_add`. `cfg.tokens.len()`/`cfg.protocols.len()`
are bounded (≤32/≤8 respectively, by this same cap), but `tokens.len()`/`protocols.len()` come
straight from the caller-supplied `Vec` argument with no independent upper bound before this
comparison runs. The file already has a dedicated `checked_mul_count` helper
(`contracts/rfq_registry/src/lib.rs:700-702`) specifically to avoid silent-wrap/overflow-panic
risk for the *cost* arithmetic; these two cap checks are the only arithmetic in the file that
don't follow that same discipline. Because the workspace's release profile sets
`overflow-checks = true` (`contracts/Cargo.toml:14`), an overflow here would panic/trap (the
transaction reverts) rather than silently wrapping — so this is not exploitable for state
corruption — but it does mean a sufficiently large `tokens`/`protocols` argument fails with an
opaque host trap instead of the typed `Error::TooManyTokens`/`Error::TooManyProtocols` the rest of
this contract is careful to always return, and it's an avoidable inconsistency in a file whose
whole design philosophy for numeric safety is otherwise "no silent wrap, ever."

**Fix:**

```rust
let requested = cfg.tokens.len().checked_add(tokens.len()).ok_or(Error::MathOverflow)?;
if requested > MAX_TOKENS_PER_MAKER {
    return Err(Error::TooManyTokens);
}
```

(and the equivalent for `add_protocols`).

## Info

### IN-01: `tools/rfq-registry-live.mjs` hardcodes a demo token address that isn't on the documented Testnet-reset checklist

**File:** `tools/rfq-registry-live.mjs:80`
**Issue:** `USDC_SAC` is derived from a hardcoded issuer G-address
(`GBJH2XCGKRMFKCBYPFJHHGISZGLOYZ3TM3IMFQPQSK7NT2L7JUARLC26`) that is the repo's own demo USDC
issuer (per `CLAUDE.md`'s "TEMPORARY, demo only" note about `src/core/tokens.ts`). `CLAUDE.md`'s
Testnet-reset checklist (`CLAUDE.md:391-395`) enumerates `OTC_CONTRACT_ID`, `REFLECTOR_ORACLE_ID`,
and `RFQ_REGISTRY_ID` as needing updates on a reset, but does not mention this script's own
hardcoded token constant, or `src/core/tokens.ts`'s demo-issuer note, as things to re-check
together. A full Testnet reset wipes all accounts, so this issuer address would need re-funding
(and, if the keypair is lost, replacing) before this script's `add_tokens` leg would still resolve
to a meaningful discovery scenario.
**Fix:** Add a one-line cross-reference in this script's header comment (or in `CLAUDE.md`'s
reset checklist) pointing at `src/core/tokens.ts`'s demo-issuer note, so a future reset updates
both together.

---

_Reviewed: 2026-08-26T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
