# Constraints

Run 2026-08-19 (re-run #3). Extracted from all four classified SPEC documents (the previous run's
cycle blocker is resolved; the migration and RFQ specs are back in). The three 2026-07 specs are
shipped historical records: their entries are STANDING constraints on the codebase, not open work.
The RFQ spec's entries constrain the forward-looking implementation. Every entry cites its source.

## Signature-scoping invariant (rfq_swap)
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md (§7.1)
- type: api-contract
- content: Every economically meaningful field (taker, both tokens, both amounts, expiry,
  order_id, fee_bps) sits inside the maker's require_auth_for_args tuple. Invariant to enforce in
  review and tests: a deterministic, injective mapping from the authorized args to the funds that
  can move. Any field left out of the tuple is a field an attacker can vary while replaying the
  same signature.

## RFQ wire protocol (Stellar RFQ v1, JSON-RPC 2.0)
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md (§6)
- type: protocol
- content: JSON-RPC 2.0 over HTTPS (WSS optional; HTTPS-only recommended for v1). Methods:
  getMakerSideOrder, getTakerSideOrder, getPricing(pairs, minExpiry?), getAllPricing,
  getProtocols, getTokens. Error codes: -33600 cannot provide order, -33601 pair not traded,
  -33602/-33603 amount too low/high, -33604 invalid params, -33605 rate limited, plus -33700
  taker trustline missing/unauthorized for makerToken and -33701 maker inventory temporarily
  unavailable. Type conventions: token/contract ids are C-addresses; maker wallets G or C; taker
  wallets G-only in v1 (taker must be the tx source; a C-address cannot be one); amounts are
  decimal strings in atomic units (i128 range; never hardcode 7 decimals — fetch decimals() for
  custom SEP-41 tokens); network is the passphrase. The order response carries one base64
  authEntry field (signed SorobanAuthorizationEntry) in place of AirSwap's (v,r,s).

## rfq_swap interface and swap order-of-operations
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md (§4.1-§4.2)
- type: api-contract
- content: Order { maker, taker, maker_token, maker_amount: i128, taker_token, taker_amount: i128,
  expiry: u64 (unix seconds, defense-in-depth), order_id: u64 (maker-scoped, monotonic),
  fee_bps: u32 }. Errors: Expired=1, Cancelled=2, FeeMismatch=3, AmountInvalid=4, Paused=5,
  NotAuthorized=6. swap checks paused, amounts > 0, timestamp <= expiry, not cancelled,
  fee_bps == current fee, THEN maker require_auth_for_args, taker require_auth, then leg 1
  (taker -> maker), leg 2 (maker -> taker), fee transfer (maker -> collector), swap event with
  topics (swap, maker, taker). No min/max slippage fields; no contract custody; checked i128
  math everywhere (mul_bps via checked_mul/checked_div, overflow panics).

## rfq_swap storage and TTL policy
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md (§4.3, §4.6)
- type: schema
- content: admin/fee_bps/fee_collector/paused in Instance storage (extend TTL on every admin
  write; ops cron tops up). Cancelled(maker, order_id) in Temporary storage, TTL set at write to
  cover max quote lifetime, never extended. Auth nonces are host-managed temporary entries. TTL
  is rent, not security: anyone can extend any entry's TTL, so validity deadlines live in checked
  values (signed expiry + signature_expiration_ledger), never in entry lifetimes. No per-user
  persistent state. Quote windows kept tight: 30-90s (~6-18 ledgers) is the suggested RFQ
  default.

## rfq_registry shape
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md (§5)
- type: api-contract
- content: MakerConfig { url: String, protocols: Vec<u32>, tokens: Vec<Address>, staked: i128 }.
  Storage: Token(Address) -> Vec<Address> (persistent, capped at max_makers_per_token, e.g. 100),
  Maker(Address) -> MakerConfig (persistent). All lists explicitly bounded (unbounded Vec growth
  bricks Soroban contracts against read limits). No contract-side extend function (bare
  ExtendFootprintTTLOp by an ops cron keeps entries warm).

