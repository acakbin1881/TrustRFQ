# Phase 2: Desk RFQ Taker Path - Context

**Gathered:** 2026-08-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the desk into the RFQ taker, as a MINIMAL REFERENCE SURFACE over an SDK-shaped taker core:
registry discovery (two `get_urls_for_token` reads + client-side intersection), parallel
`getMakerSideOrder` fan-out (Stellar RFQ v1 wire, 2-3s timeout), local validation before any
wallet prompt, one-signature settlement through the deployed `rfq_swap`, trustline pre-flight,
golden-vector-pinned order encoding, curated CSP posture, and a stub-maker E2E that settles for
real on Testnet. Requirements: TAKER-01..06, CSP-01, E2E-01.

Positioning is LOCKED (POS-D1/UI-D1, see PROJECT.md): TrustRFQ is a protocol, not an end-user
interface. The desk surface exists only to demonstrate the protocol; taker logic lands as
SDK-shaped pure modules under `src/` so the separate-repo taker SDK can extract them; desk
components are a thin shell. Desk metrics are never cited as evidence.

Out of this phase: the real maker server (Phase 3, separate repo), broadcast retirement
(Phase 4), `getTakerSideOrder`, any events indexer (IDX-01, open question).

</domain>

<decisions>
## Implementation Decisions

### Desk placement (minimal reference surface)
- **D-01:** RFQ lives in a NEW, deliberately small panel: a fourth section in the bar-mounted
  section nav, peer of create/incoming/sent. `Ticket.tsx` and the broadcast lane are untouched
  (broadcast stays live until Phase 4). New `data-panel` name must be added to BOTH
  `src/App.tsx` and `public/intent.css` (known silent-failure gotcha).
- **D-02:** Discovery is visible as ONE line: after pair selection the panel shows an
  "N makers found" indicator (AirSwap hides discovery entirely; the user chose the indicator for
  the demo value of the on-chain registry). No maker list, no URLs.
- **D-03:** No persistence. RFQ writes NOTHING to Supabase, ever. Settlement confirmation is
  in-panel: exact amounts + tx hash link (+ swap event confirmation). The chain is the permanent
  record; read-back/history convenience belongs to IDX-01 (deferred). This keeps the RFQ lane
  chain-only end to end. — **Reversibility:** reversible — adding an optional history later is
  additive; the deliberate absence of a data layer is the decision.

### Quote display and selection
- **D-04:** Validated quotes render as a ranked list sorted by price, BEST PRESELECTED; the
  taker may select another row. The selection rule stays "best price like `airswap best`"
  (spec §6); the list is presentation, not a different selection algorithm.
- **D-05:** Each quote row shows a countdown; an expired quote drops from the list; a manual
  "re-quote" button re-runs the fan-out. NO automatic periodic re-fan-out (rate-limit friendly;
  wire error -33605 exists for a reason).
- **D-06:** Sell-side only in v1: one amount field (what the taker sells), `getMakerSideOrder`
  fan-out per TAKER-02. `getTakerSideOrder` is deferred.
- **D-07:** Maker identity is NOT shown on quote rows (AirSwap-faithful). Rows show
  price/receive amount + countdown only. The settlement guarantee is the signed auth entry, not
  maker identity; the N-makers indicator (D-02) already tells the registry story. Maker
  addresses stay visible in E2E records and dev tools, not in the UI.

