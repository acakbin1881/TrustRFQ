#![no_std]
//! rfq_registry: a stake-gated, on-chain "phone book" for RFQ market makers.
//!
//! Ported from AirSwap's `Registry.sol`: a maker posts a refundable XLM stake
//! to register its off-chain quote-server URL, and any client can then
//! discover it with a free, unauthenticated read-only call. The registry
//! stores no opinion about the endpoint beyond structural validation (length,
//! non-empty) — it stays, deliberately, "a boring phone book" (design spec
//! §5): no on-chain scheme parsing, no reachability probing. Stake is a spam
//! price, not a slashing bond: `eject` always refunds the full amount
//! recorded in `MakerConfig.staked`, never a reduced remainder.
//!
//! **Deliberate divergence from the sibling `rfq_swap` contract.** `rfq_swap`
//! uses a `__constructor` (host-guaranteed single call; there is no way to
//! invoke it twice, so no re-init check is possible or needed). This contract
//! instead exposes a plain, separately callable `initialize(...)` guarded by
//! an explicit already-initialized check. That is not an oversight: REG-01
//! names `initialize` as a required entry point, and REG-03 requires a *test*
//! asserting a re-init guard — a runtime check that is structurally
//! impossible to exercise against a constructor (there is nothing left to
//! call a second time). Do not "fix" this to match `rfq_swap`; the two
//! contracts in this workspace intentionally demonstrate both valid Soroban
//! initialization patterns. Deploy is therefore a two-step CLI sequence:
//! `stellar contract deploy` with no constructor args, followed by a separate
//! `stellar contract invoke -- initialize ...`.
//!
//! **Deliberately no `upgrade` entry point.** `rfq_swap` has one, guarded by
//! `require_admin`; this contract holds every registered maker's stake in
//! escrow as its own SAC balance, so an admin-invokable wasm swap would be a
//! standing route to spend funds that are not the admin's. The phase's own
//! threat model forbids any admin path to staked funds, so the omission is
//! permanent, not a gap to fill in later.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env,
    String, Vec,
};

/// Instance-storage TTL policy: top up to ~30 days whenever less than ~1 day
/// is left. Applied on every `initialize`/admin write.
const INSTANCE_TTL_THRESHOLD: u32 = 17_280;
const INSTANCE_TTL_EXTEND_TO: u32 = 518_400;

/// Persistent per-key TTL policy for `Maker`/`Token` entries: bumped on every
/// write, never via a dedicated contract-side "extend" entry point — anyone
/// can extend any entry's TTL from outside the contract with a bare
/// `ExtendFootprintTTLOp` (design spec §5), so no such function is needed.
const PERSISTENT_TTL_THRESHOLD: u32 = 17_280;
const PERSISTENT_TTL_EXTEND_TO: u32 = 518_400;

/// Fixed code-constant caps (D-10). `MAX_TOKENS_PER_MAKER` /
/// `MAX_PROTOCOLS_PER_MAKER` bound a single maker's own lists; the separate,
/// admin-tunable `max_makers_per_token` (instance storage, see `Config`)
/// bounds how many makers may list the SAME token. These are two independent
/// bounds enforced in two different places (later plans in this phase add the
/// entry points that check them).
const MAX_TOKENS_PER_MAKER: u32 = 32;
const MAX_PROTOCOLS_PER_MAKER: u32 = 8;

/// D-09: URL validation is a bare structural bound (non-empty, max bytes), no
/// on-chain scheme check. `soroban_sdk::String::len()` is a byte count, not a
/// char count — see CLAUDE.md / RESEARCH.md Pitfall 4.
const MAX_URL_BYTES: u32 = 256;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidCost = 3,
    InvalidCap = 4,
    UrlInvalid = 5,
    NotRegistered = 6,
    TokenAlreadyAdded = 7,
    TokenNotFound = 8,
    ProtocolAlreadyAdded = 9,
    ProtocolNotFound = 10,
    TooManyTokens = 11,
    TooManyProtocols = 12,
    TokenListFull = 13,
    EmptyInput = 14,
    MathOverflow = 15,
}

/// Everything discovery needs about one maker. `staked` is the single source
/// of refund truth for `eject`: `base_cost` plus `per_token_cost` for every
/// token currently in `tokens`, at the rate paid when each was added.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MakerConfig {
    pub url: String,
    pub protocols: Vec<u32>,
    pub tokens: Vec<Address>,
    pub staked: i128,
}

/// Everything a discovery client needs before registering or querying, in one
/// read.
#[contracttype]
#[derive(Clone)]
pub struct Config {
    pub admin: Address,
    pub stake_token: Address,
    pub base_cost: i128,
    pub per_token_cost: i128,
    pub max_makers_per_token: u32,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    StakeToken,
    BaseCost,
    PerTokenCost,
    MaxMakersPerToken,
    /// Persistent. `Maker(Address)` and `Token(Address)` each carry exactly
    /// one value, so — unlike `rfq_swap`'s `Cancelled(CancelKey)` — no
    /// struct-wrapping is needed; a `#[contracttype]` enum variant only needs
    /// wrapping when it must carry TWO or more values.
    Maker(Address),
    /// Persistent -> `Vec<Address>`, capped at `max_makers_per_token`. Wired
    /// up by a later plan in this phase (`add_tokens`/`get_urls_for_token`).
    Token(Address),
}

