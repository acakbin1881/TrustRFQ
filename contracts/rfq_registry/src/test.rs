#![cfg(test)]

// The crate is `#![no_std]`; the test harness links std, so opt it back into
// scope for `"a".repeat(...)` in the oversize-url test below.
extern crate std;

use crate::{
    CostsSet, Error, MakerEjected, MakerRegistered, MaxMakersSet, ProtocolsAdded,
    ProtocolsRemoved, RfqRegistry, RfqRegistryClient, TokensAdded, TokensRemoved, UrlUpdated,
};
use soroban_sdk::{
    testutils::{Address as _, Events as _, MockAuth, MockAuthInvoke},
    token, Address, Env, Event as _, IntoVal, String,
};

// --- coverage boundary (read before adding "missing" tests) ---------------
//
// Everything here runs with `mock_all_auths()` (or an explicit, narrower
// `MockAuth` tree for the one rejection test that needs it), which bypasses
// the host's real signature machinery entirely. That is enough to prove the
// argument-binding/auth-gating surface, the stake/refund arithmetic, and the
// D-06 zero-restake path — but it CANNOT prove that a persistent entry's TTL
// actually bumps against a real host, or that the on-chain SAC balance moves
// exactly against real network fees. Those are proven by
// `tools/rfq-registry-live.mjs` against a deployed Testnet instance.
//
// Per the project's fund-every-actor rule (CLAUDE.md Gotchas — `rfq_swap`
// shipped a false-green rejection test because an interloper had no
// balance): every actor that could plausibly cause a false pass via
// insufficient funds is funded in `setup()` up front.

const BASE_COST: i128 = 1_000_000_000;
const PER_TOKEN_COST: i128 = 100_000_000;
const MAX_MAKERS_PER_TOKEN: u32 = 100;

struct Setup<'a> {
    env: Env,
    client: RfqRegistryClient<'a>,
    contract_id: Address,
    admin: Address,
    stake_token: Address,
    st: token::Client<'a>,
    maker: Address,
}

fn make_token<'a>(
    env: &Env,
    admin: &Address,
) -> (Address, token::Client<'a>, token::StellarAssetClient<'a>) {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let addr = sac.address();
    (
        addr.clone(),
        token::Client::new(env, &addr),
        token::StellarAssetClient::new(env, &addr),
    )
}

fn url_str(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

/// A fully initialized registry with a maker funded for ten registrations'
/// worth of stake. All auths are mocked open here; the one test that needs a
/// narrower tree builds it explicitly.
fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let maker = Address::generate(&env);
    let (stake_token, st, st_admin) = make_token(&env, &admin);

    let contract_id = env.register(RfqRegistry, ());
    let client = RfqRegistryClient::new(&env, &contract_id);
    client.initialize(
        &admin,
        &stake_token,
        &BASE_COST,
        &PER_TOKEN_COST,
        &MAX_MAKERS_PER_TOKEN,
    );

    st_admin.mint(&maker, &(BASE_COST * 10));

    Setup {
        env,
        client,
        contract_id,
        admin,
        stake_token,
        st,
        maker,
    }
}

/// Like `setup`, but with a caller-chosen `max_makers_per_token`, so the
/// per-token cap can be exercised without registering 100 makers. The maker
/// is minted enough to cover `MAX_TOKENS_PER_MAKER` (32) token registrations
/// plus `base_cost`, so per-maker-cap boundary tests never fail on funds.
fn setup_with_cap<'a>(cap: u32) -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let maker = Address::generate(&env);
    let (stake_token, st, st_admin) = make_token(&env, &admin);

    let contract_id = env.register(RfqRegistry, ());
    let client = RfqRegistryClient::new(&env, &contract_id);
    client.initialize(&admin, &stake_token, &BASE_COST, &PER_TOKEN_COST, &cap);

    st_admin.mint(&maker, &(BASE_COST + PER_TOKEN_COST * 40));

    Setup {
        env,
        client,
        contract_id,
        admin,
        stake_token,
        st,
        maker,
    }
}

/// Registers `n` distinct, funded makers and adds `token` to each one's list,
/// in order. Used to fill a `Token(t)` list to an exact size cheaply. Every
/// actor is funded (fund-every-actor rule) so a rejection at the boundary is
/// never a false pass caused by an unfunded interloper.
fn fill_token_list<'a>(s: &Setup<'a>, token: &Address, n: u32) -> std::vec::Vec<Address> {
    let mut makers = std::vec::Vec::new();
    for i in 0..n {
        let m = register_new_maker(s, 1, &std::format!("https://fill{}.example/quote", i));
        s.client.add_tokens(&m, &soroban_sdk::vec![&s.env, token.clone()]);
        makers.push(m);
    }
    makers
}

// --- initialize / re-init guard --------------------------------------------

#[test]
fn initialize_stores_config_and_reads_back() {
    let s = setup();
    let cfg = s.client.get_config();
    assert_eq!(cfg.admin, s.admin);
    assert_eq!(cfg.stake_token, s.stake_token);
    assert_eq!(cfg.base_cost, BASE_COST);
    assert_eq!(cfg.per_token_cost, PER_TOKEN_COST);
    assert_eq!(cfg.max_makers_per_token, MAX_MAKERS_PER_TOKEN);
}

#[test]
fn initialize_rejects_reinit_and_leaves_config_unchanged() {
    let s = setup();
    let attacker_admin = Address::generate(&s.env);

    let r = s.client.try_initialize(
        &attacker_admin,
        &s.stake_token,
        &(BASE_COST * 2),
        &PER_TOKEN_COST,
        &MAX_MAKERS_PER_TOKEN,
    );
    assert_eq!(r, Err(Ok(Error::AlreadyInitialized)));

    // Every stored value is exactly what the FIRST call wrote.
    let cfg = s.client.get_config();
    assert_eq!(cfg.admin, s.admin);
    assert_eq!(cfg.base_cost, BASE_COST);
}

#[test]
fn initialize_rejects_non_positive_costs() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let stake_token = Address::generate(&env);
    let contract_id = env.register(RfqRegistry, ());
    let client = RfqRegistryClient::new(&env, &contract_id);

    assert_eq!(
        client.try_initialize(&admin, &stake_token, &0, &PER_TOKEN_COST, &MAX_MAKERS_PER_TOKEN),
        Err(Ok(Error::InvalidCost))
    );
    assert_eq!(
        client.try_initialize(&admin, &stake_token, &BASE_COST, &0, &MAX_MAKERS_PER_TOKEN),
        Err(Ok(Error::InvalidCost))
    );
    assert_eq!(
        client.try_initialize(&admin, &stake_token, &-1, &PER_TOKEN_COST, &MAX_MAKERS_PER_TOKEN),
        Err(Ok(Error::InvalidCost))
    );

    // Still uninitialized: a valid call now succeeds.
    client.initialize(&admin, &stake_token, &BASE_COST, &PER_TOKEN_COST, &MAX_MAKERS_PER_TOKEN);
    assert_eq!(client.get_config().base_cost, BASE_COST);
}

