#![cfg(test)]

use crate::{OtcSwap, OtcSwapClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger as _, MockAuth, MockAuthInvoke},
    token, Address, BytesN, Env, IntoVal, Val, Vec,
};

struct Setup<'a> {
    env: Env,
    client: OtcSwapClient<'a>,
    contract_id: Address,
    maker: Address,
    taker: Address,
    token_a: Address,
    token_b: Address,
    ta: token::Client<'a>,
    tb: token::Client<'a>,
}

fn make_token<'a>(env: &Env, admin: &Address) -> (Address, token::Client<'a>, token::StellarAssetClient<'a>) {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let addr = sac.address();
    (
        addr.clone(),
        token::Client::new(env, &addr),
        token::StellarAssetClient::new(env, &addr),
    )
}

/// maker holds `maker_amount` token_a, taker holds `taker_amount` token_b.
/// No allowances: settlement is now authorized per-call via `require_auth`.
/// All auths are mocked open here (needed for the admin `mint`); the scoped
/// tests narrow the authorization on the `fill` call itself.
fn setup<'a>(maker_amount: i128, taker_amount: i128) -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(OtcSwap, ());
    let client = OtcSwapClient::new(&env, &contract_id);

    let issuer = Address::generate(&env);
    let maker = Address::generate(&env);
    let taker = Address::generate(&env);

    let (token_a, ta, ta_admin) = make_token(&env, &issuer);
    let (token_b, tb, tb_admin) = make_token(&env, &issuer);

    ta_admin.mint(&maker, &maker_amount);
    tb_admin.mint(&taker, &taker_amount);

    Setup { env, client, contract_id, maker, taker, token_a, token_b, ta, tb }
}

fn order_id(env: &Env, n: u8) -> BytesN<32> {
    BytesN::from_array(env, &[n; 32])
}

#[test]
fn fill_swaps_both_legs() {
    let s = setup(100, 250);
    let exp = s.env.ledger().timestamp() + 3600;

    s.client.fill(
        &s.maker, &s.taker, &s.token_a, &s.token_b, &100, &250, &exp, &order_id(&s.env, 1),
    );

    assert_eq!(s.ta.balance(&s.maker), 0);
    assert_eq!(s.ta.balance(&s.taker), 100);
    assert_eq!(s.tb.balance(&s.taker), 0);
    assert_eq!(s.tb.balance(&s.maker), 250);
}

#[test]
fn fill_is_not_replayable() {
    let s = setup(100, 250);
    let exp = s.env.ledger().timestamp() + 3600;
    let id = order_id(&s.env, 1);

    s.client.fill(&s.maker, &s.taker, &s.token_a, &s.token_b, &100, &250, &exp, &id);
    // second attempt with the same order id must fail
    let again = s.client.try_fill(&s.maker, &s.taker, &s.token_a, &s.token_b, &100, &250, &exp, &id);
    assert!(again.is_err());
}

#[test]
fn fill_rejects_expired_order() {
    let s = setup(100, 250);
    s.env.ledger().set_timestamp(10_000);
    let past = 9_000u64;

    let r = s.client.try_fill(
        &s.maker, &s.taker, &s.token_a, &s.token_b, &100, &250, &past, &order_id(&s.env, 2),
    );
    assert!(r.is_err());
    // no funds moved
    assert_eq!(s.ta.balance(&s.maker), 100);
    assert_eq!(s.tb.balance(&s.taker), 250);
}

#[test]
fn fill_rejects_zero_amount() {
    let s = setup(100, 250);
    let exp = s.env.ledger().timestamp() + 3600;

    let r = s.client.try_fill(
        &s.maker, &s.taker, &s.token_a, &s.token_b, &0, &250, &exp, &order_id(&s.env, 3),
    );
    assert!(r.is_err());
}

