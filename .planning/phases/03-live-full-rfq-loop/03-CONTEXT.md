# Phase 3: Live Full RFQ Loop - Context

**Gathered:** 2026-09-13
**Status:** Ready for planning

<domain>
## Phase Boundary

The milestone gate (E2E-02): a real registered maker, quoting from its own always-on server,
is discovered by the desk via `rfq_registry` and settled on Testnet end-to-end, with nothing
stubbed. Work in THIS repo: the first real maker origin joins `vercel.json` `connect-src`
(closing the CSP-01 clause Phase 2's D-11 deferred here), the automated E2E driver is extended
to run against the real maker, the run is recorded reproducibly, and any integration gaps the
real loop surfaces are fixed. The reference maker server itself is built in a SEPARATE sibling
repo (spec §11 repo split); Phase 3 plans in this GSD project drive that repo's creation, but
server code never enters this repo. Out of this phase: broadcast retirement (Phase 4,
RETIRE-01), the taker SDK extraction, `getTakerSideOrder`, any events indexer (IDX-01, open).

</domain>

<decisions>
## Implementation Decisions

### Maker server bootstrap (separate repo)
- **D-01:** We create the separate maker-server repo ourselves, now. The seed is the signing
  and wire logic of `tools/e2e/stub-maker.mjs` (already: real JSON-RPC 2.0 `getMakerSideOrder`,
  genuinely signed auth entries, real Testnet settles). Test-only failure knobs are dropped;
  a persistent maker identity and server config are added. Waiting for an external party was
  rejected (indefinite block on the milestone).
- **D-02:** The separate-repo work is planned and executed FROM THIS GSD PROJECT: Phase 3
  plans include the tasks that create and develop the sibling repo. Code lands there, never
  here; this repo only consumes the endpoint. Single steering point keeps the milestone
  coherent.
- **D-03:** The reference maker's v1 surface is exactly Phase 2's D-12 minimal:
  `getMakerSideOrder` + real auth-entry signing + the wire errors the flow needs (e.g. -33700
  trustline refusal). No `getPricing`, no `getTakerSideOrder`, no WSS, no health/rate-limit
  endpoints (deferred). The stub keeps the failure knobs; the reference server stays clean.
- **D-04:** Pricing is a FIXED CONFIGURED RATE (e.g. 1 XLM = 2.5 USDC) plus optional spread,
  set in server config. Deterministic pricing lets the E2E-02 record verify expected vs
  actual amounts exactly. Reflector-derived pricing and a pluggable pricing hook were both
  deferred.

### Origin, hosting, CSP, desk deployment
- **D-05:** The maker server deploys to a REAL permanent https origin as a Vercel serverless
  function (the maker repo gets its own Vercel project; maker secret key lives in Vercel env).
  Localhost and tunnels were rejected (weak evidence / churny URLs). Cold-start latency fits
  inside the desk's 2-3s fan-out timeout.
- **D-06:** `vercel.json` `connect-src` gains the maker origin by hand, per the curated
  allow-list posture (Phase 2 D-11). This is the CSP-01 closure.
- **D-07:** Evidence-first deployment ordering: E2E-02 runs against the Vercel BRANCH PREVIEW
  deployment of `feat/rfq-milestone` (previews get the same `vercel.json` headers, so the
  zero-CSP-violation proof is real). Merge to `main` (which auto-deploys production) happens
  only AFTER E2E-02 passes; an optional post-merge verification run on production may follow.

### Driving the run
- **D-08:** Dual evidence: the automated driver (`tools/e2e/rfq-driver.mjs` extended to point
  at the real maker) is the REPRODUCIBLE tool, re-runnable after Testnet resets; the recorded
  milestone evidence also includes ONE human-driven run with real Freighter in the browser
  (the 2026-07-14 two-wallet precedent). Wallet layer and maker are then both real in at
  least one recorded settle.
- **D-09:** The automated run settles BOTH directions of XLM/USDC (XLM->USDC and USDC->XLM,
  two recorded txs); the manual run settles one direction. The maker holds inventory on both
  sides (demo-issuer USDC via the existing mint tooling). The XLM->USDC direction exercises
  the taker trustline path live.

### Maker lifecycle and run record
- **D-10:** The maker STAYS registered and live after the run: persistent identity, registry
  entry kept, server keeps quoting, so anyone opening the desk sees a real maker until the
  next quarterly Testnet reset. Stake stays locked (Testnet XLM, no real cost).
  Register-run-eject was rejected (registry would sit empty again).
- **D-11:** The run record is Markdown + JSON together: the automated driver emits a
  machine-readable JSON artifact (committed), and a dated markdown record under `docs/`
  carries maker address, registry entry (URL + tokens), the quotes, all tx hashes, the four
  balance deltas per swap, the desk deployment URL, the manual-run note, and post-reset
  re-run instructions (success criterion 4).
- **D-12:** Post-reset recovery is a ONE-COMMAND re-bootstrap script in the maker repo:
  fund the maker account, set up trustline + inventory, register on the freshly deployed
  registry (`set_url` + `add_tokens`). This repo's Testnet-reset checklist (the comment in
  `public/otc-config.js`) gains a pointer to those maker steps.

