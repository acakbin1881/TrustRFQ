# Phase 3: Live Full RFQ Loop - Research

**Researched:** 2026-09-13
**Domain:** Vercel serverless function deployment (sibling maker-server repo) + live Testnet RFQ integration proof
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Maker server bootstrap (separate repo)**
- **D-01:** Create the separate maker-server repo now, seeded from `tools/e2e/stub-maker.mjs`'s
  signing and wire logic (real JSON-RPC 2.0 `getMakerSideOrder`, genuinely signed auth entries,
  real Testnet settles). Drop test-only failure knobs; add a persistent maker identity and server
  config. Waiting for an external party was rejected (indefinite block on the milestone).
- **D-02:** The separate-repo work is planned and executed FROM THIS GSD PROJECT: Phase 3 plans
  include the tasks that create and develop the sibling repo. Code lands there, never here; this
  repo only consumes the endpoint.
- **D-03:** The reference maker's v1 surface is exactly Phase 2's D-12 minimal: `getMakerSideOrder`
  + real auth-entry signing + the wire errors the flow needs (e.g. -33700 trustline refusal). No
  `getPricing`, no `getTakerSideOrder`, no WSS, no health/rate-limit endpoints (deferred).
- **D-04:** Pricing is a FIXED CONFIGURED RATE (e.g. 1 XLM = 2.5 USDC) plus optional spread, set in
  server config. Deterministic pricing lets the E2E-02 record verify expected vs actual amounts
  exactly. Reflector-derived pricing and a pluggable pricing hook were both deferred.

**Origin, hosting, CSP, desk deployment**
- **D-05:** The maker server deploys to a REAL permanent https origin as a Vercel serverless
  function (its own Vercel project; maker secret key lives in Vercel env). Localhost and tunnels
  were rejected. Cold-start latency fits inside the desk's 2-3s fan-out timeout.
- **D-06:** `vercel.json` `connect-src` gains the maker origin by hand, per the curated allow-list
  posture (Phase 2 D-11). This is the CSP-01 closure.
- **D-07:** Evidence-first deployment ordering: E2E-02 runs against the Vercel BRANCH PREVIEW
  deployment of `feat/rfq-milestone` first (previews get the same `vercel.json` headers). Merge to
  `main` (auto-deploys production) only AFTER E2E-02 passes; an optional post-merge verification
  run on production may follow.

**Driving the run**
- **D-08:** Dual evidence: the automated driver (`tools/e2e/rfq-driver.mjs` extended to point at
  the real maker) is the REPRODUCIBLE tool; the recorded milestone evidence also includes ONE
  human-driven run with real Freighter in the browser (the 2026-07-14 two-wallet precedent).
- **D-09:** The automated run settles BOTH directions of XLM/USDC (two recorded txs); the manual
  run settles one direction. The maker holds inventory on both sides (demo-issuer USDC via
  existing mint tooling). The XLM->USDC direction exercises the taker trustline path live.

**Maker lifecycle and run record**
- **D-10:** The maker STAYS registered and live after the run: persistent identity, registry entry
  kept, server keeps quoting. Stake stays locked (Testnet XLM, no real cost). Register-run-eject
  was rejected (registry would sit empty again).
- **D-11:** The run record is Markdown + JSON together: the automated driver emits a
  machine-readable JSON artifact (committed), and a dated markdown record under `docs/` carries
  maker address, registry entry (URL + tokens), quotes, all tx hashes, the four balance deltas per
  swap, the desk deployment URL, the manual-run note, and post-reset re-run instructions.
- **D-12:** Post-reset recovery is a ONE-COMMAND re-bootstrap script in the maker repo: fund the
  maker account, set up trustline + inventory, register on the freshly deployed registry (`set_url`
  + `add_tokens`). This repo's Testnet-reset checklist (`public/otc-config.js` comment) gains a
  pointer to those maker steps.

### Claude's Discretion
- Maker repo name, exact sibling location, and internal layout.
- Key custody details: env var names on Vercel, local gitignored key-file convention (model on
  `demo-keys.json` / `e2e-keys.json`).
- CORS headers on the maker function (the desk calls it cross-origin; handle it correctly, it is
  an implementation detail).
- Exact record file paths, JSON artifact schema, and npm script naming for the live driver run.
- Run amounts, and how the manual run's evidence is captured beyond the mandatory tx hash.
- Whether integration fixes in this repo surface as their own plan or fold into the run plan.

### Deferred Ideas (OUT OF SCOPE)
- Maker server ops endpoints (health check, -33605 rate limiting): add if/when uptime matters
  beyond the demo window.
- Pluggable pricing hook and Reflector-derived quoting: maker-SDK maturation work, later.
- `getPricing`, `getTakerSideOrder`, WSS/LastLook: deferred by the source spec.
- Taker SDK extraction from `src/core/rfq/` into the separate repo: after the milestone.
- Carried from earlier phases: IDX-01 events indexer (open, revisit at milestone close), CSP
  `connect-src https:` wildcard (only if origin curation becomes a burden), registry
  indexer/HTTP cache.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| E2E-02 | LIVE FULL LOOP (milestone gate): the desk taker discovers a registered maker via `rfq_registry`, receives a live quote from the maker's own server (separate repo), and settles it on Testnet end-to-end, with the run recorded (maker address, registry entry, tx hash) | Standard Stack (Vercel serverless deployment pattern), Architecture Patterns (maker repo shape, CORS/CSP wiring), Code Examples (seeding the server from `stub-maker.mjs`, the driver's real-maker extension points), Common Pitfalls (cold start vs 3s fan-out timeout, orphaned registry entries, CORS preflight, env var key custody), Runtime State Inventory (registry/Vercel/CSP state this phase changes permanently) |
</phase_requirements>

## Summary

Phase 3 has almost no new *technology* to research — every building block (JSON-RPC 2.0 wire
shapes, `authorizeEntry`/RECORDING-mode simulation signing, registry `set_url`/`add_tokens`,
Freighter-mock E2E driving) already runs correctly in this repo's `tools/e2e/stub-maker.mjs` and
`tools/e2e/rfq-driver.mjs`, proven live on Testnet through Phase 2. This phase is a **deployment
and integration-proof problem**: take code that already works as a local child process and turn it
into (a) a standalone npm package in a new sibling repo, (b) deployed as a Vercel serverless
function behind a real https origin, (c) reachable cross-origin from the desk under CSP, (d)
registered permanently on the live `rfq_registry`, and (e) exercised by the existing E2E driver
pointed at that remote origin instead of a spawned local child process.

