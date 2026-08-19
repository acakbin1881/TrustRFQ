# Synthesis Summary

Run: 2026-08-19, re-run #3 via .planning/intel/ingest-manifest.yaml
Mode: new (net-new bootstrap; no existing .planning PROJECT/REQUIREMENTS/ROADMAP/STATE checked)
Precedence applied: ADR > SPEC > PRD > DOC; per-doc override: the RFQ architecture spec carries
manifest precedence 0 (highest in set)
Status: READY — 0 blockers, 0 competing variants; safe to route

## Doc counts by type

- SPEC: 4 (the whole set); ADR: 0, PRD: 0, DOC: 0, UNKNOWN: 0
- Locked docs: 0; manifest type overrides: 4 (all declared SPEC, classifier concurred)
- Excluded by manifest (user-approved cycle break, run #1):
  docs/superpowers/specs/2026-07-10-intent-private-offer-layer-design.md

## Cycle detection

DFS (three-color) over the in-set cross_ref graph: exactly one edge
(2026-08-17-rfq-protocol-architecture-design -> 2026-07-10-react-ts-frontend-migration-design),
no cycles, depth 1. Run #2's migration <-> RFQ cycle is resolved: the migration classification's
banner backlink was suppressed with user approval (provenance in its notes field). All four docs
synthesized; nothing withheld.

## Synthesized docs

1. docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md — SPEC, precedence 0,
   ADOPTED forward-looking direction; seeds the requirements
2. docs/superpowers/specs/2026-07-10-react-ts-frontend-migration-design.md — SPEC, shipped,
   historical record; standing constraints
3. docs/superpowers/specs/2026-07-12-desk-light-redesign-design.md — SPEC, shipped, historical
   record (banner-corrected form extracted); standing constraints
4. docs/superpowers/specs/2026-07-15-reflector-fair-price-suggestion-design.md — SPEC, shipped;
   standing constraints

## Extracted intel

- Decisions: 15 entries in decisions.md — ALL status "proposed" (no ADRs in set, zero locked):
  RFQ-D1..D10 (Design A auth-entry settlement, taker-as-source, account-signer delegation,
  maker-paid capped fee, fill-or-kill, temp-storage cancel, XLM-staked registry, AirSwap wire
  compat, repo split, interim fan-out lifecycle), MIG-D1..D2 (Vite/React/TS static SPA, golden
  vectors), DESK-D1 (light theme + token-name contract), ORACLE-D1 (advisory-only Reflector chip)
- Requirements: 8 entries in requirements.md, derived from the RFQ spec and scoped to THIS repo:
  REQ-rfq-swap-contract (DONE per repo context 2026-08-18 — do not schedule),
  REQ-rfq-registry-contract, REQ-rfq-swap-any (deferred beyond v1 by the spec),
  REQ-rfq-desk-taker-path, REQ-rfq-runtime-config, REQ-rfq-csp-maker-origins,
  REQ-rfq-broadcast-retirement (gated on RFQ shipping), REQ-rfq-indexer (open question in
  source; unresolvable scope, marked absent rather than guessed).
  Maker server + taker SDK are explicitly OUT (separate repo; see constraints.md "Repo split
  boundary"). No competing acceptance variants.
- Constraints: 19 entries in constraints.md — api-contract 9, protocol 1, schema 1, nfr 8.
  Highlights: rfq_swap signature-scoping invariant; RFQ v1 JSON-RPC wire protocol + error codes;
  TTL-is-rent storage policy; token-curation boundary; otc_swap vs rfq_swap non-blurring;
  fillCanonicalArgs determinism + golden vectors; CSP no-'unsafe-inline'; un-bundled runtime
  config; styles.css/intent.css compatibility contract; banner-corrected shadow rule;
  rendered-pixel WCAG AA; oracle-never-signed boundary.
- Context: 9 topics in context.md — ship statuses, RFQ adoption + supersedes direction and
  naming, ecosystem prior art, the RFQ spec's open questions (§10), operational notes
  (cancel race, simulation latency, footprint sharding, MEV), migration accepted risks
  (one overtaken), redesign scope boundaries, fair-price YAGNI list, ingest provenance.

## Conflicts

0 blockers, 0 competing-variants, 8 auto-resolved/informational (INFO). Detail:
.planning/INGEST-CONFLICTS.md. Notable INFO: RFQ naming supersession (precedence 0 wins), desk
look temporal supersession, redesign banner self-correction, non-ADR "locked" headings,
already-satisfied requirements (rfq_swap, Cargo workspace).

## Pointers

- Report: .planning/INGEST-CONFLICTS.md
- Intel: .planning/intel/{decisions,requirements,constraints,context}.md
- Manifest: .planning/intel/ingest-manifest.yaml (records the intent-layer exclusion)
- Classifications: .planning/intel/classifications/*.json (provenance notes include the
  user-approved cross_ref suppression)
