#![no_std]
//! RFQ settlement contract: an AirSwap RFQ port to Soroban.
//!
//! Deliberately **asymmetric**, and this is the whole design (see
//! `docs/specs/2026-08-17-rfq-protocol-architecture-design.md` §4):
//!
//! - The **maker** quotes off-chain and pre-signs a detached
//!   `SorobanAuthorizationEntry` scoped with `require_auth_for_args` over every
//!   economic term of the order. The maker never submits a transaction.
//! - The **taker** authorizes by being the **transaction source account**. Their
//!   ordinary envelope signature *is* their authorization, so a taker signs one
//!   normal transaction and never produces a detached auth entry.
//!
//! That asymmetry is what makes an RFQ fill cost the taker a single wallet
//! prompt. It also means this contract's replay protection is **not** the same
//! as `otc_swap`'s: see the "Replay" note on `swap`.
//!
//! Contrast with the sibling `otc_swap` contract, which is symmetric (both
//! parties sign detached entries via plain `require_auth()`, the submit is
//! permissionless, and a persistent `Filled` key blocks double-fills). The two
//! models coexist on purpose; do not blur them.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, BytesN, Env, IntoVal, Vec,
};

/// Hard cap on the protocol fee, enforced in code so no admin key can raise it.
/// AirSwap's equivalent check only rejects fees at or above 100%
/// (`SwapERC20.setProtocolFee`); this is deliberately much tighter.
const MAX_FEE_BPS: u32 = 30;

/// Basis-point divisor. Mirrors AirSwap's `FEE_DIVISOR`.
const BPS_DIVISOR: i128 = 10_000;

/// Ledgers a cancellation flag stays alive: ~24h at 5s/ledger, far beyond any
/// quote lifetime (an RFQ quote lives 30-90s, i.e. 6-18 ledgers).
const CANCEL_TTL: u32 = 17_280;

/// Instance-storage TTL policy: top up to ~30 days whenever less than ~1 day is
/// left. Applied on admin writes; ops keeps it warm between them.
const INSTANCE_TTL_THRESHOLD: u32 = 17_280;
const INSTANCE_TTL_EXTEND_TO: u32 = 518_400;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    Expired = 1,
    Cancelled = 2,
    FeeMismatch = 3,
    AmountInvalid = 4,
    Paused = 5,
    /// Reserved. Authorization failures are raised by the host when
    /// `require_auth` fails, so this code is never returned; it is kept so the
    /// numbering matches the design spec §4.1 and stays stable for clients.
    NotAuthorized = 6,
    FeeTooHigh = 7,
    MathOverflow = 8,
}

/// The complete economic description of one quote. Every field except `maker`
/// is bound into the maker's signed argument tuple (`maker` is bound implicitly:
/// it is the address being authorized).
#[contracttype]
#[derive(Clone)]
pub struct Order {
    /// Provides `maker_token`, signs the auth entry, pays the fee.
    pub maker: Address,
    /// Provides `taker_token`; in practice also the transaction source.
    pub taker: Address,
    pub maker_token: Address,
    pub maker_amount: i128,
    pub taker_token: Address,
    pub taker_amount: i128,
    /// Unix seconds. Defense in depth on top of the auth entry's own
    /// `signature_expiration_ledger`.
    pub expiry: u64,
    /// Maker-scoped handle, used for cancellation and analytics. NOT a replay
    /// guard: the host-consumed auth nonce is.
    pub order_id: u64,
    /// Must equal the contract's current fee at settlement time. Bound into the
    /// signature so the fee cannot be changed under a signed quote.
    pub fee_bps: u32,
}

/// Composite key for a cancellation flag.
///
/// A `#[contracttype]` enum variant can hold at most one value, so the design
/// spec's `Cancelled(Address, u64)` sketch does not compile; the pair travels in
/// this struct instead.
#[contracttype]
#[derive(Clone)]
pub struct CancelKey {
    pub maker: Address,
    pub order_id: u64,
}

/// Everything a maker server needs before signing a quote, in one read.
#[contracttype]
#[derive(Clone)]
pub struct Config {
    pub admin: Address,
    pub fee_bps: u32,
    pub fee_collector: Address,
    pub paused: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    FeeBps,
    FeeCollector,
    Paused,
    /// Temporary storage. TTL is rent, not security: anyone may extend any
    /// entry's TTL with a bare `ExtendFootprintTTLOp`, so a stranger can only
    /// keep an order cancelled, never un-cancel it. Order validity itself comes
    /// from the signed `expiry` and the auth entry's expiration ledger.
    Cancelled(CancelKey),
}