#[test]
fn initialize_rejects_zero_cap() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let stake_token = Address::generate(&env);
    let contract_id = env.register(RfqRegistry, ());
    let client = RfqRegistryClient::new(&env, &contract_id);

    assert_eq!(
        client.try_initialize(&admin, &stake_token, &BASE_COST, &PER_TOKEN_COST, &0),
        Err(Ok(Error::InvalidCap))
    );
}

// --- set_url / registration lifecycle --------------------------------------

#[test]
fn set_url_stakes_and_creates_config() {
    let s = setup();
    let url = url_str(&s.env, "https://maker.example/quote");

    assert_eq!(s.st.balance(&s.maker), BASE_COST * 10);
    assert_eq!(s.st.balance(&s.contract_id), 0);

    s.client.set_url(&s.maker, &url);

    assert_eq!(s.st.balance(&s.maker), BASE_COST * 9);
    assert_eq!(s.st.balance(&s.contract_id), BASE_COST);

    let cfg = s.client.get_maker(&s.maker);
    assert_eq!(cfg.url, url);
    assert_eq!(cfg.staked, BASE_COST);
    assert!(cfg.protocols.is_empty());
    assert!(cfg.tokens.is_empty());
}

#[test]
fn set_url_update_no_restake() {
    let s = setup();
    let url1 = url_str(&s.env, "https://maker.example/quote");
    s.client.set_url(&s.maker, &url1);

    let maker_after_first = s.st.balance(&s.maker);
    let contract_after_first = s.st.balance(&s.contract_id);

    let url2 = url_str(&s.env, "https://maker.example/quote-v2");
    s.client.set_url(&s.maker, &url2);

    // D-06: zero additional stake moved, `staked` unchanged.
    assert_eq!(s.st.balance(&s.maker), maker_after_first);
    assert_eq!(s.st.balance(&s.contract_id), contract_after_first);

    let cfg = s.client.get_maker(&s.maker);
    assert_eq!(cfg.url, url2);
    assert_eq!(cfg.staked, BASE_COST);
}

#[test]
fn set_url_rejects_invalid_url() {
    let s = setup();

    let empty = url_str(&s.env, "");
    assert_eq!(
        s.client.try_set_url(&s.maker, &empty),
        Err(Ok(Error::UrlInvalid))
    );

    let too_long = "a".repeat(257);
    let long_url = url_str(&s.env, too_long.as_str());
    assert_eq!(
        s.client.try_set_url(&s.maker, &long_url),
        Err(Ok(Error::UrlInvalid))
    );

    // Neither rejected call moved funds or created a registration.
    assert_eq!(s.st.balance(&s.contract_id), 0);
    assert!(s.client.try_get_maker(&s.maker).is_err());
}

#[test]
fn set_url_rejects_non_maker_auth() {
    let s = setup();
    let attacker = Address::generate(&s.env);
    let url = url_str(&s.env, "https://maker.example/quote");

    let invoke = MockAuthInvoke {
        contract: &s.contract_id,
        fn_name: "set_url",
        args: (s.maker.clone(), url.clone()).into_val(&s.env),
        sub_invokes: &[],
    };
    let auths = [MockAuth {
        address: &attacker,
        invoke: &invoke,
    }];

    // Only the attacker's authorization is present; `maker.require_auth()`
    // finds nothing that matches `s.maker` and the call must fail.
    let r = s.client.mock_auths(&auths).try_set_url(&s.maker, &url);
    assert!(r.is_err());
    assert_eq!(s.st.balance(&s.contract_id), 0);
    assert!(s.client.try_get_maker(&s.maker).is_err());
}

// --- get_maker --------------------------------------------------------------

#[test]
fn get_maker_errors_for_unregistered() {
    let s = setup();
    let stranger = Address::generate(&s.env);
    assert_eq!(
        s.client.try_get_maker(&stranger),
        Err(Ok(Error::NotRegistered))
    );
}

// --- eject -------------------------------------------------------------------

#[test]
fn eject_refunds_full_stake_and_removes_entry() {
    let s = setup();
    let url = url_str(&s.env, "https://maker.example/quote");
    s.client.set_url(&s.maker, &url);

    let maker_before_eject = s.st.balance(&s.maker);
    assert_eq!(s.st.balance(&s.contract_id), BASE_COST);

    s.client.eject(&s.maker);

    // The full stake comes back, never a slashed or rounded-down remainder.
    assert_eq!(s.st.balance(&s.maker), maker_before_eject + BASE_COST);
    assert_eq!(s.st.balance(&s.contract_id), 0);
    assert_eq!(
        s.client.try_get_maker(&s.maker),
        Err(Ok(Error::NotRegistered))
    );
}

#[test]
fn eject_rejects_unregistered() {
    let s = setup();
    assert_eq!(
        s.client.try_eject(&s.maker),
        Err(Ok(Error::NotRegistered))
    );
}

#[test]
fn reregister_after_eject_stakes_again() {
    let s = setup();
    let url = url_str(&s.env, "https://maker.example/quote");

    s.client.set_url(&s.maker, &url);
    s.client.eject(&s.maker);
    assert_eq!(s.st.balance(&s.contract_id), 0);

    // Fresh registration, no ban state: a second `set_url` stakes again.
    s.client.set_url(&s.maker, &url);
    assert_eq!(s.st.balance(&s.contract_id), BASE_COST);
    let cfg = s.client.get_maker(&s.maker);
    assert_eq!(cfg.staked, BASE_COST);
}

// --- add_tokens / remove_tokens / get_urls_for_token -----------------------

fn token_addr(env: &Env) -> Address {
    Address::generate(env)
}

/// Registers a fresh, funded maker (funded for `n` token registrations plus
/// one `base_cost`) and returns its address. Used to fill `Token(t)` lists
/// without hand-writing each actor's setup.
fn register_new_maker<'a>(s: &Setup<'a>, n_tokens: u32, url: &str) -> Address {
    let maker = Address::generate(&s.env);
    let st_admin = token::StellarAssetClient::new(&s.env, &s.stake_token);
    st_admin.mint(&maker, &(BASE_COST + PER_TOKEN_COST * (n_tokens as i128) + PER_TOKEN_COST));
    s.client.set_url(&maker, &url_str(&s.env, url));
    maker
}