### Claude's Discretion
- Maker repo name, exact sibling location, and internal layout.
- Key custody details: env var names on Vercel, local gitignored key-file convention
  (model on `demo-keys.json` / `e2e-keys.json`).
- CORS headers on the maker function (the desk calls it cross-origin; handle it correctly,
  it is an implementation detail).
- Exact record file paths, JSON artifact schema, and npm script naming for the live driver
  run.
- Run amounts, and how the manual run's evidence is captured beyond the mandatory tx hash.
- Whether integration fixes in this repo surface as their own plan or fold into the run plan.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Protocol / wire / repo split
- `docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md` §6 (Stellar RFQ v1
  wire: JSON-RPC 2.0 `getMakerSideOrder` shapes, error codes -33600..-33605 and
  -33700/-33701, decimal-string atomic amounts), §5 (registry the maker registers on),
  §7 (security analysis), §11 (repo split: the separate maker-server repo this phase
  bootstraps).

### Prior decisions this phase executes against
- `.planning/phases/02-desk-rfq-taker-path/02-CONTEXT.md` (Phase 2 D-09 price-guarded retry,
  D-10 real-registration discovery with zero test-only code in `src/`, D-11 curated CSP with
  the maker-origin clause deferred to this phase, D-12 stub scope).
- `.planning/REQUIREMENTS.md` (E2E-02 text, milestone definition of done, positioning note).
- `.planning/ROADMAP.md` (Phase 3 success criteria 1-4).
- `.planning/PROJECT.md` (POS-D1: evidence is on-chain proofs, never interface metrics).

### Code to seed, extend, or touch
- `tools/e2e/stub-maker.mjs` (the seed for the reference maker server: signing + wire logic).
- `tools/e2e/rfq-driver.mjs` + `tools/e2e/lib.mjs` + `tools/e2e/freighter-mock.mjs` (the
  automated driver D-08 extends to target the real maker).
- `src/core/rfq/` (discover/order/validate/settle/wire/retry: the shipped taker core the run
  exercises; changes only if the live loop surfaces a gap).
- `tools/rfq-registry-live.mjs` (register/fund/eject steps the re-bootstrap script mirrors).
- `tools/mint-usdc.mjs`, `tools/fund-demo.mjs`, `tools/derive-keys.mjs` (demo-issuer USDC
  inventory and funding patterns for the persistent maker).
- `vercel.json` (D-06 `connect-src` change; header parity between preview and production).
- `public/otc-config.js` (Testnet-reset checklist comment gains the maker pointer, D-12).
- `contracts/rfq_registry/src/lib.rs` and `contracts/rfq_swap/src/lib.rs` header comments
  (the on-chain invariants the live loop settles under).
- `CLAUDE.md` (commands, verify-before-deploy checklist, CSP gotchas).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `stub-maker.mjs` already signs real auth entries over the real wire shape: the reference
  maker is a refactor + deploy, not a from-scratch build.
- `rfq-driver.mjs` already drives the full desk RFQ flow through the mock Freighter and
  settles on Testnet; pointing it at a remote maker origin and a deployed desk URL is the
  extension surface.
- `tools/rfq-registry-live.mjs` demonstrates every registry step the persistent maker needs
  (set_url with stake, add_tokens, discovery reads).
- Demo funding tools + gitignored key-file convention cover maker funding and inventory.

### Established Patterns
- Evidence = on-chain proofs (POS-D1); recorded tx hashes and balance deltas, never UI
  metrics.
- Curated allow-lists everywhere: tokens (`src/core/tokens.ts`) and CSP origins move in
  lockstep with the code.
- Runtime config un-bundled (`window.*`): Testnet reset stays a one-file edit plus, now, the
  maker re-bootstrap pointer.
- Golden vectors + mutation-verified guards are the regression tripwires; the live loop must
  not require touching them.

### Integration Points
- `vercel.json` `connect-src` (the one production-posture change in this repo).
- `tools/e2e/` (driver extension + record emission).
- `docs/` (the dated run record).
- The new sibling maker repo (created by this phase's plans, consumed via its https origin).

</code_context>

<specifics>
## Specific Ideas

- "Nothing stubbed" is the phase's identity: every rejected option (localhost origin, mock
  wallet as sole evidence, ephemeral maker) was rejected for leaving a stub-shaped hole in
  the milestone claim.
- The registry phone book should be genuinely populated after this phase: a visitor opening
  the desk sees a real maker and can pull a real quote until the next Testnet reset.
- Evidence-first ordering throughout: prove on the branch preview, then merge; record first,
  then keep the maker live.

</specifics>

<deferred>
## Deferred Ideas

- Maker server ops endpoints (health check, -33605 rate limiting): add if/when the server's
  uptime starts to matter beyond the demo window.
- Pluggable pricing hook and Reflector-derived quoting: maker-SDK maturation work, later.
- `getPricing`, `getTakerSideOrder`, WSS/LastLook: deferred by the source spec.
- Taker SDK extraction from `src/core/rfq/` into the separate repo: after the milestone.
- Carried from earlier phases: IDX-01 events indexer (open question, revisit at milestone
  close), CSP `connect-src https:` wildcard (only if origin curation becomes a burden),
  registry indexer/HTTP cache.

</deferred>

---

*Phase: 3-Live Full RFQ Loop*
*Context gathered: 2026-09-13*
