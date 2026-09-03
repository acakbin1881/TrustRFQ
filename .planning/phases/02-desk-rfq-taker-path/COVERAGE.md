# Phase 02 — API Coverage Matrix

**Phase:** 02-desk-rfq-taker-path
**Generated:** 2026-09-03 (plan-phase)
**Policy:** Full API Coverage by Default — Opt Out, Never Opt In. Every capability the phase's
external surfaces expose is listed. `INTEGRATE` is the default; every `OPT-OUT` carries a
one-line reason.

The three surfaces this phase touches:

1. **Maker quote-server JSON-RPC 2.0** (Stellar RFQ v1, spec §6 of
   `docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md`) — the wire the desk
   fans out to.
2. **`rfq_registry`** (`CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G`) — the desk is
   a read-only consumer; the E2E stub-maker lifecycle (D-10) is the only writer.
3. **`rfq_swap`** (`CCNP7626WIJVWVTBPLPG6QM77TY6JBU42D4PYONUFTDEPIIW6ZFJQIDT`) — settlement.

---

## 1. Maker quote-server JSON-RPC (Stellar RFQ v1)

| Capability | Disposition | Reason (OPT-OUT only) |
|---|---|---|
| `getMakerSideOrder` | INTEGRATE | — (TAKER-02, D-06: sell-side fan-out is the phase's quote path) |
| `getTakerSideOrder` | OPT-OUT | Buy-fixed direction explicitly deferred — CONTEXT.md `## Deferred Ideas`; TAKER-02 scopes to `getMakerSideOrder` only |
| `getPricing(pairs, minExpiry?)` | OPT-OUT | Indicative pricing, not firm quotes; desk settles only signed quotes and D-12 excludes it from the stub maker |
| `getAllPricing()` | OPT-OUT | Same as `getPricing` — indicative-only surface, no settlement path |
| `getProtocols` | OPT-OUT | Maker protocol capability already readable on-chain via `rfq_registry` `MakerConfig.protocols`; a second discovery channel adds no capability this phase |
| `getTokens` | OPT-OUT | Token curation is deliberately off-chain via `src/core/tokens.ts` + registry token lists (REQUIREMENTS.md "Out of Scope": in-contract/maker-declared token allowlist rejected for v1) |
| `setProtocols` / `setTokens` (WSS server push) | OPT-OUT | WSS out of scope per D-12 and spec §10's HTTPS-only v1 recommendation |
| Error `-33600` cannot provide order | INTEGRATE | — (drop this maker from the quote list) |
| Error `-33601` pair not traded | INTEGRATE | — (drop) |
| Error `-33602` / `-33603` amount too low / too high | INTEGRATE | — (drop; surfaced through the shared empty state) |
| Error `-33604` invalid params | INTEGRATE | — (drop) |
| Error `-33605` rate limited | INTEGRATE | — (drop; D-05's no-automatic-re-fan-out rule exists to avoid provoking it) |
| Error `-33700` taker trustline missing / unauthorized for makerToken | INTEGRATE | — (D-08: exactly the refusal the passive trustline note pre-empts) |
| Error `-33701` maker inventory temporarily unavailable | INTEGRATE | — (drop, via the shared JSON-RPC error-response path) |
| JSON-RPC transport: HTTPS POST, 2-3s timeout, malformed-response drop | INTEGRATE | — (TAKER-02) |

## 2. `rfq_registry` entry points

| Capability | Disposition | Reason (OPT-OUT only) |
|---|---|---|
| `get_urls_for_token` | INTEGRATE | — (TAKER-01: two reads + client-side intersection) |
| `get_maker` | OPT-OUT | Desk deliberately shows no maker identity, URL, or config (D-02/D-07); discovery needs only the URL list. Still exercised on-chain by `tools/rfq-registry-live.mjs` from Phase 1. |
| `get_config` (registry) | OPT-OUT | Stake pricing (`base_cost`/`per_token_cost`/`max_makers_per_token`) is a maker-registration concern; the desk taker never stakes |
| `set_url` | INTEGRATE | — (E2E only, D-10: the stub maker registers its localhost URL with a real stake so the desk discovers it through the normal read path) |
| `add_tokens` | INTEGRATE | — (E2E only, D-10: stakes `per_token_cost` per curated-pair token so the intersection returns the stub) |
| `eject` | INTEGRATE | — (E2E only, D-10: run ends with a full stake refund and delisting) |
| `remove_tokens` | OPT-OUT | `eject` already unwinds every token list in one call; a partial removal adds no coverage the E2E lifecycle needs |
| `add_protocols` / `remove_protocols` | OPT-OUT | Protocol declaration is not read by the desk (see `get_maker` row); no taker-visible behavior depends on it |
| `initialize` | OPT-OUT | One-time deploy step, already executed in Phase 1; re-init is guarded by the contract |
| `set_costs` / `set_max_makers_per_token` | OPT-OUT | Admin surface; the desk taker is not the registry admin |

## 3. `rfq_swap` entry points and events

| Capability | Disposition | Reason (OPT-OUT only) |
|---|---|---|
| `swap(order)` | INTEGRATE | — (TAKER-04: taker as tx source, maker `authEntry` pre-attached, one `signTransaction`) |
| `get_config()` | INTEGRATE | — (TAKER-03: `feeBps` cross-check before any wallet prompt; also reads `paused`) |
| `SwapExecuted` event (via RPC `getEvents`) | INTEGRATE | — (TAKER-04: confirmation alongside `getTransaction`) |
| `is_cancelled(maker, order_id)` | OPT-OUT | Redundant round-trip: the enforcing-mode simulation that runs BEFORE the wallet prompt already surfaces a cancelled order as `Error::Cancelled`, so a separate read cannot prevent a prompt the simulation does not already prevent |
| `cancel(maker, order_ids)` | OPT-OUT | Maker-side entry point; the desk is the taker surface (recorded in 02-UI-SPEC.md Copywriting Contract: "not wired into this desk surface") |
| `OrdersCancelled` event | OPT-OUT | Emitted only by `cancel`, which the desk does not call; no taker-visible state derives from it |
| `set_fee` / `set_fee_collector` / `set_paused` | OPT-OUT | Admin surface, governed by the contract admin identity; not a taker capability |
| `upgrade(new_wasm_hash)` | OPT-OUT | Admin surface; this phase deploys nothing and is a pure consumer of the already-deployed instance |
| `__constructor` | OPT-OUT | Deploy-time only; already executed. Informational for a Testnet reset (RESEARCH.md Pitfall 6). |

---

## Summary

| Surface | INTEGRATE | OPT-OUT |
|---|---|---|
| Maker JSON-RPC | 9 | 6 |
| `rfq_registry` | 4 | 7 |
| `rfq_swap` | 3 | 6 |
| **Total** | **16** | **19** |

Every OPT-OUT above carries a reason traceable to REQUIREMENTS.md, 02-CONTEXT.md (`## Deferred
Ideas` or a D-XX decision), 02-RESEARCH.md, or the adopted architecture spec. No capability is
silently unlisted.
