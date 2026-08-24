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

/// A maker priced and staked one or more tokens it now quotes.
#[contractevent(topics = ["tok_add"], data_format = "vec")]
pub struct TokensAdded {
    #[topic]
    pub maker: Address,
    pub tokens: Vec<Address>,
    pub cost: i128,
}

/// A maker withdrew one or more tokens it no longer quotes, refunded in full.
#[contractevent(topics = ["tok_rm"], data_format = "vec")]
pub struct TokensRemoved {
    #[topic]
    pub maker: Address,
    pub tokens: Vec<Address>,
    pub refund: i128,
}

/// A maker declared one or more protocol versions it speaks. Stake-free.
#[contractevent(topics = ["prot_add"], data_format = "vec")]
pub struct ProtocolsAdded {
    #[topic]
    pub maker: Address,
    pub protocols: Vec<u32>,
}

/// A maker retracted one or more protocol versions it no longer speaks.
#[contractevent(topics = ["prot_rm"], data_format = "vec")]
pub struct ProtocolsRemoved {
    #[topic]
    pub maker: Address,
    pub protocols: Vec<u32>,
}

/// Admin retuned the spam-price knobs. Applies to future stake movements
/// only; `MakerConfig.staked` is the frozen source of refund truth for
/// everyone already registered (D-04, T-01-22).
#[contractevent(topics = ["set_cost"], data_format = "vec")]
pub struct CostsSet {
    pub base_cost: i128,
    pub per_token_cost: i128,
}

/// Admin retuned the per-token maker-list ceiling. Never evicts an existing
/// entry (D-04, T-01-21) -- `add_tokens` re-reads this value fresh on every
/// call and only blocks NEW additions.
#[contractevent(topics = ["set_max"], data_format = "vec")]
pub struct MaxMakersSet {
    pub max_makers_per_token: u32,
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

    /// A registered maker prices and stakes the tokens it now quotes.
    ///
    /// D-05 strict duplicate semantics: a token already in `MakerConfig.tokens`
    /// (including a repeat within this same input `Vec`, since the growing
    /// `cfg.tokens` is what is checked) is a hard error, moving no funds. D-07:
    /// only a registered maker (one that has called `set_url`) may call this.
    /// The two bounds below are independent (RESEARCH.md Pitfall 2): a fixed
    /// code-constant cap on the maker's OWN token list (`MAX_TOKENS_PER_MAKER`,
    /// D-10), and a live-read, admin-tunable cap on how many makers may list
    /// the SAME token (`max_makers_per_token`, D-02/D-04) — re-read from
    /// instance storage on every call, never cached, so lowering the cap later
    /// blocks new additions without evicting anyone already on a list
    /// (RESEARCH.md Pitfall 3). A single pass with early `Err` returns is
    /// sufficient for all-or-nothing behavior: Soroban rolls back every
    /// storage write and every token transfer made in this invocation the
    /// moment it errors (RESEARCH.md Pattern 4), so no manual unwind code is
    /// needed for D-05's "no state change, no funds move on error."
    pub fn add_tokens(env: Env, maker: Address, tokens: Vec<Address>) -> Result<(), Error> {
        maker.require_auth();
        if tokens.is_empty() {
            return Err(Error::EmptyInput);
        }

        let key = DataKey::Maker(maker.clone());
        let mut cfg: MakerConfig = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotRegistered)?;

        if cfg.tokens.len() + tokens.len() > MAX_TOKENS_PER_MAKER {
            return Err(Error::TooManyTokens);
        }

        let cap = max_makers_per_token(&env);
        for token in tokens.iter() {
            if cfg.tokens.contains(&token) {
                return Err(Error::TokenAlreadyAdded);
            }
            let token_key = DataKey::Token(token.clone());
            let mut list: Vec<Address> = env
                .storage()
                .persistent()
                .get(&token_key)
                .unwrap_or_else(|| Vec::new(&env));
            if list.len() >= cap {
                return Err(Error::TokenListFull);
            }
            list.push_back(maker.clone());
            env.storage().persistent().set(&token_key, &list);
            bump_maker(&env, &token_key);
            cfg.tokens.push_back(token);
        }

        let cost = checked_mul_count(per_token_cost(&env), tokens.len())?;
        let contract_addr = env.current_contract_address();
        // `maker.require_auth()` above covers this sub-invocation, same as
        // `set_url`'s first-registration stake leg.
        token::Client::new(&env, &stake_token(&env)).transfer(&maker, &contract_addr, &cost);
        cfg.staked = cfg.staked.checked_add(cost).ok_or(Error::MathOverflow)?;
        env.storage().persistent().set(&key, &cfg);
        bump_maker(&env, &key);

