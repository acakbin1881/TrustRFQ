#![cfg(test)]

// The crate is `#![no_std]`; the test harness links std, so opt it back into
// scope for `std::vec!` in the env.auths() assertion below.
extern crate std;

use crate::{Error, Order, RfqSwap, RfqSwapClient};
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, AuthorizedFunction, Ledger as _, MockAuth, MockAuthInvoke},
    token, vec, Address, Env, IntoVal, Val, Vec,
};

// --- coverage boundary (read before adding "missing" tests) ---------------
//
// `rfq_swap` keeps NO filled marker, unlike `otc_swap`'s persistent
// `Filled(order_id)` key. A signed quote is single-use because the HOST
// consumes the auth entry's nonce on verification, and it goes stale on its own
// via `signature_expiration_ledger`. Every test below runs with mocked auth,
// which bypasses the host's signature machinery entirely, so **replay and
// signature expiry are not testable in this file at all**. They are proven
// against the real network by `tools/rfq-live-swap.mjs`, which submits a second
// transaction reusing one signed entry and requires it to fail.
//
// Do not "fix" the absent replay test by adding on-chain state. That would
// duplicate a host guarantee and cost a persistent ledger entry per fill.
//
// What this file DOES cover: the argument-binding boundary (which is the whole
// security model), the business-rule guards, and the admin gate.

struct Setup<'a> {
    env: Env,
    client: RfqSwapClient<'a>,
    contract_id: Address,
    admin: Address,
    collector: Address,
    maker: Address,
    taker: Address,
    maker_token: Address,
    taker_token: Address,
    mt: token::Client<'a>,
    tt: token::Client<'a>,
    /// Kept so tests can fund extra actors. A test that expects a rejection
    /// MUST fund every actor involved, otherwise it passes on an insufficient
    /// balance and silently stops testing what it claims to test.
    tt_admin: token::StellarAssetClient<'a>,
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

/// Both parties start with 1_000_000 of the token they are selling. All auths
/// are mocked open here (the SAC admin `mint` needs it); the scoped tests
/// narrow authorization on the `swap` call itself.
fn setup<'a>(fee_bps: u32) -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let issuer = Address::generate(&env);
    let admin = Address::generate(&env);
    let collector = Address::generate(&env);
    let maker = Address::generate(&env);
    let taker = Address::generate(&env);

    let contract_id = env.register(RfqSwap, (admin.clone(), fee_bps, collector.clone()));
    let client = RfqSwapClient::new(&env, &contract_id);

    let (maker_token, mt, mt_admin) = make_token(&env, &issuer);
    let (taker_token, tt, tt_admin) = make_token(&env, &issuer);

    mt_admin.mint(&maker, &1_000_000);
    tt_admin.mint(&taker, &1_000_000);

    Setup {
        env,
        client,
        contract_id,
        admin,
        collector,
        maker,
        taker,
        maker_token,
        taker_token,
        mt,
        tt,
        tt_admin,
    }
}

fn order_of(s: &Setup, maker_amount: i128, taker_amount: i128, fee_bps: u32) -> Order {
    Order {
        maker: s.maker.clone(),
        taker: s.taker.clone(),
        maker_token: s.maker_token.clone(),
        maker_amount,
        taker_token: s.taker_token.clone(),
        taker_amount,
        expiry: s.env.ledger().timestamp() + 3600,
        order_id: 1,
        fee_bps,
    }
}

/// The exact tuple the maker signs. Mirrors `require_auth_for_args` in lib.rs;
/// if the two ever drift, every scoped-auth test below fails loudly.
fn signed_args(env: &Env, o: &Order) -> Vec<Val> {
    (
        o.taker.clone(),
        o.maker_token.clone(),
        o.maker_amount,
        o.taker_token.clone(),
        o.taker_amount,
        o.expiry,
        o.order_id,
        o.fee_bps,
    )
        .into_val(env)
}

/// The taker authorizes the whole `swap` call, so their args are the function's
/// own argument list: a single `Order`.
fn call_args(env: &Env, o: &Order) -> Vec<Val> {
    vec![env, o.clone().into_val(env)]
}

// --- happy paths ----------------------------------------------------------

#[test]
fn swap_moves_both_legs() {
    let s = setup(0);
    let o = order_of(&s, 100, 250, 0);

    s.client.swap(&o);

    assert_eq!(s.mt.balance(&s.maker), 999_900);
    assert_eq!(s.mt.balance(&s.taker), 100);
    assert_eq!(s.tt.balance(&s.taker), 999_750);
    assert_eq!(s.tt.balance(&s.maker), 250);
    assert_eq!(s.mt.balance(&s.collector), 0);
}

