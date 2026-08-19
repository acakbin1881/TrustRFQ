## Conflict Detection Report

Run 2026-08-19, re-run #3 via .planning/intel/ingest-manifest.yaml. Mode: new.
Precedence: ADR > SPEC > PRD > DOC; per-doc override: the RFQ architecture spec carries
manifest precedence 0 (highest in set).

### BLOCKERS (0)

### WARNINGS (0)

### INFO (8)

[INFO] Both prior cycle blockers resolved; cross-reference graph is acyclic
  Found: run #1's intent-layer <-> rfq-architecture cycle is gone (the intent-layer spec is
    excluded by the manifest and no in-set reference to it survives); run #2's migration <->
    rfq-architecture cycle is gone (the migration spec's classification cross_refs no longer
    list the RFQ spec — the banner backlink was suppressed with user approval, provenance
    recorded in that classification's notes field). DFS over the in-set cross_ref graph finds
    exactly one edge (rfq-architecture -> react-ts-migration) and no cycles.
  Note: all four docs were synthesized this run; nothing was withheld.

[INFO] All four docs classified SPEC; no ADRs, PRDs, DOCs, or UNKNOWNs; no locked decisions
  Found: 4 classifications, all type SPEC at high confidence, all manifest-declared with
    classifier concurrence, all locked=false.
  Note: no LOCKED-vs-LOCKED check could fire; decisions.md entries all carry status
    "proposed"; requirements.md is derived from the precedence-0 RFQ spec per orchestrator
    instruction, not from PRDs.

[INFO] Auto-resolved: RFQ naming — precedence-0 spec retires the migration spec's older labels
  Found: docs/superpowers/specs/2026-07-10-react-ts-frontend-migration-design.md calls the
    roadmap feature the "institutional RFQ protocol" (and elsewhere "peer-to-server RFQ");
    docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md (manifest
    precedence 0) explicitly retires those names: the feature is "the RFQ protocol", and it is
    peer-to-peer.
  Note: RFQ spec wins by per-doc precedence override; the migration spec's own 2026-08-17
    banner already concedes the point. Synthesized intel uses the current naming only.

[INFO] Auto-resolved: desk appearance — the 2026-07-12 redesign supersedes the migration's
  like-for-like look
  Found: the migration spec (2026-07-10) constrains its port to "identical look" and "styles.css
    is not rewritten"; the desk redesign spec (2026-07-12) rewrites public/styles.css wholesale
    to the light "milky swap" theme and retires the dark+gold theme.
  Note: not a live conflict — the migration constraint was scoped to the migration event itself,
    and the redesign shipped after it (merged e75cf6f, 2026-07-15). The redesign's theme +
    compatibility contract is the standing constraint extracted to constraints.md.

[INFO] Auto-resolved: desk shadow rule — the redesign spec's banner inverts its own body
  Found: the 2026-07-12 spec body prescribes filter: drop-shadow on .ticket__card-shadow (for
    the notched-card mask); its 2026-08-17 banner records that the mask is gone and the rule
    INVERTED: box-shadow, never filter: drop-shadow.
  Note: single-document self-correction; the banner-corrected form is what constraints.md
    records, and the banner says "do not implement from this document".

[INFO] "Locked decisions" / "Decisions (locked)" headings in two SPECs are not ADR-locked
  Found: docs/superpowers/specs/2026-07-12-desk-light-redesign-design.md has a "Locked
    decisions (user-chosen)" section and
    docs/superpowers/specs/2026-07-15-reflector-fair-price-suggestion-design.md has a
    "Decisions (locked)" section; both docs are classified SPEC with locked=false (manifest
    type is authoritative).
  Note: their decision-shaped content is captured in decisions.md as status "proposed" and in
    constraints.md; no LOCKED-decision protection applies.

[INFO] Dangling cross-references to out-of-set files
  Found: classifications reference repo files outside the ingest set: CLAUDE.md, STELLAR.md,
    src/wallet/authSignature.ts, fixtures/canonical-args.json,
    docs/migrations/2026-07-10-intent-layer.sql, and (by suppressed pointer only, recorded in
    the RFQ classification's notes) the excluded
    docs/superpowers/specs/2026-07-10-intent-private-offer-layer-design.md.
  Note: expected and informational per the orchestrator directive; these files are live repo
    context, not manifest docs, and create no graph edges.

[INFO] Some spec-derived requirements are already satisfied in the codebase
  Found: the RFQ spec requires the rfq_swap contract and leaves the Cargo-workspace question
    open (§10); repo context (CLAUDE.md Status) records rfq_swap BUILT, DEPLOYED and PROVEN on
    Testnet 2026-08-18, and the contracts/ Cargo workspace introduced the same day with
    otc_swap's wasm hash verified byte-identical.
  Note: requirements.md flags REQ-rfq-swap-contract with a done status note so the roadmapper
    does not schedule it; still open in this repo: rfq_registry, swap_any (deferred beyond v1
    by the spec), the desk taker path, runtime-config + CSP touchpoints, and the gated
    broadcast-layer retirement.