        TokensAdded {
            maker,
            tokens,
            cost,
        }
        .publish(&env);
        Ok(())
    }

    /// A registered maker withdraws tokens it no longer quotes, refunded in
    /// full at the rate recorded in `MakerConfig.staked` (D-05: a token not in
    /// the maker's list is a hard error, refunding nothing). Removal is
    /// index-based (`Vec::remove`), never swap-remove, so the surviving
    /// entries in both the maker's own list and `Token(t)`'s list keep their
    /// relative order — an observable of `get_urls_for_token`. An abandoned
    /// `Token(t)` list (emptied by this call) is deleted outright rather than
    /// stored empty, so it stops paying rent.
    pub fn remove_tokens(env: Env, maker: Address, tokens: Vec<Address>) -> Result<(), Error> {
        maker.require_auth();
        if tokens.is_empty() {
            return Err(Error::EmptyInput);
        }

        let key = DataKey::Maker(maker.clone());
        let mut cfg: MakerConfig = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotRegistered)?;

        for token in tokens.iter() {
            let idx = cfg
                .tokens
                .first_index_of(&token)
                .ok_or(Error::TokenNotFound)?;
            cfg.tokens.remove(idx);

            let token_key = DataKey::Token(token.clone());
            let mut list: Vec<Address> = env
                .storage()
                .persistent()
                .get(&token_key)
                .unwrap_or_else(|| Vec::new(&env));
            if let Some(midx) = list.first_index_of(&maker) {
                list.remove(midx);
            }
            if list.is_empty() {
                env.storage().persistent().remove(&token_key);
            } else {
                env.storage().persistent().set(&token_key, &list);
                bump_maker(&env, &token_key);
            }
        }

        let refund = checked_mul_count(per_token_cost(&env), tokens.len())?;
        cfg.staked = cfg.staked.checked_sub(refund).ok_or(Error::MathOverflow)?;
        env.storage().persistent().set(&key, &cfg);
        bump_maker(&env, &key);

        let contract_addr = env.current_contract_address();
        token::Client::new(&env, &stake_token(&env)).transfer(&contract_addr, &maker, &refund);

        TokensRemoved {
            maker,
            tokens,
            refund,
        }
        .publish(&env);
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

    /// Free, unauthenticated, read-only discovery call: no auth, no writes, no
    /// TTL bump. Returns urls in the `Token(t)` list's own insertion order. An
    /// unregistered token returns an empty `Vec`, never an error — this is the
    /// call Phase 2's desk issues per pair via RPC simulation. Defensively
    /// skips any listed address whose `Maker` entry is missing (the lists are
    /// kept in sync by `add_tokens`/`remove_tokens`/`eject`, but a read-only
    /// discovery call must never panic for a client).
    pub fn get_urls_for_token(env: Env, token: Address) -> Vec<String> {
        let list: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Token(token))
            .unwrap_or_else(|| Vec::new(&env));

        let mut urls = Vec::new(&env);
        for addr in list.iter() {
            let cfg: Option<MakerConfig> = env.storage().persistent().get(&DataKey::Maker(addr));
            if let Some(cfg) = cfg {
                urls.push_back(cfg.url);
            }
        }
        urls
    }

    /// A registered maker declares protocol versions it speaks. Stake-free —
    /// the distinguishing property versus `add_tokens` (asserted in tests, not
    /// only in this comment). Reuses the token functions' preamble
    /// (`require_auth`, empty-input, `NotRegistered`) and D-05's strict
    /// duplicate semantics; D-05 itself names only the token functions, so
    /// applying identical hard-error semantics here (D-08) is a planner
    /// decision made for one validation code path and one mental model, not a
    /// user-locked requirement — cheap to soften later since no storage shape
    /// changes are involved.
    pub fn add_protocols(env: Env, maker: Address, protocols: Vec<u32>) -> Result<(), Error> {
        maker.require_auth();
        if protocols.is_empty() {
            return Err(Error::EmptyInput);
        }

        let key = DataKey::Maker(maker.clone());
        let mut cfg: MakerConfig = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotRegistered)?;

        if cfg.protocols.len() + protocols.len() > MAX_PROTOCOLS_PER_MAKER {
            return Err(Error::TooManyProtocols);
        }

        for protocol in protocols.iter() {
            if cfg.protocols.contains(&protocol) {
                return Err(Error::ProtocolAlreadyAdded);
            }
            cfg.protocols.push_back(protocol);
        }

        env.storage().persistent().set(&key, &cfg);
        bump_maker(&env, &key);
        ProtocolsAdded { maker, protocols }.publish(&env);
        Ok(())
    }

    /// A registered maker retracts protocol versions it no longer speaks.
    /// Stake-free; ordering-stable index-based removal, mirroring
    /// `remove_tokens`. D-08.
    pub fn remove_protocols(env: Env, maker: Address, protocols: Vec<u32>) -> Result<(), Error> {
        maker.require_auth();
        if protocols.is_empty() {
            return Err(Error::EmptyInput);
        }

        let key = DataKey::Maker(maker.clone());
        let mut cfg: MakerConfig = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotRegistered)?;

        for protocol in protocols.iter() {
            let idx = cfg
                .protocols
                .first_index_of(&protocol)
                .ok_or(Error::ProtocolNotFound)?;
            cfg.protocols.remove(idx);
        }

        env.storage().persistent().set(&key, &cfg);
        bump_maker(&env, &key);
        ProtocolsRemoved { maker, protocols }.publish(&env);
        Ok(())
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

    // --- admin (spam-price tuning only; no path to escrowed stake) ---------
    //
    // These are the ONLY two admin entry points this contract has. No
    // `withdraw`/`sweep`/`drain`/`upgrade`: the contract's SAC balance is
    // maker stake held in escrow, and any of those would be a standing route
    // for the admin to spend funds that are not the admin's (T-01-20, header
    // comment above).

    /// Retunes the spam price for FUTURE stake movements only. Existing
    /// registrations are unaffected: `MakerConfig.staked` records what was
    /// actually paid at the time it was paid, and every refund path
    /// (`remove_tokens`, `eject`) reads that field, never a recomputation
    /// from the current cost values (D-04, T-01-22).
    pub fn set_costs(env: Env, base_cost: i128, per_token_cost: i128) -> Result<(), Error> {
        require_admin(&env);
        if base_cost <= 0 || per_token_cost <= 0 {
            return Err(Error::InvalidCost);
        }
        let s = env.storage().instance();
        s.set(&DataKey::BaseCost, &base_cost);
        s.set(&DataKey::PerTokenCost, &per_token_cost);
        bump_instance(&env);
        CostsSet {
            base_cost,
            per_token_cost,
        }
        .publish(&env);
        Ok(())
    }

    /// Retunes how many makers may list the same token. D-04's no-eviction
    /// rule lives at the `add_tokens` check site, which re-reads this value
    /// fresh on every call (never a cached snapshot): lowering the cap below
    /// a populated `Token(t)` list's length blocks only NEW additions, and
    /// every already-registered maker on that list keeps working and keeps
    /// its refund rights (T-01-21).
    pub fn set_max_makers_per_token(env: Env, max_makers_per_token: u32) -> Result<(), Error> {
        require_admin(&env);
        if max_makers_per_token == 0 {
            return Err(Error::InvalidCap);
        }
        env.storage()
            .instance()
            .set(&DataKey::MaxMakersPerToken, &max_makers_per_token);
        bump_instance(&env);
        MaxMakersSet {
            max_makers_per_token,
        }
        .publish(&env);
        Ok(())
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

        // Delist from every token list the maker appears in BEFORE deleting
        // `Maker(maker)`, so no dangling address is left for
        // `get_urls_for_token` to resolve (it would defensively skip one, but
        // an abandoned `Token(t)` list should also stop paying rent when it's
        // the last entry removed).
        for token in cfg.tokens.iter() {
            let token_key = DataKey::Token(token);
            let list: Option<Vec<Address>> = env.storage().persistent().get(&token_key);
            if let Some(mut list) = list {
                if let Some(idx) = list.first_index_of(&maker) {
                    list.remove(idx);
                }
                if list.is_empty() {
                    env.storage().persistent().remove(&token_key);
                } else {
                    env.storage().persistent().set(&token_key, &list);
                    bump_maker(&env, &token_key);
                }
            }
        }

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

fn require_admin(env: &Env) {
    admin(env).require_auth();
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

/// `per_token_cost * count` with checked math: overflow surfaces as
/// `Error::MathOverflow` rather than a silent wrap, mirroring `rfq_swap`'s
/// `mul_bps` helper.
fn checked_mul_count(amount: i128, count: u32) -> Result<i128, Error> {
    amount.checked_mul(count as i128).ok_or(Error::MathOverflow)
}

#[cfg(test)]
mod test;