#[test]
fn swap_charges_fee_to_maker() {
    let s = setup(30);
    let o = order_of(&s, 1_000, 250, 30);

    s.client.swap(&o);

    // fee = floor(1000 * 30 / 10_000) = 3, paid by the maker ON TOP of the leg.
    assert_eq!(s.mt.balance(&s.collector), 3);
    assert_eq!(s.mt.balance(&s.maker), 1_000_000 - 1_000 - 3);
    assert_eq!(s.mt.balance(&s.taker), 1_000);
    // The taker's side is untouched by the fee.
    assert_eq!(s.tt.balance(&s.maker), 250);
}

#[test]
fn fee_rounds_down() {
    // 100 * 30 / 10_000 = 0.3 -> 0: sub-stroop fees round to nothing, and the
    // fee transfer is skipped entirely rather than moving 0.
    let s = setup(30);
    s.client.swap(&order_of(&s, 100, 250, 30));
    assert_eq!(s.mt.balance(&s.collector), 0);

    // 400 * 30 / 10_000 = 1.2 -> 1
    let s2 = setup(30);
    s2.client.swap(&order_of(&s2, 400, 250, 30));
    assert_eq!(s2.mt.balance(&s2.collector), 1);
}

#[test]
fn get_config_reports_live_settings() {
    let s = setup(10);
    let c = s.client.get_config();
    assert_eq!(c.admin, s.admin);
    assert_eq!(c.fee_bps, 10);
    assert_eq!(c.fee_collector, s.collector);
    assert!(!c.paused);

    s.client.set_fee(&25);
    s.client.set_paused(&true);
    let c2 = s.client.get_config();
    assert_eq!(c2.fee_bps, 25);
    assert!(c2.paused);
}

// --- the argument-binding boundary (the security model) -------------------

#[test]
fn swap_with_scoped_auth_succeeds() {
    let s = setup(30);
    let o = order_of(&s, 1_000, 250, 30);
    let signed = signed_args(&s.env, &o);
    let called = call_args(&s.env, &o);

    // The maker's subtree: their own leg, then the fee leg. Order matters, the
    // host matches the tree by shape and sequence.
    let maker_subs = [
        MockAuthInvoke {
            contract: &s.maker_token,
            fn_name: "transfer",
            args: (s.maker.clone(), s.taker.clone(), 1_000i128).into_val(&s.env),
            sub_invokes: &[],
        },
        MockAuthInvoke {
            contract: &s.maker_token,
            fn_name: "transfer",
            args: (s.maker.clone(), s.collector.clone(), 3i128).into_val(&s.env),
            sub_invokes: &[],
        },
    ];
    let taker_subs = [MockAuthInvoke {
        contract: &s.taker_token,
        fn_name: "transfer",
        args: (s.taker.clone(), s.maker.clone(), 250i128).into_val(&s.env),
        sub_invokes: &[],
    }];

    // NOTE the asymmetry, and it is the point of this test: the maker's root
    // args are the `require_auth_for_args` TUPLE, while the taker's are the
    // function's own argument list (one `Order`). Swapping them is the easiest
    // way to get this contract subtly wrong.
    let maker_root = MockAuthInvoke {
        contract: &s.contract_id,
        fn_name: "swap",
        args: signed.clone(),
        sub_invokes: &maker_subs,
    };
    let taker_root = MockAuthInvoke {
        contract: &s.contract_id,
        fn_name: "swap",
        args: called,
        sub_invokes: &taker_subs,
    };
    let auths = [
        MockAuth {
            address: &s.maker,
            invoke: &maker_root,
        },
        MockAuth {
            address: &s.taker,
            invoke: &taker_root,
        },
    ];

    s.client.mock_auths(&auths).swap(&o);

    // Prove on-ledger what each party actually authorized. Must run before any
    // further contract call, which would reset env.auths().
    let auths_seen = s.env.auths();
    let (maker_addr, maker_authz) = auths_seen.first().unwrap();
    assert_eq!(maker_addr, &s.maker);
    assert_eq!(
        maker_authz.function,
        AuthorizedFunction::Contract((s.contract_id.clone(), symbol_short!("swap"), signed))
    );
    assert_eq!(maker_authz.sub_invocations.len(), 2);

    assert_eq!(s.mt.balance(&s.taker), 1_000);
    assert_eq!(s.tt.balance(&s.maker), 250);
    assert_eq!(s.mt.balance(&s.collector), 3);
}

