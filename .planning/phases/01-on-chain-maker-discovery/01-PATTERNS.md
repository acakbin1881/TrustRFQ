# Phase 1: On-Chain Maker Discovery - Pattern Map

**Mapped:** 2026-08-20
**Files analyzed:** 8
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `contracts/rfq_registry/Cargo.toml` | config | file-I/O | `contracts/rfq_swap/Cargo.toml` | exact |
| `contracts/rfq_registry/src/lib.rs` | model + service (contract) | CRUD | `contracts/rfq_swap/src/lib.rs` | role-match (deliberate divergence on `initialize` vs `__constructor`, see below) |
| `contracts/rfq_registry/src/test.rs` | test | CRUD / event-driven | `contracts/rfq_swap/src/test.rs` | exact |
| `contracts/Cargo.toml` | config | file-I/O | itself (existing, modified) | exact — only add `"rfq_registry"` to `members` |
| `tools/rfq-registry-live.mjs` | utility (live integration check) | request-response | `tools/rfq-live-swap.mjs` | exact |
| `public/otc-config.js` | config | request-response | itself (existing, modified) | exact — copy the `RFQ_SWAP_CONTRACT_ID` block shape |
| `src/config.ts` | config | request-response | itself (existing, modified) | exact — copy the `RFQ_SWAP_CONTRACT_ID` export shape |

## Pattern Assignments

### `contracts/rfq_registry/Cargo.toml` (config, file-I/O)

**Analog:** `contracts/rfq_swap/Cargo.toml` (read in full)

Copy verbatim, only changing `name`:

```toml
[package]
name = "rfq_registry"
version = "0.1.0"
edition = "2021"
publish = false

[lib]
crate-type = ["cdylib", "rlib"]
doctest = false

[dependencies]
soroban-sdk = { workspace = true }

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }

# NOTE: `[profile.release]` intentionally lives in the workspace root manifest
# (../Cargo.toml). Cargo ignores profile blocks in member crates, so a copy here
# would be silently dead and the wasm would build unoptimized.
```

**`contracts/Cargo.toml` edit** (`contracts/Cargo.toml:1-3`):
```toml
[workspace]
resolver = "2"
members = ["otc_swap", "rfq_swap", "rfq_registry"]
```
`[profile.release]` (`contracts/Cargo.toml:12-20`) stays untouched at the root — do not duplicate it into the new member. After the edit, re-run `cargo test --manifest-path contracts/Cargo.toml` and confirm `otc_swap.wasm` still hashes to `83f60b85...` (CLAUDE.md Gotchas: adding a workspace member can re-resolve `Cargo.lock`).

---

### `contracts/rfq_registry/src/lib.rs` (model/service, CRUD)

**Analog:** `contracts/rfq_swap/src/lib.rs` (read in full, 407 lines)

**Header-comment invariants convention** (`contracts/rfq_swap/src/lib.rs:1-21`):
```rust
#![no_std]
//! <one-paragraph description of the contract's core asymmetry/design choice>
//!
//! <why it matters, contrast with sibling contract if any>
```
For `rfq_registry`, the header comment must explicitly record the **deliberate divergence** from `rfq_swap`'s constructor pattern (per RESEARCH.md Pitfall 1): this contract uses a plain `initialize` entry point with an explicit re-init guard, NOT `__constructor`, because REG-01 names `initialize` as a callable entry point and REG-03 requires a re-init-guard *test* (which is untestable against a constructor).

