# Phase 1: On-Chain Maker Discovery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-19
**Phase:** 1-On-Chain Maker Discovery
**Areas discussed:** Deploy parameters, Registration lifecycle, Input validation, Live Testnet check

---

## Deploy parameters

| Option | Description | Selected |
|--------|-------------|----------|
| 100 / 10 XLM | base_cost = 100, per_token_cost = 10; prices spam, fits Friendbot budget | ✓ |
| 1 / 0.1 XLM | Near-zero friction, representative economics only | |
| Sen karar ver | Claude picks reasonable Testnet values | |

**User's choice:** 100 / 10 XLM

| Option | Description | Selected |
|--------|-------------|----------|
| 100 | Spec §5 example value | ✓ |
| 20 | Tighter cap, smaller reads | |
| Sen karar ver | Claude picks | |

**User's choice:** max_makers_per_token = 100

| Option | Description | Selected |
|--------|-------------|----------|
| Mevcut deployer | Same identity as rfq_swap (GB3WSGXR...) | ✓ |
| Yeni hesap | Dedicated registry identity | |

**User's choice:** existing `deployer` identity
**Notes:** The user asked what "registry", "admin", and "deployer" mean; explained from first
principles (on-chain phone book, settings-only authority, the user's own CLI keypair). The user
confirmed understanding that they themselves are the admin via the deployer account.

| Option | Description | Selected |
|--------|-------------|----------|
| Sadece maliyetler | set_costs only; cap fixed at init | |
| İkisi de | set_costs AND set_max_makers_per_token tunable | ✓ |
| Hiçbiri | Everything fixed at initialize | |

**User's choice:** both admin-tunable. Lowering the cap never evicts existing entries; it only
blocks new additions.

---

## Registration lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Hata ver | Strict error on duplicate add / absent remove (AirSwap-faithful) | ✓ |
| Sessizce atla | Idempotent no-op semantics | |

**User's choice:** strict errors, no funds move on error.

| Option | Description | Selected |
|--------|-------------|----------|
| URL güncellensin | Re-call of set_url updates URL, no extra stake | ✓ |
| Hata versin | URL change requires eject + re-register | |

**User's choice:** update in place; only the first call stakes.

| Option | Description | Selected |
|--------|-------------|----------|
| Hata ver | add_tokens before set_url errors (NotRegistered) | ✓ |
| Otomatik kayıt | add_tokens auto-registers with empty URL | |

**User's choice:** hard error; registration order is set_url first.

| Option | Description | Selected |
|--------|-------------|----------|
| Evet, ekle | Add remove_protocols (stake-free, symmetric) | ✓ |
| Hayır, spec'e sadık kal | Keep the exact spec §5 sketch | |

**User's choice:** add `remove_protocols` (recorded extension beyond the spec sketch).

---

## Input validation

| Option | Description | Selected |
|--------|-------------|----------|
| Sadece uzunluk | Non-empty, max 256 bytes; scheme checked client-side | ✓ |
| Uzunluk + https öneki | Also verify https:// prefix on-chain | |
| Hiçbir şey | Accept anything including empty | |

**User's choice:** length-only validation.

| Option | Description | Selected |
|--------|-------------|----------|
| Evet, sabit tavanlar | Max 32 tokens, 8 protocols per maker (code constants) | ✓ |
| Sadece token tavanı | Cap protocols only | |
| Sen karar ver | Claude picks values | |

**User's choice:** fixed caps on both per-maker lists.

---

## Live Testnet check

| Option | Description | Selected |
|--------|-------------|----------|
| rfq-live-swap deseni | Self-contained tools/rfq-registry-live.mjs, Friendbot actors, no key file | ✓ |
| Demo anahtarlarıyla | Reuse demo-keys.json accounts | |

**User's choice:** mirror the rfq-live-swap.mjs pattern.

| Option | Description | Selected |
|--------|-------------|----------|
| Uzatma kanıtı | Live script proves TTL bump via getLedgerEntries before/after a write; archival simulated in unit tests | ✓ |
| Tam arşiv döngüsü | Wait out real TTL lapse on Testnet (days/weeks) | |

**User's choice:** TTL-bump proof live, archival in unit tests.
**Notes:** The user asked for a detailed explanation of TTL/archival before answering; explained
rent, archival, restore, and why a real lapse cannot fit a single script run.

---

## Claude's Discretion

- Re-registration after eject: allowed as a fresh registration.
- Non-positive costs rejected; empty-Vec and intra-call-duplicate arguments error.
- Event names/topics (events on every state transition per spec §7.6), error enum numbering,
  storage key shapes, TTL constants: modeled on `contracts/rfq_swap/src/lib.rs`.

## Deferred Ideas

- Registry indexer / HTTP cache (IDX-01, open question, unscheduled).
- Mainnet admin hardening (multisig + timelock) while Testnet-only.