## Contract-level security checklist (RFQ contracts)
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md (§7.6)
- type: nfr
- content: initialize guarded against re-init; admin = multisig; set_fee capped in code (e.g.
  <= 30 bps); upgrade behind a timelock; pause halts swap/swap_any but NEVER cancel; events on
  every state transition; state changes precede external calls where possible (do not assume
  host reentrancy blocking is permanent); external audit before Mainnet.

## Token-curation boundary (arbitrary-contract-call hazard)
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md (§7.3)
- type: nfr
- content: maker_token / taker_token are caller-supplied contract addresses the swap contract
  calls; a maliciously chosen token can no-op its transfer and settle a real asset against a
  hollow one. Controls: maker servers quote only their allowlist; taker clients resolve tokens
  from a curated list, never raw user-pasted addresses (src/core/tokens.ts is exactly this
  control); the registry is the shared curation point. In-contract allowlist rejected for v1
  (open revisit, §10). Same curation policy covers fee-on-transfer/rebasing tokens; trustline
  pre-checks on both sides (-33700); clawback-enabled assets get a per-asset client warning.

## Repo split boundary
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md (§3, §10, §11)
- type: nfr
- content: Contracts (contracts/) and the taker client (the desk SPA) stay in TrustRFQ. The maker
  quote server and the taker SDK live in a SEPARATE repo (suggested name trustrfq-maker-server,
  open question). This repo must not grow a server runtime; the constraint reaffirms the
  2026-07-10 migration spec (quote server is a separate repo; no server runtime here).

## otc_swap vs rfq_swap — do not blur the two auth models
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md (§11)
- type: api-contract
- content: otc_swap::fill is symmetric (both parties sign Address-credential entries via plain
  require_auth over full args; permissionless submit; persistent Filled(order_id) replay key; no
  events). rfq_swap is asymmetric (only the maker pre-signs via require_auth_for_args; taker
  authorizes as tx source; temporary-storage cancel flags; events; protocol fee; pairs with a
  registry). The OTC settlement invariants apply to otc_swap only.

## Test wiring boundary for shared TS protocol code
- source: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md (§11
  build-phase touchpoints)