// --- auth-binding (the security fix) -------------------------------------
//
// These two tests scope each party's authorization to the *exact* agreed
// terms (`100 <-> 250`) — overriding the open mock on the `fill` call — and
// prove the agreed fill settles while any fill that tampers with an amount is
// rejected. Each party's auth entry is rooted at `fill(100, 250, ...)` with
// that party's own `transfer` sub-call.

#[test]
fn fill_with_scoped_auth_succeeds() {
    let s = setup(100, 250);
    let exp = s.env.ledger().timestamp() + 3600;
    let id = order_id(&s.env, 4);

    let fill_args: Vec<Val> = (
        s.maker.clone(), s.taker.clone(), s.token_a.clone(), s.token_b.clone(),
        100i128, 250i128, exp, id.clone(),
    ).into_val(&s.env);
    let maker_transfer = [MockAuthInvoke {
        contract: &s.token_a, fn_name: "transfer",
        args: (s.maker.clone(), s.taker.clone(), 100i128).into_val(&s.env), sub_invokes: &[],
    }];
    let taker_transfer = [MockAuthInvoke {
        contract: &s.token_b, fn_name: "transfer",
        args: (s.taker.clone(), s.maker.clone(), 250i128).into_val(&s.env), sub_invokes: &[],
    }];
    let maker_root = MockAuthInvoke {
        contract: &s.contract_id, fn_name: "fill", args: fill_args.clone(), sub_invokes: &maker_transfer,
    };
    let taker_root = MockAuthInvoke {
        contract: &s.contract_id, fn_name: "fill", args: fill_args, sub_invokes: &taker_transfer,
    };
    let auths = [
        MockAuth { address: &s.maker, invoke: &maker_root },
        MockAuth { address: &s.taker, invoke: &taker_root },
    ];

    s.client.mock_auths(&auths).fill(
        &s.maker, &s.taker, &s.token_a, &s.token_b, &100, &250, &exp, &id,
    );

    assert_eq!(s.ta.balance(&s.taker), 100);
    assert_eq!(s.tb.balance(&s.maker), 250);
}

#[test]
fn fill_rejects_amount_tampering() {
    let s = setup(100, 250);
    let exp = s.env.ledger().timestamp() + 3600;
    let id = order_id(&s.env, 5);

    // Both parties authorize ONLY the honest 100 <-> 250 terms.
    let fill_args: Vec<Val> = (
        s.maker.clone(), s.taker.clone(), s.token_a.clone(), s.token_b.clone(),
        100i128, 250i128, exp, id.clone(),
    ).into_val(&s.env);
    let maker_transfer = [MockAuthInvoke {
        contract: &s.token_a, fn_name: "transfer",
        args: (s.maker.clone(), s.taker.clone(), 100i128).into_val(&s.env), sub_invokes: &[],
    }];
    let taker_transfer = [MockAuthInvoke {
        contract: &s.token_b, fn_name: "transfer",
        args: (s.taker.clone(), s.maker.clone(), 250i128).into_val(&s.env), sub_invokes: &[],
    }];
    let maker_root = MockAuthInvoke {
        contract: &s.contract_id, fn_name: "fill", args: fill_args.clone(), sub_invokes: &maker_transfer,
    };
    let taker_root = MockAuthInvoke {
        contract: &s.contract_id, fn_name: "fill", args: fill_args, sub_invokes: &taker_transfer,
    };
    let auths = [
        MockAuth { address: &s.maker, invoke: &maker_root },
        MockAuth { address: &s.taker, invoke: &taker_root },
    ];

    // Attacker submits a fill that under-pays the taker leg (250 -> 1). The
    // invocation no longer matches either signed auth entry, so it is rejected
    // and no funds move.
    let r = s.client.mock_auths(&auths).try_fill(
        &s.maker, &s.taker, &s.token_a, &s.token_b, &100, &1, &exp, &id,
    );
    assert!(r.is_err());
    assert_eq!(s.ta.balance(&s.maker), 100);
    assert_eq!(s.tb.balance(&s.taker), 250);
}
