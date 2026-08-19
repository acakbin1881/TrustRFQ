# Decisions

Run 2026-08-19 (re-run #3, via .planning/intel/ingest-manifest.yaml). No ADR-type documents were
present in this ingest: all 4 classified docs are type SPEC, none with `locked: true`, so NO entry
below carries LOCKED-decision protection. The entries are decision statements recorded verbatim-in-
substance inside the SPECs (the RFQ spec's §10 "Key decisions (recorded)" and the shipped specs'
decision sections); status is `proposed` throughout because none is an Accepted ADR. Precedence
within the set: the RFQ architecture spec carries manifest precedence 0 (highest).

## RFQ-D1: Design A — auth-entry-native settlement (Design B rejected)
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md
- status: proposed (spec status: ADOPTED architecture 2026-08-17; not ADR-locked)
- decision: The "order signature" IS a signed SorobanAuthorizationEntry; replay protection,
  expiry, and network binding come from the Soroban auth protocol. Design B (EVM-style in-contract
  ed25519 verification + nonce map) is rejected for v1.
- scope: rfq_swap settlement model

## RFQ-D2: Taker is the transaction source; takers never call signAuthEntry
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md
- status: proposed (ADOPTED 2026-08-17)
- decision: Only the maker produces a detached Address-credential auth entry (scoped with
  require_auth_for_args over every economic term); the taker authorizes via SourceAccount
  credentials by signing one ordinary transaction. Maximizes wallet compatibility.
- scope: rfq_swap auth model, taker flow

## RFQ-D3: Delegated signing = Stellar-native account signers, zero contract code
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md
- status: proposed (ADOPTED 2026-08-17; corrected from a direct authorize/revoke port in the
  2026-08-17 docs audit)
- decision: The maker adds the server's hot key as a weighted account signer on the maker
  G-account (setOptions); revocation is one setOptions. No contract-side delegation map (it
  cannot work: the SAC transfer sub-invocation demands the maker's own auth). Policy-enforcing
  C-account makers are explicitly deferred (not v1, no work planned).
- scope: maker key management

## RFQ-D4: Protocol fee — maker-paid, in maker_token, bps bound into the signature, hard-capped
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md
- status: proposed (ADOPTED 2026-08-17)
- decision: fee = maker_amount * bps / 10_000, paid by the maker in maker_token on top of
  maker_amount; order.fee_bps must equal current contract fee (else FeeMismatch); set_fee is
  hard-capped in code (e.g. <= 30 bps).
- scope: rfq_swap fee model

## RFQ-D5: Exact-amount fill-or-kill semantics; no partials, no min/max, no contract custody
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md
- status: proposed (ADOPTED 2026-08-17)
- decision: RFQ quotes are firm: the amounts in the order are the amounts that settle. Two
  transfers plus fee, nothing else (no intermediate contract-held balance, no refund transfer).
- scope: rfq_swap settlement semantics

## RFQ-D6: Cancellation via temporary-storage flags keyed by (maker, order_id)
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md
- status: proposed (ADOPTED 2026-08-17)
- decision: cancel(maker, order_ids) writes Cancelled flags into temporary storage with TTL
  beyond max quote lifetime; validity deadlines live in checked values (signed expiry + auth
  expiration ledger), never in entry lifetimes (TTL is rent, not security).
- scope: rfq_swap cancellation

## RFQ-D7: Registry stakes native XLM; admin-tunable costs; bounded per-token lists
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md
- status: proposed (ADOPTED 2026-08-17)
- decision: rfq_registry is a stake-gated phone book. Stake asset is native XLM via its SAC;
  base_cost + per_token_cost are admin-tunable; the bond prices spam, is not slashable. Maker
  lists per token are explicitly bounded (max_makers_per_token); pair intersection is client-side.
- scope: rfq_registry

## RFQ-D8: AirSwap wire shapes and error codes retained; maker/taker vocabulary, ERC20 suffix dropped
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md
- status: proposed (ADOPTED 2026-08-17)
- decision: JSON-RPC 2.0 with AirSwap's request/response shapes and error vocabulary (-33600 to
  -33605), methods renamed to getMakerSideOrder / getTakerSideOrder etc.; -33700 (taker trustline
  missing/unauthorized) and -33701 (maker inventory unavailable) added in the
  implementation-specific range. HTTPS-only recommended for v1 (WSS optional, open question).
- scope: off-chain RFQ wire protocol

## RFQ-D9: Repo split — contracts + taker desk in TrustRFQ; maker server + taker SDK separate repo
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md
- status: proposed (ADOPTED 2026-08-17)
- decision: rfq_swap and rfq_registry live in this repo under contracts/; the desk (this SPA)
  becomes the taker web app. The maker quote server and the taker SDK go in a SEPARATE repo
  (mirroring airswap-ref-server), reaffirming the 2026-07-10 migration spec (its lines 44/56:
  quote server is a separate repo; no server runtime here).
- scope: repository boundaries

## RFQ-D10: Broadcast/intent layer stays live as interim fan-out until the RFQ protocol ships
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md
- status: proposed (ADOPTED 2026-08-17)
- decision: The RFQ protocol supersedes (in direction) the shipped broadcast/intent layer, which
  stays live and functional until the RFQ protocol ships and is removed only then (the /intent
  redirect and migration SQL retire with it). The OTC directed lane (dual-signed fill between
  known counterparties) is unchanged and permanent.
- scope: feature lifecycle, interim fan-out mode

## MIG-D1: Stack — Vite + React + TypeScript, static output, client-only SPA
- source: docs/superpowers/specs/2026-07-10-react-ts-frontend-migration-design.md
- status: proposed (implemented 2026-07-10; historical record per its 2026-08-17 banner)
- decision: Client-only SPA compiled to static files, no server runtime. Next.js rejected because
  its static export emits inline hydration scripts forcing 'unsafe-inline' into script-src; Vite
  emits no inline script once build.modulePreload.polyfill = false.
- scope: frontend stack

## MIG-D2: Golden vectors as the migration baseline for the signature boundary
- source: docs/superpowers/specs/2026-07-10-react-ts-frontend-migration-design.md
- status: proposed (implemented 2026-07-10)
- decision: Vectors captured from the live vanilla stack (fixtures/canonical-args.json) are the
  regression tripwire for fillCanonicalArgs / canonicalPayload; canonical.ts imports Buffer
  explicitly so Vitest and the browser bundle exercise the same implementation.
- scope: src/core/canonical.ts signature boundary

## DESK-D1: Light "milky swap" desk theme; gold retired; single section control
- source: docs/superpowers/specs/2026-07-12-desk-light-redesign-design.md
- status: proposed (shipped, merged e75cf6f 2026-07-15; historical record per its 2026-08-17
  banner: do not implement from that document)
- decision: The dark+gold theme goes away; neutral light palette (white cards, near-black ink
  accent, lavender canvas), Inter + IBM Plex Mono, three tabs collapse into a floating pill +
  modal section sheet. The --gold token family becomes the ink-accent family: token NAMES and
  selectors never change, only values.
- scope: desk visual system (otc.html, public/styles.css, public/intent.css)

## ORACLE-D1: Reflector fair price is advisory-only, on-chain source, tap-to-fill
- source: docs/superpowers/specs/2026-07-15-reflector-fair-price-suggestion-design.md
- status: proposed (shipped 2026-07-18, b051d2b; spec's own heading says "Decisions (locked)" but
  the doc is classified SPEC, not an ADR — no LOCKED protection)
- decision: Source is the Reflector on-chain oracle via SEP-40 read-only simulation (no off-chain
  price API, no new CSP origin); UX is a subtle tap-to-fill chip that only fills an EMPTY leg,
  never overwrites typed values, never auto-fills, no deviation badge; cross rate computed
  client-side (x_last_price absent on the contract).
- scope: compose-ticket fair-price suggestion