**Imports pattern** (`contracts/rfq_swap/src/lib.rs:23-26`):
```rust
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, BytesN, Env, IntoVal, Vec,
};
```
`rfq_registry` additionally needs `String` (for `url`) and `Map`/no `Map` (Vec-only per Don't Hand-Roll table) — add `String` to this import list.

**TTL constants pattern** (`contracts/rfq_swap/src/lib.rs:36-43`):
```rust
/// Ledgers a cancellation flag stays alive: ~24h at 5s/ledger, far beyond any
/// quote lifetime.
const CANCEL_TTL: u32 = 17_280;

/// Instance-storage TTL policy: top up to ~30 days whenever less than ~1 day is
/// left. Applied on admin writes; ops keeps it warm between them.
const INSTANCE_TTL_THRESHOLD: u32 = 17_280;
const INSTANCE_TTL_EXTEND_TO: u32 = 518_400;
```
For `rfq_registry`, add analogous persistent-storage TTL constants per RESEARCH.md Pattern 2:
```rust
const PERSISTENT_TTL_THRESHOLD: u32 = 17_280;   // ~1 day at 5s/ledger
const PERSISTENT_TTL_EXTEND_TO: u32 = 518_400;  // ~30 days
```
Plus fixed code-constant caps (D-10): `const MAX_TOKENS_PER_MAKER: u32 = 32;` `const MAX_PROTOCOLS_PER_MAKER: u32 = 8;`

**Error enum style** (`contracts/rfq_swap/src/lib.rs:45-60`):
```rust
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    Expired = 1,
    Cancelled = 2,
    FeeMismatch = 3,
    AmountInvalid = 4,
    Paused = 5,
    NotAuthorized = 6,
    FeeTooHigh = 7,
    MathOverflow = 8,
}
```
Model `rfq_registry`'s `Error` enum the same way: numbered `#[repr(u32)]` variants covering `AlreadyInitialized`, `InvalidCost`, `NotRegistered`, `AlreadyRegistered` (or reuse `TokenAlreadyAdded`/`TokenNotFound`), `UrlInvalid`, `TooManyTokens`, `TooManyProtocols`, `TokenListFull` (per-token cap, D-02/D-04), `NotAdmin`-equivalent reserved slot mirroring the `NotAuthorized` reserved-comment convention.

**Struct-wrapped composite key gotcha** (`contracts/rfq_swap/src/lib.rs:87-97, 109-121`):
```rust
/// A `#[contracttype]` enum variant can hold at most one value, so the design
/// spec's `Cancelled(Address, u64)` sketch does not compile; the pair travels in
/// this struct instead.
#[contracttype]
#[derive(Clone)]
pub struct CancelKey {
    pub maker: Address,
    pub order_id: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    FeeBps,
    FeeCollector,
    Paused,
    Cancelled(CancelKey),
}
```
`rfq_registry`'s `DataKey::Maker(Address)` and `DataKey::Token(Address)` each carry exactly ONE value, so per RESEARCH.md's Anti-Pattern note, do NOT struct-wrap them — this gotcha only applies to genuinely multi-field keys.

**Config/instance-storage pattern** (`contracts/rfq_swap/src/lib.rs:99-121, 358-379`):
```rust
#[contracttype]
#[derive(Clone)]
pub struct Config {
    pub admin: Address,
    pub fee_bps: u32,
    pub fee_collector: Address,
    pub paused: bool,
}
// ... accessor helpers:
fn admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}
fn fee_bps(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::FeeBps).unwrap()
}
fn require_admin(env: &Env) {
    admin(env).require_auth();
}
fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}
```
Mirror this exactly for `rfq_registry`'s `Admin`/`StakeToken`/`BaseCost`/`PerTokenCost`/`MaxMakersPerToken` instance-storage fields and their accessor functions (see RESEARCH.md Pattern 1 for the `initialize` body shape — same accessor style, different entry-point mechanics).

**`#[contractevent]` pattern** (`contracts/rfq_swap/src/lib.rs:123-164`):
```rust
#[contractevent(topics = ["swap"], data_format = "vec")]
pub struct SwapExecuted {
    #[topic]
    pub maker: Address,
    #[topic]
    pub taker: Address,
    pub order_id: u64,
    // ...
}
```
Topics are pinned explicitly rather than derived from the struct name (comment at `lib.rs:123-127`) so a Rust rename never silently breaks a downstream indexer. For `rfq_registry`, emit one `#[contractevent]` struct per state transition (spec §7.6, CONTEXT.md Claude's Discretion): `MakerRegistered`, `UrlUpdated`, `TokensAdded`, `TokensRemoved`, `ProtocolsAdded`, `ProtocolsRemoved`, `MakerEjected`, `CostsSet`, `MaxMakersPerTokenSet` — each with `#[topic]` on the `maker` (or admin-action) address field.

**Auth-scoped mutation pattern** (`contracts/rfq_swap/src/lib.rs:200-279`, esp. 218-243): the `require_auth_for_args`/`require_auth` calls sit immediately before the state-changing token transfers; the security-boundary comment style (`lib.rs:218-222`) should be copied for `rfq_registry`'s stake-transfer calls — call out explicitly which fields are bound into the authorized call.

**Admin-gated setter pattern** (`contracts/rfq_swap/src/lib.rs:320-336`):
```rust
pub fn set_fee(env: Env, fee_bps: u32) -> Result<(), Error> {
    require_admin(&env);
    if fee_bps > MAX_FEE_BPS {
        return Err(Error::FeeTooHigh);
    }
    env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
    bump_instance(&env);
    FeeSet { fee_bps }.publish(&env);
    Ok(())
}
```
Copy this exact shape for `set_costs` and `set_max_makers_per_token` (D-04).

**Stake transfer via SAC `token::Client`** (`contracts/rfq_swap/src/lib.rs:246-265`):
```rust
token::Client::new(&env, &order.taker_token).transfer(&order.taker, &order.maker, &order.taker_amount);
```
For `rfq_registry`, model the stake escrow this way (RESEARCH.md Pattern 3):
```rust
let contract_addr = env.current_contract_address();
token::Client::new(&env, &stake_token(&env)).transfer(&maker, &contract_addr, &base_cost);
// refund on eject:
token::Client::new(&env, &stake_token(&env)).transfer(&contract_addr, &maker, &cfg.staked);
```

**`upgrade` admin function** (`contracts/rfq_swap/src/lib.rs:346-353`):
```rust
pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
    require_admin(&env);
    env.deployer().update_current_contract_wasm(new_wasm_hash);
}
```
Not explicitly required by REG-01..03 but consistent with the sibling contract; include if the planner wants parity (Claude's Discretion territory, not a locked decision — flag if adding).

**Deliberate divergence — `initialize` instead of `__constructor`** (`contracts/rfq_swap/src/lib.rs:169-185` shows the pattern to AVOID copying wholesale):
```rust
// rfq_swap's constructor (DO NOT copy this shape for rfq_registry):
pub fn __constructor(env: Env, admin: Address, fee_bps: u32, fee_collector: Address) {
    let s = env.storage().instance();
    s.set(&DataKey::Admin, &admin);
    // ... no re-init check needed; host guarantees single call
    bump_instance(&env);
}
```
Instead, per RESEARCH.md's Pattern 1 / Pitfall 1, `rfq_registry::initialize` must be a plain `#[contractimpl]` method with an explicit guard:
```rust
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

**Footer test module wiring** (`contracts/rfq_swap/src/lib.rs:406-407`):
```rust
#[cfg(test)]
mod test;
```

---

### `contracts/rfq_registry/src/test.rs` (test, CRUD/event-driven)

**Analog:** `contracts/rfq_swap/src/test.rs` (567 lines; read imports/setup, happy-path, argument-binding-boundary, and admin-gate sections)

**Header + coverage-boundary comment convention** (`contracts/rfq_swap/src/test.rs:1-29`):
```rust
#![cfg(test)]
extern crate std;

use crate::{Error, Order, RfqSwap, RfqSwapClient};
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, AuthorizedFunction, Ledger as _, MockAuth, MockAuthInvoke},
    token, vec, Address, Env, IntoVal, Val, Vec,
};