#[test]
fn swap_rejects_amount_tampering() {
    let s = setup(0);
    let honest = order_of(&s, 100, 250, 0);
    let signed = signed_args(&s.env, &honest);

    // The attacker resubmits the maker's signature against a cheaper taker leg.
    let mut tampered = honest.clone();
    tampered.taker_amount = 1;

    let maker_subs = [MockAuthInvoke {
        contract: &s.maker_token,
        fn_name: "transfer",
        args: (s.maker.clone(), s.taker.clone(), 100i128).into_val(&s.env),
        sub_invokes: &[],
    }];
    let taker_subs = [MockAuthInvoke {
        contract: &s.taker_token,
        fn_name: "transfer",
        args: (s.taker.clone(), s.maker.clone(), 1i128).into_val(&s.env),
        sub_invokes: &[],
    }];
    let maker_root = MockAuthInvoke {
        contract: &s.contract_id,
        fn_name: "swap",
        args: signed,
        sub_invokes: &maker_subs,
    };
    let taker_root = MockAuthInvoke {
        contract: &s.contract_id,
        fn_name: "swap",
        args: call_args(&s.env, &tampered),
        sub_invokes: &taker_subs,
    };
    let auths = [
        MockAuth {
            address: &s.maker,
            invoke: &maker_root,
        },
        MockAuth {
            address: &s.taker,
            invoke: &taker_root,
        },
    ];

    let r = s.client.mock_auths(&auths).try_swap(&tampered);
    assert!(r.is_err());
    assert_eq!(s.mt.balance(&s.maker), 1_000_000);
    assert_eq!(s.tt.balance(&s.taker), 1_000_000);
}

#[test]
fn swap_rejects_taker_substitution() {
    let s = setup(0);
    // The maker quoted this taker...
    let quoted = order_of(&s, 100, 250, 0);
    let signed = signed_args(&s.env, &quoted);

    // ...but a different address tries to take the quote. It is funded on
    // purpose: an unfunded interloper would make this test pass on an
    // insufficient balance instead of on the authorization check, which is
    // exactly the false pass a mutation run caught here.
    let interloper = Address::generate(&s.env);
    s.tt_admin.mint(&interloper, &1_000_000);

    let mut swapped = quoted.clone();
    swapped.taker = interloper.clone();

    let maker_subs = [MockAuthInvoke {
        contract: &s.maker_token,
        fn_name: "transfer",
        args: (s.maker.clone(), interloper.clone(), 100i128).into_val(&s.env),
        sub_invokes: &[],
    }];
    let taker_subs = [MockAuthInvoke {
        contract: &s.taker_token,
        fn_name: "transfer",
        args: (interloper.clone(), s.maker.clone(), 250i128).into_val(&s.env),
        sub_invokes: &[],
    }];
    let maker_root = MockAuthInvoke {
        contract: &s.contract_id,
        fn_name: "swap",
        args: signed,
        sub_invokes: &maker_subs,
    };
    let taker_root = MockAuthInvoke {
        contract: &s.contract_id,
        fn_name: "swap",
        args: call_args(&s.env, &swapped),
        sub_invokes: &taker_subs,
    };
    let auths = [
        MockAuth {
            address: &s.maker,
            invoke: &maker_root,
        },
        MockAuth {
            address: &interloper,
            invoke: &taker_root,
        },
    ];

    // `taker` is inside the signed tuple, so the maker's signature does not
    // cover this fill and no funds move.
    let r = s.client.mock_auths(&auths).try_swap(&swapped);
    assert!(r.is_err());
    assert_eq!(s.mt.balance(&s.maker), 1_000_000);
}

// --- business-rule guards -------------------------------------------------

#[test]
fn swap_rejects_fee_mismatch() {
    let s = setup(30);
    // The maker signed a 10 bps quote while the contract now charges 30.
    let r = s.client.try_swap(&order_of(&s, 1_000, 250, 10));
    assert_eq!(r, Err(Ok(Error::FeeMismatch)));
    assert_eq!(s.mt.balance(&s.taker), 0);
}

#[test]
fn swap_expiry_boundary() {
    let s = setup(0);
    let mut o = order_of(&s, 100, 250, 0);
    o.expiry = 10_000;

    // Still valid ON the expiry second.
    s.env.ledger().set_timestamp(10_000);
    s.client.swap(&o);
    assert_eq!(s.mt.balance(&s.taker), 100);

    // One second later it is dead.
    s.env.ledger().set_timestamp(10_001);
    let mut o2 = o.clone();
    o2.order_id = 2;
    let r = s.client.try_swap(&o2);
    assert_eq!(r, Err(Ok(Error::Expired)));
}

