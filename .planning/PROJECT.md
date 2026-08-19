# TrustRFQ

## What This Is

TrustRFQ is a peer-to-peer OTC dApp on Stellar (Testnet only), modeled on the Swap/AirSwap peer
protocol: parties agree off-chain and settle on-chain atomically. The shipped product is a
client-only React + TS desk (directed dual-signed fills plus an interim broadcast fan-out) with
Soroban settlement contracts. This milestone builds the RFQ protocol in this repo: on-chain maker
discovery (`rfq_registry`) and the desk's taker path against always-on maker quote servers, settling
through the already-proven `rfq_swap` contract.

## Core Value

Two parties settle exactly the terms that were signed: atomic on-chain settlement where a signature
over the full economic terms is the integrity boundary, with no middleman able to alter the deal.

## Requirements

### Validated

Shipped and confirmed working (see CLAUDE.md Status for provenance):

- ✓ OTC directed lane: dual-signed `fill`, permissionless submit (two-wallet E2E passed 2026-07-14)
- ✓ Off-chain RFQ negotiation UI: compose, threads, counters, Supabase realtime
- ✓ Interim broadcast fan-out (stays live until the RFQ protocol ships; see RETIRE-01)
- ✓ `rfq_swap` settlement contract: built, deployed, proven on Testnet 2026-08-18 (SWAP-01;
  live mixed-credential swap + replay rejection, 17 unit tests, mutation-verified arg bindings)
- ✓ `RFQ_SWAP_CONTRACT_ID` runtime-config wiring (verified 2026-08-19 in `public/otc-config.js`
  + `src/config.ts`)
- ✓ Reflector fair-price advisory chip (never on the signed path)
- ✓ Automated two-browser E2E census harness (`tools/e2e/`, mock Freighter, settles on Testnet)

### Active

Milestone 1: FULL RFQ LOOP ON TESTNET. Definition of done: a desk taker discovers a registered
maker via `rfq_registry`, receives a live quote from the maker's own server, and settles it on
Testnet end-to-end. Full detail in .planning/REQUIREMENTS.md.

- [ ] `rfq_registry` stake-gated maker discovery contract, deployed on Testnet (REG-01..03)
- [ ] `RFQ_REGISTRY_ID` in the un-bundled runtime config (CFG-01)
- [ ] Desk taker path: registry discovery, parallel quote fan-out, local validation,
      one-signature settlement, trustline pre-flight, golden-vector-pinned encoding (TAKER-01..06)
- [ ] CSP `connect-src` gains maker-server origins, zero violations (CSP-01)
- [ ] E2E census extended with a local stub maker, settling for real on Testnet (E2E-01)
- [ ] Live full loop against a real maker server from the separate repo (E2E-02, the milestone gate)
- [ ] Broadcast/intent fan-out retired only after the RFQ protocol ships (RETIRE-01)

### Out of Scope

- Maker quote server + taker SDK in this repo: they live in a SEPARATE repo per the adopted spec
  (§11 repo split); this repo must never grow a server runtime. Their availability is an external
  dependency INSIDE this milestone (Phase 3).
- `swap_any` open-order entry point: explicitly deferred beyond v1 by the source spec (§4.4).
- Events indexer: OPEN question in the source spec (§10, indexer in v1 vs chain-only reads);
  unscheduled until the question is answered.
- AirSwap LastLook streaming, NFT swaps, staker fee rebates: out of scope per the adopted spec.
- Policy-enforcing C-account makers: deferred, no v1 work planned (RFQ-D3).
- Mainnet: Testnet only until external audit and governance questions resolve.
- Sign-In-With-Stellar / per-wallet RLS: future hardening, accepted Testnet-MVP risk stands.

## Context

- The repo is mature and shipped: single-entry SPA (`otc.html` -> `src/`), deployed contracts
  (`otc_swap` and `rfq_swap`), a Supabase-coordinated negotiation layer, and a real-settling E2E
  harness. Codebase map: .planning/codebase/. Authoritative status: CLAUDE.md.
- The RFQ protocol architecture was ADOPTED 2026-08-17 (docs-only adoption):
  `docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md`. Its core auth
  assumption was proven on-chain 2026-08-18 (tx `49fa69b2...`): maker's detached
  Address-credential entry + taker's SourceAccount credential settle in one tx.
- The broadcast/intent layer is relabeled the interim fan-out mode: keep live and functional
  until the RFQ protocol ships, remove only then. The directed OTC lane is permanent.