#[test]
fn add_tokens_stakes_and_lists_maker() {
    let s = setup();
    s.client.set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    let t1 = token_addr(&s.env);
    let t2 = token_addr(&s.env);

    let maker_before = s.st.balance(&s.maker);
    let contract_before = s.st.balance(&s.contract_id);

    s.client.add_tokens(&s.maker, &soroban_sdk::vec![&s.env, t1.clone(), t2.clone()]);

    assert_eq!(s.st.balance(&s.maker), maker_before - PER_TOKEN_COST * 2);
    assert_eq!(s.st.balance(&s.contract_id), contract_before + PER_TOKEN_COST * 2);

    let cfg = s.client.get_maker(&s.maker);
    assert_eq!(cfg.tokens.len(), 2);
    assert_eq!(cfg.staked, BASE_COST + PER_TOKEN_COST * 2);

    let urls1 = s.client.get_urls_for_token(&t1);
    assert_eq!(urls1.len(), 1);
    assert_eq!(urls1.get(0).unwrap(), cfg.url);
    let urls2 = s.client.get_urls_for_token(&t2);
    assert_eq!(urls2.len(), 1);
}

#[test]
fn get_urls_for_token_empty_for_unregistered_token() {
    let s = setup();
    let stranger_token = token_addr(&s.env);
    let urls = s.client.get_urls_for_token(&stranger_token);
    assert_eq!(urls.len(), 0);
}

#[test]
fn add_tokens_rejects_duplicate_in_existing_list() {
    let s = setup();
    s.client.set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    let t1 = token_addr(&s.env);
    s.client.add_tokens(&s.maker, &soroban_sdk::vec![&s.env, t1.clone()]);

    let r = s.client.try_add_tokens(&s.maker, &soroban_sdk::vec![&s.env, t1.clone()]);
    assert_eq!(r, Err(Ok(Error::TokenAlreadyAdded)));

    // No funds moved and no extra entry created by the rejected call.
    let cfg = s.client.get_maker(&s.maker);
    assert_eq!(cfg.tokens.len(), 1);
}

#[test]
fn add_tokens_rejects_intra_call_duplicate() {
    let s = setup();
    s.client.set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    let t1 = token_addr(&s.env);

    let r = s
        .client
        .try_add_tokens(&s.maker, &soroban_sdk::vec![&s.env, t1.clone(), t1.clone()]);
    assert_eq!(r, Err(Ok(Error::TokenAlreadyAdded)));

    let cfg = s.client.get_maker(&s.maker);
    assert!(cfg.tokens.is_empty());
    assert_eq!(s.st.balance(&s.contract_id), BASE_COST);
}

#[test]
fn add_tokens_rejects_empty_input() {
    let s = setup();
    s.client.set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    let empty: soroban_sdk::Vec<Address> = soroban_sdk::vec![&s.env];
    assert_eq!(
        s.client.try_add_tokens(&s.maker, &empty),
        Err(Ok(Error::EmptyInput))
    );
}

#[test]
fn add_tokens_and_remove_tokens_reject_unregistered() {
    let s = setup();
    let stranger = Address::generate(&s.env);
    let t1 = token_addr(&s.env);
    assert_eq!(
        s.client
            .try_add_tokens(&stranger, &soroban_sdk::vec![&s.env, t1.clone()]),
        Err(Ok(Error::NotRegistered))
    );
    assert_eq!(
        s.client
            .try_remove_tokens(&stranger, &soroban_sdk::vec![&s.env, t1.clone()]),
        Err(Ok(Error::NotRegistered))
    );
}

#[test]
fn remove_tokens_refunds_and_delists() {
    let s = setup();
    s.client.set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    let t1 = token_addr(&s.env);
    s.client.add_tokens(&s.maker, &soroban_sdk::vec![&s.env, t1.clone()]);

    let maker_before = s.st.balance(&s.maker);
    let contract_before = s.st.balance(&s.contract_id);

    s.client.remove_tokens(&s.maker, &soroban_sdk::vec![&s.env, t1.clone()]);

    assert_eq!(s.st.balance(&s.maker), maker_before + PER_TOKEN_COST);
    assert_eq!(s.st.balance(&s.contract_id), contract_before - PER_TOKEN_COST);

    let cfg = s.client.get_maker(&s.maker);
    assert!(cfg.tokens.is_empty());
    assert_eq!(cfg.staked, BASE_COST);

    // The abandoned Token(t) list is gone entirely, not stored empty.
    let urls = s.client.get_urls_for_token(&t1);
    assert_eq!(urls.len(), 0);
}

#[test]
fn remove_tokens_rejects_token_not_in_list_and_refunds_nothing() {
    let s = setup();
    s.client.set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    let t1 = token_addr(&s.env);

    let contract_before = s.st.balance(&s.contract_id);
    let r = s
        .client
        .try_remove_tokens(&s.maker, &soroban_sdk::vec![&s.env, t1.clone()]);
    assert_eq!(r, Err(Ok(Error::TokenNotFound)));
    assert_eq!(s.st.balance(&s.contract_id), contract_before);
}

#[test]
fn remove_tokens_rejects_empty_input() {
    let s = setup();
    s.client.set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    let empty: soroban_sdk::Vec<Address> = soroban_sdk::vec![&s.env];
    assert_eq!(
        s.client.try_remove_tokens(&s.maker, &empty),
        Err(Ok(Error::EmptyInput))
    );
}

#[test]
fn eject_delists_from_every_token_and_refunds_full_stake() {
    let s = setup();
    s.client.set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    let t1 = token_addr(&s.env);
    let t2 = token_addr(&s.env);
    s.client
        .add_tokens(&s.maker, &soroban_sdk::vec![&s.env, t1.clone(), t2.clone()]);

    let maker_before = s.st.balance(&s.maker);
    let expected_refund = BASE_COST + PER_TOKEN_COST * 2;

    s.client.eject(&s.maker);

    assert_eq!(s.st.balance(&s.maker), maker_before + expected_refund);
    assert_eq!(s.st.balance(&s.contract_id), 0);
    assert_eq!(
        s.client.try_get_maker(&s.maker),
        Err(Ok(Error::NotRegistered))
    );
    assert_eq!(s.client.get_urls_for_token(&t1).len(), 0);
    assert_eq!(s.client.get_urls_for_token(&t2).len(), 0);
}