// --- events ---------------------------------------------------------------
//
// Topics are the indexer's primary key, so they are pinned explicitly rather
// than derived from the struct name: renaming a Rust type must never silently
// break a downstream consumer.

/// A maker's first `set_url` call: stake moved, `MakerConfig` created.
#[contractevent(topics = ["reg"], data_format = "vec")]
pub struct MakerRegistered {
    #[topic]
    pub maker: Address,
    pub url: String,
    pub staked: i128,
}

/// An already-registered maker's `set_url` call: url replaced in place, zero
/// additional stake moved (D-06).
#[contractevent(topics = ["url"], data_format = "vec")]
pub struct UrlUpdated {
    #[topic]
    pub maker: Address,
    pub url: String,
}

/// A maker's full exit: every stroop of `staked` refunded, entry removed.
#[contractevent(topics = ["eject"], data_format = "vec")]
pub struct MakerEjected {
    #[topic]
    pub maker: Address,
    pub refunded: i128,
}

#[contract]
pub struct RfqRegistry;

#[contractimpl]
impl RfqRegistry {
    /// Callable once. See the header comment for why this is a plain function
    /// with an explicit guard rather than a `__constructor`.
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
        if base_cost <= 0 || per_token_cost <= 0 {
            return Err(Error::InvalidCost);
        }
        if max_makers_per_token == 0 {
            return Err(Error::InvalidCap);
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

    /// First call for `maker` stakes `base_cost` and creates its
    /// `MakerConfig`; every later call replaces `url` in place for zero
    /// additional stake (D-06). Either way `maker` must authorize this call
    /// itself — the storage key is keyed on the same address.
    pub fn set_url(env: Env, maker: Address, url: String) -> Result<(), Error> {
        maker.require_auth();
        if url.len() == 0 || url.len() > MAX_URL_BYTES {
            return Err(Error::UrlInvalid);
        }

        let key = DataKey::Maker(maker.clone());
        let existing: Option<MakerConfig> = env.storage().persistent().get(&key);
        match existing {
            Some(mut cfg) => {
                cfg.url = url.clone();
                env.storage().persistent().set(&key, &cfg);
                bump_maker(&env, &key);
                UrlUpdated { maker, url }.publish(&env);
            }
            None => {
                let cost = base_cost(&env);
                let contract_addr = env.current_contract_address();
                // `maker.require_auth()` above authorizes this sub-invocation:
                // one `require_auth()` per address per top-level call covers
                // every sub-invocation that address makes, including the
                // SAC's own internal `from.require_auth()`.
                token::Client::new(&env, &stake_token(&env)).transfer(
                    &maker,
                    &contract_addr,
                    &cost,
                );
                let cfg = MakerConfig {
                    url: url.clone(),
                    protocols: Vec::new(&env),
                    tokens: Vec::new(&env),
                    staked: cost,
                };
                env.storage().persistent().set(&key, &cfg);
                bump_maker(&env, &key);
                MakerRegistered {
                    maker,
                    url,
                    staked: cost,
                }
                .publish(&env);
            }
        }
        Ok(())
    }

    /// Free, unauthenticated read. Errors `NotRegistered` rather than
    /// returning an empty/default config, so callers cannot mistake "never
    /// registered" for "registered with no data."
    pub fn get_maker(env: Env, maker: Address) -> Result<MakerConfig, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Maker(maker))
            .ok_or(Error::NotRegistered)
    }

    /// Everything a discovery client needs before registering or querying.
    pub fn get_config(env: Env) -> Config {
        Config {
            admin: admin(&env),
            stake_token: stake_token(&env),
            base_cost: base_cost(&env),
            per_token_cost: per_token_cost(&env),
            max_makers_per_token: max_makers_per_token(&env),
        }
    }

    /// Full refund of `MakerConfig.staked` — never a slashed, rounded-down,
    /// or fee-deducted remainder (phase prohibition: stake is a spam price,
    /// not a bond). `maker` must authorize; the refund leg needs no
    /// additional auth because the contract is the `from` of its own SAC
    /// transfer, not a G-account (RESEARCH.md Assumption A1, proven by this
    /// function's own unmocked-auth test). Re-registering after `eject`
    /// succeeds as a fresh registration (Claude's Discretion).
    pub fn eject(env: Env, maker: Address) -> Result<(), Error> {
        maker.require_auth();
        let key = DataKey::Maker(maker.clone());
        let cfg: MakerConfig = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotRegistered)?;
        env.storage().persistent().remove(&key);

        let contract_addr = env.current_contract_address();
        token::Client::new(&env, &stake_token(&env)).transfer(
            &contract_addr,
            &maker,
            &cfg.staked,
        );

        MakerEjected {
            maker,
            refunded: cfg.staked,
        }
        .publish(&env);
        Ok(())
    }
}

// --- internals --------------------------------------------------------------

fn admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

fn stake_token(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::StakeToken)
        .unwrap()
}

fn base_cost(env: &Env) -> i128 {
    env.storage().instance().get(&DataKey::BaseCost).unwrap()
}

fn per_token_cost(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::PerTokenCost)
        .unwrap()
}

fn max_makers_per_token(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::MaxMakersPerToken)
        .unwrap()
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}

fn bump_maker(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND_TO);
}

#[cfg(test)]
mod test;
