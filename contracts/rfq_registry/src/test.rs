#![cfg(test)]

// The crate is `#![no_std]`; the test harness links std, so opt it back into
// scope for `"a".repeat(...)` in the oversize-url test below.
extern crate std;

use crate::{Error, RfqRegistry, RfqRegistryClient};
use soroban_sdk::{
    testutils::{Address as _, MockAuth, MockAuthInvoke},
    token, Address, Env, IntoVal, String,
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
    // additions once a token's list is at/above the (now-lower) cap. The
    // eviction half of this rule needs `set_max_makers_per_token`, which
    // lands in Plan 01-03 — this test proves the shape against the cap
    // passed to `initialize`, which is all that is available in this plan.
    //
    // TODO(01-03): once `set_max_makers_per_token` lands, extend this test to
    // lower the cap on a LIVE instance after three makers are registered
    // (rather than only at `initialize` time), and assert: all three survive,
    // `get_urls_for_token` still returns three urls, and a fourth maker's
    // `add_tokens` is rejected with `Err(Error::TokenListFull)`.
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