#[test]
fn remove_from_middle_preserves_order() {
    let s = setup();
    let t = token_addr(&s.env);

    let m1 = register_new_maker(&s, 1, "https://m1.example/quote");
    s.client.add_tokens(&m1, &soroban_sdk::vec![&s.env, t.clone()]);
    let m2 = register_new_maker(&s, 1, "https://m2.example/quote");
    s.client.add_tokens(&m2, &soroban_sdk::vec![&s.env, t.clone()]);
    let m3 = register_new_maker(&s, 1, "https://m3.example/quote");
    s.client.add_tokens(&m3, &soroban_sdk::vec![&s.env, t.clone()]);

    let before = s.client.get_urls_for_token(&t);
    assert_eq!(before.len(), 3);

    s.client.remove_tokens(&m2, &soroban_sdk::vec![&s.env, t.clone()]);

    let after = s.client.get_urls_for_token(&t);
    assert_eq!(after.len(), 2);
    assert_eq!(after.get(0).unwrap(), s.client.get_maker(&m1).url);
    assert_eq!(after.get(1).unwrap(), s.client.get_maker(&m3).url);
}

#[test]
fn failing_multi_token_add_tokens_leaves_state_untouched() {
    let s = setup();
    s.client.set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    let t1 = token_addr(&s.env);
    // Already-added token makes the SECOND element of the next call fail.
    s.client.add_tokens(&s.maker, &soroban_sdk::vec![&s.env, t1.clone()]);

    let t_new = token_addr(&s.env);
    let cfg_before = s.client.get_maker(&s.maker);
    let contract_before = s.st.balance(&s.contract_id);
    let maker_before = s.st.balance(&s.maker);

    // t_new is fine, t1 is already added -> the whole call must roll back.
    let r = s
        .client
        .try_add_tokens(&s.maker, &soroban_sdk::vec![&s.env, t_new.clone(), t1.clone()]);
    assert_eq!(r, Err(Ok(Error::TokenAlreadyAdded)));

    let cfg_after = s.client.get_maker(&s.maker);
    assert_eq!(cfg_after.tokens.len(), cfg_before.tokens.len());
    assert_eq!(s.st.balance(&s.contract_id), contract_before);
    assert_eq!(s.st.balance(&s.maker), maker_before);
    // t_new was never actually listed, even though it was valid on its own.
    assert_eq!(s.client.get_urls_for_token(&t_new).len(), 0);
}

// --- add_protocols / remove_protocols --------------------------------------
//
// Stake-free mirror of the token functions (D-08). Note (RESEARCH.md Open
// Question 2): D-05 itself only names the token functions; applying the same
// strict duplicate semantics here is a planner decision, recorded in the doc
// comment above `add_protocols` in lib.rs, not a user-locked requirement.

#[test]
fn add_protocols_and_remove_protocols_move_no_stake() {
    let s = setup();
    s.client.set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));

    let maker_before = s.st.balance(&s.maker);
    let contract_before = s.st.balance(&s.contract_id);
    let staked_before = s.client.get_maker(&s.maker).staked;

    s.client.add_protocols(&s.maker, &soroban_sdk::vec![&s.env, 1u32, 2u32]);
    let cfg = s.client.get_maker(&s.maker);
    assert_eq!(cfg.protocols.len(), 2);
    assert_eq!(cfg.staked, staked_before);
    assert_eq!(s.st.balance(&s.maker), maker_before);
    assert_eq!(s.st.balance(&s.contract_id), contract_before);

    s.client.remove_protocols(&s.maker, &soroban_sdk::vec![&s.env, 1u32]);
    let cfg = s.client.get_maker(&s.maker);
    assert_eq!(cfg.protocols.len(), 1);
    assert_eq!(cfg.protocols.get(0).unwrap(), 2u32);
    // Byte-identical staked/balances across a matched add+remove pair.
    assert_eq!(cfg.staked, staked_before);
    assert_eq!(s.st.balance(&s.maker), maker_before);
    assert_eq!(s.st.balance(&s.contract_id), contract_before);
}

#[test]
fn add_protocols_rejects_duplicate_and_intra_call_duplicate() {
    let s = setup();
    s.client.set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    s.client.add_protocols(&s.maker, &soroban_sdk::vec![&s.env, 1u32]);

    let r = s
        .client
        .try_add_protocols(&s.maker, &soroban_sdk::vec![&s.env, 1u32]);
    assert_eq!(r, Err(Ok(Error::ProtocolAlreadyAdded)));

    let r2 = s
        .client
        .try_add_protocols(&s.maker, &soroban_sdk::vec![&s.env, 2u32, 2u32]);
    assert_eq!(r2, Err(Ok(Error::ProtocolAlreadyAdded)));

    let cfg = s.client.get_maker(&s.maker);
    assert_eq!(cfg.protocols.len(), 1);
}

#[test]
fn remove_protocols_rejects_not_present() {
    let s = setup();
    s.client.set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    let r = s
        .client
        .try_remove_protocols(&s.maker, &soroban_sdk::vec![&s.env, 9u32]);
    assert_eq!(r, Err(Ok(Error::ProtocolNotFound)));
}

#[test]
fn protocols_reject_empty_input_and_unregistered() {
    let s = setup();
    s.client.set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    let empty: soroban_sdk::Vec<u32> = soroban_sdk::vec![&s.env];
    assert_eq!(
        s.client.try_add_protocols(&s.maker, &empty),
        Err(Ok(Error::EmptyInput))
    );
    assert_eq!(
        s.client.try_remove_protocols(&s.maker, &empty),
        Err(Ok(Error::EmptyInput))
    );

    let stranger = Address::generate(&s.env);
    assert_eq!(
        s.client
            .try_add_protocols(&stranger, &soroban_sdk::vec![&s.env, 1u32]),
        Err(Ok(Error::NotRegistered))
    );
    assert_eq!(
        s.client
            .try_remove_protocols(&stranger, &soroban_sdk::vec![&s.env, 1u32]),
        Err(Ok(Error::NotRegistered))
    );
}

#[test]
fn add_protocols_caps_at_eight_per_maker() {
    let s = setup();
    s.client.set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    let seven: soroban_sdk::Vec<u32> =
        soroban_sdk::vec![&s.env, 1, 2, 3, 4, 5, 6, 7];
    s.client.add_protocols(&s.maker, &seven);
    assert_eq!(s.client.get_maker(&s.maker).protocols.len(), 7);

    // 7 -> 8 succeeds.
    s.client.add_protocols(&s.maker, &soroban_sdk::vec![&s.env, 8u32]);
    assert_eq!(s.client.get_maker(&s.maker).protocols.len(), 8);

    // 8 -> 9th rejected.
    let r = s
        .client
        .try_add_protocols(&s.maker, &soroban_sdk::vec![&s.env, 9u32]);
    assert_eq!(r, Err(Ok(Error::TooManyProtocols)));
    assert_eq!(s.client.get_maker(&s.maker).protocols.len(), 8);
}

