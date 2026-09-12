# Requirements: TrustRFQ (Milestone 1: Full RFQ Loop on Testnet)

**Defined:** 2026-08-19
**Core Value:** Two parties settle exactly the terms that were signed: atomic on-chain settlement
where a signature over the full economic terms is the integrity boundary.

**Milestone definition of done (user-chosen):** a desk taker discovers a registered maker via
`rfq_registry`, receives a live quote from the maker's server, and settles it on Testnet
end-to-end. The maker quote server + taker SDK live in a SEPARATE repo; their availability is an
external dependency INSIDE this milestone. Phases needing a live counterparty may use a local stub
maker (extending `tools/e2e/`) as intermediate verification, but the milestone is only DONE on the
live full loop.

**Positioning note (locked 2026-08-24, SCF Customer Development Plan §3.1; POS-D1/UI-D1 in
PROJECT.md):** TrustRFQ is a protocol, not an end-user interface. The "desk taker" in this
milestone is the minimal reference interface that demonstrates the protocol; it is not a product
to grow users on. Taker logic (discovery, quote fan-out, validation, settlement) lands as
SDK-shaped pure modules under `src/` so the separate-repo taker SDK can extract them; desk
components stay a thin shell over that core. Interface metrics (clicks, wallet-prompt counts)
are never cited as evidence; evidence is on-chain proofs and reproducible measurements.

## v1 Requirements

Source: `docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md` (adopted
2026-08-17), via .planning/intel/requirements.md. Scoped to this repo only.

### Registry (rfq_registry contract)

- [x] **REG-01**: A maker can register and manage itself in the stake-gated `rfq_registry` phone
  book: `initialize(admin, stake_token, base_cost, per_token_cost, max_makers_per_token)`,
  `set_url` (stakes `base_cost` on first call), `add_tokens`/`remove_tokens` (`per_token_cost`
  stake/refund), `add_protocols`, `eject` (full unwind + refund), `get_urls_for_token`,
  `get_maker` (spec §5)

- [x] **REG-02**: Registry storage follows the spec's bounded, persistent layout: stake asset is
  native XLM via its SAC; costs admin-tunable; `Token(Address) -> Vec<Address>` capped at
  `max_makers_per_token` plus `Maker(Address) -> MakerConfig`, both persistent, TTL bumped on
  every write; all lists explicitly bounded; no contract-side extend function; pair intersection
  stays client-side

- [x] **REG-03**: `rfq_registry` is deployed on Testnet with unit tests (un-mocked auth trees
  where meaningful, security checklist from spec §7.6: re-init guard, events on state
  transitions) and a live Testnet integration check that exercises registration, discovery, and
  archival/restore (TTL) behavior

### Runtime Config

- [x] **CFG-01**: `RFQ_REGISTRY_ID` joins `public/otc-config.js` and `src/config.ts` following
  the `OTC_CONTRACT_ID` pattern (`window.*` un-bundled script, typed reader), and joins the
  quarterly Testnet-reset checklist; a reset stays a one-file edit, not a rebuild.
  (Verified 2026-08-19: `RFQ_SWAP_CONTRACT_ID` wiring already landed; this requirement covers
  only the registry id.)

### Desk Taker Path

Scope shape (UI-D1): TAKER-01..05 describe protocol behavior surfaced through a deliberately
minimal desk shell; the logic itself is SDK-shaped `src/` modules (see Positioning note above).

- [x] **TAKER-01**: The desk discovers maker URLs for the selected pair via two
  `get_urls_for_token` read-only simulations and client-side intersection (registry reads use the
  already-allowed RPC origin)

- [x] **TAKER-02**: The desk fans out `getMakerSideOrder` (Stellar RFQ v1: JSON-RPC 2.0, AirSwap
  wire shapes and error codes) to discovered makers in parallel with a 2-3s timeout, dropping
  malformed responses

- [x] **TAKER-03**: The desk validates and selects quotes locally before any wallet interaction:
  economics match the request, `feeBps` equals the on-chain `get_config` value, sane
  expiry/`signatureExpirationLedger`, and the decoded `authEntry` invocation tree matches the
  order terms

- [x] **TAKER-04**: Accepting a quote settles via one ordinary Freighter `signTransaction`: the
  taker's G-account is tx source with the maker's `authEntry` attached, enforcing simulate +
  `assembleTransaction`, submit + poll, confirmation via `getTransaction` plus the swap event; no
  wallet `signAuthEntry` on the taker path