// --- coverage boundary (read before adding "missing" tests) ---------------
// <state clearly what this file can and cannot prove; point to the live
//   script for what it cannot: e.g. archival lapse across a real ledger,
//   TTL bump on live network, live SAC balance exactness>
```
For `rfq_registry`, the equivalent boundary note should state: mocked-auth unit tests can prove the argument-binding/auth-gating/bounded-list/duplicate-rejection/event-emission surface, but CANNOT prove live TTL bump-on-write (that's `tools/rfq-registry-live.mjs`, D-12) and archival lapse must be simulated via `env.ledger().with_mut(...)` + `get_ttl`/`extend_ttl` testutils (RESEARCH.md Open Question 1 — spike this first as a throwaway test).

**Setup harness pattern** (`contracts/rfq_swap/src/test.rs:31-98`): a `Setup<'a>` struct bundling `env`, `client`, `contract_id`, actor addresses, and token clients, built by a `setup(...)` helper that calls `env.mock_all_auths()` and mints starting balances. Adapt for `rfq_registry`: `Setup` needs `admin`, `stake_token` (a SAC via `env.register_stellar_asset_contract_v2`), `maker`, and mint the maker enough stake-token balance to cover several `base_cost`/`per_token_cost` operations. Comment at `test.rs:43-46` on the fund-every-actor rule for rejection tests is a hard project rule — copy it verbatim as a reminder comment.

