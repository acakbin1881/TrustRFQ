#![no_std]
//! OTC settlement contract — AirSwap-style signed `fill` on Soroban.
//!
//! Both parties agree off-chain. Each then independently signs an off-chain
//! Soroban authorization entry over the *exact* order terms (counterparty,
//! tokens, **amounts**, expiration, order id). `fill` carries both signatures
//! and moves the two legs with `transfer` — each leg authorized by its owner's
//! signature. Anyone may assemble and submit the transaction: the two
//! signatures pin every term, so the submitter cannot alter amounts, tokens or
//! recipients. There is no separate `approve`/allowance step.

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, BytesN, Env};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,
    Expired = 2,
    AlreadyFilled = 3,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// order_id -> filled, prevents replay
    Filled(BytesN<32>),
}

#[contract]
pub struct OtcSwap;

#[contractimpl]
impl OtcSwap {
    /// Settle an accepted order. `maker` sends `maker_amount` of `maker_token`
    /// to `taker`, and `taker` sends `taker_amount` of `taker_token` to `maker`,
    /// atomically. Both `maker` and `taker` must have authorized *this exact
    /// invocation* (off-chain signed auth entry over all arguments).
    /// `expiration` is a unix timestamp; `order_id` is the sha256 of the
    /// off-chain order id.
    pub fn fill(
        env: Env,
        maker: Address,
        taker: Address,
        maker_token: Address,
        taker_token: Address,
        maker_amount: i128,
        taker_amount: i128,
        expiration: u64,
        order_id: BytesN<32>,
    ) -> Result<(), Error> {
        if maker_amount <= 0 || taker_amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if env.ledger().timestamp() > expiration {
            return Err(Error::Expired);
        }

        let key = DataKey::Filled(order_id);
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadyFilled);
        }

        // Each party signed an auth entry over *these exact* fill arguments, so
        // both signatures are bound to the whole order — amounts included. The
        // token `transfer` sub-calls (which each call `from.require_auth()`) are
        // covered by the same per-party auth tree, so a single signature per
        // party authorizes both this contract call and moving their own funds.
        maker.require_auth();
        taker.require_auth();

        token::Client::new(&env, &maker_token).transfer(&maker, &taker, &maker_amount);
        token::Client::new(&env, &taker_token).transfer(&taker, &maker, &taker_amount);

        env.storage().persistent().set(&key, &true);
        env.storage().persistent().extend_ttl(&key, 17_280, 518_400);
        Ok(())
    }
}

#[cfg(test)]
mod test;
