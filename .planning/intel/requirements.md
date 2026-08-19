# Requirements

Run 2026-08-19 (re-run #3). No PRD-type documents were present in this ingest (all 4 docs are
SPEC), so there is no PRD-derived bucket; it is ABSENT, not omitted. Per orchestrator instruction,
forward-looking requirements are derived from the adopted RFQ protocol architecture spec
(manifest precedence 0), scoped to what belongs in THIS repo. The maker quote server and taker SDK
are explicitly OUT of scope for this repo (separate repo per the spec's §11 repo split; recorded
as a constraint in constraints.md). The three 2026-07 specs describe shipped work and yield
constraints/context, not open requirements. No competing acceptance variants exist.

Implementation-status notes come from repo context (CLAUDE.md Status), not from the spec, and are
flagged as such.

## REQ-rfq-swap-contract: `rfq_swap` settlement contract
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md (§4)
- description: Soroban contract settling a maker-signed RFQ order atomically: swap(order) with
  Order { maker, taker, maker_token, maker_amount, taker_token, taker_amount, expiry, order_id,
  fee_bps }; cancel(maker, order_ids) via temporary-storage flags; is_cancelled; admin surface
  (initialize, set_fee capped in code, set_fee_collector, set_paused, upgrade).
- acceptance: paused/amount/expiry/cancelled/fee checks precede auth; maker
  require_auth_for_args over the full economic tuple (taker, both tokens, both amounts, expiry,
  order_id, fee_bps); taker require_auth via source-account credentials; two transfers plus
  maker-paid fee, no custody; swap event published; checked i128 math; unit tests include
  un-mocked auth trees with single-arg perturbation negatives; testnet replay-rejection and
  expiration tests (host-level guarantees unreachable from mocked unit tests).
- scope: contracts/rfq_swap (this repo)
- status note (repo context, not the spec): BUILT, DEPLOYED and PROVEN on Testnet 2026-08-18
  (17 unit tests; live mixed-credential swap + replay rejection via tools/rfq-live-swap.mjs).
  Roadmapper should treat this as done, not schedulable.

## REQ-rfq-registry-contract: `rfq_registry` maker discovery contract
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md (§5)
- description: Stake-gated phone book: initialize(admin, stake_token, base_cost, per_token_cost,
  max_makers_per_token); set_url (stakes base_cost on first call); add_tokens/remove_tokens
  (per_token_cost stake/refund); add_protocols; eject (full unwind + refund); get_urls_for_token;
  get_maker.
- acceptance: stake asset is native XLM via its SAC; costs admin-tunable; storage layout
  Token(Address) -> Vec<Address> capped at max_makers_per_token plus Maker(Address) ->
  MakerConfig, both persistent, TTL bumped on every write; all lists explicitly bounded; pair
  intersection stays client-side; registry archival/restore exercised in testnet integration
  tests.
- scope: contracts/rfq_registry (this repo)
- status note (repo context): NOT built yet.

## REQ-rfq-swap-any: open-order entry point `swap_any`
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md (§4.4)
- description: swapAnySender equivalent: the maker authorizes an args tuple that omits the taker;
  the taker arrives as a separate unauthorized parameter (distinct entry point, since Soroban
  Address has no zero-address sentinel).
- acceptance: per the spec, explicitly NOT part of v1 — "Ship swap in v1; swap_any is a small
  follow-on", primarily for OTC-style open-order flows that are out of scope for the design.
- scope: contracts/rfq_swap follow-on (this repo); deferred beyond v1 by the source spec.
- status note (repo context): NOT built.

## REQ-rfq-desk-taker-path: the desk becomes the RFQ taker web app
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md (§3, §6 taker
  flow, §11)
- description: Taker flow end-to-end in this repo's SPA: discover maker URLs via two
  get_urls_for_token simulated reads and client-side intersection; fan out getMakerSideOrder in
  parallel (2-3s timeout, drop malformed responses); validate and select locally (economics
  match, feeBps equals on-chain value, sane expiry/signatureExpirationLedger, decoded authEntry
  invocation tree matches the order); assemble the tx with the taker's G-account as source and
  the maker's authEntry attached; enforcing simulate + assembleTransaction; taker signs one
  ordinary transaction (Freighter signTransaction — no wallet signAuthEntry needed); submit and
  poll; confirm via getTransaction plus the swap event.
- acceptance: reuses the existing building blocks named by the spec (src/core/fill.ts patterns,
  src/wallet/ layer, src/core/tokens.ts curated allow-list for token resolution); trustline
  pre-flight with an "add trustline" prompt; expired-entry failure auto-refreshes the quote and
  retries once; E2E via the tools/e2e/ mock-Freighter harness extended to the quote flow;
  the future RFQ canonical order encoding is deterministic and pinned with golden vectors
  (same discipline as fillCanonicalArgs).
- scope: src/ (this repo). Depends on maker server + taker SDK from the separate repo existing.
- status note (repo context): NOT built.

## REQ-rfq-runtime-config: RFQ contract ids in the runtime config
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md (§11
  build-phase touchpoints)
- description: src/config.ts + public/otc-config.js gain RFQ_SWAP_CONTRACT_ID and
  RFQ_REGISTRY_ID following the OTC_CONTRACT_ID pattern (window.* un-bundled scripts).
- acceptance: both ids join the quarterly Testnet-reset checklist alongside OTC_CONTRACT_ID and
  REFLECTOR_ORACLE_ID; a Testnet reset stays a one-file edit, not a rebuild.
- scope: runtime config (this repo)
- status note (repo context): rfq_swap is deployed (id exists) but the spec's config wiring is
  not confirmed landed; roadmapper to verify.

## REQ-rfq-csp-maker-origins: CSP allow-list gains maker-server origins
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md (§11
  build-phase touchpoints)
- description: vercel.json connect-src must gain every maker-server origin the desk will query
  (the CSP is an allow-list; the browser silently blocks unlisted origins). Registry reads use
  the already-allowed RPC origin.
- acceptance: zero CSP violations in the browser console after the change; no 'unsafe-inline'
  ever enters script-src.
- scope: vercel.json (this repo); changes only when desk taker integration starts.
- status note: absent until implementation starts (recorded by the spec as a build-phase
  touchpoint, deliberately unchanged at adoption time).

## REQ-rfq-broadcast-retirement: remove the interim fan-out layer when RFQ ships
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md (§11 "What this
  supersedes")
- description: The broadcast/intent layer (fanOut in src/data/broadcasts.ts; broadcasts / rounds
  / intents tables from docs/migrations/2026-07-10-intent-layer.sql) is replaced by pull-quoting
  from registered makers. The /intent -> /otc redirect in vercel.json retires together with the
  broadcast layer, not before.
- acceptance: layer stays LIVE and functional until the RFQ protocol ships; removed only then;
  the migration SQL stays as long as the schema is live in the production Supabase project; the
  OTC directed lane is untouched (permanent).
- scope: src/data/, vercel.json, Supabase schema (this repo); gated on RFQ shipping.

## REQ-rfq-indexer: events indexer (optional)
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md (§3, §9, §10)
- description: Optional but recommended: consume rfq_swap events via RPC getEvents into Postgres
  for analytics, maker scorecards, and fill-confirmation UX; can also cache the registry.
- acceptance: absent from v1 scope decisions — "whether the indexer ships in v1 or the web app
  reads chain-only" is an OPEN question in the spec (§10). Repo placement unspecified. Not
  schedulable until that question is answered.
- scope: unresolved (open question in source; marked absent rather than guessed).
