<h1 align="center">TrustRFQ</h1>

<p align="center"><strong>A signed-quote RFQ protocol for Stellar, and the reference desk that demonstrates it.</strong></p>

<p align="center">
  Makers run their own quote servers. Takers pull firm, pre-signed quotes and settle on-chain with one signature.<br>
  No order book, no middleman, no slippage: the price that settles is the price that was signed.
</p>

<p align="center">
  <a href="#what-this-is">What this is</a> •
  <a href="#how-an-rfq-trade-settles">How a trade settles</a> •
  <a href="#protocol-components">Components</a> •
  <a href="#deployments-testnet">Deployments</a> •
  <a href="#what-is-proven-and-what-is-not">Status</a> •
  <a href="#getting-started">Getting started</a> •
  <a href="#roadmap">Roadmap</a>
</p>

---

## What this is

TrustRFQ is a port of [AirSwap](https://www.airswap.io)'s request-for-quote model to
[Stellar](https://stellar.org) and its Soroban smart contracts. It is built as a **protocol, not a
trading interface**: the deliverable is a settlement contract, a maker registry, and a wire format
that any maker server or DEX aggregator can speak. The web desk in this repository exists to prove
that the protocol works end to end, not to acquire traders.

**The problem it addresses.** Stellar has liquid venues for small trades and nothing for size. Two
measurements in [`tools/`](tools/) make this concrete, both against public mainnet endpoints:

- [`tools/slippage/`](tools/slippage/README.md) samples what a trader actually receives from
  Horizon's path finder (order book and AMM pools combined) at increasing sizes, repeated across
  hours and weekdays to locate the floor.
- [`tools/tradesize/`](tools/tradesize/README.md) reconstructs taker orders from two weeks of
  mainnet trade history (2026-08-20 to 2026-09-03: 1.28 million XLM/USDC trade records folded
  into 1.25 million taker operations, cross-checked against `/trade_aggregations` at 0.00%
  delta). 86% of operations were under $1; above $20,000 there was exactly one market order.
  Size is expensive, so it does not happen.

**The model.** A maker quotes off-chain and pre-signs the exact terms. The taker verifies the
quote locally, then submits a single transaction that the settlement contract executes atomically.
Nobody rests an order in public, nobody moves first, and nobody in the middle can alter a term.

Three settled design decisions shape everything below:

1. **Asymmetric authorization.** The maker signs a detached Soroban authorization entry over every
   economic term. The taker authorizes by being the transaction source, so the taker's ordinary
   envelope signature is its consent and it never signs an auth entry. This is what makes an RFQ
   fill cost the taker exactly one wallet prompt.
2. **Maker-paid fee, 10 bps, capped at 30 bps in code.** The taker receives the full quoted amount.
3. **On-chain discovery.** Makers post a refundable XLM stake to list their quote-server URL per
   token in `rfq_registry`; any client finds them with a free read-only call.

## How an RFQ trade settles

```
  Taker (desk or SDK)            rfq_registry (on-chain)           Maker quote server
        │                                 │                                 │
        │  get_urls_for_token × 2 ───────▶│                                 │
        │◀──────── maker URLs ────────────│                                 │
        │                                                                   │
        │  getMakerSideOrder  (JSON-RPC 2.0, parallel fan-out, 3 s) ───────▶│
        │◀──────── order + maker-signed authorization entry ────────────────│
        │                                                                   │
        │  validate locally, fail closed (terms, fee, expiry, auth tree)
        │  rank quotes by price
        │
        │  sign ONE transaction ──▶  rfq_swap.swap(order)
        │                            ├─ maker_token: maker ─▶ taker (full amount)
        │                            ├─ taker_token: taker ─▶ maker
        │                            └─ fee (10 bps of maker_token): maker ─▶ fee collector
```

1. **Discover.** The taker reads `get_urls_for_token` for both legs of the pair and intersects the
   two lists. Unreachable, slow (over 3 s) or malformed makers are dropped silently.
2. **Quote.** Each maker gets the same `getMakerSideOrder` request in parallel and answers with a
   complete `Order` plus its detached signature, scoped with `require_auth_for_args`.
3. **Validate.** Before any wallet prompt, the quote is checked against things the maker does not
   control: the taker's own request, the live `get_config` fee, the token allow-list, expiry, the
   entry's ledger expiration, and the decoded invocation tree of the maker's own signature. Any
   check that cannot positively pass is a rejection.
4. **Settle.** The taker signs one transaction. `swap` verifies the maker's entry, moves both
   legs and the fee, and emits a `SwapExecuted` event the desk confirms against.

Replay is handled by the Soroban host: a signed entry carries a nonce the host consumes, so the
same quote cannot settle twice (proven live, the replay was rejected with
`Error(Auth, ExistingValue)`). `expiry` and `signature_expiration_ledger` bound a quote's life to
its 30 to 90 second window, and a maker can `cancel` order ids early.

## Protocol components

| Component | Where | What it is |
|-----------|-------|------------|
| `rfq_swap` | [`contracts/rfq_swap/`](contracts/rfq_swap/) | Settlement. `swap` / `cancel` / `is_cancelled` / `get_config`, plus admin `set_fee` (capped), `set_fee_collector`, `set_paused`, `upgrade`. 17 unit tests; the argument-binding tests are mutation-verified (unbinding a field in the contract turns them red). |
| `rfq_registry` | [`contracts/rfq_registry/`](contracts/rfq_registry/) | Stake-gated maker phone book, ported from AirSwap's `Registry.sol`. `set_url` stakes a base cost, `add_tokens` stakes per token, `eject` refunds the whole stake. Bounded lists (32 tokens and 8 protocols per maker, an admin-tunable cap of makers per token, URLs at most 256 bytes). No `upgrade` entry point on purpose: the contract escrows other people's stake. 60 unit tests. |
| Stellar RFQ v1 wire | [`src/core/rfq/wire.ts`](src/core/rfq/wire.ts), spec [§6](docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md) | JSON-RPC 2.0 with maker/taker naming. `getMakerSideOrder(network, swapContract, makerToken, takerToken, takerAmount, takerWallet, minExpiry)` returns `{ order, authEntry, signatureExpirationLedger }`. Amounts are decimal strings. Error codes reuse AirSwap's vocabulary (`-33600` cannot provide order through `-33605` rate limited). |
| Taker core | [`src/core/rfq/`](src/core/rfq/) | Pure, SDK-shaped modules: `order.ts` (the on-chain `Order` encoding, golden-vector pinned), `validate.ts` (the fail-closed gate, anchored to a captured real maker auth-entry tree), `discover.ts` (URL intersection and tie-stable price ranking), `settle.ts` (one-signature settlement; its signer interface exposes only `signTransaction`, so a detached taker signature is structurally impossible). [`src/data/rfqNetwork.ts`](src/data/rfqNetwork.ts) is the single network call site. The separate-repo taker SDK extracts from these. |
| Stub maker | [`tools/e2e/stub-maker.mjs`](tools/e2e/stub-maker.mjs) | A faithful local maker server for the E2E harness: registers on the live Testnet registry with a real stake, produces its `authEntry` the way a production server must (recording-mode simulation, then `authorizeEntry`), and exposes failure knobs (slow, malformed, refused, drifted terms, wrong fee, short TTL) so the taker's validation is proven against really-signed bad quotes. |

The production maker quote server and the taker SDK live in a **separate repository** by design;
this repo never grows a server runtime.

## The desk

[`otc.html`](otc.html) → [`src/`](src/) is a client-only React + TypeScript SPA (Vite), Freighter
wallet only, Stellar Testnet only. The connected wallet is the identity; there is no sign-in.
Four sections:

| Section | Lane | What happens |
|---------|------|--------------|
| **RFQ** | RFQ protocol | Pick a pair and a sell amount. The panel discovers makers via the registry, fans out for quotes, shows them ranked by price with live countdowns and a manual **Refresh quotes**, and settles the chosen one with a single `signTransaction` prompt. It writes nothing off-chain. |
| **New order** | Directed OTC (permanent) | Compose an offer for one specific `G…` address. Leaving the counterparty empty broadcasts it instead (see below). |
| **Incoming** / **Sent** | Directed OTC | Every offer is a negotiation thread: Accept, Decline or Counter on the amounts, live over Supabase Realtime. Accepted terms settle through `otc_swap`. |

**Directed OTC** is the lane for two parties who already know each other. It settles today on the
separate `otc_swap` contract, a **two-signature symmetric swap**: both parties sign detached
authorization entries over the exact `fill` arguments, and anyone may submit the transaction.
Decided 2026-08-19: this lane will move onto `rfq_swap` as a mode (the taker supplies a detached
entry instead of being the source, and the order gains a signed `require_fill_guard` flag), and
`otc_swap` retires. Until that cut-over, `otc_swap` stays deployed and fee-free.

**Broadcast** (an offer with no counterparty, fanned out to takers subscribed to the pair) is an
interim mode that predates the protocol. It stays live until a real maker server closes the RFQ
loop, then it is removed.

The compose ticket also shows an advisory **fair-price hint** read from the
[Reflector](https://reflector.network) oracle through a read-only simulation. It is never signed
and never on the settlement path.

### Supported assets

| Asset | Details |
|-------|---------|
| XLM | Native; no trustline needed |
| USDC | Classic asset used through its Stellar Asset Contract; the receiver needs a trustline |

Token SAC ids are derived in-app from the asset and network passphrase. Only allow-listed assets
([`src/core/tokens.ts`](src/core/tokens.ts)) can be rendered, signed or settled.

> **Demo-only issuer.** The USDC entry currently points at a self-issued Testnet asset so block-size
> demos can be minted freely. Restore Circle's Testnet issuer in `tokens.ts` (both ids are in the
> comment above the allow-list, and two tests pin it) before any other use.

## Deployments (Testnet)

| Contract | Id | Notes |
|----------|----|-------|
| `rfq_swap` | `CCNP7626WIJVWVTBPLPG6QM77TY6JBU42D4PYONUFTDEPIIW6ZFJQIDT` | Fee 10 bps, maker-paid. Deployed 2026-08-18. |
| `rfq_registry` | `CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G` | `base_cost` 100 XLM, `per_token_cost` 10 XLM, 100 makers per token. Deployed and initialized 2026-08-26. |
| `otc_swap` | `CCAPYEWHYSGORPUOC7FBSIRBIWSJJSPJOIWPJNEZLGDXUWJVWV7MTKBJ` | Directed OTC lane. Deployed bytecode matches source (wasm `83f60b85…`). |
| Reflector oracle | `CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63` | Advisory fair price only. |

All four ids live in [`public/otc-config.js`](public/otc-config.js) and are typed in
[`src/config.ts`](src/config.ts). `rfq_swap`'s id will change once the single-contract
consolidation reshapes the `Order` struct.

Hosted demo: https://trustrfq.vercel.app (currently runs the OTC lane; the RFQ section is not
deployed there yet). Demo video:
https://drive.google.com/file/d/1vho_-MLwHPmhuG_rzhkRNgtZAbzydyuG/view?usp=sharing

## What is proven, and what is not

Everything listed as proven settled real value on Stellar Testnet and can be re-run from this repo.

**Proven**

- **The asymmetric authorization model.** A maker's detached `Address`-credential entry and a
  taker's `SourceAccount` credential settle in one transaction, with no taker auth entry at all
  ([tx `49fa69b2…`](https://stellar.expert/explorer/testnet/tx/49fa69b2258d551b0a1a86b551312be6a6f21c49bf3cab314b80717303ecc4f2),
  2026-08-18). Replaying the same signed entry was rejected by the host.
  Re-run: `node tools/rfq-live-swap.mjs`.
- **Registry lifecycle.** Register, add tokens, discover by token, `get_maker`, eject with an exact
  full refund, plus a read-cost probe showing `get_urls_for_token` at the 100-maker cap uses about
  2.6% of Testnet's per-transaction instruction budget.
  Re-run: `node tools/rfq-registry-live.mjs`.
- **The full taker path, one signature.** A headless taker discovers the stub maker through the
  live registry, receives a signed quote, validates it and settles with exactly one
  `signTransaction` prompt, measured as `promptsByType { REQUEST_ACCESS: 1, SUBMIT_TRANSACTION: 1 }`
  ([tx `90cd51d6…`](https://stellar.expert/explorer/testnet/tx/90cd51d6307fe407c629aff051cd3e556be4e37233109d727783f2461fa491cc),
  2026-09-09). The same run exercises nine scenarios: the happy path, five really-signed bad quotes
  (slow, malformed, refused, drifted economics, wrong fee) that must never become a selectable row
  and must cost zero wallet prompts, and three discovery cases (zero makers, two makers with
  different prices ranked correctly, a quote dropping off the list when its countdown ends).
  Re-run: `node tools/e2e/rfq-driver.mjs`.
- **Directed OTC, two real wallets.** A cross-asset 10 XLM ↔ 1 USDC trade negotiated and settled
  through two Freighter wallets
  ([tx `af0392ff…`](https://stellar.expert/explorer/testnet/tx/af0392ff49ac9478a95fd8059bc64f62fd715d1de84d16d4acd912c5268a63aa),
  2026-07-14), and the same flow automated with a mock Freighter counting every click and prompt
  (maker 11 clicks / 4 prompts, taker 7 / 3). Re-run: `npm run e2e:census`.

**Not yet**

- **No production maker server exists.** Every RFQ proof above ran against the stub maker. The
  milestone gate is a live quote from a real maker server (separate repo) settled on Testnet.
- **The deployed site cannot reach maker servers.** `connect-src` in [`vercel.json`](vercel.json)
  allows only RPC, Horizon and Supabase; maker origins are not in the CSP yet.
- **Trustline pre-flight and the expired-entry retry** on the RFQ accept path are in progress.
- **Single-contract consolidation** (`rfq_swap` settling both lanes, `otc_swap` retired) is
  decided, not built. `swap_any` open orders and an events indexer are deferred.
- **Testnet only, unaudited.** Do not use with real funds.

## Repository layout

```
TrustRFQ/
├── contracts/                  # Cargo workspace (profile.release lives here, members inherit it)
│   ├── rfq_swap/               # RFQ settlement: swap / cancel / get_config + admin (17 tests)
│   ├── rfq_registry/           # Stake-gated maker discovery (60 tests)
│   └── otc_swap/               # Two-signature symmetric fill for the directed lane (6 tests)
├── otc.html                    # The single Vite entry
├── src/
│   ├── core/rfq/               # Taker core: wire, order encoding, validate, discover, settle
│   ├── core/                   # Directed-lane logic: canonical args, fill, tokens, pairs, oracle
│   ├── data/                   # Supabase queries + realtime hooks; rfqNetwork.ts (registry reads, fan-out)
│   ├── ui/                     # RfqPanel, Ticket, ThreadView, OrderCard, SettlementStrip, ...
│   ├── wallet/                 # Wallets Kit (Freighter) + signAuthEntry encoding normaliser
│   └── config.ts               # The one reader of window.* runtime config
├── public/                     # Landing page, stylesheets, otc-config.js, supabase-config.js
├── fixtures/                   # Golden vectors: OTC canonical args, RFQ order encoding, captured auth tree
├── tools/
│   ├── rfq-live-swap.mjs       # Live proof of the rfq_swap auth model
│   ├── rfq-registry-live.mjs   # Live proof of the registry lifecycle + read-cost probe
│   ├── e2e/                    # Headless two-browser census, mock Freighter, stub maker, RFQ driver
│   ├── slippage/               # Mainnet slippage-at-size measurement (scheduled, forward in time)
│   └── tradesize/              # Mainnet trade-size distribution (retroactive sweep)
├── docs/
│   ├── migrations/             # Supabase SQL: base schema, intent layer
│   └── superpowers/specs/      # Dated design specs; 2026-08-17 = the adopted RFQ architecture
└── vercel.json                 # Build, rewrites, strict CSP + security headers
```

## Getting started

### Prerequisites

- Node ≥ 20.19
- For contracts: Rust with the `wasm32v1-none` target and the
  [Stellar CLI](https://developers.stellar.org/docs/tools/cli) (v27)
- A [Freighter](https://freighter.app) wallet funded on Testnet

### Install and run

```bash
git clone https://github.com/acakbin1881/TrustRFQ.git
cd TrustRFQ
npm install
npm run dev          # http://localhost:5173/otc.html
```

### Tests

```bash
npm test                                          # vitest: 12 files, 167 tests
cargo test --manifest-path contracts/Cargo.toml   # 83 tests: rfq_swap 17 + rfq_registry 60 + otc_swap 6
npm run build                                     # tsc --noEmit && vite build → dist/
```

The TypeScript suite includes three golden-vector fixtures that pin byte-exact encodings: the
directed lane's `fill` arguments, the RFQ `Order` (Soroban encodes struct fields as a sorted
symbol map, not in declaration order), and the decoded invocation tree of a real maker signature.
If any of them drifts, the maker's signature stops matching and settlement reverts, so trust the
red test.

### Configuration

Runtime config is deliberately not bundled: it is two plain `window.*` scripts, so a Testnet reset
is a one-file edit on the deployed site, not a rebuild.

- [`public/otc-config.js`](public/otc-config.js): `RPC_URL`, `HORIZON_URL`, `NETWORK_PASSPHRASE`,
  `RFQ_SWAP_CONTRACT_ID`, `RFQ_REGISTRY_ID`, `OTC_CONTRACT_ID`, `REFLECTOR_ORACLE_ID`. An empty
  id silently disables the feature that needs it.
- [`public/supabase-config.js`](public/supabase-config.js): Supabase URL + anon key (directed lane
  and broadcasts only; the RFQ lane uses no database).

For a fresh Supabase project run, in the SQL Editor, first
[`docs/migrations/00-base-schema.sql`](docs/migrations/00-base-schema.sql) and then
[`docs/migrations/2026-07-10-intent-layer.sql`](docs/migrations/2026-07-10-intent-layer.sql).

### Build and deploy the contracts

```bash
rustup target add wasm32v1-none
cd contracts && stellar contract build          # → target/wasm32v1-none/release/*.wasm

# rfq_swap: constructor args are required
stellar contract deploy \
  --wasm target/wasm32v1-none/release/rfq_swap.wasm \
  --source-account <identity> --network testnet \
  -- --admin <G…> --fee-bps 10 --fee-collector <G…>

# rfq_registry: NO constructor. Deploy, then initialize in a second call.
stellar contract deploy \
  --wasm target/wasm32v1-none/release/rfq_registry.wasm \
  --source-account <identity> --network testnet
stellar contract invoke --id <NEW_ID> --source-account <identity> --network testnet -- \
  initialize --admin <G…> --stake-token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
  --base-cost 1000000000 --per-token-cost 100000000 --max-makers-per-token 100
stellar contract invoke --id <NEW_ID> --source-account <identity> --network testnet -- get_config   # admin must read back as yours

# otc_swap (directed lane)
stellar contract deploy \
  --wasm target/wasm32v1-none/release/otc_swap.wasm \
  --source-account <identity> --network testnet
```

Paste the printed `C…` ids into `public/otc-config.js`. Two things to know before you do:

- `rfq_registry` has a re-init guard and no `upgrade`, so an `initialize` that lands with the
  wrong admin is permanent. Read `get_config` back before you publish the id.
- The `rfq_swap` fee collector must hold a trustline for every non-native token a fee can be
  charged in (the fee is paid in `maker_token`). On this deployment that meant opening a USDC
  trustline for the collector once.

### Prove it on Testnet

```bash
node tools/rfq-live-swap.mjs        # one RFQ swap with mixed credentials, then a replay that must fail
node tools/rfq-registry-live.mjs    # register → discover → eject, exact refund, read-cost probe
```

Both scripts create throwaway actors through Friendbot and need no key file.

### Run the headless E2E

```bash
npm run build && npm run preview -- --port 4173     # terminal 1

node tools/e2e/rfq-driver.mjs                       # RFQ lane: spawns the stub maker, 9 scenarios,
                                                    # settles for real, report in tools/e2e/out/
npm run e2e:census                                  # directed OTC lane, two browsers, click census
```

The harness drives the built app through a mock Freighter (a postMessage shim, no extension) so
every wallet prompt is counted, not assumed. Two things the RFQ run needs that a fresh clone does
not have:

- the gitignored `demo-keys.json` (the stub maker sells the demo USDC issuer's asset, so it reads
  the issuer secret from there; see `tools/derive-keys.mjs` and `tools/mint-usdc.mjs`);
- Testnet XLM: the stub maker creates a throwaway keypair through Friendbot and stakes real XLM
  to register. It ejects for a full refund on SIGINT/SIGTERM; a hard kill leaves a staked, dead
  entry on the registry.

### Try the desk by hand

Two funded Testnet wallets, two browsers. Start with XLM ↔ XLM to avoid trustlines.

- **Directed OTC:** wallet A composes a New order to wallet B's address; B sees it live in Incoming
  and Accepts or Counters; both press **Sign order**; either presses **Settle now**. One `fill`
  moves both legs. On a cross-asset order the taker cannot sign until the maker's trustline exists,
  so the maker signs first.
- **RFQ:** open the RFQ section, choose a pair and amount, **Refresh quotes**. You need a maker
  registered for both tokens; `STUB_MAKER_PORT=4174 node tools/e2e/stub-maker.mjs` gives you one
  (same `demo-keys.json` requirement as above; it prints `STUB_MAKER_READY` once registered).
  Accept a row and confirm the single wallet prompt.

## Security model

- **The signature over the full terms is the integrity boundary.** In `rfq_swap` the maker's
  entry is scoped with `require_auth_for_args` over the whole `Order`, and the taker is the source
  account. A changed amount, token, counterparty or fee has no valid signature, so `swap` reverts.
  `otc_swap` gets the same property from two `require_auth()` calls over the `fill` arguments.
- **The taker never trusts the maker server.** Quotes are validated fail-closed against the
  taker's own request, the contract's live config and the maker's own signed invocation tree,
  before a wallet prompt exists.
- **The fee cannot be raised past 30 bps** by anyone, including the admin: the cap is a constant.
- **The registry cannot spend stake.** `eject` refunds exactly what was recorded; there is no
  admin path to staked funds and no `upgrade`.
- **The database is untrusted.** Supabase coordinates the directed lane's UI state with the anon
  key; it holds no authority. Reads are public, an accepted Testnet-MVP risk. A column-scoped grant
  freezes an order's addresses, tokens, expiration and nonce after insert.
- **Token quarantine.** Only allow-listed assets render or sign; a look-alike asset with another
  issuer is blocked.
- **Strict headers.** Allow-list CSP with no inline or CDN scripts, HSTS, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`.
- **A known wallet-kit quirk is contained.** `@creit.tech/stellar-wallets-kit` 1.9.5 double-encodes
  the signature returned by `signAuthEntry`; [`src/wallet/authSignature.ts`](src/wallet/authSignature.ts)
  normalises it so the core never sees it. The RFQ taker path is unaffected because it never
  calls `signAuthEntry`.

> **Disclaimer:** Testnet only. Not audited. Do not use with real funds.

## Roadmap

**Milestone 1: full RFQ loop on Testnet.** Done when a desk taker discovers a real maker through
the registry, receives a live quote from the maker's own server, and settles it.

- [x] `rfq_swap` built, deployed, proven (2026-08-18)
- [x] Phase 1: `rfq_registry` built, deployed, proven, wired into config (2026-08-26)
- [ ] Phase 2: desk taker path. Discovery, validated fan-out, ranked quotes, one-signature
      settlement all proven against the stub maker (2026-09-09). Remaining: trustline pre-flight,
      expired-entry retry, maker origins in the CSP, RFQ driver folded into `npm run e2e:census`
- [ ] Phase 3: the same loop against a real maker server (separate repo). Milestone gate
- [ ] Phase 4: retire the interim broadcast fan-out; the directed lane is untouched

**After the milestone**

- [ ] Single settlement contract: `rfq_swap` serves both lanes via a signed `require_fill_guard`
      flag (persistent filled key for long-lived directed offers, host nonce only for short-lived
      quotes); `otc_swap` retires. New wasm, new id
- [ ] Taker SDK extracted from `src/core/rfq/` and a reference maker server (separate repo)
- [ ] Aggregator integrations (the distribution path for a protocol with no end-user acquisition)
- [ ] `swap_any` open orders, events indexer, Sign-In-With-Stellar for per-wallet RLS
- [ ] External audit, then Mainnet

Design record: [`docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md`](docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md)
(with the 2026-08-19 single-contract amendment at the top). Earlier specs in the same folder are
historical.

## License

[MIT](LICENSE). No warranty.

<p align="center"><sub>Rust + Soroban on Stellar · React + TypeScript · built as a protocol first</sub></p>