#[test]
fn remove_protocols_preserves_order_of_survivors() {
    let s = setup();
    s.client.set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    s.client
        .add_protocols(&s.maker, &soroban_sdk::vec![&s.env, 1u32, 2u32, 3u32]);

    s.client.remove_protocols(&s.maker, &soroban_sdk::vec![&s.env, 2u32]);

    let cfg = s.client.get_maker(&s.maker);
    assert_eq!(cfg.protocols.len(), 2);
    assert_eq!(cfg.protocols.get(0).unwrap(), 1u32);
    assert_eq!(cfg.protocols.get(1).unwrap(), 3u32);
}

#[test]
fn get_urls_for_token_resolves_twenty_makers_in_insertion_order() {
    let s = setup();
    let t = token_addr(&s.env);
    let mut makers = std::vec::Vec::new();
    for i in 0..20 {
        let m = register_new_maker(&s, 1, &std::format!("https://m{}.example/quote", i));
        s.client.add_tokens(&m, &soroban_sdk::vec![&s.env, t.clone()]);
        makers.push(m);
    }

    let urls = s.client.get_urls_for_token(&t);
    assert_eq!(urls.len(), 20);
    for (i, m) in makers.iter().enumerate() {
        assert_eq!(urls.get(i as u32).unwrap(), s.client.get_maker(m).url);
    }
}

// --- both caps at their exact boundary, and proven independent ------------
//
// The two bounds are separate checks in separate places inside `add_tokens`
// (RESEARCH.md Pitfall 2): `MAX_TOKENS_PER_MAKER` is a fixed code constant
// compared against the CALLING maker's own `cfg.tokens.len() + tokens.len()`;
// `max_makers_per_token` is a live, admin-tunable instance-storage value
// compared against each individual `Token(t)` list's `len()`. A suite that
// only exercises one and calls "bounded-list rejection" covered would leave
// the other free to be deleted without a red test — see the mutation results
// recorded in the plan SUMMARY for proof both checks have teeth.

#[test]
fn per_token_cap_rejects_at_exact_boundary() {
    let s = setup_with_cap(3);
    let t = token_addr(&s.env);
    fill_token_list(&s, &t, 3);

    let fourth = register_new_maker(&s, 1, "https://fourth.example/quote");
    let fourth_balance_before = s.st.balance(&fourth);

    let r = s
        .client
        .try_add_tokens(&fourth, &soroban_sdk::vec![&s.env, t.clone()]);
    assert_eq!(r, Err(Ok(Error::TokenListFull)));
    // The failed call debited nothing.
    assert_eq!(s.st.balance(&fourth), fourth_balance_before);
    assert_eq!(s.client.get_urls_for_token(&t).len(), 3);
}

#[test]
fn per_token_cap_accepts_exactly_one_more_at_cap_minus_one() {
    let s = setup_with_cap(3);
    let t = token_addr(&s.env);
    fill_token_list(&s, &t, 2);

    let third = register_new_maker(&s, 1, "https://third.example/quote");
    s.client.add_tokens(&third, &soroban_sdk::vec![&s.env, t.clone()]);
    assert_eq!(s.client.get_urls_for_token(&t).len(), 3);
}

#[test]
fn per_maker_cap_rejects_the_33rd_token_and_accepts_the_32nd() {
    let s = setup();
    s.client.set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));

    let mut tokens = std::vec::Vec::new();
    for _ in 0..31 {
        tokens.push(token_addr(&s.env));
    }
    for t in tokens.iter() {
        s.client.add_tokens(&s.maker, &soroban_sdk::vec![&s.env, t.clone()]);
    }
    assert_eq!(s.client.get_maker(&s.maker).tokens.len(), 31);

    // 31 -> 32nd succeeds.
    let t32 = token_addr(&s.env);
    s.client.add_tokens(&s.maker, &soroban_sdk::vec![&s.env, t32.clone()]);
    assert_eq!(s.client.get_maker(&s.maker).tokens.len(), 32);

    // 32 -> 33rd rejected.
    let t33 = token_addr(&s.env);
    let r = s
        .client
        .try_add_tokens(&s.maker, &soroban_sdk::vec![&s.env, t33.clone()]);
    assert_eq!(r, Err(Ok(Error::TooManyTokens)));
    assert_eq!(s.client.get_maker(&s.maker).tokens.len(), 32);
}

#[test]
fn per_maker_cap_rejects_a_batch_that_would_cross_the_boundary() {
    let s = setup();
    s.client.set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));

    for _ in 0..30 {
        let t = token_addr(&s.env);
        s.client.add_tokens(&s.maker, &soroban_sdk::vec![&s.env, t]);
    }
    assert_eq!(s.client.get_maker(&s.maker).tokens.len(), 30);

    // A single call of 3 new tokens would take 30 -> 33: rejected in full,
    // the up-front check counts the whole batch, not one element at a time.
    let batch = soroban_sdk::vec![
        &s.env,
        token_addr(&s.env),
        token_addr(&s.env),
        token_addr(&s.env),
    ];
    let r = s.client.try_add_tokens(&s.maker, &batch);
    assert_eq!(r, Err(Ok(Error::TooManyTokens)));
    assert_eq!(s.client.get_maker(&s.maker).tokens.len(), 30);
}

#[test]
fn caps_are_independent_full_token_list_vs_full_maker_list() {
    // A maker well under its own 32-token cap is still rejected by a full
    // Token(t) list.
    let s = setup_with_cap(1);
    let t = token_addr(&s.env);
    fill_token_list(&s, &t, 1);

    let one_token_maker = register_new_maker(&s, 1, "https://onetoken.example/quote");
    let r = s
        .client
        .try_add_tokens(&one_token_maker, &soroban_sdk::vec![&s.env, t.clone()]);
    assert_eq!(r, Err(Ok(Error::TokenListFull)));
}

#[test]
fn caps_are_independent_maker_at_own_cap_rejected_even_with_empty_token_lists() {
    // A maker at its own 32-token cap is rejected even when every target
    // Token(t) list is completely empty (a generous, unfilled cap).
    let s = setup_with_cap(100);
    s.client.set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    for _ in 0..32 {
        let t = token_addr(&s.env);
        s.client.add_tokens(&s.maker, &soroban_sdk::vec![&s.env, t]);
    }
    assert_eq!(s.client.get_maker(&s.maker).tokens.len(), 32);

    let brand_new_token = token_addr(&s.env);
    assert_eq!(s.client.get_urls_for_token(&brand_new_token).len(), 0);
    let r = s
        .client
        .try_add_tokens(&s.maker, &soroban_sdk::vec![&s.env, brand_new_token]);
    assert_eq!(r, Err(Ok(Error::TooManyTokens)));
}