The one genuine open risk the research surfaced is **cold-start latency versus the desk's 3-second
per-maker fan-out timeout** (`src/data/rfqNetwork.ts`'s `AbortSignal.timeout(3000)`, confirmed by
reading the file this session). Community benchmarks report Vercel Node serverless cold starts
around 850ms-1s P50, but multiple independent GitHub issues report spikes to 2-3s under real
conditions — no official Vercel SLA exists. Layered on top of the maker's own ~100-300ms RECORDING-
mode simulation cost (from the adopted spec, §6), a cold invocation could plausibly exceed 3s and
get silently dropped by the taker's fan-out (by design — TAKER-02 drops non-2xx/timeout responses
with no error surfaced). This is a real risk to D-05's "cold-start latency fits inside the 2-3s
fan-out timeout" assumption and should be treated as unverified, not settled.

The rest of the phase is bookkeeping precision: a persistent Vercel-hosted signing key (env var,
never a file, never `Keypair.random()` per invocation — the maker's registry identity must survive
redeploys), CORS handled explicitly (Vercel does not add it automatically), `vercel.json`
`connect-src` and preview/production header parity (confirmed: headers apply identically to both),
and a driver run that swaps a spawned child process for a `fetch`-reachable remote URL with zero
change to the fan-out/validate/settle path it already exercises.

