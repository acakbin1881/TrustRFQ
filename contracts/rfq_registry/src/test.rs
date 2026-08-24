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