#[test]
fn lowering_cap_does_not_evict_existing_makers_but_blocks_new_additions() {
    // D-04: lowering `max_makers_per_token` never evicts; it only blocks NEW
    // additions once a token's list is at/above the (now-lower) cap. This is
    // the `initialize`-time-cap half of the shape; the live-cap half (lower
    // the cap on an already-populated list via `set_max_makers_per_token`) is
    // proven by `lowering_live_cap_does_not_evict_but_blocks_new_additions`
    // below.
    let s = setup_with_cap(3);
    let t = token_addr(&s.env);
    fill_token_list(&s, &t, 3);
    assert_eq!(s.client.get_urls_for_token(&t).len(), 3);

    let fourth = register_new_maker(&s, 1, "https://fourth.example/quote");
    let r = s
        .client
        .try_add_tokens(&fourth, &soroban_sdk::vec![&s.env, t.clone()]);
    assert_eq!(r, Err(Ok(Error::TokenListFull)));
    // The three existing entrants are untouched by the rejected 4th call.
    assert_eq!(s.client.get_urls_for_token(&t).len(), 3);
}

#[test]
fn maker_at_or_above_lowered_cap_can_still_remove_and_eject() {
    // Even a maker whose token registrations happened under a cap that has
    // since been exceeded (conceptually — this plan cannot lower the cap on
    // a live instance yet, see the TODO above) must still be able to
    // `remove_tokens`/`eject` normally: those paths never check
    // `max_makers_per_token` at all.
    let s = setup_with_cap(3);
    let t = token_addr(&s.env);
    let makers = fill_token_list(&s, &t, 3);
    let m1 = makers.first().unwrap();

    s.client.remove_tokens(m1, &soroban_sdk::vec![&s.env, t.clone()]);
    assert_eq!(s.client.get_urls_for_token(&t).len(), 2);

    let m2 = makers.get(1).unwrap();
    s.client.eject(m2);
    assert_eq!(s.client.get_urls_for_token(&t).len(), 1);
}

// --- set_costs / set_max_makers_per_token (admin spam-price tuning) -------

#[test]
fn set_costs_updates_config_and_emits_event() {
    let s = setup();
    s.client.set_costs(&2_000_000_000, &200_000_000);

    // `env.events().all()` only returns events from the LAST contract
    // invocation, so capture it before any further call (e.g. get_config)
    // resets the window.
    let expected = CostsSet {
        base_cost: 2_000_000_000,
        per_token_cost: 200_000_000,
    }
    .to_xdr(&s.env, &s.contract_id);
    let events = s.env.events().all();
    assert_eq!(events.events().last().unwrap(), &expected);

    let cfg = s.client.get_config();
    assert_eq!(cfg.base_cost, 2_000_000_000);
    assert_eq!(cfg.per_token_cost, 200_000_000);
}

#[test]
fn set_max_makers_per_token_updates_config_and_emits_event() {
    let s = setup();
    s.client.set_max_makers_per_token(&5);

    // See the comment in set_costs_updates_config_and_emits_event: capture
    // events before any further contract call resets the window.
    let expected = MaxMakersSet {
        max_makers_per_token: 5,
    }
    .to_xdr(&s.env, &s.contract_id);
    let events = s.env.events().all();
    assert_eq!(events.events().last().unwrap(), &expected);

    assert_eq!(s.client.get_config().max_makers_per_token, 5);
}

#[test]
fn set_costs_rejects_non_positive_values_and_changes_nothing() {
    let s = setup();
    let before = s.client.get_config();

    assert_eq!(
        s.client.try_set_costs(&0, &PER_TOKEN_COST),
        Err(Ok(Error::InvalidCost))
    );
    assert_eq!(
        s.client.try_set_costs(&BASE_COST, &-1),
        Err(Ok(Error::InvalidCost))
    );

    let after = s.client.get_config();
    assert_eq!(after.base_cost, before.base_cost);
    assert_eq!(after.per_token_cost, before.per_token_cost);
}

#[test]
fn set_max_makers_per_token_rejects_zero_and_changes_nothing() {
    let s = setup();
    assert_eq!(
        s.client.try_set_max_makers_per_token(&0),
        Err(Ok(Error::InvalidCap))
    );
    assert_eq!(s.client.get_config().max_makers_per_token, MAX_MAKERS_PER_TOKEN);
}

#[test]
fn admin_functions_reject_non_admin() {
    // Table-driven, mirroring rfq_swap's admin_functions_reject_non_admin
    // shape (contracts/rfq_swap/src/test.rs). The attacker needs no funding
    // here: neither setter moves any token, so an unfunded caller cannot
    // explain a pass -- the rejection can only come from `require_admin`.
    let s = setup();
    let attacker = Address::generate(&s.env);

    let calls: [(&str, soroban_sdk::Vec<soroban_sdk::Val>); 2] = [
        (
            "set_costs",
            (2_000_000_000i128, 200_000_000i128).into_val(&s.env),
        ),
        ("set_max_makers_per_token", (5u32,).into_val(&s.env)),
    ];

    for (fn_name, args) in calls.iter() {
        let invoke = MockAuthInvoke {
            contract: &s.contract_id,
            fn_name,
            args: args.clone(),
            sub_invokes: &[],
        };
        let auths = [MockAuth {
            address: &attacker,
            invoke: &invoke,
        }];
        // Only the attacker's authorization is present, so the contract's
        // `admin.require_auth()` (inside `require_admin`) finds nothing that
        // matches the real admin.
        let r: Result<(), ()> = match *fn_name {
            "set_costs" => s
                .client
                .mock_auths(&auths)
                .try_set_costs(&2_000_000_000, &200_000_000)
                .map(|_| ())
                .map_err(|_| ()),
            _ => s
                .client
                .mock_auths(&auths)
                .try_set_max_makers_per_token(&5)
                .map(|_| ())
                .map_err(|_| ()),
        };
        assert!(r.is_err(), "{} must reject a non-admin caller", fn_name);
    }

    let cfg = s.client.get_config();
    assert_eq!(cfg.base_cost, BASE_COST);
    assert_eq!(cfg.per_token_cost, PER_TOKEN_COST);
    assert_eq!(cfg.max_makers_per_token, MAX_MAKERS_PER_TOKEN);
}

#[test]
fn raising_base_cost_does_not_change_an_existing_makers_refund() {
    // T-01-22: a cost retune must never change what an already-registered
    // maker is refunded. `eject`/`remove_tokens` read `MakerConfig.staked`,
    // never a recomputation from the current cost, so the ORIGINAL amount
    // paid comes back even after the admin doubles the price.
    let s = setup();
    s.client.set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    let maker_before_retune = s.st.balance(&s.maker);

    s.client.set_costs(&(BASE_COST * 2), &PER_TOKEN_COST);
    assert_eq!(s.client.get_config().base_cost, BASE_COST * 2);

    s.client.eject(&s.maker);

    // Refunded exactly the ORIGINAL base_cost, not the new, higher one.
    assert_eq!(s.st.balance(&s.maker), maker_before_retune + BASE_COST);
}