#[test]
fn swap_rejects_non_positive_amounts() {
    let s = setup(0);

    let mut zero_maker = order_of(&s, 100, 250, 0);
    zero_maker.maker_amount = 0;
    assert_eq!(
        s.client.try_swap(&zero_maker),
        Err(Ok(Error::AmountInvalid))
    );

    let mut negative_taker = order_of(&s, 100, 250, 0);
    negative_taker.taker_amount = -1;
    assert_eq!(
        s.client.try_swap(&negative_taker),
        Err(Ok(Error::AmountInvalid))
    );

    assert_eq!(s.mt.balance(&s.maker), 1_000_000);
}

#[test]
fn swap_rejects_when_paused() {
    let s = setup(0);
    s.client.set_paused(&true);

    assert_eq!(
        s.client.try_swap(&order_of(&s, 100, 250, 0)),
        Err(Ok(Error::Paused))
    );

    s.client.set_paused(&false);
    s.client.swap(&order_of(&s, 100, 250, 0));
    assert_eq!(s.mt.balance(&s.taker), 100);
}

#[test]
fn cancel_works_while_paused() {
    // A pause must never trap a maker's open quotes.
    let s = setup(0);
    s.client.set_paused(&true);
    s.client.cancel(&s.maker, &vec![&s.env, 1u64]);
    assert!(s.client.is_cancelled(&s.maker, &1));
}

#[test]
fn cancel_then_swap_fails() {
    let s = setup(0);
    assert!(!s.client.is_cancelled(&s.maker, &1));

    s.client.cancel(&s.maker, &vec![&s.env, 1u64, 7u64]);
    assert!(s.client.is_cancelled(&s.maker, &1));
    assert!(s.client.is_cancelled(&s.maker, &7));
    // Cancellation is maker-scoped: another maker's id 1 is untouched.
    assert!(!s.client.is_cancelled(&s.taker, &1));

    assert_eq!(
        s.client.try_swap(&order_of(&s, 100, 250, 0)),
        Err(Ok(Error::Cancelled))
    );

    // A different order id from the same maker still settles.
    let mut live = order_of(&s, 100, 250, 0);
    live.order_id = 2;
    s.client.swap(&live);
    assert_eq!(s.mt.balance(&s.taker), 100);
}

// --- admin gate -----------------------------------------------------------

#[test]
fn set_fee_rejects_above_cap() {
    let s = setup(0);
    assert_eq!(s.client.try_set_fee(&31), Err(Ok(Error::FeeTooHigh)));
    s.client.set_fee(&30);
    assert_eq!(s.client.get_config().fee_bps, 30);
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn constructor_rejects_fee_above_cap() {
    // The cap is enforced at deploy too, so a contract can never come into
    // existence charging more than MAX_FEE_BPS.
    let env = Env::default();
    let admin = Address::generate(&env);
    let collector = Address::generate(&env);
    env.register(RfqSwap, (admin, 31u32, collector));
}

#[test]
fn admin_functions_reject_non_admin() {
    let s = setup(0);
    let attacker = Address::generate(&s.env);

    let calls: [(&str, Vec<Val>); 3] = [
        ("set_fee", (5u32,).into_val(&s.env)),
        ("set_fee_collector", (attacker.clone(),).into_val(&s.env)),
        ("set_paused", (true,).into_val(&s.env)),
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
        // `admin.require_auth()` finds nothing that matches.
        let r = match *fn_name {
            "set_fee" => s
                .client
                .mock_auths(&auths)
                .try_set_fee(&5)
                .map(|_| ())
                .map_err(|_| ()),
            "set_fee_collector" => s
                .client
                .mock_auths(&auths)
                .try_set_fee_collector(&attacker)
                .map(|_| ())
                .map_err(|_| ()),
            _ => s
                .client
                .mock_auths(&auths)
                .try_set_paused(&true)
                .map(|_| ())
                .map_err(|_| ()),
        };
        assert!(r.is_err(), "{} must reject a non-admin caller", fn_name);
    }

    // Nothing changed.
    let c = s.client.get_config();
    assert_eq!(c.fee_bps, 0);
    assert_eq!(c.fee_collector, s.collector);
    assert!(!c.paused);
}

#[test]
fn upgrade_requires_admin_auth() {
    use soroban_sdk::BytesN;
    let s = setup(0);
    let attacker = Address::generate(&s.env);
    let hash = BytesN::from_array(&s.env, &[0u8; 32]);

    let invoke = MockAuthInvoke {
        contract: &s.contract_id,
        fn_name: "upgrade",
        args: (hash.clone(),).into_val(&s.env),
        sub_invokes: &[],
    };
    let auths = [MockAuth {
        address: &attacker,
        invoke: &invoke,
    }];
    assert!(s.client.mock_auths(&auths).try_upgrade(&hash).is_err());
}
