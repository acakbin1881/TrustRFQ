# RFQ protocol architecture: peer-to-peer quoting on Soroban

**Date:** 2026-08-17 · **Status:** ADOPTED architecture (docs-only adoption; implementation not
yet scheduled)
**Supersedes (direction):** [2026-07-10-intent-private-offer-layer-design.md](2026-07-10-intent-private-offer-layer-design.md).
That layer shipped and stays live as the interim fan-out mode until this protocol ships.

**Scope:** a faithful port of AirSwap's Request-for-Quote (RFQ) protocol to Stellar using Soroban
smart contracts. RFQ is the entire scope of this design. AirSwap's other trading modes (LastLook
streaming, NFT swaps) and its staker fee-rebate mechanics are not part of it and are not planned.
TrustRFQ's existing OTC lane (the dual-signed `fill` between known counterparties) is a separate,
permanent feature of this repo and is unaffected.

> **AMENDMENT 2026-08-19: one settlement contract, not two.** The sentence above is superseded on
> its last four words. The OTC lane is permanent as a *lane*, but it stops having its own
> contract: `rfq_swap` becomes the single settlement contract for both lanes and `otc_swap` is
> retired. Rationale: AirSwap runs OTC and RFQ on one contract because both have the same auth
> topology (one party signs the order, the other sends the transaction), and `rfq_swap` already
> accommodates the OTC topology too, since `order.taker.require_auth()` is satisfied either by the
> taker being the transaction source (RFQ, one prompt) or by a detached Address-credential entry
> (OTC, permissionless submit). The three consequences were decided the same day:
> 1. **Timing:** the migration happens inside the RFQ milestone, not after it. One deploy, both
>    lanes, `otc_swap` retired at cutover.
> 2. **Fee:** 10 bps, maker-paid, on **both** lanes (AirSwap applies its protocol fee to OTC
>    trades as well). The 30 bps hard cap stays.
> 3. **Double-fill guard:** `Order` gains `require_fill_guard: bool`, bound into the maker's
>    signed argument tuple. Directed OTC offers set it `true` and the contract writes a persistent
>    filled key; RFQ quotes set it `false` and rely on the host auth nonce plus a short expiry, so
>    a 60-second quote pays no storage rent. Neither party can flip the flag: it sits inside the
>    maker's signed tuple, and the taker's plain `require_auth()` binds the whole `Order`.
>
> This changes `Order`, so `rfq_swap` gets a new wasm and a new contract id; §4 below describes
> the pre-amendment struct.

**Naming:** inside this repo the feature is simply **"the RFQ protocol"**. The pre-adoption
working name "stellar-rfq" and the old roadmap phrases "institutional RFQ protocol" and
"peer-to-server quoting" all retire. The protocol is **peer-to-peer**: the maker's quote server
is the maker's own trading endpoint, not a third party, and no intermediary sits between the
peers. Contract crates: `rfq_swap`, `rfq_registry`.

---

## 1. What AirSwap RFQ actually is (research summary)

AirSwap communicates prices **off-chain** and settles **on-chain**. RFQ is peer-to-peer:
professional market makers ("makers") run public web servers as their own trading endpoints;
traders ("takers") discover those servers, request firm quotes directly from the makers, and
settle the best one atomically on-chain. The server IS the maker; no intermediary sits between
the two peers. There is no order book and no pooled liquidity: every trade is a bilateral atomic
swap.

### 1.1 Roles

At the protocol layer AirSwap distinguishes **signers** (who set and cryptographically sign the
terms) from **senders** (who submit the terms to the chain for settlement). In RFQ specifically:

- The **maker server is always the signer**: it prices the request and returns a signed order.
- The **taker client is always the sender**: it submits the transaction and pays the fees.

### 1.2 The four moving parts

1. **Registry contract (on-chain).** Makers stake tokens and register `(server URL, supported
   tokens, supported protocol IDs)`. Clients call `getURLsForToken(tokenA)` and
   `getURLsForToken(tokenB)` and intersect the two URL sets to find servers quoting that pair.
   Staking has a base cost plus a per-token support cost (amounts vary per chain deployment),
   which is an anti-spam/quality bond, not slashable collateral.

2. **Maker server (off-chain).** A JSON-RPC 2.0 server over HTTPS or WSS with CORS enabled. Core
   RFQ methods:
   - `getSignerSideOrderERC20(chainId, swapContract, senderAmount, signerToken, senderToken,
     senderWallet, minExpiry?)`: the "I'm selling you X, how much will you give me?" direction.
     The server returns a signed order filling in `signerAmount`.
   - `getSenderSideOrderERC20(...)`: the mirror image. The taker specifies what they want to
     receive; the server fills in `senderAmount`.
   - `getPricingERC20(pairs)` / `getAllPricingERC20()`: soft (indicative) pricing as **levels**
     (piecewise amount/price tuples) or a **formula** string (`"x*0.00053"`).
   - Discovery helpers `getProtocols` / `getTokens`, and a standard error-code vocabulary
     (`-33600` cannot quote, `-33601` pair not traded, `-33602/-33603` amount too low/high,
     `-33604` bad params, `-33605` rate limited).

3. **Swap contract (on-chain).** `SwapERC20` settles a signed `OrderERC20` atomically:
   ```
   Order = { nonce, expiry, signerWallet, signerToken, signerAmount,
             protocolFee, senderWallet, senderToken, senderAmount }
   + EIP-712 signature (v, r, s) over the order, domain-separated by
     { name: "SWAP_ERC20", version: "4.3", chainId, verifyingContract }
   ```
   Settlement functions: `swap` (fee with staker rebates), `swapAnySender` (order signed with
   open sender), and `swapLight` (gas-efficient path where `msg.sender` must equal the order's
   sender). The contract checks the signature, expiry, and nonce; performs both `transferFrom`s;
   pulls the protocol fee (bps of `signerAmount`, paid by the signer in `signerToken`); and emits
   a `SwapERC20` event keyed by nonce. `cancel(uint256[] nonces)` lets a signer kill outstanding
   orders; `authorize(signer)` / `revoke()` let a cold wallet delegate signing to a hot key.

4. **Client / SDK.** `@airswap/libraries` wraps discovery (`Registry.getServers`), quoting
   (`server.getSignerSideOrderERC20`), and settlement (`SwapERC20.swapLight(...)`). The taker
   compares quotes from all responding servers, picks the best, and submits.

### 1.3 Properties worth preserving in the port