**Primary recommendation:** Seed the sibling maker repo directly from `tools/e2e/stub-maker.mjs`'s
signing logic (drop the D-12 failure-knob dispatch and the registry eject-on-SIGTERM teardown;
keep everything else), wrap the HTTP handler as a single Vercel Node serverless function
(`api/rpc.ts`) with explicit CORS + OPTIONS handling, load the maker's secret key from a Vercel
Sensitive env var scoped to Production, and bootstrap identity/registration with a one-shot Node
script (mirroring `tools/rfq-registry-live.mjs`'s `set_url`/`add_tokens` pattern) rather than
registering inside the serverless function's cold-start path.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Maker pricing + auth-entry signing | API / Backend (sibling repo, Vercel serverless function) | — | Signing requires the maker's private key; must never touch the browser tier. Already isolated this way in `stub-maker.mjs`. |
| Maker registry bootstrap (`set_url`/`add_tokens`) | API / Backend (one-shot script in sibling repo) | Database/Storage (`rfq_registry` contract) | A registration write is a deliberate, infrequent admin action, not a per-request server responsibility — doing it inside the serverless function's cold path would re-run on every cold start. |
| Quote discovery (`get_urls_for_token` reads) | Browser / Client (`src/data/rfqNetwork.ts`) | — | Already TAKER-01, unchanged by this phase; free RPC simulation reads, no maker server involved. |
| Quote fan-out (`getMakerSideOrder` fetch) | Browser / Client | API / Backend (maker's serverless function responds) | TAKER-02, unchanged shape; only the target URL moves from `localhost:4174` to a real https origin. |
| CSP allow-listing of the maker origin | CDN / Static config (`vercel.json`, this repo) | — | Enforced at the edge/CDN layer per request; must be updated by hand per the curated allow-list posture (no wildcard). |
| Settlement (`swap` invocation, taker signs) | Browser / Client + Database/Storage (Soroban contract) | — | Unchanged from Phase 2 (`src/core/rfq/settle.ts`); this phase only supplies a real counterpart maker signature. |
| Run evidence (JSON + Markdown record) | Browser-side driver output / this repo's `docs/` and `tools/e2e/` | — | Reproducibility artifact, not a runtime component. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@stellar/stellar-sdk` | `^16.0.1` (already pinned this repo; latest on npm `17.0.1`, published 2026-08-25) [VERIFIED: npm registry] | `authorizeEntry`, `simulateTransaction` (RECORDING mode), `Contract`/`TransactionBuilder`, registry invocation | The sibling maker repo should pin the SAME major version this repo already runs against (`^16.0.1`), since `stub-maker.mjs` (the seed) already calls exactly this API surface correctly. Do not bump to 17.x without separately re-verifying the auth-entry/XDR shapes against this repo's golden-vector discipline. |
| Vercel Node.js Serverless Functions (`api/*.ts`, no `@vercel/node` runtime dependency required for a plain handler) | Node.js runtime as configured in the sibling repo's `vercel.json` `functions` block | Hosts the single `getMakerSideOrder` JSON-RPC endpoint | D-05's locked choice; a plain `export default function handler(req, res)` needs no framework, matching D-03's "minimal surface" (no Fastify, no Express) — fewer dependencies to legitimacy-audit and fewer moving parts to keep in sync with `stub-maker.mjs`'s already-correct logic. |
| TypeScript | `^5.x` current stable, matches this repo's tooling conventions | Type safety for the wire types (`RfqOrder`, `MakerSideOrderResult` — copy from `src/core/rfq/wire.ts`) | Keeps the sibling repo's wire types byte-identical in shape to what this repo's `validateQuote` expects; a drift here fails silently as a `malformed_field` rejection on the taker side, not a compile error, unless both repos independently type the same shapes. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vercel` (CLI) | latest (`59.16.0` at research time) [VERIFIED: npm registry] | Local dev (`vercel dev`), branch deploys, env var management (`vercel env add`) | Dev/deploy tooling only, not a runtime dependency of the served function. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vercel serverless function (single `api/rpc.ts`) | A small Express/Fastify app deployed the same way | Spec §9 suggests Fastify for the *eventual* maker-SDK-maturity server; D-03 explicitly scopes this phase's server to the minimal surface, so the extra framework buys nothing yet and adds a dependency to audit. Revisit when `getPricing`/rate-limiting/health endpoints are added post-milestone. |
| Vercel hosting | Fly.io / Render / a raw VPS | D-05 already locked Vercel specifically (cold-start risk noted below is the one real tradeoff; Vercel wins on "real permanent https origin with zero ops burden," matching this repo's own Vercel deployment). |
| Env var key custody | KMS/HSM signer callback (spec §7.4's eventual hardening target) | Out of scope for this phase's demo-scale server; a Vercel Sensitive env var is the documented, correct minimum for a Testnet-only, non-custodial-of-real-funds key. Flag as a v2 hardening item, not a Phase 3 gap. |

**Installation (sibling repo, once created):**
```bash
npm install @stellar/stellar-sdk@^16.0.1
npm install -D typescript vercel
```

**Version verification:** `npm view @stellar/stellar-sdk version` → `17.0.1` (latest; this repo
pins `^16.0.1` and should stay there for the maker repo too, since `authorizeEntry`'s signature
and RECORDING-mode simulation behavior are what `stub-maker.mjs` already proved live — do not
silently pick up 17.x in the new repo). `npm view vercel version` → `59.16.0`. Both confirmed via
`npm view` this session [VERIFIED: npm registry].

## Package Legitimacy Audit

| Package | Registry | Age (latest publish) | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|----------------------|--------------|--------------|---------|-------------|
| `@stellar/stellar-sdk` | npm | 2026-08-25 (latest version) | 373,292 | github.com/stellar/js-stellar-sdk | SUS (heuristic: "too-new" — flags any *recently released version* of an actively maintained package, not the package's first publish) | Approved — already the exact dependency running in production of THIS repo at `^16.0.1`; official Stellar Development Foundation org, no postinstall script. Treat the SUS flag as a heuristic false positive; no `checkpoint:human-verify` needed. |
| `@vercel/node` | npm | 2026-09-11 (latest version) | 3,271,380 | github.com/vercel/vercel | SUS (same "too-new" heuristic) | Not required for this phase (a plain handler needs no explicit `@vercel/node` runtime dependency); if the planner chooses to add it anyway for local-dev types, treat as low-risk (official Vercel org, 3.2M weekly downloads, no postinstall) but still route through a `checkpoint:human-verify` per protocol since it is NEW to this project. |
| `vercel` (CLI) | npm | 2026-09-11 (latest version) | 2,795,868 | github.com/vercel/vercel | SUS (same heuristic) | New devDependency for the sibling repo. Official org, huge download count, no postinstall script — low actual risk, but per protocol the planner must add a `checkpoint:human-verify` task before `npm install -g vercel` / adding it as a devDependency, since this project has not used it before. |
| `typescript` | npm | 2026-07-08 | 203,362,610 | github.com/microsoft/TypeScript | OK | Approved. |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `@vercel/node`, `vercel` (CLI) — both are the "too-new"
heuristic firing on an actively-maintained package's latest release date, not a slopsquat signal;
both have official `github.com/vercel/vercel` provenance and multi-million weekly downloads. The
planner should still insert a `checkpoint:human-verify` before first install per protocol, but
this is a low-risk, largely procedural gate, not a red flag requiring alternative-package
research. `@stellar/stellar-sdk` is exempted from the checkpoint requirement because it is already
running in production in this exact repo.

*No packages in this audit were discovered only via WebSearch/training data without registry
verification — all four were checked live via `npm view` this session.*

## Architecture Patterns

### System Architecture Diagram

```
BROWSER (this repo's desk, trustrfq.vercel.app)
  │
  │ 1. discoverMakerUrls(): 2x get_urls_for_token simulateTransaction (RPC)
  ▼
Soroban RPC (soroban-testnet.stellar.org) ── rfq_registry ──► returns maker's https URL
  │
  │ 2. fanOutMakerSideOrder(): POST https://<maker-origin>/api/rpc  (JSON-RPC 2.0, 3s timeout)
  ▼
SIBLING REPO'S VERCEL PROJECT (new https origin, CSP-allow-listed in THIS repo's vercel.json)
  │  api/rpc.ts (Node serverless function)
  │    - CORS + OPTIONS preflight handled explicitly
  │    - loads maker's Keypair from a Sensitive env var
  │    - builds throwaway-source `swap` tx, RECORDING-mode simulateTransaction (RPC call out)
  │    - authorizeEntry(makerEntry, keypair, validUntilLedger, passphrase)
  │    - returns { order, authEntry, signatureExpirationLedger, ... }
  ▼
BROWSER: validateQuote() (src/core/rfq/validate.ts, unchanged) ── accepts/rejects
  │
  │ 3. Accept: settleQuote() builds `swap(order)` tx, taker = tx source,
  │    attaches maker's authEntry, taker signs ONE Freighter signTransaction
  ▼
Soroban RPC ──► rfq_swap.swap() ──► two SAC transfers + fee transfer ──► swap event
  │
  ▼
tx hash + getTransaction confirmation ──► tools/e2e/rfq-driver.mjs report (JSON)
                                       ──► docs/<date>-live-rfq-run.md (Markdown record, D-11)
```

Registration is a **separate, one-shot, out-of-band flow** (not shown as a per-request path above):
a bootstrap script in the sibling repo runs `set_url` + `add_tokens` against `rfq_registry` once
(D-10 persistent registration), independent of any serverless function cold start.

### Recommended Project Structure (sibling maker repo)

```
trustrfq-maker-server/                 (name = planner/Claude's discretion, D-01/D-02)
├── api/
│   └── rpc.ts                         # single Vercel serverless function: getMakerSideOrder + CORS
├── src/
│   ├── signing.ts                     # signQuote(): RECORDING-mode sim + authorizeEntry (from stub-maker.mjs)
│   ├── order.ts                       # toAtomic/atomicToDecimal/orderScVal (copy from src/core/rfq/order.ts)
│   ├── wire.ts                        # RfqOrder / MakerSideOrderResult / RFQ_ERROR (copy from src/core/rfq/wire.ts)
│   └── config.ts                      # env var reads: MAKER_SECRET, RFQ_SWAP_CONTRACT_ID, RFQ_REGISTRY_ID, RATE
├── scripts/
│   └── bootstrap.mjs                  # D-12 one-command re-bootstrap: fund, trustline+inventory, set_url, add_tokens
├── vercel.json                        # functions config, CORS headers if not handled in-code
├── package.json
└── tsconfig.json
```

### Pattern 1: Seeding the serverless handler from `stub-maker.mjs`

**What:** `stub-maker.mjs`'s `signQuote()` and `handleGetMakerSideOrder()` (lines ~279-375 of
`tools/e2e/stub-maker.mjs`, read this session) already implement the exact spec-correct flow: build
a throwaway-source `swap` tx, `simulateTransaction` in RECORDING mode, pull the maker's entry out
of `sim.result.auth`, sign with `authorizeEntry`. This logic is transport-agnostic (it does not
know it's inside a `node:http` server) and ports directly into a Vercel handler body.

**When to use:** As the entire signing core of the sibling repo's `api/rpc.ts`.

**Example (adapted shape, not a verbatim copy — see `tools/e2e/stub-maker.mjs` lines 279-326 for
the exact source this pattern is drawn from):**
```typescript
// api/rpc.ts (Vercel Node serverless function)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { signQuote, priceQuote } from '../src/signing';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS).end();
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(404, CORS_HEADERS).end();
    return;
  }
  const msg = req.body; // Vercel parses JSON bodies automatically for Node functions
  if (msg?.method !== 'getMakerSideOrder') {
    res.writeHead(200, { ...CORS_HEADERS, 'content-type': 'application/json' })
      .end(JSON.stringify({ jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32601, message: 'Method not found' } }));
    return;
  }
  try {
    const order = priceQuote(msg.params);           // D-04: fixed configured rate + spread
    const signed = await signQuote(order);           // RECORDING-mode sim + authorizeEntry
    res.writeHead(200, { ...CORS_HEADERS, 'content-type': 'application/json' })
      .end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: signed }));
  } catch (e) {
    res.writeHead(200, { ...CORS_HEADERS, 'content-type': 'application/json' })
      .end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -33600, message: String((e as Error).message) } }));
  }
}
```

### Pattern 2: Persistent maker identity (departs from `stub-maker.mjs`'s `Keypair.random()`)

**What:** `stub-maker.mjs` deliberately uses a fresh `Keypair.random()` every process start (it is
a throwaway test fixture, ejected on SIGTERM). Phase 3's maker must be the OPPOSITE: one identity
that survives redeploys and cold starts, because D-10 requires it to STAY registered.

**When to use:** Generate the maker keypair ONCE (locally, via a bootstrap script mirroring
`tools/rfq-registry-live.mjs`'s pattern), store its secret in a Vercel Sensitive env var scoped to
Production, and have `api/rpc.ts` read `Keypair.fromSecret(process.env.MAKER_SECRET)` on every
invocation rather than generating a new key.

**Example:**
```typescript
// src/config.ts (sibling repo)
import { Keypair } from '@stellar/stellar-sdk';

const secret = process.env.MAKER_SECRET;
if (!secret) throw new Error('MAKER_SECRET env var not set');
export const makerKeypair = Keypair.fromSecret(secret);
```

### Pattern 3: Registration as a one-shot script, not a cold-start side effect

**What:** `stub-maker.mjs`'s `setup()` registers on the registry (`set_url` + `add_tokens`) every
time the process starts, because it IS a fresh throwaway process every run. A serverless function
cold-starts on unpredictable request timing; re-running `set_url` on every cold start would be
wasteful (though idempotent per D-06's "second `set_url` is a free in-place update", verified live
by `tools/rfq-registry-live.mjs` this session) and adds unnecessary RPC round trips to the request
that triggers the cold start.

**When to use:** Run registration ONCE, out of band, via `scripts/bootstrap.mjs` (D-12's
re-bootstrap script), invoked manually after each deploy / after each Testnet reset — not inside
`api/rpc.ts`.

### Anti-Patterns to Avoid

- **Registering inside the request handler:** couples an unrelated concern (admin bookkeeping) to
  the hot path and adds a two-transaction RPC round trip to a request that must fit inside the
  taker's 3s fan-out timeout.
- **A framework the spec's endgame wants but D-03 doesn't yet:** do not reach for Fastify/Express
  in this phase; D-03 is explicit that the v1 reference maker's surface is minimal, and a plain
  Vercel function handler covers it with zero extra dependencies.
- **Trusting `req.body` blindly for JSON-RPC shape:** validate `msg.jsonrpc === '2.0'` and
  `msg.method === 'getMakerSideOrder'` before touching `msg.params`, mirroring
  `stub-maker.mjs`'s existing method-name check (`tools/e2e/stub-maker.mjs:534`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Signing the maker's detached auth entry | Manual XDR construction / hand-built `SorobanAuthorizationEntry` | `simulateTransaction` (RECORDING mode) + `authorizeEntry` from `@stellar/stellar-sdk` | Already the proven pattern in `tools/rfq-live-swap.mjs` and `tools/e2e/stub-maker.mjs`; hand-building XDR is exactly the "classic bug farm" the adopted spec (§2, Design A) rejected building a custom signature scheme to avoid. |
| CORS for a cross-origin JSON-RPC endpoint | A custom CORS middleware from scratch | Explicit header-setting in the handler (the pattern above) — Vercel does not add CORS automatically | Confirmed via Vercel's own KB (`how-to-enable-cors`): functions must set the headers themselves; a hand-rolled preflight responder is easy to get subtly wrong (wrong status code, missing `Access-Control-Allow-Headers` for the JSON `content-type` header) and this repo already has a correct reference in `stub-maker.mjs`'s `CORS_HEADERS` constant. |
| Reproducible re-bootstrap after a Testnet reset | An ad hoc manual runbook only | A single idempotent Node script (D-12), following `tools/rfq-registry-live.mjs`'s already-proven fund→register→verify sequence | This repo's own Testnet-reset checklist precedent (multiple `window.*` ids) shows manual multi-step resets are exactly where mistakes accumulate; a script is cheaper to get right once than a checklist is to follow correctly every quarter. |

**Key insight:** Nothing in this phase requires new cryptographic or protocol logic — every hard
problem (auth-entry scoping, replay/expiry, registry bookkeeping) was already solved and proven
live in Phases 1-2. The entire remaining risk surface is **operational**: key custody, deployment
topology, CORS/CSP wiring, and timing under real (not localhost) network latency.

## Runtime State Inventory

> Phase 3 does not rename or refactor identifiers, but it does introduce and permanently mutate
> several pieces of live, out-of-repo state — the same "what survives after every file is
> updated" question applies to what this phase CREATES.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data (on-chain) | A NEW persistent `Maker(Address) -> MakerConfig` entry on the live `rfq_registry` (`CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G`, confirmed in `public/otc-config.js`), staked with real (free, Testnet) XLM. D-10: this entry is meant to OUTLIVE the phase and stay live until the next Testnet reset. | Code: bootstrap script writes it. Data: nothing to migrate (net-new); the entry must be re-created after every quarterly Testnet reset via the D-12 script — this is itself a recurring "data migration" the bootstrap script exists to make one command. |
| Live service config (not in git) | The maker's Vercel project: its own env vars (`MAKER_SECRET`, contract ids), its own custom/assigned domain. None of this lives in THIS repo's git history — it is entirely inside the sibling repo's Vercel dashboard. | This repo only needs the resulting https URL (recorded in `vercel.json` `connect-src` and the D-11 run record); the sibling repo's Vercel project settings are out of this repo's version control by construction (mirrors `CLAUDE.md`'s existing note that this repo's OWN Vercel project config is likewise outside git). |
| OS-registered state | None — a Vercel serverless function has no OS-level registration analog (no systemd unit, no launchd plist, no Task Scheduler entry) the way `tools/slippage`'s cron job does. | None. |
| Secrets/env vars | `MAKER_SECRET` (new, Vercel Sensitive env var, sibling repo only) — the maker's Stellar secret key. Local dev convention: a gitignored key file in the sibling repo, modeled on THIS repo's `demo-keys.json`/`e2e-keys.json` (Claude's discretion per CONTEXT.md). | Code: `src/config.ts` reads `process.env.MAKER_SECRET`. No existing secret is renamed; this is net-new. |
| Build artifacts | None in THIS repo. The sibling repo's own `node_modules`/`.vercel` build output is that repo's concern (should follow this repo's own `.gitignore` precedent: `.vercel`, `node_modules`, `dist/`). | None here. |

**Nothing found in category "OS-registered state":** verified by reasoning about Vercel's
serverless execution model (no persistent process, no OS-level service registration) — there is no
equivalent surface to audit the way `launchd`/Task Scheduler entries would need auditing in a
rename phase.

## Common Pitfalls

### Pitfall 1: Cold-start latency exceeding the taker's fan-out timeout

**What goes wrong:** The desk's `getMakerSideOrder` fetch uses `AbortSignal.timeout(3000)`
[VERIFIED: src/data/rfqNetwork.ts:80-81 — `signal: AbortSignal.timeout(3000), // 2-3s per TAKER-02, per-request (not a fan-out budget)`]. If the maker's Vercel function has gone cold (idle beyond Vercel's warm-instance window), the cold-start delay plus the maker's own RECORDING-mode simulation RPC round trip (spec-documented "adds ~100-300ms against a nearby RPC," §6) can together approach or exceed 3 seconds. TAKER-02's fetch then throws, is caught, and the quote is silently dropped (`getMakerSideOrder` in `rfqNetwork.ts` returns `null` on any fetch failure) — the maker simply never appears as a quote row, with no visible error.
**Why it happens:** Community benchmarks (openstatus.dev, Mar 2024) report Vercel Node.js cold starts around 859ms P50, but several GitHub issues/discussions on `vercel/vercel` report 2-3s spikes under real conditions; there is no official Vercel-published cold-start SLA [CITED: web search, LOW confidence — see Assumptions Log A1].
**How to avoid:** (1) The automated driver run (D-08) should issue at least one "warm-up" request to the maker before the timed scenario, and document that the FIRST cold request may need a retry — this is defensible evidence practice, not cheating, since a real taker's own retry-once-on-failure UX (already shipped, D-09 from Phase 2) covers exactly this case. (2) Consider a low-frequency keep-warm ping (a Vercel Cron Job hitting the function every few minutes) if cold starts prove to be a recurring problem during the live run — but this is an operational mitigation to try if the problem is OBSERVED, not something to pre-build speculatively (D-03 already excludes ops endpoints from v1 scope; a cron keep-warm is infra, not a wire-protocol endpoint, so it does not conflict with that decision). (3) Record actual observed latency in the D-11 run record so this becomes a measured fact, not a repeated assumption on the next Testnet reset.
**Warning signs:** A `getMakerSideOrder` fetch that reliably fails only on the FIRST request after a period of maker inactivity, and succeeds on retry — the signature of a cold start, not a wire-protocol bug.

### Pitfall 2: CORS preflight not handled, quote silently unreachable from the browser

**What goes wrong:** Vercel Functions do not add CORS headers automatically [CITED: vercel.com/kb/guide/how-to-enable-cors]. If `api/rpc.ts` only handles `POST` and ignores `OPTIONS`, the browser's preflight request (triggered because the desk sends a `content-type: application/json` POST cross-origin) gets a non-2xx or header-less response, and the actual POST never fires — the maker looks completely unreachable, with a browser-console CORS error, not a wire-protocol error.
**Why it happens:** It's easy to port `stub-maker.mjs`'s `node:http` handler logic (which DOES handle `OPTIONS` explicitly, confirmed by reading `tools/e2e/stub-maker.mjs:513-517` this session) while forgetting that a Vercel serverless function needs the identical explicit handling — nothing in the platform does it for you.
**How to avoid:** Port `stub-maker.mjs`'s existing `CORS_HEADERS` constant and its `OPTIONS` branch verbatim into the Vercel handler (see Pattern 1's Code Example above); test with a real cross-origin fetch from the Vercel branch-preview URL before trusting the E2E driver's headless browser (which may mask CORS issues Playwright's route interception doesn't reproduce identically to a genuine cross-origin fetch).
**Warning signs:** The maker's URL responds fine to `curl -X POST`, but the desk's browser console shows a CORS error and zero requests reach the maker's logs.

### Pitfall 3: Orphaned registry entries from a maker key with no persisted secret

**What goes wrong:** `tools/e2e/rfq-driver.mjs`'s own header comments document this exact failure mode already happening during Phase 2 development: a `Keypair.random()` maker process that crashes before its SIGINT/SIGTERM eject handler runs leaves an un-ejectable, permanently-staked registry entry (its secret was never written anywhere) [VERIFIED: tools/e2e/rfq-driver.mjs:874-896 — "A maker process that registers on-chain and then crashes BEFORE reaching its SIGINT/SIGTERM eject handler ... leaves an un-ejectable registry entry behind ... no later process can ever sign an `eject` for it"]. Phase 3's maker uses a PERSISTENT key specifically to avoid this class of problem (D-10), but the risk shifts: if the bootstrap script is re-run with a freshly generated key by mistake (rather than reusing the stored `MAKER_SECRET`), the OLD entry becomes exactly this kind of orphan.
**Why it happens:** Confusing "regenerate the maker's identity" (wrong, breaks D-10 persistence) with "regenerate the bootstrap script's throwaway probe/test accounts" (fine, matches `stub-maker.mjs`'s existing pattern for actors OTHER than the maker itself).
**How to avoid:** The bootstrap script must load an EXISTING `MAKER_SECRET` if one is already configured (fail loudly rather than silently generating a new key), and only generate a fresh keypair on a genuinely first-time setup or an explicit `--fresh-maker`-style flag (mirroring `tools/e2e/prepare-keys.mjs`'s existing `--fresh-maker` convention, confirmed this session).
**Warning signs:** `get_maker` for the expected maker address suddenly errors ("not found") while the desk still shows a stray, unresponsive maker URL in discovery.

### Pitfall 4: Amount/decimals drift between the sibling repo's copy of `order.ts`/`wire.ts` and this repo's originals

**What goes wrong:** The maker server needs its own copies of `toAtomic`/`atomicToDecimal`/`orderScVal` (there is no shared npm package between the two repos per the locked repo split) and the `RfqOrder`/`MakerSideOrderResult` types. A silent divergence — e.g. a decimals constant hardcoded differently, or a field renamed in one repo but not the other — produces a quote this repo's `validateQuote` rejects as `malformed_field` or `tree_mismatch`, which looks identical to a genuinely malicious/broken maker.
**Why it happens:** Two independent repos maintaining structurally identical logic is the acknowledged cost of the locked repo split (spec §11); nothing enforces the two copies stay in sync except discipline.
**How to avoid:** Copy `src/core/rfq/order.ts`'s `toAtomic`/`atomicToDecimal` and `wire.ts`'s type definitions into the sibling repo VERBATIM at seed time (not reimplemented from memory), and note the copy's origin commit hash in a comment so future drift is at least traceable. `stub-maker.mjs` already does this correctly (its own header comment: "the exact ScVal encoding src/core/rfq/order.ts's orderToScVal produces") — carry that discipline, and that exact working code, into the new repo.
**Warning signs:** `validateQuote` rejects every quote from the real maker with `tree_mismatch` or `malformed_field` despite the maker server logging a successfully signed response.

## Code Examples

### Registering a persistent maker (adapted from the proven live pattern)

```javascript
// Source: tools/rfq-registry-live.mjs (this repo), lines 178-193 (invokeRegistry),
// already proven live this session as tools/e2e/stub-maker.mjs's own setup() sequence
// (lines 576-585, read this session).
async function invokeRegistry(kp, fnName, args) {
  const account = await server.getAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, { fee: FEE, networkPassphrase: NETWORK })
    .addOperation(registry.call(fnName, ...args))
    .setTimeout(TIMEOUT)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) throw new Error(`${fnName} failed: ${sim.error}`);
  const ready = rpc.assembleTransaction(tx, sim).build();
  ready.sign(kp);
  const sent = await server.sendTransaction(ready);
  const final = await server.pollTransaction(sent.hash, { attempts: 20, sleepStrategy: () => 1000 });
  if (final.status !== 'SUCCESS') throw new Error(`${fnName} tx ${final.status}`);
  return sent.hash;
}
// Bootstrap script calls: invokeRegistry(makerKp, 'set_url', [...]) then
// invokeRegistry(makerKp, 'add_tokens', [...]) — exactly stub-maker.mjs's setup(),
// run ONCE out of band instead of on every process start.
```

### Extending the E2E driver to target a real remote maker

The driver already parameterizes maker interaction almost entirely through `maker.url` (see
`tools/e2e/rfq-driver.mjs`'s `spawnStubMaker()` return shape `{ child, url, pubkey }`, read this
session). Pointing it at a real deployed maker means skipping `spawnStubMaker()` entirely for the
"real maker" scenario and supplying `{ url: 'https://<sibling-repo-origin>/api/rpc' }` directly —
no change needed to `page.route(maker.url, ...)` interception logic, `runD12Scenario`, or any
validation/settlement code, since all of that already operates purely on the URL string and the
genuine HTTP responses it returns. The failure-knob scenarios (SLOW/MALFORMED/REFUSE/DRIFTED/
WRONG_FEE) are D-03-excluded from the reference maker's surface, so those specific scenarios stay
exercised only against the local stub, not the live run — the live E2E-02 run is the HAPPY PATH
(plus the two-direction settlement D-09 requires) against the real remote origin.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Maker as a local `node:http` child process spawned by the E2E driver (Phase 2, `tools/e2e/stub-maker.mjs`) | Maker as a deployed Vercel serverless function behind a real https origin (Phase 3, sibling repo) | This phase | The wire protocol, signing logic, and validation are UNCHANGED — only the transport/hosting layer changes, which is precisely why this phase is scoped as an integration-and-deployment proof rather than new protocol work. |
| Registry populated only transiently during E2E runs (registered, then ejected at teardown) | Registry carries a permanently live maker entry (D-10) | This phase | The `rfq_registry` phone book becomes genuinely useful to a human visiting the desk between Testnet resets, not just a test fixture. |

**Deprecated/outdated:** None — this phase does not deprecate any existing code path; it adds a
new deployment target alongside the still-useful local stub maker (which Phase 2's D-12 scenarios
continue to depend on for negative-path testing).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vercel Node.js serverless cold starts typically land around 850ms-1s P50, with documented spikes to 2-3s in some conditions, and no official Vercel SLA exists | Common Pitfalls (Pitfall 1), Summary | If cold starts are consistently worse than this in practice, the maker may need a keep-warm cron or the taker's 3s timeout may need revisiting (out of this phase's scope to change TAKER-02's constant) — the risk is a flaky/inconsistent E2E-02 run, not a wrong architecture. Verified only by community benchmarks/GitHub issues (LOW confidence, no official Vercel number), not measured directly against the actual sibling repo's function — the planner should have the phase's own plan MEASURE this empirically (the D-08 automated run's own timing IS the real verification) rather than trust this research's estimate. |
| A2 | A plain Vercel Node serverless function (`api/rpc.ts`, no `@vercel/node` runtime dependency, no framework) is sufficient to serve one JSON-RPC POST method with correct CORS | Standard Stack, Architecture Patterns Pattern 1 | If Vercel's platform requires `@vercel/node` types/runtime declarations for TypeScript functions that this research didn't surface, the planner may need an extra `checkpoint:human-verify` around the sibling repo's first successful `vercel dev`/deploy before committing to "no framework." Low risk: this is a very standard, widely-documented Vercel pattern. |
| A3 | The sibling repo should pin `@stellar/stellar-sdk@^16.0.1` (matching this repo) rather than the newer `17.0.1` | Standard Stack | If 17.x has a breaking change to `authorizeEntry`'s signature or RECORDING-mode simulation output shape, pinning to 16.x avoids that risk but foregoes any bug fixes 17.x carries. Not independently verified against the 17.x changelog this session — only npm's latest-version metadata was checked. |

**If this table is empty:** N/A — see rows above.

## Open Questions

1. **What is the actual measured cold-start + RECORDING-mode-simulation latency for THIS specific
   maker function, deployed to THIS specific Vercel project?**
   - What we know: Community benchmarks suggest cold starts of order ~1-3s are plausible; the
     spec estimates simulation adds ~100-300ms.
   - What's unclear: Whether the combination reliably fits inside the taker's fixed 3s per-request
     timeout in practice.
   - Recommendation: Treat this as something the phase's own execution measures directly (the
     automated driver run's timing data, captured in the D-11 JSON record) rather than something
     research can settle in advance. If it's a real problem, a keep-warm cron is the documented
     mitigation (Pitfall 1).

2. **Exact sibling repo name and location.**
   - What we know: CONTEXT.md leaves this to Claude's discretion; the spec's §10 open-questions
     section suggested `trustrfq-maker-server` as one naming option (not binding).
   - What's unclear: Whether the planner wants it as a sibling directory to this repo locally, a
     separate GitHub repo under the same account, or both.
   - Recommendation: Default to `trustrfq-maker-server` as a sibling GitHub repo (matches AirSwap's
     own `airswap-ref-server` naming precedent cited in the adopted spec §11), created via the
     planner's task sequence rather than assumed here.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Sibling repo local dev, bootstrap script | ✓ | `>=20.19` (this repo's `package.json` `engines`, confirmed) [VERIFIED: package.json:5-6] | — |
| `@stellar/stellar-sdk` | Signing, registry invocation, simulation | ✓ (already installed, this repo) | `^16.0.1` pinned; `17.0.1` latest on npm | Pin `^16.0.1` in the sibling repo too (see A3) |
| Vercel CLI (`vercel`) | Local dev / deploy of the sibling repo | Not yet installed anywhere in this environment (new project) | `59.16.0` latest on npm, confirmed via `npm view` | `npx vercel` avoids a global/dev-dependency install if preferred |
| A Vercel account with a second project | Hosting the maker server on its own https origin | Assumed available (this repo already deploys to Vercel; same account can create a second project) — not independently confirmed this session | — | If unavailable, D-05 itself would need revisiting (out of this research's authority; a locked decision) |
| Testnet Friendbot / Horizon / Soroban RPC | Funding + registering the maker, live settlement | ✓ (used successfully throughout Phase 1-2, this session's file reads confirm working scripts against these exact endpoints) | — | — |

**Missing dependencies with no fallback:** none identified — the one unverified item (a second
Vercel project under the account) is an account/billing question outside this research's scope,
not a technical gap.

**Missing dependencies with fallback:** Vercel CLI not yet installed locally; `npx vercel` avoids
requiring an install step.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.10` (this repo, unchanged) for any pure-logic code copied into the sibling repo's own unit tests; Playwright-core `^1.60.0` (this repo) for the E2E driver extension |
| Config file | This repo: `vite.config.ts` (`include: src/**`, confirmed by CLAUDE.md's Gotchas). Sibling repo: none yet — Wave 0 gap. |
| Quick run command | `npm test` (this repo, unchanged: 12 files, 167 tests) |
| Full suite command | `npm test && npm run e2e:rfq` (this repo); sibling repo's own `npm test` once Wave 0 sets it up |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| E2E-02 (criterion 1) | Real maker discovered via `rfq_registry` with no hardcoded URL | integration (live Testnet) | `node tools/e2e/rfq-driver.mjs` (extended to target the real maker) | ❌ Wave 0 — driver needs a real-maker mode/flag |
| E2E-02 (criterion 2) | Maker's server returns a live signed quote the desk validates and accepts | integration (live Testnet + live https origin) | same driver run; `validateQuote` unit coverage already exists (`src/core/rfq/validate.test.ts`) | ✓ (validate.test.ts) / ❌ (live-maker driver flag) |
| E2E-02 (criterion 3) | Swap settles on Testnet, tx hash + event + four balance deltas match quoted amounts + fee | integration (live Testnet) | driver's existing settlement assertions (tx hash regex, balance-delta checks already present for the OTC driver's pattern) extended to RFQ | ❌ Wave 0 — balance-delta assertions for the RFQ swap specifically |
| E2E-02 (criterion 4) | Run recorded reproducibly (maker address, registry entry, quote, tx hash) after a Testnet reset | manual + automated (JSON+Markdown artifact per D-11) | driver writes `REPORT` JSON (existing pattern, `tools/e2e/rfq-driver.mjs`'s `REPORT` env var); a new `docs/<date>-live-rfq-run.md` is hand-authored from that JSON | ❌ Wave 0 — the Markdown record template + the sibling repo's `scripts/bootstrap.mjs` |

### Sampling Rate

- **Per task commit:** `npm test` (this repo's existing unit suite; the sibling repo's own quick
  unit run once it exists)
- **Per wave merge:** `npm run e2e:rfq` against the local stub maker (regression, cheap) plus a
  targeted run against the real deployed maker once it exists
- **Phase gate:** The live E2E-02 run itself (D-07's evidence-first ordering: branch preview first,
  then production) IS the phase gate — there is no "full suite" beyond that live proof for this
  milestone-gate phase.

### Wave 0 Gaps

- [ ] `tools/e2e/rfq-driver.mjs` needs a mode to target a real remote maker URL instead of
      `spawnStubMaker()` (covers E2E-02 criteria 1-2)
- [ ] Balance-delta assertions for the RFQ swap direction pair (XLM->USDC and USDC->XLM), mirroring
      the existing OTC driver's balance-delta pattern (covers E2E-02 criterion 3)
- [ ] Sibling repo: no test infrastructure exists yet (new repo) — needs its own `package.json`
      test script once created, even if minimal (unit tests for `toAtomic`/`orderScVal`/pricing)
- [ ] `docs/<date>-live-rfq-run.md` template (D-11) does not exist yet
- [ ] `scripts/bootstrap.mjs` (D-12 one-command re-bootstrap) does not exist yet (sibling repo)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No user-facing authentication surface added; the maker's identity IS its Stellar keypair, already covered under V6. |
| V3 Session Management | No | Stateless JSON-RPC request/response; no sessions. |
| V4 Access Control | Partial | `rfq_swap`'s `require_auth_for_args` (unchanged, existing contract) is the real access-control boundary; the maker server itself has no access-control logic of its own beyond "anyone can POST a quote request," which is the protocol's intended open-discovery model (spec §7.5). |
| V5 Input Validation | Yes | The maker server must validate `getMakerSideOrder` params before pricing (malformed `takerAmount`, unknown token addresses) — mirror `stub-maker.mjs`'s existing `toAtomic` parsing discipline; reject with `-33604` (invalid params) rather than crashing, per the spec's error vocabulary. |
| V6 Cryptography | Yes | `authorizeEntry`/`Keypair.fromSecret` from `@stellar/stellar-sdk` — never hand-roll signing. The maker's secret key custody (Vercel Sensitive env var) is the single most security-critical config decision this phase makes; treat it with the same care as this repo's existing `demo-keys.json` gitignore discipline. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Maker secret key leaked via a non-Sensitive env var, a client-exposed `NEXT_PUBLIC_`-style prefix, or committed to the sibling repo's git history | Information Disclosure | Vercel Sensitive env var scoped to Production only [CITED: vercel.com/docs/environment-variables/sensitive-environment-variables]; sibling repo's own `.gitignore` mirrors this repo's `demo-keys.json`/`e2e-keys.json` convention for any local dev key file. |
| A malicious/compromised taker spamming `getMakerSideOrder` to exhaust the maker's RPC quota or force excessive signing | Denial of Service | Explicitly deferred per D-03/spec §7.4 (rate limiting, `-33605`) — acceptable for this phase's demo-scale server, but the planner should note it as a known, accepted gap in the run record, not silently omit it. |
| Cross-origin requests from an unintended origin abusing the maker's wide-open `Access-Control-Allow-Origin: *` | Spoofing (of origin trust, not of the maker's own signature) | Accepted by design: the maker's signature-over-terms is the real trust boundary (spec §7.1), not CORS; a wide-open CORS policy matches AirSwap's own model where any taker can request a quote. Mirrors `stub-maker.mjs`'s existing header comment justifying `'*'` this session. |
| A caller-supplied `makerToken`/`takerToken` address that is not on the maker's own allow-list, tricking the maker into quoting/signing a hollow or malicious token contract | Tampering | The maker server must only quote its OWN configured token pair(s) (mirrors `src/core/tokens.ts`'s curated allow-list discipline on the taker side) — reject any request naming a token outside that list with `-33601` (pair not traded), never attempt to price an unknown token. |

## Sources

### Primary (HIGH confidence)
- `tools/e2e/stub-maker.mjs` (this repo, read in full this session) — the exact signing/wire logic this phase seeds from.
- `tools/e2e/rfq-driver.mjs` (this repo, read in full this session) — the E2E driver this phase extends.
- `tools/rfq-registry-live.mjs` (this repo, read in full this session) — the proven registration pattern.
- `src/data/rfqNetwork.ts`, `src/core/rfq/discover.ts`, `src/core/rfq/wire.ts`, `src/core/tokens.ts`, `src/config.ts` (this repo, read this session) — the exact taker-side contract this phase's maker must satisfy.
- `vercel.json`, `public/otc-config.js`, `package.json`, `.gitignore` (this repo, read this session) — existing deployment/config conventions this phase extends.
- `docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md` (read in full this session) — the adopted architecture, §6 (wire protocol), §9 (stack), §11 (repo split).

### Secondary (MEDIUM confidence)
- [Vercel docs: Environment Variables](https://vercel.com/docs/environment-variables) / [Sensitive environment variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables) — key custody pattern.
- [Vercel KB: How to enable CORS](https://vercel.com/kb/guide/how-to-enable-cors) — CORS must be handled explicitly.
- [Vercel docs: Static Configuration with vercel.json](https://vercel.com/docs/project-configuration/vercel-json) / [Response headers](https://vercel.com/docs/headers/response-headers) — preview/production header parity.
- [Stellar Docs: Signing Soroban contract invocations](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations) — `basicNodeSigner`/`authorizeEntry` server-side pattern (confirms existing repo usage).

### Tertiary (LOW confidence)
- [openstatus.dev: Monitoring latency, Vercel Serverless vs Edge](https://www.openstatus.dev/blog/monitoring-latency-vercel-edge-vs-serverless) — cold-start benchmark numbers (community, not official).
- [vercel/vercel GitHub issue #6292](https://github.com/vercel/vercel/issues/6292) and [discussion #7961](https://github.com/vercel/vercel/discussions/7961) — anecdotal reports of 2-3s cold starts.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library choice is either already running in this exact repo (`@stellar/stellar-sdk`) or a well-documented, officially-sourced Vercel pattern.
- Architecture: HIGH — directly derived from reading this repo's own already-proven-live code (`stub-maker.mjs`, `rfq-driver.mjs`, `rfq-registry-live.mjs`), not external inference.
- Pitfalls: MEDIUM — three of four pitfalls are grounded in this repo's own documented history (orphaned registry entries, amount/decimals drift risk from the repo-split precedent); the cold-start pitfall (Pitfall 1) rests on LOW-confidence external benchmarks and is explicitly flagged as needing live measurement, not settled research.

**Research date:** 2026-09-13
**Valid until:** 2026-10-13 (30 days; re-check Vercel's cold-start behavior and `@stellar/stellar-sdk` version if the phase is replanned after that window, since Vercel's platform and the SDK are both actively evolving)