**Happy-path test shape** (`contracts/rfq_swap/src/test.rs:138-195`):
```rust
#[test]
fn swap_moves_both_legs() {
    let s = setup(0);
    let o = order_of(&s, 100, 250, 0);
    s.client.swap(&o);
    assert_eq!(s.mt.balance(&s.maker), 999_900);
    // ...
}
```
Model `set_url_stakes_and_creates_config`, `set_url_update_no_restake` (D-06), `add_tokens_stakes_per_token`, `eject_refunds_and_delists` (checks balance deltas exactly, same style as `swap_moves_both_legs`/`swap_charges_fee_to_maker`).

**Argument-binding / auth-scoped test pattern** (`contracts/rfq_swap/src/test.rs:199-260`, `MockAuthInvoke`/`MockAuth` usage): use this exact `MockAuthInvoke`-tree construction style to test that `set_url`/`add_tokens`/`eject` each require the maker's own auth (not a stand-in attacker's), mirroring the "asymmetry" comment style at `test.rs:229-232` — but for `rfq_registry` the pattern is simpler (single `maker.require_auth()`, no split maker/taker subtree).

**Admin-gate rejection test pattern** (`contracts/rfq_swap/src/test.rs:500-547`):
```rust
#[test]
fn admin_functions_reject_non_admin() {
    let s = setup(0);
    let attacker = Address::generate(&s.env);
    let calls: [(&str, Vec<Val>); 3] = [
        ("set_fee", (5u32,).into_val(&s.env)),
        // ...
    ];
    for (fn_name, args) in calls.iter() {
        let invoke = MockAuthInvoke { contract: &s.contract_id, fn_name, args: args.clone(), sub_invokes: &[] };
        let auths = [MockAuth { address: &attacker, invoke: &invoke }];
        let r = /* dispatch to try_<fn_name> */;
        assert!(r.is_err(), "{} must reject a non-admin caller", fn_name);
    }
}
```
Copy directly for `rfq_registry`'s `set_costs`/`set_max_makers_per_token` admin-gate tests.