### Trustline and settlement UX
- **D-08:** Trustline handling is "early passive note + in-flow prompt": on pair selection the
  desk checks the ALREADY-FETCHED `useBalances` trustline data (zero extra network cost) and, if
  the makerToken trustline is missing, shows a passive one-liner ("you'll need a trustline for
  X; makers may refuse to quote without it" — wire error -33700 is exactly this refusal). The
  actual changeTrust wallet prompt happens in-flow at accept time, before the swap
  `signTransaction`. Rationale: pure AirSwap just-in-time maps badly to Stellar because maker
  servers may pre-check and return -33700 instead of quotes, leaving an unexplained empty list.
- **D-09:** Expired-entry retry is PRICE-GUARDED, locked as "same principle as AirSwap": the
  taker never signs at a price they have not seen. On an expired-entry failure the desk
  auto-fetches ONE fresh quote; if the fresh price is equal or better it retries once
  automatically with a visible note; if worse it stops, re-displays the new price, and asks for
  re-confirmation. This satisfies TAKER-05's refresh-and-retry-once while preserving the
  never-unseen-price rule (Freighter's contract-invocation prompt does not render amounts
  human-readably; the panel is the real consent surface). The spec's unconditional auto-retry
  sentence is an SDK/programmatic-taker convenience, not a human-desk rule.

### Stub maker and E2E wiring
- **D-10:** The desk discovers the stub maker through REAL REGISTRATION: the E2E script funds a
  throwaway maker via Friendbot, registers its localhost URL on the real Testnet registry
  (`set_url` with real stake, `add_tokens`), the desk finds it through the normal registry read
  path with ZERO test-only code in `src/`, and the run ends with `eject` + full stake refund.
  `tools/rfq-registry-live.mjs` already demonstrates every one of these steps.
- **D-11:** CSP stays a CURATED allow-list: each real maker origin is added to `vercel.json`
  `connect-src` by hand at deploy time (token-allow-list philosophy). Phase 2 makes NO
  production CSP change (no real makers yet; the localhost stub runs only where Vercel headers
  do not apply); Phase 3 adds the first real origin. Measured fact behind the choice: AirSwap
  ships NO CSP at all (no header, no meta CSP on airswap.io / trader.airswap.io, HSTS only);
  copying that would loosen this repo's audited posture and was rejected. —
  **Reversibility:** reversible — a later `connect-src https:` wildcard is a one-line
  vercel.json edit if maker-count curation ever becomes a burden.
- **D-12:** The stub maker is FAITHFUL WITH FAILURE KNOBS: real JSON-RPC 2.0
  `getMakerSideOrder` returning a genuinely signed authEntry (Friendbot-funded maker key;
  settles for real on Testnet), plus test-togglable failure modes the census exercises: slow
  response (>3s timeout-drop), malformed JSON (drop), -33700 refusal, drifted economics / wrong
  feeBps (TAKER-03 pre-wallet rejection), expired entry (D-09 retry path). NOT implemented:
  `getPricing`, `getTakerSideOrder`, WSS.

### Claude's Discretion
- Settlement progress display: reuse the existing desk feedback patterns (toast + status
  progression + tx link in the in-panel confirmation); no new UX invented.
- Panel microcopy, empty states (zero quotes back, zero makers registered), fee display
  footnote (fee is maker-paid; taker sees net amounts), exact section label.
- SDK-shaped module layout under `src/` (e.g. `src/core/rfq/*` pure logic, one network module
  for JSON-RPC fan-out following the `fill.ts` isolation pattern) — shape it so the separate
  repo can lift it with minimal untangling.
- Stub maker location/port and failure-knob mechanism inside `tools/e2e/`.
- Golden-vector fixture shape for the RFQ order encoding (TAKER-06), modeled on
  `fixtures/canonical-args.json` + `src/core/canonical.test.ts`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Protocol / wire / taker flow
- `docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md` §6 — Stellar RFQ v1
  wire (JSON-RPC 2.0, `getMakerSideOrder` request/response shapes, error codes -33600..-33605
  plus -33700/-33701, decimal-string atomic amounts, taker G-only), maker-side auth-entry
  production, and the end-to-end taker flow (discover → fan out → validate & select → assemble
  → sign & submit → confirm) incl. the expired-entry failure handling this phase refines (D-09).
  §7 — security analysis (signature scoping, asset-model hazards, trustline pre-check). §4 —
  `rfq_swap` interface the taker invokes. §10 — recorded decisions (RFQ-D1/D2 auth model).
- `contracts/rfq_swap/src/lib.rs` — header-comment invariants; `swap` args and `get_config`
  (feeBps validation source for TAKER-03); the deployed contract this phase settles through
  (`RFQ_SWAP_CONTRACT_ID` in `public/otc-config.js`).

### Positioning (why the surface is minimal)
- `.planning/PROJECT.md` — POS-D1/UI-D1 in Key Decisions + the positioning Context bullet.
- `.planning/REQUIREMENTS.md` — the positioning note under the milestone DoD + the
  "Scope shape (UI-D1)" line over TAKER-01..05; TAKER/CSP/E2E requirement texts.
- SCF Customer Development Plan, private Notion "RFQ" page §3.1 (Final) — the source of the
  protocol-not-interface positioning ("our own web interface exists only to demonstrate the
  protocol"). Not in the repo; PROJECT.md carries the operative summary.

### Existing code to mirror or reuse
- `src/core/fill.ts` — the chain-ops isolation pattern (injected `WalletSigner`, no Supabase),
  enforcing-mode simulate + assemble + submit + poll, `ensureTrustline`; the RFQ settle path
  follows this shape but with the taker as tx source and NO `signAuthEntry`.
- `src/core/canonical.ts` + `src/core/canonical.test.ts` + `fixtures/canonical-args.json` —
  the golden-vector discipline TAKER-06 must replicate for the RFQ order encoding.
- `src/core/tokens.ts` — curated token allow-list (quarantine boundary); RFQ tokens resolve
  only from here (TAKER-05).
- `src/data/useBalances.ts` — already-polled Horizon balances incl. trustlines (feeds D-08's
  zero-cost early check).
- `src/config.ts` + `public/otc-config.js` — typed runtime config readers
  (`RFQ_REGISTRY_ID`, `RFQ_SWAP_CONTRACT_ID` already wired in Phase 1).
- `src/App.tsx` + `public/intent.css` — section nav and `data-panel` contract for the fourth
  section (D-01); `src/ui/useSettlement.ts` stays untouched and `App.tsx` must still never call
  it (standing invariant).

### E2E / live-proof patterns
- `tools/e2e/` — census harness (mock Freighter postMessage driver, real Testnet settlement,
  `e2e-keys.json` via `prepare-keys.mjs`); E2E-01 extends this with the stub maker + taker
  driver.
- `tools/rfq-registry-live.mjs` — Friendbot actor + register/discover/eject steps D-10 reuses.
- `tools/rfq-live-swap.mjs` — the proven mixed-credential settle flow (maker detached entry +
  taker source account) the desk path reproduces in-browser.

### Project instructions
- `CLAUDE.md` — verify-before-deploy checklist, CSP gotchas (allow-list sync, no inline
  scripts), `data-panel`/`intent.css` gotcha, commands (`npm test`, `npm run e2e:census`,
  `cargo test --manifest-path contracts/Cargo.toml`); `otc_swap` wasm hash `83f60b85...` must
  never move.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useBalances` trustline data: powers the D-08 early note with zero extra network calls.
- `ensureTrustline` (`src/core/fill.ts`): the in-flow changeTrust step at accept time.
- `AddressSeal`, `TokenSelect`, `Toast`, toast/status patterns: the panel composes existing
  pieces; no new design system work (minimal surface).
- Phase 1 registry: deployed `rfq_registry` (`RFQ_REGISTRY_ID` in runtime config) + its live
  script as the discovery/read reference.

### Established Patterns
- `src/core/*` purity rule (no wallet/window/network) and `fill.ts` as the ONE network module:
  the RFQ core follows the same split, which is exactly what makes it SDK-extractable (UI-D1).
- Golden vectors as the signature-boundary tripwire (TAKER-06).
- Runtime config un-bundled (`window.*`): any new id/origin stays a one-file Testnet-reset edit.
- Strict CSP allow-list posture (D-11); zero inline scripts in `dist/`.

### Integration Points
- Fourth nav section in `src/App.tsx` + matching `data-panel` rules in `public/intent.css`.
- New SDK-shaped RFQ modules under `src/core/` (+ one fan-out network module) and a thin panel
  component under `src/ui/`.
- `tools/e2e/` gains the stub maker + RFQ taker driver; `npm run e2e:census` covers the flow.
- `vercel.json` `connect-src`: NO change this phase (D-11); first real maker origin in Phase 3.

</code_context>

<specifics>
## Specific Ideas

- "AirSwap'la aynı olsun" was the user's recurring calibration question; where AirSwap's
  behavior was known or measured it was followed (hidden maker identity, in-flow prompts,
  never-unseen-price), and where copying it would weaken this repo's standing posture it was
  explicitly rejected (AirSwap ships no CSP; we keep the curated allow-list).
- The taker-side guarantee, in the user's words: within a quote's validity the price CANNOT
  change (the signature binds exact amounts; the chain settles exactly those or nothing);
  after expiry the old price is dead and only a re-shown price may be signed (D-09).
- The chain is the record: "on-chain işlemler chain üzerine yazılır, backend tutulmaz" —
  confirmed and encoded as D-03.

</specifics>

<deferred>
## Deferred Ideas

- `getTakerSideOrder` (buy-fixed direction) on the desk — beyond Phase 2; TAKER-02 covers
  `getMakerSideOrder` only.
- RFQ trade history / "my swaps" read-back — belongs to IDX-01 (events indexer), an open
  question; revisit at milestone close.
- CSP `connect-src https:` wildcard — revisit only if the curated per-maker origin list becomes
  a maintenance burden as maker count grows.
- Registry indexer/HTTP cache for instant discovery UX — carried from Phase 1, still deferred.

</deferred>

---

*Phase: 2-Desk RFQ Taker Path*
*Context gathered: 2026-08-29*