#[test]
fn lowering_live_cap_does_not_evict_but_blocks_new_additions() {
    // D-04's no-eviction rule, proven against a cap lowered on a LIVE
    // instance (not just the cap passed to `initialize`): three makers
    // register under a cap of 3, the admin lowers the cap to 2, and all
    // three survive with full discovery + refund rights; only a fourth
    // maker's growth is blocked.
    let s = setup_with_cap(3);
    let t = token_addr(&s.env);
    let makers = fill_token_list(&s, &t, 3);
    assert_eq!(s.client.get_urls_for_token(&t).len(), 3);

    s.client.set_max_makers_per_token(&2);
    assert_eq!(s.client.get_config().max_makers_per_token, 2);

    // All three still resolve, in the same order.
    let urls = s.client.get_urls_for_token(&t);
    assert_eq!(urls.len(), 3);

    // A fourth maker's growth is now rejected, funds untouched.
    let fourth = register_new_maker(&s, 1, "https://fourth.example/quote");
    let fourth_balance_before = s.st.balance(&fourth);
    let r = s
        .client
        .try_add_tokens(&fourth, &soroban_sdk::vec![&s.env, t.clone()]);
    assert_eq!(r, Err(Ok(Error::TokenListFull)));
    assert_eq!(s.st.balance(&fourth), fourth_balance_before);
    assert_eq!(s.client.get_urls_for_token(&t).len(), 3);

    // Every one of the three original entrants still works normally:
    // remove_tokens and eject both succeed with correct refunds.
    let m0 = makers.first().unwrap();
    let m0_before = s.st.balance(m0);
    s.client.remove_tokens(m0, &soroban_sdk::vec![&s.env, t.clone()]);
    assert_eq!(s.st.balance(m0), m0_before + PER_TOKEN_COST);
    assert_eq!(s.client.get_urls_for_token(&t).len(), 2);

    let m1 = makers.get(1).unwrap();
    let m1_before = s.st.balance(&m1);
    let m1_staked = s.client.get_maker(&m1).staked;
    s.client.eject(&m1);
    assert_eq!(s.st.balance(&m1), m1_before + m1_staked);
    assert_eq!(s.client.get_urls_for_token(&t).len(), 1);

    let m2 = makers.get(2).unwrap();
    let m2_before = s.st.balance(&m2);
    s.client.remove_tokens(&m2, &soroban_sdk::vec![&s.env, t.clone()]);
    assert_eq!(s.st.balance(&m2), m2_before + PER_TOKEN_COST);
    assert_eq!(s.client.get_urls_for_token(&t).len(), 0);
}

// --- REG-03 security surface: auth rejection tables, events, no-auth reads

#[test]
fn maker_facing_mutations_reject_non_maker_auth() {
    // Table-driven, mirroring rfq_swap's admin_functions_reject_non_admin
    // shape. The attacker is funded generously (CLAUDE.md's fund-every-actor
    // rule): a rejection here must come from `maker.require_auth()` finding
    // no matching signer, never from an empty balance.
    let s = setup();
    let attacker = Address::generate(&s.env);
    let st_admin = token::StellarAssetClient::new(&s.env, &s.stake_token);
    st_admin.mint(&attacker, &(BASE_COST * 10));
    assert!(s.st.balance(&attacker) >= s.st.balance(&s.maker));

    // Register real state behind every call: an unregistered maker would
    // fail every one of these with NotRegistered regardless of who signs,
    // which would prove nothing about the auth check.
    s.client.set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    let t = token_addr(&s.env);
    s.client.add_tokens(&s.maker, &soroban_sdk::vec![&s.env, t.clone()]);
    s.client.add_protocols(&s.maker, &soroban_sdk::vec![&s.env, 1u32]);

    let url2 = url_str(&s.env, "https://maker.example/quote-v2");
    let tokens_vec = soroban_sdk::vec![&s.env, t.clone()];
    let protocols_vec = soroban_sdk::vec![&s.env, 1u32];

    let calls: [(&str, soroban_sdk::Vec<soroban_sdk::Val>); 6] = [
        ("set_url", (s.maker.clone(), url2.clone()).into_val(&s.env)),
        (
            "add_tokens",
            (s.maker.clone(), tokens_vec.clone()).into_val(&s.env),
        ),
        (
            "remove_tokens",
            (s.maker.clone(), tokens_vec.clone()).into_val(&s.env),
        ),
        (
            "add_protocols",
            (s.maker.clone(), protocols_vec.clone()).into_val(&s.env),
        ),
        (
            "remove_protocols",
            (s.maker.clone(), protocols_vec.clone()).into_val(&s.env),
        ),
        ("eject", (s.maker.clone(),).into_val(&s.env)),
    ];

    for (fn_name, args) in calls.iter() {
        let invoke = MockAuthInvoke {
            contract: &s.contract_id,
            fn_name,
            args: args.clone(),
            sub_invokes: &[],
        };
        let auths = [MockAuth {
            address: &attacker,
            invoke: &invoke,
        }];
        // Only the attacker's authorization is present; `maker.require_auth()`
        // finds nothing that matches `s.maker` and the call must fail.
        let r: Result<(), ()> = match *fn_name {
            "set_url" => s
                .client
                .mock_auths(&auths)
                .try_set_url(&s.maker, &url2)
                .map(|_| ())
                .map_err(|_| ()),
            "add_tokens" => s
                .client
                .mock_auths(&auths)
                .try_add_tokens(&s.maker, &tokens_vec)
                .map(|_| ())
                .map_err(|_| ()),
            "remove_tokens" => s
                .client
                .mock_auths(&auths)
                .try_remove_tokens(&s.maker, &tokens_vec)
                .map(|_| ())
                .map_err(|_| ()),
            "add_protocols" => s
                .client
                .mock_auths(&auths)
                .try_add_protocols(&s.maker, &protocols_vec)
                .map(|_| ())
                .map_err(|_| ()),
            "remove_protocols" => s
                .client
                .mock_auths(&auths)
                .try_remove_protocols(&s.maker, &protocols_vec)
                .map(|_| ())
                .map_err(|_| ()),
            _ => s
                .client
                .mock_auths(&auths)
                .try_eject(&s.maker)
                .map(|_| ())
                .map_err(|_| ()),
        };
        assert!(r.is_err(), "{} must reject a non-maker auth", fn_name);
    }

    // Every one of the six rejected calls left the victim's state untouched.
    let cfg = s.client.get_maker(&s.maker);
    assert_eq!(cfg.url, url_str(&s.env, "https://maker.example/quote"));
    assert_eq!(cfg.tokens.len(), 1);
    assert_eq!(cfg.protocols.len(), 1);
}