- Ecosystem: no existing signed-quote RFQ protocol surfaced on Stellar; go-to-market is maker
  recruitment + aggregator integration, not end-user acquisition.
- Intel provenance: .planning/intel/ (ingest run 2026-08-19, 4 SPECs, zero ADRs, zero blockers).

## Constraints

- **Tech stack**: Client-only static React + TS SPA (Vite), no server runtime; Soroban (Rust)
  contracts in the `contracts/` Cargo workspace; Supabase anon key; Freighter-only wallet;
  Stellar Testnet only. Pinned signing-critical deps (`stellar-wallets-kit@1.9.5` exact).
- **Security (rfq_swap)**: every economically meaningful field sits inside the maker's
  `require_auth_for_args` tuple; taker is tx source; TTL is rent, not security; checked i128 math.
  Invariants: STELLAR.md §0b.
- **Security (web)**: CSP script-src never gains `'unsafe-inline'`; zero inline scripts in
  `dist/`; every new external origin joins the matching CSP directive; tokens resolve only from
  the curated allow-list (`src/core/tokens.ts`); the oracle never touches any signed path.
- **Verification discipline**: golden vectors pin canonical encodings (`fillCanonicalArgs` today,
  the RFQ order encoding when it lands); auth-binding tests verified by mutation; `otc_swap` wasm
  hash `83f60b85...` must never move (deployed-bytecode-matches-source claim).
- **Protocol**: Stellar RFQ v1 wire = JSON-RPC 2.0 with AirSwap shapes and error codes (-33600..
  -33605, plus -33700/-33701); amounts are decimal strings in atomic units, never hardcode 7
  decimals; taker wallets G-only in v1.
- **Repo split**: maker server + taker SDK live in a separate repo; contracts + taker desk here.
- **Compatibility**: `styles.css`/`intent.css` token NAMES and selectors are a contract (values
  change freely, never rename/drop); runtime config stays un-bundled `window.*` scripts so a
  quarterly Testnet reset is a one-file edit (checklist: `OTC_CONTRACT_ID`, `REFLECTOR_ORACLE_ID`,
  `RFQ_SWAP_CONTRACT_ID`, and `RFQ_REGISTRY_ID` once wired).
- **Registry shape**: stake asset is native XLM via its SAC; all lists explicitly bounded
  (`max_makers_per_token`); pair intersection client-side; no contract-side extend function.
- **Test wiring**: no npm script runs cargo; shared TS protocol code lands under `src/` or brings
  its own suite (vitest include covers only `src/**`).

## Key Decisions

All entries below are adopted-by-spec (SPEC provenance, status "proposed" in intel; zero
ADR-locked decisions exist). They are treated as settled direction unless deliberately revisited.

| Decision | Rationale / Provenance | Outcome |
|----------|------------------------|---------|
| RFQ-D1+D2: Design A auth-entry-native settlement; maker signs `require_auth_for_args` entry, taker is tx source (never calls signAuthEntry) | RFQ spec 2026-08-17 §10; maximizes wallet compat; Design B (EVM-style in-contract sig verify) rejected | Good (proven on Testnet 2026-08-18) |
| RFQ-D7: registry stakes native XLM, admin-tunable costs, bounded per-token lists | RFQ spec §5; bond prices spam, unbounded Vecs brick Soroban contracts | Pending (Phase 1) |
| RFQ-D9: repo split; contracts + taker desk here, maker server + taker SDK separate repo | RFQ spec §11; reaffirms 2026-07-10 migration spec (no server runtime) | Pending |
| RFQ-D10: broadcast/intent layer stays live as interim fan-out until RFQ ships, removed only then; directed lane permanent | RFQ spec §11 "What this supersedes" | Pending (Phase 4 gate) |
| MIG-D1: Vite + React + TS, static client-only SPA (Next.js rejected: inline hydration scripts force 'unsafe-inline') | Migration spec 2026-07-10; shipped | Good |
| MIG-D2: golden vectors as the signature-boundary regression tripwire | Migration spec 2026-07-10; shipped | Good |
| DESK-D1: light "milky swap" desk theme; token NAMES/selectors are a compatibility contract | Redesign spec 2026-07-12; shipped e75cf6f | Good |
| ORACLE-D1: Reflector fair price advisory-only, on-chain SEP-40 read, tap-to-fill, never signed | Oracle spec 2026-07-15; shipped b051d2b | Good |

---
*Last updated: 2026-08-19 after project initialization from docs ingest*