- type: nfr
- content: No npm script runs cargo (contract tests are documented commands); the vitest include
  in vite.config.ts covers only src/**, so shared TS protocol code must land under src/ or bring
  its own suite.

## fillCanonicalArgs determinism + golden vectors (OTC signature boundary)
- source: docs/superpowers/specs/2026-07-10-react-ts-frontend-migration-design.md
- type: api-contract
- content: fillCanonicalArgs derives the eight ScVal args both parties' auth entries are signed
  over; it must stay deterministic (any Buffer substitution or arg reordering produces terms that
  simulate cleanly but do not match what the counterparty signed — silent until an on-chain
  revert). Defenses: src/core/ is a pure module boundary (no network, no wallet, no React);
  canonical.ts imports Buffer explicitly ('buffer' npm package) so Vitest and the browser bundle
  test the same bytes; canonical.test.ts asserts byte-identical base64 XDR against
  fixtures/canonical-args.json plus the recorded canonicalPayload string.

## CSP posture: no 'unsafe-inline', explicit connect-src allow-list
- source: docs/superpowers/specs/2026-07-10-react-ts-frontend-migration-design.md
- type: nfr
- content: script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' + RPC + Horizon + Supabase
  (https and wss). 'unsafe-inline' never appears (it is the directive guarding against
  transaction tampering, the marquee threat for a wallet-signing dApp). Vite with
  build.modulePreload.polyfill = false emits no inline script; esm.sh is gone from both
  directives.

## Runtime config stays un-bundled
- source: docs/superpowers/specs/2026-07-10-react-ts-frontend-migration-design.md
- type: nfr
- content: otc-config.js and supabase-config.js remain window.* scripts in public/, typed via a
  declare global block, so a Testnet reset is a one-file edit, not a rebuild-and-redeploy.

## Pinned signing-critical dependencies
- source: docs/superpowers/specs/2026-07-10-react-ts-frontend-migration-design.md
- type: nfr
- content: @creit.tech/stellar-wallets-kit@1.9.5 (exact), @stellar/stellar-sdk@16,
  @supabase/supabase-js@2, buffer@6 carry over exactly from the vanilla stack.

## Settlement bookkeeping: confirmed fill is the point of no return
- source: docs/superpowers/specs/2026-07-10-react-ts-frontend-migration-design.md
  (post-implementation review, confirmed finding 1)
- type: api-contract
- content: In useSettlement.settle(), after an on-chain-confirmed fill the DB bookkeeping write
  is attempted once and swallowed on failure (row stays 'settling'; on-chain state is the truth);
  success is always toasted. Routing that write through a throwing updateOrder marked executed
  trades 'failed', lost the tx hash, and made retries revert with AlreadyFilled.

## Gate/desk mounting: visibility-toggled, never unmounted
- source: docs/superpowers/specs/2026-07-10-react-ts-frontend-migration-design.md
  (post-implementation review, confirmed finding 2)
- type: api-contract
- content: Gate and desk are both always mounted and visibility-toggled so drafts and the active
  tab survive disconnect/reconnect (unmounting behind the gate destroyed the RFQ draft on
  disconnect).

## styles.css / intent.css compatibility contract
- source: docs/superpowers/specs/2026-07-12-desk-light-redesign-design.md
- type: api-contract
- content: The JSX hardcodes styles.css classes (.tabs/.tab/.tab__count, btn*, order*, legbox*,
  field*, ticket*, badge, topbar*, wallet-chip*, wrap, panel, empty, backdrop, starfield,
  eyebrow, settle__err, maker-addr, hint, input--num, leg, row2, form-actions, legs*, sig);
  intent.css consumes tokens --r-*, --font-*, --gold(-hi), --green, --red, --text-1..4,
  --line-1..3, --bg-raised, --bg-sunken, --shadow-card. RULE: no class name and no token NAME is
  removed or renamed — only values change; new tokens are additive only. The --gold family IS the
  ink-accent family (--gold #16171D, --gold-hi #2E3038, --gold-lo #000000, --gold-ink #FFFFFF).

## Desk shadow rule (banner-corrected form)
- source: docs/superpowers/specs/2026-07-12-desk-light-redesign-design.md (2026-08-17 banner;
  the banner supersedes the body's drop-shadow technique)
- type: nfr
- content: The notched-card mask is gone, which INVERTED the shadow rule: .ticket__card-shadow
  now must carry box-shadow, never filter: drop-shadow (a filtered ancestor breaks the hero's
  backdrop-filter). Do not implement from the spec body; intent.html / src/intent/ references map
  to otc.html / src/ui/ today.

## WCAG AA measured on rendered pixels
- source: docs/superpowers/specs/2026-07-12-desk-light-redesign-design.md (verification §4);
  also docs/superpowers/specs/2026-07-15-reflector-fair-price-suggestion-design.md (testing §5)
- type: nfr
- content: Contrast is verified against rendered pixels (headless Chrome screenshots with
  backdrop sampling), not by walking the CSSOM. Risky tiers named by the redesign spec: --text-4
  on white and on --bg-grad-b, green/red chips, white-on-ink surfaces, toast; the fair-price chip
  must also clear AA against the light desk surface.

## Fair-price feature boundary (oracle never touches the signature path)
- source: docs/superpowers/specs/2026-07-15-reflector-fair-price-suggestion-design.md
- type: api-contract
- content: src/core/canonical.ts and the golden vectors are not modified; the oracle value only
  pre-fills an input the maker continues to edit and is never auto-signed. Layer split: pure math
  in src/core/oracle.ts (oracleSymbol allow-list, crossRate via scaled bigint division, isStale
  at 10 min, suggestedAmount rounded to <= 7 decimals so it passes validAmount); the one network
  read in src/data/oracle.ts (lastprice via simulateTransaction with a synthetic source account,
  no wallet dependency); config through src/config.ts (REFLECTOR_ORACLE_ID unset/invalid ->
  fetchLastPrice short-circuits to null, feature silently off). Fetch only on token-pair change
  (not keystrokes), ~60s per-symbol cache, stale-resolution cancellation. useSettlement is not
  involved; the 3-call grep invariant is untouched. Failure is silent and non-blocking. No new
  CSP origin (RPC already in connect-src).