- **Firm, fill-or-kill pricing**: the price you see is the price you get; no slippage, no
  partial fills.
- **Non-custodial, no escrow**: funds only move inside the atomic settlement call.
- **No counterparty trust**: either both legs execute or neither does.
- **Signer/sender asymmetry**: maker signs offline; taker pays for and controls submission.
- **Short-lived orders + cancellation**: expiry bounds maker risk; nonce cancel is the emergency
  brake.
- **Open discovery with a spam bond**: anyone can register a server by staking.
- **Protocol fee bound into the signature**: the fee rate the maker signed is the fee rate
  settled.

---

## 2. Concept mapping: EVM/AirSwap to Stellar/Soroban

This is the heart of the design. Almost everything `SwapERC20` implements *manually* on Ethereum
(typed-data signatures, domain separation, nonce bitmaps, expiry checks) exists **natively** in
Soroban's authorization framework, which changes the shape of the port considerably.

| AirSwap / EVM concept | Stellar / Soroban equivalent | Notes |
|---|---|---|
| EIP-712 signed order (`v,r,s`) | **Signed `SorobanAuthorizationEntry`** (XDR, base64 over the wire) | The maker signs an auth entry authorizing a specific `swap(...)` invocation tree. Portable, independently signed, not bound to a transaction or fee payer. |
| `chainId` in EIP-712 domain | **Network passphrase** hashed into the auth preimage | Cross-network replay is impossible by construction. |
| Order `nonce` + on-chain nonce bitmap | **Auth-entry nonce**, consumed by the protocol | An arbitrary int64, unique among the address's non-expired signatures; the host stores consumed nonces in temporary ledger entries that live exactly until the signature expires. No contract code needed. |
| Order `expiry` (unix seconds) | **`signature_expiration_ledger`** (+ optional in-contract timestamp check) | Ledger-based; valid through the stated ledger, invalid after. Typical offsets are 12-60 ledgers (~1-5 min at ~5s per ledger). Perfect for short-lived RFQ quotes. |
| `ERC20.approve` + `transferFrom` | **Not needed.** Auth covers nested `token.transfer` sub-invocations | The maker's single auth entry authorizes both the `swap` call *and* the token transfer the contract performs on their behalf. Takers never pre-approve either. Big UX win. |
| `address` (20-byte) | `Address`: G-account (ed25519 account) or C-address (contract) | Both can authorize; C-accounts (smart wallets) sign auth entries via `__check_auth`, opening the door to policy-controlled maker treasuries. |
| ERC-20 token | **SEP-41 token interface**: Stellar Asset Contract (SAC) for classic assets, or custom Soroban tokens | SAC-wrapped classic assets use 7 decimals; amounts are `i128`. Classic-asset recipients on G-accounts need a **trustline**. |
| `swapLight` submitted by taker | **Taker = transaction source account** | Source-account credentials need no separate auth signature; the envelope signature covers them. So the taker signs one normal transaction; only the maker produces a detached auth entry. |
| `swapAnySender` (open orders) | Separate entry point where the taker address is excluded from the maker-authorized args | See §4.4. |
| `cancel(nonces[])` | Contract-side `cancel(order_ids)` flag in **temporary storage** (TTL ≥ quote lifetime) | Auth nonces can't be revoked early at the protocol level, so an explicit order-ID kill switch is layered on top. Short expiries make this rarely needed. |
| `authorize`/`revoke` delegated signer | **Stellar-native account signers**: the maker adds the server's hot key as a weighted signer on its G-account; removing it revokes | No contract code needed. A direct contract-side port cannot work here: the SAC `transfer` sub-invocation demands the maker's own auth (§4.5). Policy-enforcing C-account makers noted but out of scope, §4.5. |
| Gas / gas auctions | Inclusion fee + metered resource fee | Fees are cents-level; front-running economics are far weaker; Protocol 23 executes non-conflicting transactions in parallel. |
| Events via logs, indexed by `nonce` | Contract events via `env.events().publish`, queried through RPC `getEvents` | Protocol 23's unified event stream (CAP-67) makes off-chain indexing straightforward. |

**Two possible settlement designs were considered:**

- **Design A (adopted): auth-entry native.** The "order signature" *is* a signed
  `SorobanAuthorizationEntry`. Replay protection, expiry, and network binding come from the
  protocol. The contract stays small (~200 lines of meaningful logic), and this mirrors the
  official `atomic_swap` example pattern (`require_auth_for_args` for both parties, transfers as
  authorized sub-invocations), which is well-trodden and well-audited territory.
- **Design B: EVM-style port.** Define an `Order` struct, hash it, verify an ed25519 signature
  in-contract (`env.crypto().ed25519_verify`), and keep a nonce map in contract storage, a
  literal translation of `SwapERC20`. This buys nothing on Stellar, adds hand-rolled
  crypto/domain-separation/nonce logic (the classic bug farm), restricts makers to raw ed25519
  keys (no smart-wallet makers), and fights the platform. **Rejected for v1.** It only becomes
  interesting if you later need orders verifiable by *other* contracts without the host auth
  framework.

The rest of this document assumes **Design A**.

---

## 3. System architecture

```
                        OFF-CHAIN                                ON-CHAIN (Soroban)
  ┌──────────────────────────────────────────────┐      ┌──────────────────────────────┐
  │                                              │      │                              │
  │  ┌─────────────┐   JSON-RPC (HTTPS/WSS)      │      │   ┌──────────────────────┐   │
  │  │ Taker web   │──────────────────────────┐  │      │   │  rfq_registry        │   │
  │  │ app / CLI   │                          │  │      │   │  stake · url ·       │   │
  │  └──────┬──────┘                          ▼  │      │   │  tokens · protocols  │   │
  │         │                        ┌───────────┴──┐   │   └──────────▲───────────┘   │
  │         │  discovery (read)      │ Maker server │   │              │ register/stake│
  │         ├────────────────────────│  #1..N       │───┼──────────────┘               │
  │         │                        │ pricing ·    │   │                              │
  │  ┌──────▼──────┐                 │ risk · sign  │   │   ┌──────────────────────┐   │
  │  │ Taker SDK   │                 └──────┬───────┘   │   │  rfq_swap            │   │
  │  │ (TS)        │   signed auth entry    │           │   │  swap · swap_any ·   │   │
  │  └──────┬──────┘◄───────────────────────┘           │   │  cancel · fee ·      │   │
  │         │  build tx + attach maker auth             │   │  events              │   │
  │         │  simulate → wallet sign → submit          │   └──────────▲───────────┘   │
  │         └─────────────────────────────────────┐     │              │               │
  │                                               │     │              │ transfer      │
  │  ┌─────────────┐        getEvents             │     │   ┌──────────┴───────────┐   │
  │  │ Indexer /   │◄───── Stellar RPC ───────────┼─────┼──►│  SEP-41 tokens       │   │
  │  │ analytics   │                              ▼     │   │  (SACs / custom)     │   │
  │  └─────────────┘                    sendTransaction │   └──────────────────────┘   │
  └──────────────────────────────────────────────┘      └──────────────────────────────┘
```