// --- events ---------------------------------------------------------------
//
// Topics are the indexer's primary key, so they are pinned explicitly rather
// than derived from the struct name: renaming a Rust type must never silently
// break a downstream consumer.

/// One settled quote. `fee` is already the computed amount, not the rate.
#[contractevent(topics = ["swap"], data_format = "vec")]
pub struct SwapExecuted {
    #[topic]
    pub maker: Address,
    #[topic]
    pub taker: Address,
    pub order_id: u64,
    pub maker_token: Address,
    pub maker_amount: i128,
    pub taker_token: Address,
    pub taker_amount: i128,
    pub fee: i128,
}

#[contractevent(topics = ["cancel"], data_format = "vec")]
pub struct OrdersCancelled {
    #[topic]
    pub maker: Address,
    pub order_ids: Vec<u64>,
}

#[contractevent(topics = ["set_fee"], data_format = "vec")]
pub struct FeeSet {
    pub fee_bps: u32,
}

#[contractevent(topics = ["set_coll"], data_format = "vec")]
pub struct FeeCollectorSet {
    pub fee_collector: Address,
}

#[contractevent(topics = ["paused"], data_format = "vec")]
pub struct PausedSet {
    pub paused: bool,
}

#[contract]
pub struct RfqSwap;

#[contractimpl]
impl RfqSwap {
    /// Runs exactly once, at deploy. Using a constructor rather than an
    /// `initialize` entry point removes the re-initialization attack class
    /// entirely: the host guarantees a single call and never re-runs it on
    /// `upgrade`.
    pub fn __constructor(env: Env, admin: Address, fee_bps: u32, fee_collector: Address) {
        if fee_bps > MAX_FEE_BPS {
            panic_with_error!(&env, Error::FeeTooHigh);
        }
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::FeeBps, &fee_bps);
        s.set(&DataKey::FeeCollector, &fee_collector);
        s.set(&DataKey::Paused, &false);
        bump_instance(&env);
    }

    /// Settle a taker-bound quote.
    ///
    /// Called by anyone, but in practice the taker is the transaction source.
    /// The maker's authorization arrives as a pre-signed auth entry attached to
    /// the transaction; the taker's rides their envelope signature.
    ///
    /// **Replay.** Unlike `otc_swap::fill`, this contract keeps **no** filled
    /// marker. A signed quote is single-use because the host consumes the auth
    /// entry's nonce on verification, and it goes stale on its own because of
    /// `signature_expiration_ledger`. Both are host guarantees and
    /// re-implementing them here would be redundant on-chain state. `expiry`
    /// and `order_id` below are the *application* layers:
    /// a business deadline and a cancellable handle.
    pub fn swap(env: Env, order: Order) -> Result<(), Error> {
        if is_paused(&env) {
            return Err(Error::Paused);
        }
        if order.maker_amount <= 0 || order.taker_amount <= 0 {
            return Err(Error::AmountInvalid);
        }
        // `>` not `>=`: a quote is still good on its expiry second.
        if env.ledger().timestamp() > order.expiry {
            return Err(Error::Expired);
        }
        if cancelled(&env, &order.maker, order.order_id) {
            return Err(Error::Cancelled);
        }
        if order.fee_bps != fee_bps(&env) {
            return Err(Error::FeeMismatch);
        }

        // THE security boundary. Every field that can move funds sits inside
        // this tuple, so there is a deterministic, injective mapping from the
        // signed args to the transfers below (spec §7.1). Anything omitted here
        // is a field an attacker could vary while replaying the same signature.
        // `order.maker` is bound implicitly as the address being authorized.
        order.maker.require_auth_for_args(
            (
                order.taker.clone(),
                order.maker_token.clone(),
                order.maker_amount,
                order.taker_token.clone(),
                order.taker_amount,
                order.expiry,
                order.order_id,
                order.fee_bps,
            )
                .into_val(&env),
        );

        // The taker authorizes over the full `swap` args. With source-account
        // credentials this is satisfied by their transaction signature at no
        // extra prompt. The contract does not *require* the taker to be the
        // source: an Address-credential entry works too, it just costs a
        // signature.
        order.taker.require_auth();

        let fee = mul_bps(order.maker_amount, order.fee_bps)?;

        token::Client::new(&env, &order.taker_token).transfer(
            &order.taker,
            &order.maker,
            &order.taker_amount,
        );
        token::Client::new(&env, &order.maker_token).transfer(
            &order.maker,
            &order.taker,
            &order.maker_amount,
        );
        // Fee is paid by the maker, in maker_token, ON TOP of maker_amount
        // (mirrors AirSwap: `signerAmount * fee / FEE_DIVISOR`, from the
        // signer's wallet).
        if fee > 0 {
            token::Client::new(&env, &order.maker_token).transfer(
                &order.maker,
                &fee_collector(&env),
                &fee,
            );
        }

        SwapExecuted {
            maker: order.maker,
            taker: order.taker,
            order_id: order.order_id,
            maker_token: order.maker_token,
            maker_amount: order.maker_amount,
            taker_token: order.taker_token,
            taker_amount: order.taker_amount,
            fee,
        }
        .publish(&env);
        Ok(())
    }

    /// Kill outstanding quotes ahead of their natural expiry.
    ///
    /// Honest caveat (identical to AirSwap's `cancel(nonces)`): a taker already
    /// holding a signed quote can settle before this lands. Short expiries are
    /// the primary control; cancel is the backstop. Deliberately still callable
    /// while paused, so a pause can never trap a maker's open quotes.
    pub fn cancel(env: Env, maker: Address, order_ids: Vec<u64>) {
        maker.require_auth();
        for order_id in order_ids.iter() {
            let key = DataKey::Cancelled(CancelKey {
                maker: maker.clone(),
                order_id,
            });
            env.storage().temporary().set(&key, &true);
            env.storage()
                .temporary()
                .extend_ttl(&key, CANCEL_TTL, CANCEL_TTL);
        }
        OrdersCancelled { maker, order_ids }.publish(&env);
    }

    /// True while a cancellation flag for `(maker, order_id)` is live.
    pub fn is_cancelled(env: Env, maker: Address, order_id: u64) -> bool {
        cancelled(&env, &maker, order_id)
    }

    /// Everything a maker server needs before signing: read this and put the
    /// returned `fee_bps` into the order, or every quote risks `FeeMismatch`.
    pub fn get_config(env: Env) -> Config {
        Config {
            admin: admin(&env),
            fee_bps: fee_bps(&env),
            fee_collector: fee_collector(&env),
            paused: is_paused(&env),
        }
    }

    // --- admin (multisig / timelock in production) ------------------------

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

    pub fn set_fee_collector(env: Env, to: Address) {
        require_admin(&env);
        env.storage().instance().set(&DataKey::FeeCollector, &to);
        bump_instance(&env);
        FeeCollectorSet { fee_collector: to }.publish(&env);
    }

    /// Halts `swap`. Never halts `cancel`.
    pub fn set_paused(env: Env, paused: bool) {
        require_admin(&env);
        env.storage().instance().set(&DataKey::Paused, &paused);
        bump_instance(&env);
        PausedSet { paused }.publish(&env);
    }

    /// In-place upgrade; the contract id and all storage survive. This cannot
    /// be retrofitted later (a contract without it can only be replaced by a
    /// new id, invalidating every maker's configuration), which is why it ships
    /// in v1 even though AirSwap's `SwapERC20` has no equivalent.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        require_admin(&env);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }
}

// --- internals ------------------------------------------------------------

fn admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

fn fee_bps(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::FeeBps).unwrap()
}

fn fee_collector(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::FeeCollector)
        .unwrap()
}

fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false)
}

fn cancelled(env: &Env, maker: &Address, order_id: u64) -> bool {
    env.storage().temporary().has(&DataKey::Cancelled(CancelKey {
        maker: maker.clone(),
        order_id,
    }))
}

fn require_admin(env: &Env) {
    admin(env).require_auth();
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}

/// `floor(amount * bps / 10_000)` with checked math: overflow surfaces as a
/// contract error rather than a panic or, worse, a wrap.
fn mul_bps(amount: i128, bps: u32) -> Result<i128, Error> {
    amount
        .checked_mul(bps as i128)
        .map(|v| v / BPS_DIVISOR)
        .ok_or(Error::MathOverflow)
}

#[cfg(test)]
mod test;