- [x] **TAKER-05**: Trustline pre-flight with an "add trustline" prompt before settlement; an
  expired-entry failure auto-refreshes the quote and retries once; tokens resolve only from the
  curated allow-list (`src/core/tokens.ts`), never raw user-pasted addresses

- [x] **TAKER-06**: The RFQ canonical order encoding is deterministic and pinned with golden
  vectors (same discipline as `fillCanonicalArgs`), under `src/` so vitest covers it

### CSP

- [x] **CSP-01**: `vercel.json` `connect-src` gains every maker-server origin the desk queries;
  zero CSP violations in the browser console; `'unsafe-inline'` never enters `script-src`.
  (Changes only when desk taker integration starts.)

### End-to-End Verification

- [x] **E2E-01**: `tools/e2e/` is extended with a local stub maker (a quote server signing real
  auth entries) and a taker driver covering the full RFQ quote flow through the mock Freighter,
  settling for real on Testnet (intermediate verification while the real maker server is absent)

- [ ] **E2E-02**: LIVE FULL LOOP (milestone gate): the desk taker discovers a registered maker via
  `rfq_registry`, receives a live quote from the maker's own server (separate repo), and settles
  it on Testnet end-to-end, with the run recorded (maker address, registry entry, tx hash)

### Retirement (gated on RFQ shipping)

- [ ] **RETIRE-01**: The broadcast/intent fan-out layer (`fanOut` in `src/data/broadcasts.ts`;
  `broadcasts`/`rounds`/`intents` tables; the `/intent -> /otc` redirect in `vercel.json`) is
  removed only AFTER the RFQ protocol ships, all together; the migration SQL stays as long as the
  schema is live in the production Supabase project; the OTC directed lane is untouched
  (permanent)

## Satisfied Requirements (no phase scheduled)

- [x] **SWAP-01**: `rfq_swap` settlement contract (spec §4): swap/cancel/is_cancelled/admin,
  asymmetric auth, maker-paid capped fee, temporary-storage cancel flags. BUILT, DEPLOYED and
  PROVEN on Testnet 2026-08-18 (17 unit tests, mutation-verified arg bindings, live
  mixed-credential swap + replay rejection via `tools/rfq-live-swap.mjs`). Do not schedule.

## v2 Requirements

Deferred to a future milestone. Tracked but not in the current roadmap.

### Contracts

- **SWAP-02**: `swap_any` open-order entry point (maker authorizes a tuple omitting the taker;
  distinct entry point since Soroban `Address` has no zero-address sentinel). Explicitly NOT part
  of v1 per the source spec (§4.4): "Ship swap in v1; swap_any is a small follow-on."

## Open (unscheduled)

- **IDX-01**: Events indexer (RPC `getEvents` -> Postgres for analytics, maker scorecards,
  fill-confirmation UX, registry cache). Whether it ships in v1 or the web app reads chain-only is
  an OPEN question in the source spec (§10); repo placement unspecified. Not schedulable until
  answered. Revisit at milestone close.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Maker quote server + taker SDK | Separate repo per spec §11; this repo never grows a server runtime |
| AirSwap LastLook streaming, NFT swaps, staker fee rebates | Out of scope per the adopted spec |
| Policy-enforcing C-account makers | Explicitly deferred by RFQ-D3; not v1, no work planned |
| In-contract token allowlist | Rejected for v1 (open revisit, spec §10); curation is off-chain via `src/core/tokens.ts` + registry |
| Mainnet deployment | Testnet only until external audit + governance custody resolve |
| Sign-In-With-Stellar / per-wallet RLS | Future hardening; public anon reads are an accepted Testnet-MVP risk |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REG-01 | Phase 1 | Complete |
| REG-02 | Phase 1 | Complete |
| REG-03 | Phase 1 | Complete |
| CFG-01 | Phase 1 | Complete |
| TAKER-01 | Phase 2 | Complete |
| TAKER-02 | Phase 2 | Complete |
| TAKER-03 | Phase 2 | Complete |
| TAKER-04 | Phase 2 | Complete |
| TAKER-05 | Phase 2 | Complete |
| TAKER-06 | Phase 2 | Complete |
| CSP-01 | Phase 2 | Complete |
| E2E-01 | Phase 2 | Complete |
| E2E-02 | Phase 3 | Pending |
| RETIRE-01 | Phase 4 | Pending |
| SWAP-01 | (none: pre-satisfied) | Complete (2026-08-18) |

**Coverage:**

- v1 schedulable requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-19*
*Last updated: 2026-08-26 - positioning note added (POS-D1/UI-D1: minimal reference interface,
SDK-shaped taker core); requirement ids and phase mapping unchanged*
