<div align="center">

<img src="public/favicon.svg" alt="TrustRFQ" width="72" height="72">

<h1>TrustRFQ</h1>

<p><strong>A signed-quote RFQ protocol for Stellar</strong><br>
Makers run their own quote servers. Takers pull firm, pre-signed quotes and settle on-chain with a single signature.</p>

<p>
<a href="https://trustrfq.vercel.app"><strong>Live desk »</strong></a>
&nbsp;·&nbsp;
<a href="https://drive.google.com/file/d/1vho_-MLwHPmhuG_rzhkRNgtZAbzydyuG/view?usp=sharing"><strong>Demo video »</strong></a>
&nbsp;·&nbsp;
<a href="docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md"><strong>Protocol spec »</strong></a>
</p>

</div>

---

<details>
<summary><strong>Table of Contents</strong></summary>

1. [About the project](#about-the-project)
2. [Features](#features)
3. [Live demo](#live-demo)
4. [Architecture](#architecture)
5. [How it works](#how-it-works)
6. [Protocol parameters](#protocol-parameters)
7. [Built with](#built-with)
8. [Contract addresses](#contract-addresses)
9. [Project structure](#project-structure)
10. [Getting started](#getting-started)
11. [What is proven, and what is not](#what-is-proven-and-what-is-not)
12. [Roadmap](#roadmap)
13. [Security](#security)
14. [License](#license)
15. [Acknowledgments](#acknowledgments)
16. [Why RFQ](#why-rfq)

</details>

---

## About the project

**TrustRFQ** is a port of [AirSwap](https://www.airswap.io)'s request-for-quote model to
[Stellar](https://stellar.org) and its Soroban smart contracts. A maker quotes off-chain and
pre-signs the exact terms; the taker verifies that quote locally and submits one transaction that
settles both legs atomically. No order book, so no slippage and no leaked intent: the price that
settles is the price that was signed.

It is built as a **protocol, not a trading interface**. The deliverable is a settlement contract, a
maker registry, and a wire format that any maker server or DEX aggregator can speak. The web desk
in this repository exists to prove the protocol works end to end, not to acquire traders.

**Where it stands.** The settlement contract and the maker registry are deployed and proven on
Stellar Testnet, and the desk's taker path settles a discovered quote with a single wallet prompt.
What is missing is a production maker server, which lives in a separate repository and is the
milestone gate. Full detail in [What is proven, and what is not](#what-is-proven-and-what-is-not).

### Why this exists

Stellar has liquid venues for small trades and nothing for size. Both halves of that claim are
measured against public mainnet endpoints by tools in this repo, not asserted:

| | |
|---|---|
| **Size is expensive** | [`tools/slippage/`](tools/slippage/README.md) samples what a trader actually receives from Horizon's path finder (order book and AMM pools combined) at increasing sizes, repeated across hours and weekdays to locate the floor rather than a lucky moment. |
| **So size does not happen** | [`tools/tradesize/`](tools/tradesize/README.md) folds two weeks of mainnet trade history into taker orders: 1.28M XLM/USDC trade records, 1.25M operations, cross-checked against `/trade_aggregations` at 0.00% delta. 86% of operations were under $1. Above $20,000 there was exactly **one** market order. |
| **An RFQ quote is neither** | The price is agreed before anything is signed, and the signature covers every economic term, so the fill cannot drift from the quote. |

### Three decisions that shape everything

1. **Asymmetric authorization.** The maker signs a detached Soroban authorization entry over every
   economic term. The taker authorizes by being the transaction source, so the taker's ordinary
   envelope signature is its consent and it never signs an auth entry. This is what makes an RFQ
   fill cost the taker exactly one wallet prompt.
2. **Maker-paid fee, 10 bps, capped at 30 bps in code.** The taker receives the full quoted amount,
   and no admin key can raise the cap.
3. **On-chain discovery.** Makers post a refundable XLM stake to list their quote-server URL per
   token; any client finds them with a free read-only call.

---

## Features

### For takers

- **One wallet prompt per fill.** Discovery, quoting and validation all happen before anything is
  signed; accepting a quote costs a single `signTransaction`.
- **Quotes are verified, not trusted.** Every quote is checked fail-closed against the taker's own
  request, the contract's live fee, the token allow-list, expiry, the entry's ledger expiration,
  and the decoded invocation tree of the maker's own signature.
- **Ranked comparison.** Quotes from every reachable maker arrive in parallel and render ranked by
  price, with live countdowns and a manual refresh.
- **Nothing to trust in the middle.** The taker builds and submits the transaction itself; there is
  no relayer and no custody.

### For makers

- **Quote from your own endpoint.** The maker server is the maker's own infrastructure, never a
  middleman. It speaks JSON-RPC 2.0 and answers a single method.
- **Stake to be discoverable, eject to get it all back.** Registration is a spam price, not a
  slashing bond: `eject` refunds the full recorded amount.
- **Cancel before expiry.** A quoted `order_id` can be cancelled on-chain, and quotes expire on
  their own within seconds.
- **No approvals.** Soroban authorization replaces the ERC-20 allowance step entirely.

### For integrators

- **The taker logic is SDK-shaped.** Discovery, order encoding, validation and settlement are pure
  modules with no wallet, network or browser dependency; the separate-repo SDK extracts from them.
- **Byte-exact encodings are pinned.** Three golden-vector fixtures lock the wire and on-chain
  formats so a drift fails a test instead of a settlement.
- **Everything is re-runnable.** Each claim in this README names the command that reproduces it
  against live Testnet.

---

## Live demo

| | |
|---|---|
| **Desk** | https://trustrfq.vercel.app |
| **Video** | [Walkthrough of a trade settling on Testnet](https://drive.google.com/file/d/1vho_-MLwHPmhuG_rzhkRNgtZAbzydyuG/view?usp=sharing) |
| **Network** | Stellar Testnet only. Connect [Freighter](https://freighter.app) with a funded Testnet account. |

The RFQ section runs locally against a maker server. The deployed site cannot reach one yet,
because maker origins are not in its CSP.

---

## Architecture

```
                        ┌──────────────────────────────────────────┐
                        │            Stellar Testnet               │
                        │                                          │
   ┌───────────┐        │   ┌────────────────┐  ┌───────────────┐  │
   │  Maker    │ stake  │   │  rfq_registry  │  │   rfq_swap    │  │
   │  quote    │───────▶│   │  who quotes    │  │  settlement   │  │
   │  server   │        │   │  what, where   │  │  + 10bps fee  │  │
   └─────┬─────┘        │   └───────┬────────┘  └───────▲───────┘  │
         │              │           │                   │          │
         │              └───────────┼───────────────────┼──────────┘
         │                          │ read-only         │ one signed tx
         │  JSON-RPC 2.0            │ simulation        │
         │  signed quote            │                   │
         │                    ┌─────┴───────────────────┴─────┐
         └───────────────────▶│      Taker (desk or SDK)      │
                              │  discover → quote → validate  │
                              └───────────────────────────────┘

   Separate repo                        This repo
```

Three moving parts, and only two of them live here:

- **`rfq_swap`** verifies the maker's signature and moves both legs plus the fee, atomically.
- **`rfq_registry`** answers "who quotes this token, and at what URL" for a free read-only call.
- **The maker quote server** is the maker's own deployable and belongs in a separate repository by
  design; this repo never grows a server runtime. A faithful stub maker
  ([`tools/e2e/stub-maker.mjs`](tools/e2e/stub-maker.mjs)) stands in for it during tests.

The desk is a client-only React + TypeScript SPA. Its RFQ taker logic lives in pure modules
([`src/core/rfq/`](src/core/rfq/)) with a single network call site
([`src/data/rfqNetwork.ts`](src/data/rfqNetwork.ts)), so the same code lifts into the SDK unchanged.

---

## How it works

### From request to settlement

```
  Taker                        rfq_registry                  Maker quote server
    │                                │                                │
    │  get_urls_for_token × 2 ──────▶│                                │
    │◀──────── maker URLs ───────────│                                │
    │                                                                 │
    │  getMakerSideOrder  (parallel fan-out, 3s timeout) ────────────▶│
    │◀──────── order + maker-signed authorization entry ──────────────│
    │                                                                 │
    │  validate locally, fail closed
    │  rank by price
    │
    │  sign ONE transaction ──▶  rfq_swap.swap(order)
    │                            ├─ maker_token: maker ─▶ taker (full amount)
    │                            ├─ taker_token: taker ─▶ maker
    │                            └─ fee (10 bps of maker_token) ─▶ collector
```

1. **Discover.** The taker reads `get_urls_for_token` for both legs of the pair and intersects the
   two lists. Unreachable, slow (over 3 seconds) or malformed makers drop out silently.
2. **Quote.** Every maker receives the same `getMakerSideOrder` request in parallel and answers
   with a complete `Order` plus a detached signature scoped with `require_auth_for_args`.
3. **Validate.** Before a wallet prompt exists, the quote is checked against things the maker does
   not control: the taker's own request, the live `get_config` fee, the token allow-list, expiry,
   the entry's ledger expiration, and the decoded invocation tree of the maker's own signature.
   Anything that cannot be positively verified is rejected.
4. **Settle.** The taker signs one transaction. `swap` verifies the maker's entry, moves both legs
   and the fee, and emits a `SwapExecuted` event the desk confirms against.

**Replay and staleness.** The Soroban host consumes a nonce carried by the signed entry, so the
same quote cannot settle twice (proven live: the replay was rejected with
`Error(Auth, ExistingValue)`). `expiry` and `signature_expiration_ledger` bound a quote to its 30
to 90 second window, and a maker can `cancel` order ids early.

### The desk

The desk is the reference client, not the product. Its **RFQ** section is the whole protocol in one
screen: pick a pair and a sell amount, refresh quotes, accept one. Ranked rows, live countdowns, a
single wallet prompt, and nothing written off-chain.

It also shows an advisory fair-price hint read from the
[Reflector](https://reflector.network) oracle by read-only simulation. It is never signed and never
on the settlement path.

---

## Protocol parameters

| | |
|---|---|
| **Protocol fee** | 10 bps, paid by the maker. The taker receives the full quoted amount. |
| **Fee cap** | 30 bps, a code constant. No admin key can exceed it. |
| **Quote lifetime** | 30 to 90 seconds, bounded by both `expiry` and `signature_expiration_ledger`. |
| **Fan-out timeout** | 3 seconds per maker, in parallel. |
| **Registration stake** | 100 XLM base, plus 10 XLM per token. Fully refunded by `eject`. |
| **Registry bounds** | 32 tokens and 8 protocols per maker; 100 makers per token (admin-tunable); URLs at most 256 bytes. |
| **Amount precision** | 7 decimals, matching Stellar Asset Contract atomic units. |
| **Assets** | XLM (native, no trustline) and USDC (classic asset via its SAC; the receiver needs a trustline). Only allow-listed assets can be rendered, signed or settled. |
| **Network** | Stellar Testnet only. |

> **Demo-only issuer.** The USDC entry currently points at a self-issued Testnet asset so
> block-size demos can be minted freely. Restore Circle's Testnet issuer in
> [`src/core/tokens.ts`](src/core/tokens.ts) (both ids sit in the comment above the allow-list, and
> two tests pin it) before any other use.

---

## Built with

| Layer | Choice |
|---|---|
| **Contracts** | Rust + Soroban SDK, one Cargo workspace, `wasm32v1-none` |
| **Desk** | React 19 + TypeScript on Vite, client-only, no server runtime |
| **Wallet** | Freighter via [Stellar Wallets Kit](https://github.com/Creit-Tech/Stellar-Wallets-Kit) |
| **Chain access** | `@stellar/stellar-sdk` against Stellar RPC and Horizon |
| **Wire format** | JSON-RPC 2.0, maker/taker naming, AirSwap error vocabulary |
| **Off-chain coordination** | Supabase (Postgres + Realtime), anon key, no authority |
| **Tests** | Vitest (192) and Rust unit tests (83), plus headless Playwright drivers that settle for real |
| **Hosting** | Vercel static build, strict allow-list CSP |

Runtime config is deliberately un-bundled: two plain `window.*` scripts, so a Testnet reset is a
one-file edit on the deployed site rather than a rebuild.

---

## Contract addresses

All on **Stellar Testnet**. Every id lives in [`public/otc-config.js`](public/otc-config.js) and is
typed in [`src/config.ts`](src/config.ts).

| Contract | Address | Notes |
|---|---|---|
| **`rfq_swap`** | `CCNP7626WIJVWVTBPLPG6QM77TY6JBU42D4PYONUFTDEPIIW6ZFJQIDT` | Settlement, fee 10 bps maker-paid. Deployed 2026-08-18. |
| **`rfq_registry`** | `CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G` | Maker discovery. Deployed and initialized 2026-08-26. |
| **`otc_swap`** | `CCAPYEWHYSGORPUOC7FBSIRBIWSJJSPJOIWPJNEZLGDXUWJVWV7MTKBJ` | Earlier settlement contract, retiring into `rfq_swap`. Deployed bytecode matches source (wasm `83f60b85…`). |
| **Reflector oracle** | `CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63` | Advisory fair price only, never on the signed path. |

`rfq_swap`'s id will change once the single-contract consolidation reshapes the `Order` struct.
Token SAC ids are not listed because they are derived in-app from the asset and network passphrase.

---

## Project structure

```
TrustRFQ/
├── contracts/                  # Cargo workspace (profile.release lives here; members inherit it)
│   ├── rfq_swap/               # Settlement: swap / cancel / is_cancelled / get_config + admin
│   ├── rfq_registry/           # Stake-gated maker discovery
│   └── otc_swap/               # Earlier settlement contract, retiring into rfq_swap
├── otc.html                    # The single Vite entry
├── src/
│   ├── core/rfq/               # Taker core, SDK-shaped: wire, order, validate, discover, settle
│   ├── core/                   # Shared core: canonical args, fill, tokens, pairs, oracle
│   ├── data/                   # Supabase queries + realtime; rfqNetwork.ts is the one RFQ call site
│   ├── ui/                     # RfqPanel, Ticket, OrderCard, SettlementStrip, ...
│   ├── wallet/                 # Wallets Kit singleton + signAuthEntry encoding normaliser
│   └── config.ts               # The only reader of window.* runtime config
├── public/                     # Landing page, stylesheets, otc-config.js, supabase-config.js
├── fixtures/                   # Golden vectors: fill args, RFQ order encoding, captured auth tree
├── tools/
│   ├── rfq-live-swap.mjs       # Live proof of the rfq_swap auth model
│   ├── rfq-registry-live.mjs   # Live proof of the registry lifecycle + read-cost probe
│   ├── e2e/                    # Headless drivers, mock Freighter, stub maker server
│   ├── slippage/               # Mainnet slippage-at-size measurement
│   └── tradesize/              # Mainnet trade-size distribution
├── docs/
│   ├── migrations/             # Supabase SQL: base schema, then intent layer
│   └── superpowers/specs/      # Dated design specs; 2026-08-17 is the adopted RFQ architecture
└── vercel.json                 # Build, rewrites, CSP + security headers
```

---

## Getting started

### Prerequisites

- **Node** ≥ 20.19
- For contracts: **Rust** with the `wasm32v1-none` target and the
  [Stellar CLI](https://developers.stellar.org/docs/tools/cli) v27
- A [Freighter](https://freighter.app) wallet funded on Testnet

### Install

```bash
git clone https://github.com/acakbin1881/TrustRFQ.git
cd TrustRFQ
npm install
npm run dev          # http://localhost:5173/otc.html
```

### Test

```bash
npm test                                          # vitest: 13 files, 192 tests
cargo test --manifest-path contracts/Cargo.toml   # 83 tests: rfq_swap 17 + rfq_registry 60 + otc_swap 6
npm run build                                     # tsc --noEmit && vite build → dist/
```

The TypeScript suite includes three golden-vector fixtures pinning byte-exact encodings: the
`fill` arguments, the RFQ `Order` (Soroban encodes struct fields as a sorted symbol map, not in
declaration order), and the decoded invocation tree of a real maker signature. If one
drifts, the maker's signature stops matching and settlement reverts, so trust the red test.

### Configure

- [`public/otc-config.js`](public/otc-config.js): `RPC_URL`, `HORIZON_URL`, `NETWORK_PASSPHRASE`,
  `RFQ_SWAP_CONTRACT_ID`, `RFQ_REGISTRY_ID`, `OTC_CONTRACT_ID`, `REFLECTOR_ORACLE_ID`. An empty id
  silently disables the feature that needs it.
- [`public/supabase-config.js`](public/supabase-config.js): Supabase URL and anon key. Used only
  by the desk's off-chain order coordination; the RFQ path touches no database.

For a fresh Supabase project, run in the SQL Editor first
[`docs/migrations/00-base-schema.sql`](docs/migrations/00-base-schema.sql), then
[`docs/migrations/2026-07-10-intent-layer.sql`](docs/migrations/2026-07-10-intent-layer.sql).

### Deploy the contracts

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
stellar contract invoke --id <NEW_ID> --source-account <identity> --network testnet -- get_config

# otc_swap (earlier settlement contract, still deployed)
stellar contract deploy \
  --wasm target/wasm32v1-none/release/otc_swap.wasm \
  --source-account <identity> --network testnet
```

Paste the printed `C…` ids into `public/otc-config.js`. Two things to know first:

- `rfq_registry` has a re-init guard and, by design, no `upgrade`. An `initialize` that lands with
  the wrong admin is permanent, so read `get_config` back and confirm the admin before publishing
  the id.
- The `rfq_swap` fee collector needs a trustline for every non-native token a fee can be charged in,
  because the fee is paid in `maker_token`. On this deployment that meant opening a USDC trustline
  for the collector once.

### Prove it on Testnet

```bash
node tools/rfq-live-swap.mjs        # one RFQ swap with mixed credentials, then a replay that must fail
node tools/rfq-registry-live.mjs    # register → discover → eject, exact refund, read-cost probe
```

Both scripts create throwaway actors through Friendbot and need no key file.

### Run the headless end-to-end

```bash
npm run build && npm run preview -- --port 4173     # terminal 1

npm run e2e:census                                  # default lane: two browsers, click census
npm run e2e:rfq                                      # RFQ lane only: spawns the stub maker, 12 scenarios,
                                                      # settles for real, report in tools/e2e/out/
node tools/e2e/run-all.mjs --lane all                # both censuses in one run
```

`tools/e2e/run-all.mjs --lane otc|rfq|all` is the one documented entry point for both censuses,
with `otc` as the default lane value; `npm run e2e:rfq` is a shorthand for `--lane rfq`. The RFQ
lane funds and manages its own taker actor and stub maker internally (no `prepare-keys.mjs` step), registers the stub on
the live `rfq_registry` with a real XLM stake, and always ejects it for a full refund — on a clean
run, a scenario failure, or an uncaught exception — so a failed run never leaves a staked,
unreachable maker listed for a later run to discover.

The harness drives the built app through a mock Freighter (a postMessage shim, no extension), so
every wallet prompt is counted rather than assumed. Two things the RFQ run needs that a fresh clone
does not have: the gitignored `demo-keys.json` (the stub maker sells the demo USDC issuer's asset
and reads the issuer secret from it; see `tools/derive-keys.mjs` and `tools/mint-usdc.mjs`), and
Testnet XLM, because the stub maker stakes real XLM to register. It ejects for a full refund on
SIGINT or SIGTERM; a hard kill leaves a staked, dead entry behind.

**The deployed CSP gains no maker origin from this harness.** The stub maker is served from a
loopback address by a process the deployed edge configuration never sees, and the local `vite
preview` server applies no policy headers at all — the two environments stay genuinely separate.
A real maker's origin joins `vercel.json`'s `connect-src` by hand at deploy time, one origin at a
time, the same curation discipline the token allow-list already uses; see
[What is proven, and what is not](#what-is-proven-and-what-is-not) for the current state of that
allow-list.

### Try the desk by hand

One funded Testnet wallet. Start with XLM ↔ XLM to avoid trustlines.

Open the RFQ section, choose a pair and an amount, then **Refresh quotes**. You need a maker
registered for both tokens: `STUB_MAKER_PORT=4174 node tools/e2e/stub-maker.mjs` gives you one and
prints `STUB_MAKER_READY` once registered. Accept a row and confirm that it costs a single wallet
prompt.

---

## What is proven, and what is not

Everything listed as proven moved real value on Stellar Testnet and can be re-run from this repo.

### Proven

- **The asymmetric authorization model.** A maker's detached `Address`-credential entry and a
  taker's `SourceAccount` credential settle in one transaction, with no taker auth entry at all
  ([tx `49fa69b2…`](https://stellar.expert/explorer/testnet/tx/49fa69b2258d551b0a1a86b551312be6a6f21c49bf3cab314b80717303ecc4f2),
  2026-08-18). Replaying the same signed entry was rejected by the host.
  Re-run with `node tools/rfq-live-swap.mjs`.
- **Registry lifecycle.** Register, add tokens, discover by token, `get_maker`, then eject with an
  exact full refund, plus a read-cost probe showing `get_urls_for_token` at the 100-maker cap uses
  about 2.6% of Testnet's per-transaction instruction budget.
  Re-run with `node tools/rfq-registry-live.mjs`.
- **The full taker path, one signature.** A headless taker discovers a maker through the live
  registry, receives a signed quote, validates it and settles with exactly one `signTransaction`
  prompt, measured as `promptsByType { REQUEST_ACCESS: 1, SUBMIT_TRANSACTION: 1 }`
  ([tx `90cd51d6…`](https://stellar.expert/explorer/testnet/tx/90cd51d6307fe407c629aff051cd3e556be4e37233109d727783f2461fa491cc),
  2026-09-09). The same run covers nine scenarios: the happy path, five really-signed bad quotes
  (slow, malformed, refused, drifted economics, wrong fee) that must never become a selectable row
  and must cost zero wallet prompts, and three discovery cases (zero makers, two makers ranked by
  price, a quote dropping off the list when its countdown ends).
  Re-run with `node tools/e2e/rfq-driver.mjs`.

### Not yet

- **No production maker server exists.** Every RFQ proof above ran against the stub maker. A live
  quote from a real maker server, settled on Testnet, is the milestone gate.
- **The deployed site cannot reach maker servers.** `connect-src` in [`vercel.json`](vercel.json)
  allows only RPC, Horizon and Supabase; maker origins are not in the CSP yet.
- **Trustline pre-flight and the expired-entry retry** on the RFQ accept path are in progress.
- **Single-contract consolidation** is decided but not built. `swap_any` open orders and an events
  indexer are deferred.
- **Testnet only, unaudited.** Do not use with real funds.

---

## Roadmap

### Milestone 1: the full RFQ loop on Testnet

Done when a desk taker discovers a real maker through the registry, receives a live quote from that
maker's own server, and settles it.

- [x] **`rfq_swap`** built, deployed and proven on Testnet (2026-08-18)
- [x] **Phase 1: on-chain maker discovery.** `rfq_registry` built, deployed, live-proven, wired into
      the runtime config (2026-08-26)
- [ ] **Phase 2: desk taker path.** Discovery, validated fan-out, ranked quotes and one-signature
      settlement all proven against the stub maker (2026-09-09). Remaining: trustline pre-flight,
      expired-entry retry, maker origins in the CSP, RFQ driver folded into `npm run e2e:census`
- [ ] **Phase 3: live full loop** against a real maker server from the separate repo. Milestone gate

### After the milestone

- [ ] **One settlement contract.** `rfq_swap` absorbs `otc_swap` through a signed
      `require_fill_guard` flag: a persistent filled key for long-lived offers, host nonce only for
      short-lived quotes. `otc_swap` retires. New wasm, new id
- [ ] **Taker SDK** extracted from `src/core/rfq/`, plus a reference maker server (separate repo)
- [ ] **Aggregator integrations**, the distribution path for a protocol with no end-user acquisition
- [ ] `swap_any` open orders, an events indexer, Sign-In-With-Stellar for per-wallet RLS
- [ ] External audit, then Mainnet

Design record: [`docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md`](docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md),
with the 2026-08-19 single-contract amendment at the top. Earlier specs in the same folder are
historical.

---

## Security

**The signature over the full terms is the integrity boundary.** In `rfq_swap` the maker's entry is
scoped with `require_auth_for_args` over the whole `Order` and the taker is the source account. A
changed amount, token, counterparty or fee has no valid signature, so `swap` reverts.

- **The taker never trusts the maker server.** Quotes are validated fail-closed against the taker's
  own request, the contract's live config and the maker's own signed invocation tree, before a
  wallet prompt exists.
- **The fee cap is a code constant.** Nobody, admin included, can charge more than 30 bps.
- **The registry cannot spend stake.** `eject` refunds exactly what was recorded, there is no admin
  path to staked funds, and the contract deliberately has no `upgrade` entry point.
- **The database is untrusted.** Supabase coordinates off-chain UI state with the anon key and
  holds no authority; a column-scoped grant freezes an order's addresses, tokens, expiration and
  nonce after insert. The RFQ path never touches it. Public reads are an accepted Testnet-MVP risk.
- **Token quarantine.** Only allow-listed assets render or sign, so a look-alike asset with an
  attacker-controlled issuer is blocked.
- **Strict headers.** Allow-list CSP with no inline or CDN scripts, HSTS,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.
- **A known wallet-kit quirk is contained.** `@creit.tech/stellar-wallets-kit` 1.9.5 double-encodes
  the signature returned by `signAuthEntry`;
  [`src/wallet/authSignature.ts`](src/wallet/authSignature.ts) normalises it so the core never sees
  it. The RFQ taker path is unaffected because it never calls `signAuthEntry`.

**Testing discipline.** The contracts' argument-binding tests are mutation-verified: unbinding a
field in the contract turns the matching test red. Rejection tests fund every actor, after one was
found passing for the wrong reason (an unfunded interloper). Quote-validation failures are proven
against really-signed bad quotes, never fabricated ones, so a decoder cannot pass for the wrong
reason.

> **Disclaimer:** TrustRFQ targets Stellar Testnet only and has not been audited. Do not use it with
> real funds. Report issues through
> [GitHub Issues](https://github.com/acakbin1881/TrustRFQ/issues).

---

## License

[MIT](LICENSE). No warranty.

---

## Acknowledgments

- [**AirSwap**](https://www.airswap.io) for the RFQ model this protocol ports, down to the maker /
  taker vocabulary and the JSON-RPC error codes. Their `Swap.sol` and `Registry.sol` were read as
  source, not summary.
- [**Stellar Development Foundation**](https://stellar.org) for Soroban and the Testnet
  infrastructure every proof in this README runs against.
- [**Reflector**](https://reflector.network) for the SEP-40 price feed behind the advisory
  fair-price hint.
- [**Creit Tech**](https://github.com/Creit-Tech/Stellar-Wallets-Kit) for Stellar Wallets Kit.

---

## Why RFQ

An order book asks you to publish your intent and then hope. You rest size where everyone can see
it, the market moves against you before it fills, and what you finally receive is not what you were
quoted. The measurements in [`tools/`](tools/) show what that costs on Stellar today, and that the
answer traders have settled on is simply not to trade at size.

Request-for-quote inverts it. You ask; a maker answers with a firm price and signs it; you either
take that exact price or you do not. Nothing is published, nothing is front-run, and the settlement
contract will reject any transaction whose terms differ by a single unit from what was signed.

That is the whole idea. Everything in this repository is in service of making the signature, and
not any intermediary, the thing you have to trust.
