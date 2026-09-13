# Phase 3 — API Coverage Decision Matrix

**Produced:** 2026-09-13 (plan time)
**Detector:** `api-coverage.cjs` returned `detected: false` against the prescribed scope
(roadmap phase text only, no PLAN.md existed yet) and `detected: true` against the wider phase
scope (CONTEXT.md + RESEARCH.md), on the signals `consumes → endpoint` and `(surface) → sdk`.
The matrix is produced on the `true` result — a false negative from an empty scope is not a
reason to skip the decision.

## What external surfaces this phase integrates

1. **Stellar RFQ v1 wire protocol** (`docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md` §6)
   — TrustRFQ's own protocol. This phase builds the **maker side** of it in a sibling repo.
2. **Vercel platform** (serverless functions, env vars, response headers) — new to this project as a
   *function host*; already used as a static host.
3. **Soroban RPC / Horizon / Friendbot (Stellar Testnet)** — already integrated in Phases 1–2, no new
   surface; listed for completeness, not re-decided here.

## Matrix — Stellar RFQ v1 maker-side capability surface

| capability | decision | reason |
|---|---|---|
| `getMakerSideOrder` (JSON-RPC 2.0 method) | INTEGRATE | The one method the taker desk calls; the entire phase gate depends on it (D-03). |
| Maker detached auth-entry signing (`authorizeEntry` over `require_auth_for_args`) | INTEGRATE | The protocol's integrity boundary; without it there is no settleable quote. |
| Error `-33601` PAIR_NOT_TRADED | INTEGRATE | Required to refuse tokens outside the maker's configured allow-list (threat T-03-02). |
| Error `-33604` INVALID_PARAMS | INTEGRATE | Required so a malformed request is a wire error, not a 500 (ASVS V5). |
| Error `-33700` TAKER_TRUSTLINE_MISSING | INTEGRATE | Named explicitly in D-03 as a wire error the flow needs. |
| Error `-33701` MAKER_INVENTORY_UNAVAILABLE | INTEGRATE | Cheap, same dispatch site, and the honest response when the RECORDING sim fails on inventory. |
| Error `-33600` CANNOT_PROVIDE_ORDER | INTEGRATE | Catch-all for any other pricing/signing failure; keeps every failure inside the JSON-RPC envelope. |
| Error `-33602` / `-33603` AMOUNT_TOO_LOW / AMOUNT_TOO_HIGH | INTEGRATE | Two comparisons against configured min/max; prevents a nonsense quote reaching the signer. |
| Error `-33605` RATE_LIMITED | OPT-OUT | D-03 defers rate limiting and ops endpoints from the v1 reference maker; the accepted DoS gap is recorded as threat T-03-03 and restated in the run record. |
| `getPricing` | OPT-OUT | Deferred by the source spec and re-confirmed by D-03; the desk taker path never calls it. |
| `getTakerSideOrder` | OPT-OUT | Deferred by the source spec and re-confirmed by D-03; explicitly out of phase per CONTEXT.md `<domain>`. |
| WSS / LastLook streaming | OPT-OUT | Deferred by the source spec (`REQUIREMENTS.md` Out of Scope) and by D-03. |
| Health / readiness endpoint | OPT-OUT | D-03 excludes ops endpoints from the v1 surface; deferred until uptime matters beyond the demo window (CONTEXT.md `<deferred>`). |

## Matrix — `rfq_registry` maker-side surface (the maker's own calls)

| capability | decision | reason |
|---|---|---|
| `set_url` | INTEGRATE | Registers the maker's https origin with the `base_cost` stake (success criterion 1). |
| `add_tokens` | INTEGRATE | Puts the maker on both SAC token lists so `get_urls_for_token` intersection finds it. |
| `get_maker` | INTEGRATE | Read-back proof of the registry entry, and the driver's on-chain source for the maker's URL. |
| `add_protocols` | OPT-OUT | The desk's discovery path does not filter on protocols; adding them costs stake and proves nothing this phase claims. |
| `remove_tokens` | OPT-OUT | Nothing in this phase removes a token; D-10 keeps the entry live. |
| `eject` | OPT-OUT | D-10 explicitly rejects register-run-eject; the maker stays registered. Retained only as the documented recovery path in the run record. |

## Matrix — Vercel platform surface

| capability | decision | reason |
|---|---|---|
| Node.js serverless function (`api/*.ts`) | INTEGRATE | D-05's locked host for the maker endpoint. |
| Sensitive environment variables | INTEGRATE | The maker's secret key custody mechanism (threat T-03-01). |
| Response headers via `vercel.json` (this repo's CSP) | INTEGRATE | D-06's `connect-src` addition; preview/production header parity is what makes D-07's evidence real. |
| Branch preview deployments | INTEGRATE | D-07's evidence-first ordering runs E2E-02 against the branch preview before any merge. |
| Cron Jobs (keep-warm ping) | OPT-OUT | RESEARCH Pitfall 1 says to apply this only if cold starts are *observed* to break the 3s fan-out; pre-building it would be speculative infra. Revisit with the measured latency the run records. |
| Edge runtime | OPT-OUT | The signing path needs the full Node `@stellar/stellar-sdk` (XDR + ed25519); Edge buys nothing and risks a runtime incompatibility on the one path that must not fail. |
| Vercel Analytics / Speed Insights | OPT-OUT | POS-D1: interface metrics are never cited as evidence; adding an analytics beacon would also require a new CSP origin for no evidential gain. |