**Re-init guard test** — new, no direct rfq_swap analog (rfq_swap uses `__constructor` so this test doesn't exist there); model loosely on `constructor_rejects_fee_above_cap` (`test.rs:489-498`) for the `#[should_panic]`/`try_*` idiom:
```rust
#[test]
fn initialize_rejects_reinit() {
    let s = setup_uninitialized(); // or call initialize twice directly on a fresh Env
    assert_eq!(s.client.try_initialize(&s.admin, &s.stake_token, &100, &10, &100),
        Err(Ok(Error::AlreadyInitialized)));
}
```

**Bounded-list rejection tests** — new; per RESEARCH.md Pitfall 2, write TWO separate tests: one for `MAX_TOKENS_PER_MAKER` (code constant, D-10) and one for `max_makers_per_token` (admin-tunable instance value, D-02/D-04), plus a Pitfall-3-style test confirming lowering the cap doesn't evict existing entries.

---

### `tools/rfq-registry-live.mjs` (utility, request-response)

**Analog:** `tools/rfq-live-swap.mjs` (full file read, 350 lines)

**Header/purpose-comment convention** (`tools/rfq-live-swap.mjs:1-17`):
```javascript
// rfq-registry-live.mjs: TESTNET-ONLY live proof of the rfq_registry stake/
// discovery model.
//
// This script exists to answer what unit tests structurally cannot: does the
// TTL of a persistent Maker(Address)/Token(Address) entry actually bump on
// write against the real host, and does the full register -> discover -> eject
// cycle move exact XLM balance deltas.
//
// It creates its own throwaway maker actor via Friendbot, so it depends on no
// gitignored key file and can be re-run from scratch at any time.
//
//   RFQ_REGISTRY_ID=C... node tools/rfq-registry-live.mjs
//
// Exits non-zero on any failed assertion.
```

**Imports + constants pattern** (`tools/rfq-live-swap.mjs:19-45`):
```javascript
import {
  Keypair, Networks, Asset, Operation, TransactionBuilder, Contract,
  Address, nativeToScVal, xdr, authorizeEntry, rpc, Horizon,
} from '@stellar/stellar-sdk';

const { Server, Api, assembleTransaction } = rpc;
const RPC_URL = 'https://soroban-testnet.stellar.org';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const FRIENDBOT = 'https://friendbot.stellar.org';
const NETWORK = Networks.TESTNET;
const FEE = '2000000';
const TIMEOUT = 120;
const CONTRACT_ID = process.env.RFQ_CONTRACT_ID || '<deployed id>';
```
For `rfq-registry-live.mjs`, also import `rpc.Server.Durability`/whatever the SDK exposes for `getContractData` (D-12's TTL-read requirement — see RESEARCH.md Code Examples "Live-check TTL proof").

**`friendbot`/`submitClassic`/`submitSoroban`/`check`/`log` plumbing** (`tools/rfq-live-swap.mjs:44-90`): copy verbatim, these are network-agnostic helpers.

**Balance snapshot pattern** (`tools/rfq-live-swap.mjs:122-130`):
```javascript
async function balances(pub) {
  const acct = await horizon.loadAccount(pub);
  const out = { XLM: 0n };
  for (const b of acct.balances) {
    if (b.asset_type === 'native') out.XLM = BigInt(b.balance.replace('.', ''));
    else out[b.asset_code] = BigInt(b.balance.replace('.', ''));
  }
  return out;
}
```
Copy verbatim — the registry stakes native XLM (D-01), so this same helper measures the maker's XLM delta across `set_url`/`add_tokens`/`eject`.

**Main flow shape** (`tools/rfq-live-swap.mjs:134-278`): funding via friendbot → build op via `Contract(CONTRACT_ID).call(...)` → `submitSoroban`-style simulate/assemble/sign/submit → balance-delta `check()` assertions → a final adversarial step (there: replay; here: TTL-bump proof per D-12, reading `getContractData` before/after a write). Structure `main()` as: fund maker → `set_url` (assert stake debited, `base_cost`) → read TTL before → `add_tokens` (assert stake debited, `per_token_cost` x N) → read TTL after, assert increase (D-12) → `get_urls_for_token`/`get_maker` (read-only, assert maker present) → `eject` (assert full refund, exact balance delta) → `get_maker`/`get_urls_for_token` again (assert maker gone).

**Simple invoke-and-check helper** (`tools/rfq-live-swap.mjs:280-292`, `readConfig`):
```javascript
async function readConfig() {
  const contract = new Contract(CONTRACT_ID);
  const src = new (await import('@stellar/stellar-sdk')).Account(
    'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
  const tx = new TransactionBuilder(src, { fee: '100', networkPassphrase: NETWORK })
    .addOperation(contract.call('get_config'))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) throw new Error(`get_config failed: ${sim.error}`);
  const { scValToNative } = await import('@stellar/stellar-sdk');
  return scValToNative(sim.result.retval);
}
```
Use this exact zero-balance-source-account trick for `rfq_registry`'s read-only `get_urls_for_token`/`get_maker` calls — no funded account needed for a pure read simulation.

**`settle`-style submit-with-expectFailure helper** (`tools/rfq-live-swap.mjs:294-345`): reusable shape for any mutating call (`set_url`/`add_tokens`/`eject`), parametrize on function name and args instead of hard-coding `swap`.

**Note on XDR key construction for the TTL read (D-12):** per RESEARCH.md's Assumption A3, prefer deriving `DataKey::Maker(Address)`'s ledger key from a `simulateTransaction` footprint of `get_maker` rather than hand-encoding the enum-variant ScVal — sidesteps an unverified XDR encoding risk.

---

### `src/config.ts` (config, request-response)

**Analog:** itself — extend the existing `RFQ_SWAP_CONTRACT_ID` block (`src/config.ts:11-22, 40-44`, already read in full)

**Window interface extension pattern** (`src/config.ts:11-22`):
```typescript
declare global {
  interface Window {
    // ...
    RFQ_SWAP_CONTRACT_ID?: string;
    RFQ_REGISTRY_ID?: string;   // NEW
  }
}
```

**Export pattern** (`src/config.ts:40-44`):
```typescript
// RFQ settlement contract. Deployed and proven on Testnet, but nothing in the
// desk calls it yet: the RFQ taker path is a later phase. Exported now so the id
// has one home and one Testnet-reset checklist entry.
export const RFQ_SWAP_CONTRACT_ID = (w.RFQ_SWAP_CONTRACT_ID || '').trim();
export const rfqEnabled = /^C[A-Z2-7]{55}$/.test(RFQ_SWAP_CONTRACT_ID);
```
Append, following the same comment convention (explain what phase reads it, note it's not on the settlement path):
```typescript
// RFQ maker/discovery registry (rfq_registry). Deployed <date>; no UI reads it
// yet (the desk taker path is Phase 2). Exported now so the id has one home
// and joins the Testnet-reset checklist.
export const RFQ_REGISTRY_ID = (w.RFQ_REGISTRY_ID || '').trim();
export const registryEnabled = /^C[A-Z2-7]{55}$/.test(RFQ_REGISTRY_ID);
```

---

### `public/otc-config.js` (config, request-response)

**Analog:** itself — extend the existing `RFQ_SWAP_CONTRACT_ID` block (`public/otc-config.js:28-35`, already read in full)

**Block pattern to copy** (`public/otc-config.js:28-35`):
```javascript
// RFQ settlement contract (rfq_swap). Deployed 2026-08-18; the desk does not
// call it yet, the id lives here so there is one place to look for it and so it
// joins the Testnet-reset checklist alongside the two ids above.
//   cd contracts && stellar contract build
//   stellar contract deploy --wasm target/wasm32v1-none/release/rfq_swap.wasm \
//     --source-account <key> --network testnet \
//     -- --admin <G...> --fee-bps 10 --fee-collector <G...>
window.RFQ_SWAP_CONTRACT_ID = 'CCNP7626WIJVWVTBPLPG6QM77TY6JBU42D4PYONUFTDEPIIW6ZFJQIDT';
```
Append, noting the TWO-STEP deploy (per RESEARCH.md Pitfall 1 — no constructor args at deploy time, `initialize` is a separate invoke):
```javascript
// RFQ maker/discovery registry (rfq_registry). Deployed <date>; no UI reads it
// yet (Phase 2). Two-step deploy: rfq_registry uses a plain `initialize` entry
// point (not a constructor), so it must be invoked separately after deploy.
//   cd contracts && stellar contract build
//   stellar contract deploy --wasm target/wasm32v1-none/release/rfq_registry.wasm \
//     --source-account deployer --network testnet
//   stellar contract invoke --id <ID> --source-account deployer --network testnet \
//     -- initialize --admin <G...> --stake-token <native SAC C...> \
//     --base-cost 1000000000 --per-token-cost 100000000 --max-makers-per-token 100
window.RFQ_REGISTRY_ID = '<fill after deploy>';
```

## Shared Patterns

### TTL bump-on-write (instance storage)
**Source:** `contracts/rfq_swap/src/lib.rs:391-395` (`bump_instance`)
**Apply to:** Every admin-mutating function in `rfq_registry/src/lib.rs` (`initialize`, `set_costs`, `set_max_makers_per_token`).
```rust
fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}
```

### TTL bump-on-write (persistent per-key storage) — new pattern, no exact rfq_swap analog
**Source:** RESEARCH.md Pattern 2, adapted from the `bump_instance` shape above.
**Apply to:** Every write to `DataKey::Maker(Address)` or `DataKey::Token(Address)` in `set_url`, `add_tokens`, `remove_tokens`, `add_protocols`, `remove_protocols`, `eject`.
```rust
fn bump_maker(env: &Env, key: &DataKey) {
    env.storage().persistent().extend_ttl(key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND_TO);
}
```

### Admin gating
**Source:** `contracts/rfq_swap/src/lib.rs:387-389` (`require_admin`) + its call sites at `lib.rs:321, 332, 340, 351`
**Apply to:** `set_costs`, `set_max_makers_per_token` in `rfq_registry`.
```rust
fn require_admin(env: &Env) {
    admin(env).require_auth();
}
```

### Self-service auth (caller mutates own entry)
**Source:** `contracts/rfq_swap/src/lib.rs:242, 288` (`order.taker.require_auth()`, `maker.require_auth()`)
**Apply to:** `set_url`, `add_tokens`, `remove_tokens`, `add_protocols`, `remove_protocols`, `eject` — each takes `maker: Address` and calls `maker.require_auth()` as the first line, matching the address the storage key is keyed on (V4 Access Control in RESEARCH.md's Security Domain table).

### All-or-nothing rollback (no manual unwind)
**Source:** RESEARCH.md Pattern 4, citing Soroban host docs; reflected structurally in every early-`Err`-return in `contracts/rfq_swap/src/lib.rs`'s `swap` function (`lib.rs:201-216`).
**Apply to:** `add_tokens`/`remove_tokens` loops — a single-pass loop with early `Err` return is correct; no manual state snapshot/restore needed.

### Checked math on overflow-risk arithmetic
**Source:** `contracts/rfq_swap/src/lib.rs:399-404` (`mul_bps`)
**Apply to:** Any stake-total arithmetic in `rfq_registry` (e.g. summing `per_token_cost * tokens.len()` for refund calculation) — use `checked_mul`/`checked_add` and map to a contract `Error`, never a silent wrap.

## No Analog Found

None — every file in this phase's scope has a direct or near-direct analog in the existing `rfq_swap`/config codebase, per RESEARCH.md's Architecture Patterns section (confirmed HIGH confidence, zero new dependencies).

## Metadata

**Analog search scope:** `contracts/rfq_swap/`, `contracts/Cargo.toml`, `tools/rfq-live-swap.mjs`, `src/config.ts`, `public/otc-config.js` — all identified directly from CONTEXT.md's `canonical_refs` section (user/researcher already pinned exact analogs; no further Glob/Grep search was needed).
**Files scanned:** 8 (all read in full or via targeted non-overlapping offsets)
**Pattern extraction date:** 2026-08-20
