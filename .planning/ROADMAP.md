# Roadmap: TrustRFQ (Milestone 1: Full RFQ Loop on Testnet)

## Overview

The `rfq_swap` settlement contract is already deployed and proven on Testnet; what remains is
everything around it. Phase 1 puts maker discovery on-chain (`rfq_registry`) and wires its id into
the runtime config. Phase 2 turns the desk into the RFQ taker: registry discovery, parallel quote
fan-out, local validation, and one-signature settlement, all proven end-to-end against a local stub
maker extending the existing E2E census harness. Phase 3 is the milestone gate: the same flow
against a real maker server (separate repo, external dependency), a live quote settled on Testnet
end-to-end. Phase 4, gated on that ship, retires the interim broadcast fan-out layer while leaving
the permanent directed OTC lane untouched.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: On-Chain Maker Discovery** - `rfq_registry` stake-gated phone book built, tested, deployed on Testnet, and wired into the runtime config
- [ ] **Phase 2: Desk RFQ Taker Path** - the desk discovers registered makers, pulls and validates firm quotes, and settles with one wallet signature, proven against a local stub maker
- [ ] **Phase 3: Live Full RFQ Loop** - milestone gate: a real maker server's live quote discovered via the registry and settled on Testnet end-to-end
- [ ] **Phase 4: Interim Fan-Out Retirement** - broadcast/intent layer removed now that the RFQ protocol has shipped; directed OTC lane untouched

## Phase Details

### Phase 1: On-Chain Maker Discovery

**Goal**: Makers can register their quote-server endpoints on-chain with a real XLM stake, and any
client can discover them with read-only calls
**Depends on**: Nothing (first phase; `rfq_swap` already deployed)
**Requirements**: REG-01, REG-02, REG-03, CFG-01
**Success Criteria** (what must be TRUE):

  1. A maker account can register on the deployed Testnet registry: `set_url` stakes `base_cost`
     XLM, `add_tokens` stakes `per_token_cost` per token, and `get_maker` returns its
     `MakerConfig` (url, protocols, tokens, staked)

  2. A client can list maker URLs for a token via a read-only `get_urls_for_token` simulation, and
     a token's maker list refuses growth past `max_makers_per_token`

  3. `eject` refunds the maker's entire stake and removes it from every token list;
     `remove_tokens` refunds `per_token_cost` per token

  4. `RFQ_REGISTRY_ID` is set in `public/otc-config.js` and typed in `src/config.ts` following the
     `OTC_CONTRACT_ID` pattern, so a Testnet reset stays a one-file edit

  5. Unit tests pass (re-init guard, auth on every mutating call, bounded-list rejection, events
     on state transitions) and a live Testnet check exercises register -> discover -> eject,
     including TTL-bump-on-write behavior
**Plans**: 1/4 plans executed

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Tracer: one maker registers, is discovered, and is refunded on live Testnet

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 01-02-PLAN.md — Token and protocol lists: stake-priced, doubly bounded, discoverable by token

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-03-PLAN.md — Admin-tunable spam pricing plus the auth, re-init, event and TTL test surface

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 01-04-PLAN.md — Redeploy, full live Testnet proof, and RFQ_REGISTRY_ID runtime config wiring

### Phase 2: Desk RFQ Taker Path

**Goal**: A taker in the desk can select a curated pair, see live firm quotes from registered
makers, and settle one with a single wallet signature, proven end-to-end against a local stub
maker settling for real on Testnet
**Depends on**: Phase 1 (discovery reads need the deployed registry)
**Requirements**: TAKER-01, TAKER-02, TAKER-03, TAKER-04, TAKER-05, TAKER-06, CSP-01, E2E-01
**Success Criteria** (what must be TRUE):

  1. A connected taker choosing a curated pair sees live quotes from makers discovered via the
     registry (two `get_urls_for_token` reads + client-side intersection); unreachable, slow
     (>3s), or malformed makers are silently dropped

  2. A quote with mismatched `feeBps`, drifted economics, or an `authEntry` whose decoded
     invocation tree does not match the order terms is rejected before any wallet prompt; the RFQ
     order encoding this validation relies on is deterministic and pinned by golden vectors

  3. Accepting a quote settles on Testnet with exactly one Freighter `signTransaction` prompt (no
     `signAuthEntry` on the taker path), and the desk confirms via `getTransaction` plus the swap
     event

  4. A taker missing the makerToken trustline is prompted to add it before settlement; an
     expired-entry failure auto-refreshes the quote and retries once

  5. The extended `npm run e2e:census` drives the full RFQ taker flow through the mock Freighter
     plus a local stub maker and settles for real on Testnet, with maker origins added to
     `connect-src`, zero CSP violations, and no `'unsafe-inline'` in `script-src`
**Plans**: TBD
**UI hint**: yes

### Phase 3: Live Full RFQ Loop

**Goal**: The milestone definition of done: a real registered maker quoting from its own server is
discovered and settled by the desk on Testnet, end-to-end, with nothing stubbed
**Depends on**: Phase 2. External dependency: the maker quote server + taker SDK repo (separate
repo per spec §11) must be live with at least one maker endpoint running; a blocked Phase 3 waits
on that repo, it does not pull server code into this one
**Requirements**: E2E-02
**Success Criteria** (what must be TRUE):

  1. A maker registered on `rfq_registry` with a real stake is discovered by the desk with no
     hardcoded URL anywhere in the flow

  2. The maker's own server returns a live signed quote over the Stellar RFQ v1 wire protocol,
     and the desk validates and accepts it

  3. The swap settles on Testnet end-to-end: tx hash, swap event, and all four balance deltas
     confirm the exact quoted amounts plus the maker-paid fee

  4. The run is recorded (maker address, registry entry, quote, tx hash) so it is reproducible
     after a quarterly Testnet reset
**Plans**: TBD

### Phase 4: Interim Fan-Out Retirement

**Goal**: With the RFQ protocol shipped, the interim broadcast/intent fan-out layer is retired in
one piece, leaving the desk with the permanent directed OTC lane plus the RFQ taker path
**Depends on**: Phase 3 (RETIRE-01 is explicitly gated on the RFQ protocol shipping; the layer
stays live and functional until then)
**Requirements**: RETIRE-01
**Success Criteria** (what must be TRUE):

  1. Broadcast fan-out is gone from the desk: the compose form no longer creates broadcasts, the
     incoming-broadcast surfaces are removed, and `fanOut`/broadcast data paths are deleted

  2. The `/intent -> /otc` redirect retires together with the layer, and the
     `broadcasts`/`rounds`/`intents` schema retirement against the live Supabase project is
     applied or explicitly recorded as the documented follow-up

  3. The directed OTC lane still works unchanged: the existing E2E census passes, `npm test` stays
     green, golden vectors and the `otc_swap` wasm hash (`83f60b85...`) are untouched
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. On-Chain Maker Discovery | 1/4 | In Progress|  |
| 2. Desk RFQ Taker Path | 0/TBD | Not started | - |
| 3. Live Full RFQ Loop | 0/TBD | Not started | - |
| 4. Interim Fan-Out Retirement | 0/TBD | Not started | - |

## Non-Phase Requirement Dispositions

- **SWAP-01** (`rfq_swap` contract): satisfied 2026-08-18, pre-roadmap; no phase
- **SWAP-02** (`swap_any`): deferred beyond v1 by the source spec; v2 backlog
- **IDX-01** (events indexer): OPEN question in the source spec (§10); unscheduled until answered