**Components:**

1. **`rfq_swap` contract (Rust/Soroban)**: atomic settlement, fee collection, cancellation,
   events. Stateless per-order except cancel flags. Lives in this repo under `contracts/`.
2. **`rfq_registry` contract (Rust/Soroban)**: staked maker registration and token-pair
   discovery. Lives in this repo under `contracts/`.
3. **Maker reference server (TypeScript/Node, or Rust)**: JSON-RPC over HTTPS (WSS optional,
   §10); pricing
   engine (levels/formula plugins); risk checks; auth-entry construction and signing; rate
   limiting. Lives in a **separate repo** (see §10-§11).
4. **Taker SDK (TypeScript, `@stellar/stellar-sdk` based)**: registry discovery, parallel quote
   fan-out, best-quote selection, transaction assembly, wallet integration, fill tracking. Lives
   in the same separate repo as the server.
5. **Reference taker UI + CLI**: thin consumers of the SDK; the CLI mirrors
   `airswap order|compare|best|registry:*` ergonomics. In TrustRFQ, the desk (this repo's SPA)
   becomes the taker web app.
6. **Indexer (optional but recommended)**: consumes `rfq_swap` events via RPC `getEvents` into
   Postgres for analytics, maker scorecards, and fill confirmation UX.

**Trust model (unchanged from AirSwap):** the contracts are the only trusted code. Maker servers
are untrusted price sources: a malicious server can at worst quote a bad price (which the client
checks before signing) or fail to respond. The registry is permissionless with a stake bond.

### 3.1 Ecosystem fit & prior art (Stellar Raven scan)

A discovery pass over the Stellar ecosystem graph surfaced **no existing signed-quote RFQ
protocol**; the trading lane today is AMMs plus aggregators. (Absence in these scans is not proof
of absence, but nothing RFQ-shaped ranked in repo or project searches.) Three directly relevant
candidates:

1. **Soroswap core** (https://github.com/soroswap/core, last updated Dec 2025). The incumbent
   Soroban AMM (Factory/Router); its `soroswap-core` codebase has a published OtterSec audit
   (Dec 2023). *Role here:* reference for production Soroban DeFi contract structure, and its
   aggregator is a natural future RFQ consumer. *Limitation:* pooled-liquidity model with no
   signed-quote component; license/maintenance status not verified.
2. **Phoenix contracts** (https://github.com/Phoenix-Protocol-Group/phoenix-contracts, last
   updated Jul 2026, actively developed). DEX-protocol contract suite; a second reference
   codebase. *Limitation:* also AMM-style, not RFQ; audit/production status not verified here.
3. **stellar-dex-agg** (https://github.com/Lum-Agg/stellar-dex-agg, last updated Aug 2026,
   days-fresh). A Stellar DEX-aggregator monorepo; the project directory also lists aggregation
   services **StellarBroker** and **WOWMAX**. *Role here:* aggregators are the MetaMask-Swaps
   analog, the first taker-integration targets once RFQ liquidity exists, since a firm signed
   quote slots into an aggregator's route comparison as just another source. *Limitation:*
   maturity/license/audit unknown.

Two consequences for this plan: (a) the RFQ lane is whitespace; the differentiator vs incumbent
AMMs is firm pricing at size with zero slippage from professional makers hedging off-chain.
(b) the go-to-market motion is *maker recruitment + aggregator integration*, not end-user
acquisition, mirroring how AirSwap reached users through MetaMask Swaps rather than its own UI.

---

## 4. On-chain design: the `rfq_swap` contract

### 4.1 Interface sketch

```rust
#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, contracterror,
                  token, Address, BytesN, Env, Vec, IntoVal};

#[contracttype]
pub struct Order {
    pub maker: Address,        // "signer": provides maker_token, signs the auth entry
    pub taker: Address,        // "sender": provides taker_token, submits the tx
    pub maker_token: Address,  // SEP-41 token contract (SAC or custom)
    pub maker_amount: i128,    // atomic units (7 dp for SAC classic assets)
    pub taker_token: Address,
    pub taker_amount: i128,
    pub expiry: u64,           // unix seconds; defense-in-depth on top of auth expiry
    pub order_id: u64,         // maker-scoped, monotonically increasing; for cancel + analytics
    pub fee_bps: u32,          // must equal current contract fee; bound into maker's signature
}

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
}

#[contract]
pub struct RfqSwap;

#[contractimpl]
impl RfqSwap {
    pub fn initialize(env: Env, admin: Address, fee_bps: u32, fee_collector: Address);

    /// Settle a taker-bound order. Called by anyone, but in practice the taker
    /// is the transaction source. Maker authorization arrives as a pre-signed
    /// SorobanAuthorizationEntry attached to the transaction.
    pub fn swap(env: Env, order: Order) -> Result<(), Error>;

    /// Settle an open ("any sender") order: the maker's authorized args exclude
    /// the taker, so any address may fill. Follow-on, not part of v1 (§4.4).
    /// OpenOrder = Order minus the `taker` field (sketch elided).
    pub fn swap_any(env: Env, order: OpenOrder, taker: Address) -> Result<(), Error>;

    /// Maker kills outstanding order_ids ahead of natural expiry.
    pub fn cancel(env: Env, maker: Address, order_ids: Vec<u64>);

    // NOTE: no authorize/revoke here. Delegated signing is an account-level
    // Stellar feature, not contract code (§4.5).

    /// True if (maker, order_id) has been cancelled and the flag hasn't expired.
    pub fn is_cancelled(env: Env, maker: Address, order_id: u64) -> bool;

    // --- admin (behind multisig / timelock) ---
    pub fn set_fee(env: Env, fee_bps: u32);            // hard cap enforced, e.g. <= 30 bps
    pub fn set_fee_collector(env: Env, to: Address);
    pub fn set_paused(env: Env, paused: bool);
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>);
}
```

### 4.2 The `swap` body: order of operations

```rust
pub fn swap(env: Env, order: Order) -> Result<(), Error> {
    if paused(&env) { return Err(Error::Paused); }
    if order.maker_amount <= 0 || order.taker_amount <= 0 { return Err(Error::AmountInvalid); }
    if env.ledger().timestamp() > order.expiry { return Err(Error::Expired); }
    if is_cancelled(&env, &order.maker, order.order_id) { return Err(Error::Cancelled); }
    if order.fee_bps != current_fee_bps(&env) { return Err(Error::FeeMismatch); }

    // The maker must have authorized EXACTLY these economic terms.
    // Every field of Order is in the authorized args; nothing is left loose.
    order.maker.require_auth_for_args((
        order.taker.clone(), order.maker_token.clone(), order.maker_amount,
        order.taker_token.clone(), order.taker_amount,
        order.expiry, order.order_id, order.fee_bps,
    ).into_val(&env));

    // The taker authorizes via source-account credentials (their tx signature).
    order.taker.require_auth();

    // Leg 1: taker -> maker
    token::Client::new(&env, &order.taker_token)
        .transfer(&order.taker, &order.maker, &order.taker_amount);

    // Leg 2: maker -> taker
    token::Client::new(&env, &order.maker_token)
        .transfer(&order.maker, &order.taker, &order.maker_amount);

    // Protocol fee: paid by the maker in maker_token, ON TOP of maker_amount
    // (mirrors AirSwap: fee = signerAmount * bps / 10_000, from signerWallet).
    let fee = mul_bps(order.maker_amount, order.fee_bps); // i128 checked math
    if fee > 0 {
        token::Client::new(&env, &order.maker_token)
            .transfer(&order.maker, &fee_collector(&env), &fee);
    }

    env.events().publish(
        (symbol_short!("swap"), order.maker.clone(), order.taker.clone()),
        (order.order_id, order.maker_token, order.maker_amount,
         order.taker_token, order.taker_amount, fee),
    );
    Ok(())
}
```

Design notes:

- **Replay & expiry are handled twice, deliberately.** The auth entry's
  `signature_expiration_ledger` and protocol-consumed nonce are the real guarantees; the
  in-contract `expiry` timestamp and `order_id` are defense-in-depth plus a human-readable handle
  for cancellation and analytics. The maker server should set
  `signature_expiration_ledger ≈ current_ledger + ceil(quote_ttl / 5s)` and
  `expiry = now + quote_ttl`, keeping both windows tight (30-90s, roughly 6-18 ledgers, is a
  sensible RFQ default; generic interactive auth entries usually get 12-60 ledgers, ~1-5 min).
- **Both token transfers are sub-invocations covered by the parties' auth trees.** The maker's
  signed entry contains the `swap` root (with the args above) *and* the nested
  `transfer(maker → taker, maker_amount)` and fee-transfer nodes; the taker's source-account
  entry covers their own transfer. Recording-mode simulation produces these trees automatically;
  nobody hand-builds XDR (§6, maker flow step 3).
- **Exact amounts, no min/max.** Unlike the generic `atomic_swap` example (which uses max-spend
  plus minimum-receive and refunds the remainder through the contract), RFQ quotes are firm: the
  amounts in the order are the amounts that settle. This removes the intermediate contract-held
  balance and the refund transfer entirely: two transfers plus fee, nothing else.
- **No reentrancy surface.** Soroban currently disallows reentrant contract calls at the host
  level, and the contract holds no funds between calls anyway.
- **Checked `i128` math everywhere.** `mul_bps` uses `checked_mul` / `checked_div`; overflow
  panics rather than wraps.

### 4.3 Cancellation

`cancel(maker, order_ids)` requires `maker.require_auth()` and writes
`Cancelled(maker, order_id) = true` into **temporary storage** with a TTL comfortably beyond the
maximum quote lifetime (e.g. a few thousand ledgers). Because every order dies naturally at
`signature_expiration_ledger`, the flag never needs to outlive the quote: temporary storage is
cheap and self-garbage-collecting, exactly the pattern the platform recommends for nonce-like
data ("temporary storage for data with a deadline" is a documented storage strategy). One
doctrinal point the official guidance is emphatic about: **TTL is rent, not security.** Anyone
can extend any entry's TTL via a plain `ExtendFootprintTTLOp` with no contract auth involved, so
validity deadlines must live in checked values, never in entry lifetimes. This design complies:
order validity comes from the signed `expiry` and the auth entry's expiration ledger; the cancel
flag's *presence* is the signal, and a stranger extending its TTL merely keeps an order
cancelled, which is harmless. A `cancel_all_before(min_order_id)` variant (AirSwap's old
`cancelUpTo`) can be added later with one instance-storage integer per maker if makers want a
nuclear option after a key incident.

Honest caveat: between quote issuance and cancellation there is a race: a taker who already holds
the signed entry can settle before the cancel lands. AirSwap has the identical race with
`cancel(nonces)`. Tight expiries are the primary control; cancel is the backstop.

### 4.4 Open orders (`swap_any`)

For the `swapAnySender` equivalent, the maker authorizes an args tuple that **omits the taker**,
and the taker arrives as a separate, unauthorized parameter:

```rust
order.maker.require_auth_for_args((
    order.maker_token.clone(), order.maker_amount,
    order.taker_token.clone(), order.taker_amount,
    order.expiry, order.order_id, order.fee_bps,
).into_val(&env));
taker.require_auth();
```

Soroban `Address` has no zero-address sentinel, so a distinct entry point (or an
`Option<Address>` inside the authorized tuple) is the clean encoding. Ship `swap` in v1;
`swap_any` is a small follow-on primarily useful for OTC-style open-order flows, which are out of
scope for this design.

### 4.5 Delegated signing (AirSwap `authorize`/`revoke`)

**v1 approach: Stellar-native account signers, zero contract code.** (Corrected in the
2026-08-17 docs audit: the earlier draft ported AirSwap's contract-side `signer -> maker`
delegation map directly, but that cannot work on Soroban. The SAC `transfer(maker, ...)`
sub-invocation demands authorization for the *maker* address itself, so a signature that
verifies only for a separate signer address can never move maker funds. AirSwap's EVM version
escapes this only because `SwapERC20` moves funds via allowance.)

The same operational goal, hot key on the quote server + inventory key in cold storage + instant
revocation, is a platform feature on Stellar. The maker adds the server's signing key as an
additional weighted **account signer** on the maker G-account (`setOptions`, weight at the
medium threshold). The host then accepts that key's signatures on the maker's auth entries, so
the server prices and signs while the master key stays cold. Compromise response: remove the
signer with one `setOptions` (and mass-`cancel` open order ids, §4.3). Nothing to deploy, no
delegation map to maintain, and `swap` keeps the plain `order.maker.require_auth_for_args(...)`
of §4.2 unchanged.

> **INFO. Out of scope for v1: policy-enforcing maker accounts.**
>
> Delegation limits *who* can sign, but a stolen hot key still signs anything until the signer
> removal lands. Soroban can do better, and this is noted here only so the option is not lost.
>
> A maker's on-chain identity can be a C-account (account contract / smart wallet) holding the
> inventory, whose `__check_auth` decides which signatures to accept. Because that function is
> arbitrary code, the maker can enforce *policy* rather than mere identity: max notional per
> order, allow-listed tokens, 2-of-3 signing, per-window volume caps. A leaked hot key then
> cannot exceed those limits, because enforcement lives on-chain rather than in the quote server.
>
> Two properties make this attractive later: the RFQ contracts require **no change at all**
> (Soroban's `Address` covers both G-accounts and contracts, so `swap` never learns the
> difference), and it is a capability EVM AirSwap does not have. **Not in v1 scope. No design or
> implementation work planned. Revisit when the desk runtime moves to production key handling.**

### 4.6 Storage, TTL, and Protocol-23 archival

| Data | Storage class | TTL policy |
|---|---|---|
| admin, fee_bps, fee_collector, paused | Instance | Extend on every admin write; monitored + topped up by ops cron |
| Cancelled(maker, order_id) | Temporary | Set at write to cover max quote lifetime; never extended |
| (auth nonces) | Temporary (managed by the host) | Automatic; lives exactly until signature expiration |

Since Protocol 23, expired **persistent** entries evict to the archive, and archived entries
declared in a transaction's read-write footprint are **restored automatically** (the submitter
re-pays storage rent); simulation surfaces the extra restore cost. The swap contract avoids
per-user persistent state entirely, so its only archival exposure is the contract instance/code
itself, a single entry ops keeps alive. Client SDKs should still budget for the restore case that
simulation reports (it matters for the registry, §5, and for rarely-touched SAC balance entries).

Also note a Protocol-23 throughput nuance: parallel execution clusters transactions by footprint
conflicts, and every fill against maker M touches M's token-balance entries. A very hot single
maker wallet therefore serializes within a ledger; market makers wanting high fill rates should
shard inventory across a few wallets. Worth one paragraph in the maker docs, not a protocol
change.

---

## 5. On-chain design: the `rfq_registry` contract

Deliberately boring: it is a stake-gated phone book.

```rust
#[contracttype]
pub struct MakerConfig {
    pub url: String,               // https:// (or wss://) endpoint
    pub protocols: Vec<u32>,       // e.g. 1 = RequestForQuote-v1
    pub tokens: Vec<Address>,      // supported tokens (bounded; refund basis for eject)
    pub staked: i128,              // total stake held by the registry
}

#[contract]
pub struct RfqRegistry;

#[contractimpl]
impl RfqRegistry {
    pub fn initialize(env: Env, admin: Address, stake_token: Address,
                      base_cost: i128, per_token_cost: i128, max_makers_per_token: u32);

    pub fn set_url(env: Env, maker: Address, url: String);            // stakes base_cost on first call
    pub fn add_tokens(env: Env, maker: Address, tokens: Vec<Address>);   // stakes per_token_cost each
    pub fn remove_tokens(env: Env, maker: Address, tokens: Vec<Address>);// refunds per_token_cost each
    pub fn add_protocols(env: Env, maker: Address, ids: Vec<u32>);
    pub fn eject(env: Env, maker: Address);                           // full unwind + refund

    pub fn get_urls_for_token(env: Env, token: Address) -> Vec<String>;
    pub fn get_maker(env: Env, maker: Address) -> Option<MakerConfig>;
}
```

Design notes:

- **Stake asset:** native XLM via its SAC keeps v1 simple and neutral (AirSwap uses
  chain-appropriate assets per network: AST on Ethereum, WBNB on BSC, and so on; "native asset"
  is squarely in the pattern). Costs are admin-tunable; the bond exists to price spam, not to
  slash.
- **Storage layout:** `Token(Address) → Vec<Address>` (registered makers per token, persistent,
  capped at `max_makers_per_token`, e.g. 100) plus `Maker(Address) → MakerConfig` (persistent).
  Lookups resolve maker addresses to URLs in one read fan-out. All lists are explicitly bounded;
  unbounded `Vec` growth is how Soroban contracts brick themselves against read limits.
- **TTL / rent:** persistent entries get their TTL bumped on every write, and no contract-side
  `extend` function is needed at all, since anyone can extend any entry's TTL with a bare
  `ExtendFootprintTTLOp` transaction operation (an ops cron does this; CAP-78's precise
  `extend_to` semantics make the budgeting clean). If a registry entry does archive anyway,
  Protocol 23 restores it automatically when it appears in a transaction's read-write footprint,
  with the submitter re-paying rent; maker docs tell operators to keep entries warm so takers
  never eat that cost during discovery.
- **Pair intersection happens client-side** (fetch URL sets for both tokens, intersect), exactly
  like AirSwap. The two `get_urls_for_token` calls are free simulated reads via RPC; an indexer
  can additionally cache the whole registry and serve it over HTTP for instant UX, with the chain
  as the source of truth.

---

## 6. Off-chain protocol spec (Stellar RFQ v1, JSON-RPC 2.0)

Kept intentionally close to AirSwap's wire protocol so that existing maker integrations
(MetaMask-style aggregators, MM trading systems) can port with minimal relearning. Same
request/response shapes, same error codes; Stellar-flavored types; and this protocol's
maker/taker vocabulary throughout (AirSwap's "signer" is our maker, its "sender" is our taker),
so `getSignerSideOrderERC20` becomes `getMakerSideOrder` and `getSenderSideOrderERC20` becomes
`getTakerSideOrder`.

**Type conventions:** token and contract identifiers are Soroban contract addresses (`C...`);
maker wallets are `G...` or `C...` (a smart-wallet maker signs its auth entry via
`__check_auth`); taker wallets are `G...` in v1, because the taker must be the transaction
source account and a C-address cannot be one (a smart-wallet taker would need a detached auth
entry; out of scope); amounts are decimal strings in atomic
units (`i128` range; 7 decimals for SAC classic assets; servers must fetch and respect
`decimals()` for custom SEP-41 tokens); `network` is the network passphrase.

### `getMakerSideOrder`: taker sells a fixed amount

Request:
```json
{
  "jsonrpc": "2.0", "id": 1, "method": "getMakerSideOrder",
  "params": {
    "network": "Public Global Stellar Network ; September 2015",
    "swapContract": "CSWAP...RFQ",
    "makerToken":  "CUSDC...SAC",
    "takerToken":  "CXLM...SAC",
    "takerAmount": "10000000000",
    "takerWallet": "GTAKER...",
    "minExpiry": "60"
  }
}
```

Response:
```json
{
  "jsonrpc": "2.0", "id": 1,
  "result": {
    "order": {
      "maker": "GMAKER...", "taker": "GTAKER...",
      "makerToken": "CUSDC...SAC", "makerAmount": "3421000000",
      "takerToken": "CXLM...SAC",  "takerAmount": "10000000000",
      "expiry": "1786924860", "orderId": "8812", "feeBps": 5
    },
    "authEntry": "<base64 SorobanAuthorizationEntry XDR, signed by maker>",
    "signatureExpirationLedger": 59283412,
    "network": "Public Global Stellar Network ; September 2015",
    "swapContract": "CSWAP...RFQ"
  }
}
```

The **single structural change from AirSwap** is here: the `(v, r, s)` ECDSA tuple becomes one
base64 `authEntry` field carrying the maker's signed authorization. Everything the EVM version
proves with EIP-712 (terms, domain, nonce, expiry) is inside that entry, enforced by the Stellar
host rather than by our contract.

### Other methods

- `getTakerSideOrder`: the mirror. The client fixes `makerAmount` (what they want to receive);
  the server fills in `takerAmount`.
- `getPricing(pairs, minExpiry?)` / `getAllPricing()`: indicative pricing; **levels and formula
  formats copied verbatim from AirSwap** (tuples of base-unit amount/price, or `"x*0.1234"`),
  with token contract addresses as pair identifiers.
- `getProtocols` / `getTokens`: capability discovery, unchanged semantics; a server that offers
  WSS (optional; §10 recommends HTTPS-only for v1) pushes `setProtocols` / `setTokens` on
  connect.
- **Errors:** reuse AirSwap's vocabulary wholesale: `-33600` cannot provide order, `-33601` pair
  not traded, `-33602/-33603` amount too low/high, `-33604` invalid params, `-33605` rate
  limited; add `-33700` *taker trustline missing/unauthorized for makerToken* and `-33701`
  *maker inventory temporarily unavailable* in the implementation-specific range.

### Maker server: producing the signed auth entry

The server never hand-assembles XDR. Per quote:

1. Price the request (levels/formula engine + risk checks: inventory, per-order and per-taker
   notional caps, taker trustline pre-check via RPC `getLedgerEntries`).
2. Build the would-be transaction: `invoke swap(order)` with a throwaway source.
3. `simulateTransaction` in **recording mode**: the RPC returns the exact
   `SorobanAuthorizationEntry` required of the maker, including the nested transfer
   sub-invocations.
4. Sign it: `authorizeEntry(entry, makerSigner, signatureExpirationLedger, networkPassphrase)`
   (`@stellar/stellar-sdk`; a KMS/HSM-backed signer callback slots in here; the SDK also ships
   `basicNodeSigner` exposing `signAuthEntry` for the simple case, and Rust servers have
   equivalents).
5. Return `{ order, authEntry }`. Log `(orderId, terms, expiration)` for the risk book and the
   cancel path.

Simulation adds ~100-300ms against a nearby RPC; servers quoting at higher frequency can cache
the invocation-tree template per (pair, direction) and only re-stamp args/nonce/expiration,
falling back to full simulation on contract upgrades.

### Taker flow, end to end

1. **Discover:** simulated reads `get_urls_for_token(makerToken)` and
   `get_urls_for_token(takerToken)`; intersect (or hit the indexer cache).
2. **Fan out** `getMakerSideOrder` to all servers in parallel; 2-3s timeout; drop malformed
   responses.
3. **Validate & select:** re-check economics locally (does `makerAmount` match the request? is
   `feeBps` the on-chain value? is `expiry`/`signatureExpirationLedger` sane? does the decoded
   `authEntry`'s invocation tree match the order?); pick best price exactly like `airswap best`.
4. **Assemble:** build tx with **taker's G-account as source**, op = `swap(order)`, attach the
   maker's `authEntry`; `simulateTransaction` (enforcing) → `assembleTransaction` applies
   footprint + resource fees (and surfaces any restore-preamble requirement).
5. **Sign & submit:** taker signs **one ordinary transaction** with Freighter `signTransaction`
   (or any wallet; because the taker is the source account, **no wallet-side `signAuthEntry`
   support is required**, which maximizes wallet compatibility today) → `sendTransaction` → poll
   `getTransaction`.
6. **Confirm:** success is definitive at `getTransaction`; UX and analytics additionally watch
   the `swap` event (topics `["swap", maker, taker]`, data includes `order_id`) via `getEvents`.

Failure handling: if the maker's entry expired mid-flow (slow user on the wallet prompt),
simulation/submission fails cleanly with an auth error → SDK auto-refreshes the quote and retries
once.

---

## 7. Security analysis

### 7.1 Signature scoping (the one place to be paranoid)

Every economically meaningful field (taker, both tokens, both amounts, expiry, order_id, fee_bps)
sits inside the maker's `require_auth_for_args` tuple. The invariant to enforce in review and
tests: **there must be a deterministic, injective mapping from the authorized args to the funds
that can move.** Any field left out of the tuple is a field an attacker can vary while replaying
the same signature. (This is the Soroban docs' own warning about `require_auth_for_args`, and it
is the port's equivalent of getting the EIP-712 struct hash right.)

Related: the auth preimage includes the network ID, and the entry carries a protocol-consumed
nonce and expiration ledger; cross-network replay, same-network replay, and stale-quote execution
are all dead by construction, with in-contract `expiry` as a second fence.

### 7.2 Cancellation race

Covered in §4.3: identical exposure to AirSwap; mitigated by short quote TTLs and the
temporary-storage cancel flag. Makers additionally bound exposure server-side via the notional
caps in §7.4.

### 7.3 Asset-model hazards specific to Stellar

- **Trustlines:** a G-account taker receiving a classic-asset SAC token must hold a trustline
  (and be authorized, for `AUTH_REQUIRED` assets), or leg 2 fails (atomically and harmlessly,
  but a failed UX). Both maker server (quote-time RPC pre-check → error `-33700`) and taker SDK
  (pre-flight + "add trustline" prompt) check this.
- **Clawback-enabled assets** can be pulled back by issuers post-settlement; surface a per-asset
  warning in the client, as any Stellar DEX must.
- **Decimals:** SAC classic assets are 7 dp; custom SEP-41 tokens are arbitrary. All wire amounts
  are atomic units; the pricing layer converts using on-chain `decimals()`; never hardcode 7.
- **Token contracts are code, and code can lie.** `maker_token` / `taker_token` are
  caller-supplied contract addresses the swap contract *calls*: the classic "arbitrary contract
  call" hazard the Soroban security guidance warns about, and a live one in the wild (the
  Quarkslab audit of the Allbridge Soroban bridge flagged exactly this pattern: an
  attacker-supplied token contract invoked inside a swap path). The signature scheme contains
  most of it (the maker signed both token addresses, so neither party can be *surprised* by a
  substitution), but a maliciously *chosen* token can still no-op its transfer and settle a real
  asset against a hollow one. Atomicity doesn't help when one leg's token is dishonest by design.
  Controls: maker servers quote only their allowlist (they already must, to price); taker clients
  resolve tokens from a curated list, never from raw user-pasted addresses (TrustRFQ's
  `src/core/tokens.ts` is exactly this); the registry is the shared curation point. An
  in-contract allowlist (registry-coupled) is possible but rejected for v1; AirSwap's
  permissionless-token stance is preserved, with curation at the edges. Recorded in §10 as an
  open revisit.
- **Fee-on-transfer / rebasing tokens:** exact-amount settlement assumes `transfer(x)` delivers
  `x`. V1 policy: makers only list well-behaved tokens; same curation machinery as above.

### 7.4 Maker server hardening

Rate limiting per IP/wallet (`-33605`); per-order, per-taker, and rolling-window notional caps
enforced *before* signing; quote/fill ratio monitoring (quote-stuffing detection); signer
isolation (KMS/HSM signer callback, no raw key on the quoting box, with the delegated hot key
added as a weighted account signer so a compromise is revoked with one `setOptions` rather than
being fatal, §4.5); structured
logging of every signed entry for reconciliation against on-chain fills; kill switch that flips
the server to `-33600` and mass-cancels open order_ids.

### 7.5 MEV & fairness

RFQ's core property carries over: the price is fixed by the maker's signature before the
transaction exists, so sandwiching is structurally impossible. On Stellar there is additionally
no public mempool auction dynamic comparable to Ethereum's, and inclusion fees are minor.
Residual risk is quote-side (a maker shading prices), which open multi-server competition (the
whole point of the registry) addresses.

### 7.6 Contract-level checklist

No reentrancy (host-enforced today; don't design assumptions that break if it's ever relaxed:
state changes still precede external calls where possible). Checked i128 math. `initialize`
guarded against re-init. Admin = multisig, `set_fee` capped in code (e.g. ≤ 30 bps), `upgrade`
behind a timelock. Pause switch halts `swap`/`swap_any` but never `cancel`. Events on every state
transition. External audit before Mainnet.

---

## 8. Testing strategy

- **Unit (Rust, `soroban-sdk` testutils):** happy paths with `mock_all_auths`; then *un-mocked*
  auth tests using `env.set_auths(...)` / constructed entries to assert the exact invocation
  trees, including negative tests where a single authorized arg is perturbed (wrong amount, wrong
  taker, wrong fee) and settlement must fail. Expiry boundary
  (`ledger().timestamp() == expiry` passes, `+1` fails), cancel-then-fill, fill-then-cancel, fee
  rounding at 1-stroop dust, paused behavior.
- **Property/fuzz:** `proptest` over amounts/fees for conservation invariants
  (maker+taker+collector balance deltas sum to zero per token; fee = floor(bps)).
- **Integration (testnet):** the full loop: deploy contracts, run reference maker, real
  recording-mode simulation, real `authorizeEntry`, real submission; replay-rejection test
  (submit same entry twice); expiration test (sign with `+2` ledgers, wait, expect auth failure);
  archival test for registry entries (let TTL lapse on a throwaway entry, exercise restore).
- **Server:** JSON-RPC conformance suite (valid/invalid params, every error code), malformed-XDR
  fuzz on anything the server parses, load test to establish quotes/sec and p99 signing latency
  with and without simulation cache.
- **E2E:** Playwright + Freighter through the web app on testnet; SDK contract tests pinned
  against recorded RPC fixtures. (TrustRFQ's `tools/e2e/` mock-Freighter census harness is a
  ready-made starting point.)
- **Chaos:** RPC provider failover, maker timeout mid-fan-out, wallet-prompt delay past
  expiration (auto-refresh path).

---

## 9. Stack summary

| Layer | Choice |
|---|---|
| Contracts | Rust + `soroban-sdk` (pin to current protocol line, P26-compatible), `stellar-cli` for build/deploy/bindings |
| Server | Node 20 + TypeScript, `@stellar/stellar-sdk` (Server RPC client, `authorizeEntry`, `assembleTransaction`), Fastify JSON-RPC, KMS/HSM signer callback |
| Client | `@stellar/stellar-sdk` + generated contract bindings; in TrustRFQ the desk already carries `stellar-wallets-kit` (Freighter) |
| RPC | SDF testnet RPC for dev; self-hosted `stellar-rpc` + commercial provider for mainnet redundancy |
| Indexer | RPC `getEvents` poller → Postgres; Grafana/Prometheus for ops |
| CI/CD | GitHub Actions: contract test+deploy, server/SDK test+publish, testnet e2e nightly |

---

## 10. Key decisions (recorded) & open questions

**Decided:** delegated signing uses Stellar-native account signers, no contract code (corrected
from a direct `authorize`/`revoke` port in the 2026-08-17 audit), with policy-enforcing maker
accounts deferred (§4.5) · auth-entry settlement over in-contract ed25519 (Design A, §2) ·
taker-as-source so takers never need `signAuthEntry` · fee paid by maker in maker_token, bps
bound into the signature, hard-capped in code · exact-amount fill-or-kill semantics, no partials
· temporary-storage cancel flags keyed by (maker, order_id) · registry stakes native XLM with
admin-tunable costs and bounded per-token lists · AirSwap's JSON-RPC wire shapes and error codes retained; methods renamed to this protocol's
maker/taker vocabulary with the `ERC20` suffix dropped, and `-33700`/`-33701` added inside
AirSwap's reserved implementation-specific range · maker server + taker SDK live in a separate repo; contracts
and the taker desk stay in TrustRFQ (this adoption, §11).

**Open:** launch token list and per-asset risk labels (clawback, auth-required) · stake sizing
(spam-pricing vs accessibility) · whether the indexer ships in v1 or the web app reads chain-only
· whether a later version adds a registry-coupled in-contract token allowlist (v1: off-chain
curation, §7.3) · governance/admin custody (start: 2-of-3 multisig + 24h upgrade timelock;
revisit before decentralizing) · WSS at launch or HTTPS-only (recommend HTTPS-only: RFQ's
request-response pattern needs nothing WSS provides, and one transport keeps maker onboarding
simpler) · when to introduce a Cargo workspace under `contracts/` (see §11) · the separate server
repo's name (suggestion: `trustrfq-maker-server`) · scheduling of the implementation phases
(contracts → server → desk integration; not scheduled by this adoption).

---

## 11. Repo fit (TrustRFQ)

This section records how the adopted architecture lands in this repository. Written at adoption
time (2026-08-17, docs only; no code changed).

### What TrustRFQ already has that maps onto this

- **The client settlement path.** `src/core/fill.ts` (`signFillAuth` / `submitFill`, trustline
  handling, enforcing-mode simulate + assemble + submit) and `src/core/canonical.ts` (the
  deterministic signature boundary, pinned by golden vectors in `fixtures/canonical-args.json`).
  The RFQ taker path reuses the same building blocks, and the same determinism discipline applies
  to the future RFQ canonical order encoding: derive everything from the stored order, never from
  `Date.now()`, and pin it with golden vectors.
- **The wallet layer.** `src/wallet/` (the wallets-kit singleton; it satisfies the
  `WalletSigner` interface declared in `src/core/fill.ts`) including
  `authSignature.ts`, the normalizer for the kit's `signAuthEntry` double-encoding bug. Note the
  asymmetry: RFQ **takers never call `signAuthEntry`** (they sign one ordinary transaction as the
  source account), so the RFQ taker path sidesteps that bug entirely. The normalizer stays
  load-bearing for the OTC lane, and for RFQ *makers* if a maker ever signs through a browser
  wallet.
- **The token allow-list.** `src/core/tokens.ts` is exactly the curated-token control §7.3
  requires of taker clients.
- **The runtime-config pattern.** `src/config.ts` + `public/otc-config.js` (`window.*`,
  un-bundled, one-file edit on Testnet reset) extends naturally to the RFQ ids.
- **The E2E harness.** `tools/e2e/` drives two headless browsers with a mock Freighter and
  settles for real on Testnet; it extends naturally to quote-flow E2E.

### What this supersedes

The broadcast/intent layer: `fanOut` in `src/data/broadcasts.ts` (one maker signature copied onto
N order rows) and the `broadcasts` / `rounds` / `intents` tables from
`docs/migrations/2026-07-10-intent-layer.sql`. It is push-fanout to subscribed takers; this
protocol replaces it with pull-quoting from registered makers. **Policy: the layer stays live and
functional until the RFQ protocol ships, and is removed only then.** The migration SQL stays as
long as the schema is live in the production Supabase project. The OTC directed lane (known
counterparty, dual-signed `fill`) is unchanged and permanent.

### `otc_swap` vs `rfq_swap`

The two contracts coexist and differ on purpose. `otc_swap::fill` is symmetric: **both** parties
sign Address-credential auth entries via plain `require_auth()` over the full args, the submit is
permissionless (either party), replay is blocked by a **persistent** `Filled(order_id)` key, and
the contract emits **no events**. `rfq_swap` is asymmetric: only the **maker** pre-signs, via
`require_auth_for_args` over every economic term; the **taker authorizes as the transaction
source** (no detached signature at all); cancel flags live in **temporary** storage; the contract
emits events, charges an optional protocol fee, and pairs with a registry. Do not blur the two
models: the OTC settlement invariants apply to `otc_swap` only, and `rfq_swap` will get its
own invariants block when it is implemented. Build note: `contracts/otc_swap` is a standalone
crate today (no Cargo workspace; its `[profile.release]` lives in its own manifest). Adding
`rfq_swap` and `rfq_registry` is the natural moment to introduce a workspace, which also moves
`[profile.release]`, relocates `Cargo.lock` / `target/`, and changes the documented
`--manifest-path` commands. Recorded as an open question in §10.

### Repo split

Contracts (`contracts/`) and the taker client (this SPA, the desk) stay in TrustRFQ. The maker
quote server and the taker SDK go in a **separate repo**, mirroring AirSwap's
`airswap-ref-server`. This reaffirms the decision recorded in
`docs/superpowers/specs/2026-07-10-react-ts-frontend-migration-design.md` (lines 44 and 56: the
quote server is a separate repo, and the RFQ protocol justifies no server runtime here), and the
CLAUDE.md Stack section has said "their quote server is a separate deployable, and so will ours
be" since the React migration.

### Build-phase touchpoints (recorded now so nothing is rediscovered)

None of these change at adoption time; all of them change when implementation starts.

- **CSP:** `vercel.json` `connect-src` must gain every maker-server origin the desk will query
  (the CSP is an allow-list; the browser silently blocks unlisted origins). Registry reads use
  the already-allowed RPC origin.
- **Redirect:** the `/intent` → `/otc` redirect in `vercel.json` retires together with the
  broadcast layer, not before.
- **Runtime config:** `src/config.ts` + `public/otc-config.js` gain `RFQ_SWAP_CONTRACT_ID` and
  `RFQ_REGISTRY_ID` following the `OTC_CONTRACT_ID` pattern; both join the quarterly
  Testnet-reset checklist alongside `OTC_CONTRACT_ID` and `REFLECTOR_ORACLE_ID`.
- **Test wiring:** no npm script runs cargo today (contract tests are documented commands); the
  vitest `include` in `vite.config.ts` covers only `src/**`, so shared TS protocol code must land
  under `src/` or bring its own suite.
