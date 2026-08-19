# Context

Run 2026-08-19 (re-run #3). No DOC-type documents were present in this ingest (all 4 docs are
SPEC), so the DOC bucket proper is ABSENT, not omitted. The topics below are narrative/status
context carried by the SPECs themselves (ship status, supersedes relationships, prior-art notes,
accepted risks) that is context for downstream planning rather than a decision, requirement, or
constraint. Every entry cites its source.

## Ship status of the three 2026-07 specs (all historical records)
- source: docs/superpowers/specs/2026-07-10-react-ts-frontend-migration-design.md
  Implemented 2026-07-10 (same day); two-wallet E2E gate cleared 2026-07-14; 2026-08-17 banner
  marks it a historical record (line numbers cited in the body no longer align; the
  kit.signAuthEntry risk it flagged turned out to be a real upstream double-encoding bug, found
  in the E2E and normalised in src/wallet/authSignature.ts).
- source: docs/superpowers/specs/2026-07-12-desk-light-redesign-design.md
  Shipped; merged to main in e75cf6f (2026-07-15). Its 2026-08-17 banner says do not implement
  from it: intent.html was folded into the single-entry desk 2026-07-13 (5ed288d) and the
  notched-card mask is gone (shadow rule inverted).
- source: docs/superpowers/specs/2026-07-15-reflector-fair-price-suggestion-design.md
  Shipped 2026-07-18 (b051d2b). Feasibility verified 2026-07-15 against the live testnet
  External CEXs & DEXs Reflector oracle (decimals 14, base USD, XLM/USDC present, x_last_price
  absent, simulation works with a synthetic unfunded source account).

## RFQ adoption status and supersedes direction
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md
  Status: ADOPTED architecture 2026-08-17, docs-only adoption; implementation not scheduled by
  the adoption. Supersedes (in direction) the 2026-07-10 intent/private-offer layer, which
  shipped and stays live as the interim fan-out mode until the RFQ protocol ships. Naming: the
  feature is "the RFQ protocol"; the working name "stellar-rfq" and the phrases "institutional
  RFQ protocol" / "peer-to-server quoting" all retire — the protocol is peer-to-peer (the
  maker's server is the maker's own endpoint, never a middleman). AirSwap's LastLook streaming,
  NFT swaps, and staker fee-rebate mechanics are out of scope and not planned.

## Ecosystem prior art (Stellar Raven scan recorded in the RFQ spec)
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md (§3.1)
  No existing signed-quote RFQ protocol surfaced on Stellar (absence not proof of absence).
  References: Soroswap core (audited Soroban AMM; future RFQ consumer via its aggregator),
  Phoenix contracts (DEX suite, second reference codebase), stellar-dex-agg (+ StellarBroker,
  WOWMAX aggregation services) as first taker-integration targets. Consequences: the RFQ lane is
  whitespace; go-to-market is maker recruitment + aggregator integration, not end-user
  acquisition.

## Open questions recorded by the RFQ spec (§10)
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md
  Launch token list and per-asset risk labels · stake sizing · indexer in v1 vs chain-only reads
  · later registry-coupled in-contract token allowlist (v1: off-chain curation) · governance/
  admin custody (start: 2-of-3 multisig + 24h upgrade timelock) · WSS at launch or HTTPS-only
  (recommend HTTPS-only) · when to introduce a Cargo workspace under contracts/ · the separate
  server repo's name (suggestion: trustrfq-maker-server) · scheduling of the implementation
  phases (contracts -> server -> desk integration). Repo-context note: the Cargo-workspace
  question is already RESOLVED in the codebase (workspace introduced 2026-08-18 with rfq_swap;
  otc_swap wasm hash gated and byte-identical, per CLAUDE.md Status).

## Operational notes from the RFQ spec worth keeping
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md
  Cancellation race: a taker holding the signed entry can settle before a cancel lands
  (identical to AirSwap); tight expiries are the primary control, cancel the backstop. Maker
  server simulation adds ~100-300ms per quote; higher-frequency servers can cache the
  invocation-tree template per (pair, direction). Protocol-23 parallelism clusters by footprint:
  a very hot single maker wallet serializes within a ledger, so makers wanting high fill rates
  should shard inventory across wallets (maker-docs paragraph, not a protocol change). MEV:
  sandwiching is structurally impossible (price fixed by the maker's signature before the tx
  exists); residual risk is quote shading, addressed by multi-server competition.

## Accepted risks recorded by the migration spec (2026-07-10, partially overtaken)
- source: docs/superpowers/specs/2026-07-10-react-ts-frontend-migration-design.md
  (1) kit.signAuthEntry unproven end-to-end — OVERTAKEN: the E2E ran 2026-07-14 and surfaced the
  real double-encoding bug, now normalised (banner). (2) styles.css shared across the build
  boundary (static landing + compiled desk, one hand-maintained file) — still standing;
  revisit if the landing is ever ported. (3) topbar/brand markup duplicated between hero.html
  and the React shell — still standing.

## Desk redesign scope boundaries (shipped)
- source: docs/superpowers/specs/2026-07-12-desk-light-redesign-design.md
  Out of scope for that redesign: landing (hero.*), src/core/*, data layer, contract, intent
  layout, favicon (favicon.svg deliberately untouched, shared with the landing). Desk-only looks
  ride on new modifier classes (.wrap--desk, .ticket--swap, .field--card*, .section-fab,
  .sheet*) so the intent surface was untouched structurally.

## Fair-price YAGNI list (shipped feature's deliberate exclusions)
- source: docs/superpowers/specs/2026-07-15-reflector-fair-price-suggestion-design.md
  No deviation/% badge, no auto-fill, no mainnet feed, no caching to DB, no oracle for tokens
  outside the allow-list, no x_last_price (absent on the probed contract).

## Ingest provenance (this run)
- source: .planning/intel/ingest-manifest.yaml + classification notes
  Re-run #3. The 2026-07-10 intent-private-offer-layer spec is EXCLUDED from the set by the
  manifest (user-approved cycle break #1); the migration spec's classification had its banner
  backlink to the RFQ spec removed from cross_refs (user-approved cycle break #2, provenance in
  its notes field), keeping the RFQ -> migration citation edge. The in-set cross_ref graph is a
  single edge and acyclic. Dangling cross_refs to out-of-set repo files (CLAUDE.md, STELLAR.md,
  src/ paths, fixtures/, docs/migrations/*.sql) are expected and informational.