#[test]
fn read_only_calls_succeed_with_no_auth_mocked_and_emit_no_events() {
    // "Succeeds with no auth mocked" is taken literally: this Env never
    // calls `mock_all_auths()`. Every call that DOES need auth (mint,
    // set_url) is scoped to exactly that one invocation via `mock_auths`, so
    // the three read-only calls at the end run with zero auths present. If
    // any of them secretly called `require_auth`, they would fail here.
    let env = Env::default();
    let admin = Address::generate(&env);
    let maker = Address::generate(&env);
    let (stake_token, _st, st_admin) = make_token(&env, &admin);

    let contract_id = env.register(RfqRegistry, ());
    let client = RfqRegistryClient::new(&env, &contract_id);

    // `initialize` calls no `require_auth` at all -- whoever calls it first
    // becomes admin -- so it needs no mocked auth whatsoever.
    client.initialize(
        &admin,
        &stake_token,
        &BASE_COST,
        &PER_TOKEN_COST,
        &MAX_MAKERS_PER_TOKEN,
    );

    let mint_amount = BASE_COST + PER_TOKEN_COST;
    let mint_invoke = MockAuthInvoke {
        contract: &stake_token,
        fn_name: "mint",
        args: (maker.clone(), mint_amount).into_val(&env),
        sub_invokes: &[],
    };
    st_admin
        .mock_auths(&[MockAuth {
            address: &admin,
            invoke: &mint_invoke,
        }])
        .mint(&maker, &mint_amount);

    let url = url_str(&env, "https://maker.example/quote");
    let transfer_sub = [MockAuthInvoke {
        contract: &stake_token,
        fn_name: "transfer",
        args: (maker.clone(), contract_id.clone(), BASE_COST).into_val(&env),
        sub_invokes: &[],
    }];
    let set_url_invoke = MockAuthInvoke {
        contract: &contract_id,
        fn_name: "set_url",
        args: (maker.clone(), url.clone()).into_val(&env),
        sub_invokes: &transfer_sub,
    };
    client
        .mock_auths(&[MockAuth {
            address: &maker,
            invoke: &set_url_invoke,
        }])
        .set_url(&maker, &url);

    // The three read-only calls: no `mock_auths` call at all on this Env.
    let cfg = client.get_config();
    assert_eq!(cfg.admin, admin);

    let m = client.get_maker(&maker);
    assert_eq!(m.url, url);

    let urls = client.get_urls_for_token(&Address::generate(&env));
    assert_eq!(urls.len(), 0);

    // None of the three reads produced a contract event of their own. (The
    // window only covers the LAST invocation -- get_urls_for_token -- but
    // that is exactly the point: even the last of the three emits nothing.)
    let events = env.events().all();
    assert_eq!(events.events().len(), 0);
}

// --- event-per-state-transition (one test per emitted event type) --------

#[test]
fn set_url_first_call_emits_maker_registered() {
    let s = setup();
    let url = url_str(&s.env, "https://maker.example/quote");
    s.client.set_url(&s.maker, &url);

    let expected = MakerRegistered {
        maker: s.maker.clone(),
        url: url.clone(),
        staked: BASE_COST,
    }
    .to_xdr(&s.env, &s.contract_id);
    let events = s.env.events().all();
    assert_eq!(events.events().last().unwrap(), &expected);
}

#[test]
fn set_url_second_call_emits_url_updated() {
    let s = setup();
    s.client
        .set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));

    let url2 = url_str(&s.env, "https://maker.example/quote-v2");
    s.client.set_url(&s.maker, &url2);

    let expected = UrlUpdated {
        maker: s.maker.clone(),
        url: url2,
    }
    .to_xdr(&s.env, &s.contract_id);
    let events = s.env.events().all();
    assert_eq!(events.events().last().unwrap(), &expected);
}

#[test]
fn add_tokens_emits_tokens_added() {
    let s = setup();
    s.client
        .set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    let t = token_addr(&s.env);
    let tokens = soroban_sdk::vec![&s.env, t.clone()];
    s.client.add_tokens(&s.maker, &tokens);

    let expected = TokensAdded {
        maker: s.maker.clone(),
        tokens: tokens.clone(),
        cost: PER_TOKEN_COST,
    }
    .to_xdr(&s.env, &s.contract_id);
    let events = s.env.events().all();
    assert_eq!(events.events().last().unwrap(), &expected);
}

#[test]
fn remove_tokens_emits_tokens_removed() {
    let s = setup();
    s.client
        .set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    let t = token_addr(&s.env);
    let tokens = soroban_sdk::vec![&s.env, t.clone()];
    s.client.add_tokens(&s.maker, &tokens);

    s.client.remove_tokens(&s.maker, &tokens);

    let expected = TokensRemoved {
        maker: s.maker.clone(),
        tokens: tokens.clone(),
        refund: PER_TOKEN_COST,
    }
    .to_xdr(&s.env, &s.contract_id);
    let events = s.env.events().all();
    assert_eq!(events.events().last().unwrap(), &expected);
}

#[test]
fn add_protocols_emits_protocols_added() {
    let s = setup();
    s.client
        .set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    let protocols = soroban_sdk::vec![&s.env, 1u32];
    s.client.add_protocols(&s.maker, &protocols);

    let expected = ProtocolsAdded {
        maker: s.maker.clone(),
        protocols: protocols.clone(),
    }
    .to_xdr(&s.env, &s.contract_id);
    let events = s.env.events().all();
    assert_eq!(events.events().last().unwrap(), &expected);
}

#[test]
fn remove_protocols_emits_protocols_removed() {
    let s = setup();
    s.client
        .set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    let protocols = soroban_sdk::vec![&s.env, 1u32];
    s.client.add_protocols(&s.maker, &protocols);

    s.client.remove_protocols(&s.maker, &protocols);

    let expected = ProtocolsRemoved {
        maker: s.maker.clone(),
        protocols: protocols.clone(),
    }
    .to_xdr(&s.env, &s.contract_id);
    let events = s.env.events().all();
    assert_eq!(events.events().last().unwrap(), &expected);
}

#[test]
fn eject_emits_maker_ejected() {
    let s = setup();
    s.client
        .set_url(&s.maker, &url_str(&s.env, "https://maker.example/quote"));
    s.client.eject(&s.maker);

    let expected = MakerEjected {
        maker: s.maker.clone(),
        refunded: BASE_COST,
    }
    .to_xdr(&s.env, &s.contract_id);
    let events = s.env.events().all();
    assert_eq!(events.events().last().unwrap(), &expected);
}
