---
phase: 1
slug: on-chain-maker-discovery
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-26
---

# Phase 1 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Any account → `rfq_registry` mutating entry points | Permissionless registration gated only by `require_auth` + XLM stake | Maker address, url string, token/protocol lists, XLM stake |
| `deployer` admin → admin setters (`set_costs`, `set_max_makers_per_token`) | Trusted admin retunes spam pricing; no path to escrowed funds | Config values only |
| Any client → read-only discovery (`get_urls_for_token`, `get_maker`, `get_config`) | Unauthenticated RPC simulation reads | Public registry state |
| Registry → maker `url` consumed later by desk/Phase 2 clients | Attacker-controlled string fetched off-chain | URL (transfer: client-side https + CSP enforcement) |
| Repo → deployed bytecode | Workspace/Cargo.lock changes could move deployed contract hashes | wasm binaries |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-01-01 | Elevation of Privilege | `initialize` re-init | critical | mitigate | `has(&DataKey::Admin)` guard → `AlreadyInitialized`; unit-tested and live-verified. Strengthened post-review (CR-01 fix `66c5773`): `admin.require_auth()` at `lib.rs:238` | closed |
| T-01-02 | Tampering | `set_url`, `eject` | high | mitigate | `maker.require_auth()` first in every maker-facing fn (8 sites), keyed to the storage key; funded-attacker rejection tests | closed |
| T-01-03 | Tampering / Repudiation | stake accounting | high | mitigate | `MakerConfig.staked` single refund source; host all-or-nothing rollback; live check asserts exact contract-balance restoration | closed |
| T-01-04 | Elevation of Privilege | no `upgrade` entry point | high | mitigate | No `upgrade`/`withdraw`/`sweep`/`drain` function exists (grep-verified 0); recorded in header comment + phase prohibition | closed |
| T-01-05 | Tampering | workspace `Cargo.lock` re-resolution | high | mitigate | `otc_swap.wasm` sha256 gate: still `83f60b85…` after every phase task and the review fixes | closed |
| T-01-06 | Denial of Service | unbounded `url` | medium | mitigate | `MAX_URL_BYTES = 256` + non-empty check → `UrlInvalid` before funds move | closed |
| T-01-07 | Information Disclosure | attacker-controlled maker `url` fetched by clients | medium | transfer | Deliberately no on-chain scheme parsing (D-09); ownership transferred to Phase 2 client-side https enforcement + `vercel.json` CSP `connect-src` — handoff explicit | closed |
| T-01-08 | Spoofing | malicious `stake_token` at initialize | low | accept | Fixed once by trusted admin, never caller-supplied; see Accepted Risks Log | closed |
| T-01-09 | Denial of Service | per-maker token list growth | high | mitigate | `MAX_TOKENS_PER_MAKER = 32` boundary check, mutation-verified | closed |
| T-01-10 | Denial of Service | per-token maker list growth | high | mitigate | Admin-tunable `max_makers_per_token` re-read live per call, independently mutation-verified | closed |
| T-01-11 | Tampering | partial state on mid-loop failure | high | mitigate | Single-pass loop, early `Err`, host rollback; failing multi-token test asserts byte-identical state | closed |
| T-01-12 | Tampering | stake refund drift | high | mitigate | Refund always from `staked`, never recomputed from current costs; test raises `base_cost` and asserts original refund | closed |
| T-01-13 | Tampering | overflow in `per_token_cost * n` | medium | mitigate | `checked_mul` → `MathOverflow` (8 checked-math sites post WR-02 fix `4c73903`) | closed |
| T-01-14 | Elevation of Privilege | unregistered account mutating state | high | mitigate | `NotRegistered` gate on every mutating path (9 sites); `set_url` sole registration path | closed |
| T-01-15 | Denial of Service | dangling addresses after `eject` | medium | mitigate | `eject` delists from every `Token(t)`; `get_urls_for_token` skips missing `Maker` entries | closed |
| T-01-16 | Repudiation | invisible state transitions | low | mitigate | `TokensAdded`/`TokensRemoved`/`ProtocolsAdded`/`ProtocolsRemoved` with pinned topics, event-tested | closed |
| T-01-17 | Elevation of Privilege | second `initialize` seizing admin | critical | mitigate | Same guard as T-01-01, asserted with unchanged `get_config()`; re-init test green | closed |
| T-01-18 | Elevation of Privilege | non-admin calling setters | high | mitigate | `require_admin(&env)` first in both setters; funded non-admin rejection table; mutation-verified (`set_costs` check deleted → test red) | closed |
| T-01-19 | Tampering | cross-maker mutation | high | mitigate | Table-driven attacker-signed rejection test across all six maker fns, attacker funded; mutation-verified (`set_url` auth deleted → test red) | closed |
| T-01-20 | Elevation of Privilege | admin draining escrowed stake | high | mitigate | No withdraw/sweep/drain/upgrade path exists; phase prohibition | closed |
| T-01-21 | Denial of Service | cap-lowering eviction | high | mitigate | No-eviction rule enforced at `add_tokens` check site against live cap; pinned test + snapshot mutation check | closed |
| T-01-22 | Tampering | cost retune changing refunds | high | mitigate | Refund from `staked` (see T-01-12); dedicated retune test | closed |
| T-01-23 | Denial of Service | persistent entries lapsing (TTL) | medium | mitigate | `bump_maker`/`bump_instance` on every mutating call; proven after ledger advance (unit) and observed live (no-op above floor, never decreased) | closed |
| T-01-24 | Repudiation | invisible admin config changes | low | mitigate | `CostsSet`/`MaxMakersSet` with pinned topics, event-tested | closed |
| T-01-25 | Elevation of Privilege | deploy→initialize race window | high | mitigate | Back-to-back deploy+initialize by `deployer`; `get_config().admin` verified before publishing the id; post-review `admin.require_auth()` makes a front-run detectable and recoverable by redeploy; deploy-safety note added to `public/otc-config.js` | closed |
| T-01-26 | Spoofing | wrong `RFQ_REGISTRY_ID` in config | high | mitigate | Live script exercised the exact id; human blocking checkpoint compared config vs deployed id (approved 2026-08-26) | closed |
| T-01-27 | Tampering | malformed id reaching a chain call | medium | mitigate | `registryEnabled` gates on `/^C[A-Z2-7]{55}$/` like the three sibling flags; invalid value silently disables | closed |
| T-01-28 | Information Disclosure | live-script key leakage | medium | mitigate | In-process keypairs, Friendbot-funded, zero filesystem writes (grep-verified); `git status` check in acceptance criteria | closed |
| T-01-29 | Tampering | CSP regression from config change | medium | mitigate | Registry uses the already-allowed RPC origin; build verified zero inline scripts; CSP conclusion stated in SUMMARY | closed |
| T-01-30 | Repudiation | unreproducible deploy after Testnet reset | medium | mitigate | Exact two-step commands in `public/otc-config.js` comment; `RFQ_REGISTRY_ID` on the CLAUDE.md reset checklist | closed |
| T-01-31 | Denial of Service | discovery read exceeding RPC limits at cap | medium | mitigate | Measured ≈91k instructions/maker; ≈10.3M at cap vs 400M budget (~2.6%); human accepted no retune; `set_max_makers_per_token` is the no-redeploy escape hatch | closed |
| T-01-SC | Tampering | Cargo/npm supply chain | high | mitigate | Zero new packages phase-wide; workspace-pinned `soroban-sdk = "26"`; only already-installed `@stellar/stellar-sdk` in tools; `otc_swap` hash gate green throughout | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01-01 | T-01-08 | `stake_token` is set once at `initialize` by the trusted `deployer` admin and never supplied by an untrusted caller; a per-call allow-list would add surface without reducing risk | Plan 01-01 threat model (plan-time disposition) | 2026-08-24 |

*Accepted risks do not resurface in future audit runs.*

---

## Residual Notes (non-blocking)

- The live Testnet instance `CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G` was deployed
  BEFORE the CR-01 fix (`66c5773`), so its on-chain `initialize` lacks `admin.require_auth()`. Its
  admin was independently verified correct via `get_config`, and `initialize` is permanently sealed
  by the re-init guard, so the deployed instance is not exposed. The hardened bytecode ships at the
  next deploy (quarterly Testnet reset or an elective redeploy).
- IN-01 from 01-REVIEW.md (hardcoded demo USDC issuer in the live script) is an Info-tier
  consistency note, not a threat; tracked in 01-REVIEW.md.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-26 | 32 | 32 | 0 | secure-phase L1 short-circuit (plan-time register; grep-depth evidence pass by orchestrator) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-26
