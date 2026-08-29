# Phase 2: Desk RFQ Taker Path - Research

**Researched:** 2026-08-29
**Domain:** Stellar/Soroban RFQ taker client (registry discovery, JSON-RPC quote fan-out, local
quote validation incl. auth-entry invocation-tree decoding, single-signature settlement via the
deployed `rfq_swap` contract), inside a React/TS desk SPA
**Confidence:** HIGH

## Summary

This phase adds nothing new to the *stack* — it wires a taker client on top of infrastructure
that already exists and is already proven live: `rfq_registry` (deployed, 59 unit tests + a live
Testnet proof script) and `rfq_swap` (deployed, 17 unit tests + a live Testnet proof script that
demonstrates the exact mixed-credential settlement this phase's UI must reproduce in-browser).
`@stellar/stellar-sdk@16.0.1` (already installed, pinned in `package.json`) covers every on-chain
operation this phase needs: read-only simulation for registry discovery, `Operation
.invokeContractFunction` + pre-attached auth for settlement, and — the single most valuable
finding of this research — a **built-in, documented helper for exactly TAKER-03's hardest
requirement**: `buildInvocationTree(entry.rootInvocation())` and `walkInvocationTree(...)`,
exported from the SDK's top level, turn a decoded `SorobanAuthorizationEntry`'s invocation tree
into a plain JS object (`{ type, args: { source, function, args }, invocations }`) without any
hand-rolled XDR walking. No new npm packages are required for this phase.

The off-chain half (JSON-RPC 2.0 `getMakerSideOrder` fan-out, error codes, timeout/drop
semantics) is fully specified in the adopted architecture spec (§6) and needs no library beyond
native `fetch` + `AbortSignal.timeout()`. The one piece of genuine complexity is decoding and
validating the maker's returned `authEntry` before any wallet prompt (TAKER-03): this requires
walking the invocation tree and asserting the `swap` root's args and the nested `transfer`
sub-invocations match the quoted order exactly, field for field. The SDK helper above turns this
from "hand-parse XDR" into "walk a tree and compare a handful of primitive values" but the exact
tree shape produced by `require_auth_for_args` for THIS contract's `swap` (root invocation args in
what order, how many `transfer` sub-invocations, in what order) has not been empirically captured
in this session and should be dumped from a live simulation early in implementation (see
Assumptions Log A1).

**Primary recommendation:** build the taker core as pure `src/core/rfq/*` modules (wire types +
canonical order encoding + quote validation + settlement) plus exactly one network module (JSON-RPC
fan-out) following `fill.ts`'s isolation discipline, reuse `Operation.invokeContractFunction` +
`buildInvocationTree` from the already-installed SDK, and validate the maker auth-entry shape
against a live Testnet simulation (via the stub maker, D-12) before hand-writing the comparison
logic.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Desk placement (minimal reference surface)**
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
  chain-only end to end. Reversibility: reversible.

**Quote display and selection**
- **D-04:** Validated quotes render as a ranked list sorted by price, BEST PRESELECTED; the
  taker may select another row. The selection rule stays "best price like `airswap best`".
- **D-05:** Each quote row shows a countdown; an expired quote drops from the list; a manual
  "re-quote" button re-runs the fan-out. NO automatic periodic re-fan-out.
- **D-06:** Sell-side only in v1: one amount field (what the taker sells), `getMakerSideOrder`
  fan-out per TAKER-02. `getTakerSideOrder` is deferred.
- **D-07:** Maker identity is NOT shown on quote rows (AirSwap-faithful). Rows show
  price/receive amount + countdown only. Maker addresses stay visible in E2E records and dev
  tools, not in the UI.

**Trustline and settlement UX**
- **D-08:** Trustline handling is "early passive note + in-flow prompt": on pair selection the
  desk checks the ALREADY-FETCHED `useBalances` trustline data (zero extra network cost) and, if
  the makerToken trustline is missing, shows a passive one-liner. The actual changeTrust wallet
  prompt happens in-flow at accept time, before the swap `signTransaction`.
- **D-09:** Expired-entry retry is PRICE-GUARDED: the taker never signs at a price they have not
  seen. On an expired-entry failure the desk auto-fetches ONE fresh quote; if the fresh price is
  equal or better it retries once automatically with a visible note; if worse it stops,
  re-displays the new price, and asks for re-confirmation.

**Stub maker and E2E wiring**
- **D-10:** The desk discovers the stub maker through REAL REGISTRATION: the E2E script funds a
  throwaway maker via Friendbot, registers its localhost URL on the real Testnet registry
  (`set_url` with real stake, `add_tokens`), the desk finds it through the normal registry read
  path with ZERO test-only code in `src/`, and the run ends with `eject` + full stake refund.
  `tools/rfq-registry-live.mjs` already demonstrates every one of these steps.
- **D-11:** CSP stays a CURATED allow-list: each real maker origin is added to `vercel.json`
  `connect-src` by hand at deploy time. Phase 2 makes NO production CSP change (no real makers
  yet; the localhost stub runs only where Vercel headers do not apply). Reversibility: reversible.
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

### Deferred Ideas (OUT OF SCOPE)
- `getTakerSideOrder` (buy-fixed direction) on the desk — beyond Phase 2; TAKER-02 covers
  `getMakerSideOrder` only.
- RFQ trade history / "my swaps" read-back — belongs to IDX-01 (events indexer), unscheduled.
- CSP `connect-src https:` wildcard — revisit only if per-maker origin curation becomes a burden.
- Registry indexer/HTTP cache for instant discovery UX — carried from Phase 1, still deferred.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TAKER-01 | Discover maker URLs via two `get_urls_for_token` reads + client-side intersection | `rfq_registry::get_urls_for_token(env, token: Address) -> Vec<String>` [VERIFIED: contracts/rfq_registry/src/lib.rs:472] confirmed live in `tools/rfq-registry-live.mjs` steps 7 and 11 (register/discover/eject cycle); free zero-balance-source-account read pattern documented below |
| TAKER-02 | Fan out `getMakerSideOrder` (JSON-RPC 2.0) in parallel, 2-3s timeout, drop malformed | Wire shapes and error codes fully specified in spec §6 [CITED: docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md §6]; native `fetch` + `AbortSignal.timeout()` pattern, no library needed |
| TAKER-03 | Validate quotes locally: economics, `feeBps` == `get_config`, expiry sanity, decoded `authEntry` invocation tree matches order terms | `rfq_swap::get_config(env) -> Config { admin, fee_bps, fee_collector, paused }` [VERIFIED: contracts/rfq_swap/src/lib.rs:309-316]; `buildInvocationTree`/`walkInvocationTree` [VERIFIED: node_modules/@stellar/stellar-sdk/lib/esm/base/invocation.d.ts:105,116, re-exported via index.d.ts:32 -> base/index.d.ts:38] |
| TAKER-04 | One `signTransaction` prompt, taker as tx source, maker `authEntry` attached, enforcing simulate + assemble + submit + `getTransaction` + event | `Operation.invokeContractFunction({contract, function: 'swap', args, auth})` pattern proven end-to-end in `tools/rfq-live-swap.mjs:296-345`; `assembleTransaction` only injects simulation auth when the op carries none — pre-attached auth must travel through rebuild (fill.ts:144-156 pattern) |
| TAKER-05 | Trustline pre-flight + prompt; expired-entry auto-refresh-and-retry-once; tokens from `src/core/tokens.ts` only | `ensureTrustline` [VERIFIED: src/core/fill.ts:73-85] reusable as-is for the maker-token leg; `useBalances`/`parseAccountBalances` already expose trustline presence via absent-key-means-no-trustline semantics [VERIFIED: src/core/balances.ts:57-81, 86-88] |
| TAKER-06 | RFQ order encoding deterministic, golden-vector pinned | `canonical.ts`/`canonical.test.ts`/`fixtures/canonical-args.json` discipline to replicate [VERIFIED: src/core/canonical.ts, src/core/canonical.test.ts, fixtures/canonical-args.json]; sorted-alphabetical-symbol-key ScVal map encoding for the `Order` struct [VERIFIED: tools/rfq-live-swap.mjs:94-110, `Object.keys(fields).sort()`] |
| CSP-01 | `connect-src` gains maker origins; zero violations; no `unsafe-inline` | Current CSP has zero maker/localhost origins [VERIFIED: vercel.json:18]; D-11 requires NO change this phase; `vite preview` (used by `npm run preview`) does not apply `vercel.json` headers, so the localhost stub is invisible to CSP during E2E |
| E2E-01 | `tools/e2e/` extended with stub maker + taker driver, settles for real on Testnet | Existing harness patterns (`lib.mjs`, `freighter-mock.mjs`, `driver.mjs`, `run-all.mjs`) [VERIFIED: tools/e2e/*.mjs] directly extensible; `tools/rfq-registry-live.mjs` supplies the exact register/discover/eject sequence D-10 requires |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Registry discovery (two reads + intersection) | Browser / Client (`src/core/rfq/discover.ts`, RPC read) | — | Read-only simulation against the already-allowed RPC origin; no server involved |
| Quote fan-out (JSON-RPC to maker servers) | Browser / Client (one network module) | — | Taker client calls maker HTTPS endpoints directly, peer-to-peer per the adopted spec; no TrustRFQ-owned server in this repo |
| Quote validation (economics, feeBps, auth-entry tree) | Browser / Client (`src/core/rfq/validate.ts`, pure) | — | Must happen before any wallet prompt; pure logic, no network/DOM |
| Order/auth-entry canonical encoding | Browser / Client (`src/core/rfq/canonical.ts`, pure) | — | Signature-boundary code; must be deterministic and unit-testable off any runtime |
| Settlement (assemble/sign/submit/confirm) | Browser / Client (`src/core/rfq/settle.ts`) | Database / Storage (Stellar ledger) | Client builds and submits; the chain is sole source of truth (D-03: no Supabase write) |
| Trustline pre-flight | Browser / Client (`useBalances` + `ensureTrustline`) | — | Reuses already-fetched Horizon balance data (D-08); the in-flow prompt is a client-signed `changeTrust` op |
| Panel UI / section nav | Browser / Client (`src/App.tsx` + new `src/ui/RfqPanel.tsx`-style component) | — | Thin shell over the core per UI-D1; composes existing `AddressSeal`/`TokenSelect`/`Toast` |
| Stub maker server (E2E only) | Off-repo-equivalent local process (`tools/e2e/`) | — | Not part of `src/`; a throwaway Node process the E2E driver spawns, standing in for the separate-repo maker server |
| Settlement contract (`rfq_swap`) | On-chain (Soroban) | — | Already deployed; this phase is a pure consumer, no contract changes |
| Discovery contract (`rfq_registry`) | On-chain (Soroban) | — | Already deployed; this phase is a pure consumer, no contract changes |

## Standard Stack

### Core

No new runtime dependencies. Everything this phase needs is already installed and pinned in
`package.json` [VERIFIED: package.json:19-26]:

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@stellar/stellar-sdk` | `^16.0.1` (installed `16.0.1`) [VERIFIED: node_modules/@stellar/stellar-sdk/package.json] | Registry/`rfq_swap` reads, `Operation.invokeContractFunction`, `authorizeEntry`, `buildInvocationTree`, ScVal encode/decode | Already the settlement SDK for the OTC lane; same library covers RFQ with no new surface |
| `@creit.tech/stellar-wallets-kit` | `1.9.5` exact [VERIFIED: package.json:20] | `signTransaction` for the one taker-side wallet prompt | Already the wallet layer; RFQ taker path needs ONLY `signTransaction`, never `signAuthEntry` (spec §6 step 5), so it sidesteps the kit's known double-encoding bug entirely |
| native `fetch` + `AbortSignal.timeout()` | browser built-in | JSON-RPC 2.0 POST to maker servers, 2-3s timeout per TAKER-02 | Standard web platform API; a JSON-RPC fan-out of this simplicity does not justify a client library |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `buffer` | `^6.0.3` (already installed, aliased in `vite.config.ts`) [VERIFIED: package.json:23, vite.config.ts:19] | Byte handling for ScVal/XDR encode paths | Reuse the existing alias; do not add a second buffer source |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `fetch` for JSON-RPC | A JSON-RPC client library (e.g. a generic `jayson`-style client) | Rejected: adds a dependency for ~20 lines of POST + AbortSignal logic; the wire shape is simple request/response, no batching/notifications needed |
| Hand-rolled invocation-tree walker | `buildInvocationTree`/`walkInvocationTree` from `@stellar/stellar-sdk` | The SDK helper is already installed, documented, and does exactly this (see Don't Hand-Roll) |

**Installation:** none required — no new packages for this phase.

**Version verification:** `@stellar/stellar-sdk` latest on the npm registry is `17.0.1`
[VERIFIED: `npm view @stellar/stellar-sdk version`, run this session]; the project is pinned to
`^16.0.1` per CLAUDE.md's "Pinned deps" convention. This phase should NOT bump the major version —
CLAUDE.md pins are deliberate and out of this phase's scope; note the gap only so a future
dependency-refresh phase is not surprised.

## Package Legitimacy Audit

Not applicable — this phase installs no new packages. Every capability (RPC reads, contract
invocation, auth-entry decoding, wallet signing) is available in `@stellar/stellar-sdk@16.0.1` and
`@creit.tech/stellar-wallets-kit@1.9.5`, both already installed and audited into this repo before
this phase began.

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
 Browser (desk SPA)                                          Testnet (Soroban + Horizon)
┌─────────────────────────────────────────────────┐        ┌──────────────────────────────┐
│                                                   │        │                              │
│  1. pair select                                  │        │                              │
│     └─> discover.ts: get_urls_for_token(makerTok)│───RPC──┼─>  rfq_registry               │
│         get_urls_for_token(takerTok) [free reads]│<──RPC──┼─┘  get_urls_for_token()        │
│         intersect client-side -> N maker URLs    │        │                              │
│         (D-02: shown as "N makers found")        │        │                              │
│                                                   │        │                              │
│  2. amount entered -> fan-out.ts                 │        │                              │
│     └─> POST getMakerSideOrder to each URL   ────┼─HTTPS──┼──>  stub maker (tools/e2e/    │
│         (JSON-RPC 2.0, 2-3s AbortSignal.timeout) │<─HTTPS─┼──┘  in Phase 2; real maker     │
│         drop malformed / timed-out responses      │        │     server = separate repo,   │
│                                                   │        │     Phase 3)                  │
│  3. validate.ts (PURE, before any wallet prompt) │        │                              │
│     ├─ economics match request                  │        │                              │
│     ├─ feeBps == get_config().fee_bps       ─────┼───RPC──┼─>  rfq_swap.get_config()      │
│     ├─ expiry / signatureExpirationLedger sane   │        │                              │
│     └─ buildInvocationTree(authEntry.rootInv())  │        │                              │
│        walked & compared to order terms          │        │                              │
│                                                   │        │                              │
│  4. rank by price, best preselected (D-04)       │        │                              │
│     countdown per row, manual re-quote (D-05)    │        │                              │
│                                                   │        │                              │
│  5. accept -> trustline check (useBalances,      │        │                              │
│     zero extra cost) -> in-flow changeTrust if   │────────┼──>  SAC changeTrust (if needed)│
│     missing (D-08) -> ONE signTransaction        │        │                              │
│     -> Operation.invokeContractFunction(swap,    │────────┼──>  rfq_swap.swap(order)       │
│        args, auth=[makerEntry]) simulate         │        │     require_auth_for_args(maker)│
│        (enforcing) -> assemble -> sign -> submit │        │     require_auth(taker=source) │
│                                                   │        │     2x transfer + fee transfer │
│  6. poll getTransaction + swap event      ───────┼───RPC──┼─>  SwapExecuted event          │
│     in-panel confirmation: amounts + tx hash     │        │                              │
│     (D-03: NO Supabase write, ever)              │        │                              │
│                                                   │        │                              │
│  7. on Expired auth failure: auto-refetch ONE    │        │                              │
│     fresh quote; retry once IF price equal/better│        │                              │
│     else stop and re-confirm (D-09)              │        │                              │
└─────────────────────────────────────────────────┘        └──────────────────────────────┘
```

### Recommended Project Structure
```
src/
├── core/
│   ├── rfq/
│   │   ├── wire.ts        # JSON-RPC 2.0 request/response types + error codes (TAKER-02)
│   │   ├── canonical.ts   # Order -> ScVal (sorted-key map), golden-vector target (TAKER-06)
│   │   ├── validate.ts    # PURE: economics/feeBps/expiry/invocation-tree checks (TAKER-03)
│   │   ├── discover.ts    # PURE helpers: intersect URL sets, rank quotes (D-04)
│   │   └── settle.ts      # chain ops: assemble/simulate/sign/submit/poll (TAKER-04), mirrors fill.ts
│   ├── canonical.ts        # existing OTC signature boundary — untouched
│   └── tokens.ts           # existing allow-list — RFQ tokens resolve from here only (TAKER-05)
├── data/
│   └── rfqNetwork.ts       # the ONE network module: RPC reads for discovery/get_config + JSON-RPC fan-out (fetch)
├── ui/
│   └── RfqPanel.tsx         # thin shell: pair select, quote list, accept flow — composes AddressSeal/TokenSelect/Toast
└── App.tsx                  # gains a 4th TabName + data-panel entry (D-01)
tools/e2e/
├── stub-maker.mjs           # local JSON-RPC maker server with D-12 failure knobs (new)
└── driver.mjs                # extended with an RFQ taker flow (or a sibling rfq-driver.mjs)
```

This mirrors `fill.ts`'s isolation rule: `src/core/*` never imports the wallet, `window`, or
`fetch`-based network calls directly except in the one designated network module, which keeps the
whole `src/core/rfq/*` tree lift-able into the separate-repo taker SDK with minimal untangling
(UI-D1 requirement).

### Pattern 1: Free read-only registry/contract reads (zero-balance source account)
**What:** simulate a read-only call with a throwaway, unfunded source account; no signing, no
fee, no network write.
**When to use:** TAKER-01 discovery reads and TAKER-03's `get_config` read.
**Example:**
```javascript
// Source: tools/rfq-registry-live.mjs:147-163 (VERIFIED, this exact pattern is what
// tools/rfq-registry-live.mjs uses for get_maker/get_config/get_urls_for_token reads)
async function simulateRead(contract, fnName, scValArgs) {
  const src = new Account(
    'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
  const tx = new TransactionBuilder(src, { fee: '100', networkPassphrase: NETWORK })
    .addOperation(contract.call(fnName, ...scValArgs))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) return { error: sim.error, sim };
  return { value: scValToNative(sim.result.retval), sim };
}
```

### Pattern 2: Settlement with a pre-attached, detached maker auth entry
**What:** the taker builds `swap(order)` with itself as tx source, attaches the maker's signed
entry directly on the operation, then simulates in enforcing mode (auth already attached, so
tampering surfaces as a simulation error before submission).
**When to use:** TAKER-04.
**Example:**
```javascript
// Source: tools/rfq-live-swap.mjs:296-324 (VERIFIED, proven live on Testnet 2026-08-18)
async function settle(takerKp, order, auth, label) {
  const account = await server.getAccount(takerKp.publicKey());
  const tx = new TransactionBuilder(account, { fee: FEE, networkPassphrase: NETWORK })
    .addOperation(
      Operation.invokeContractFunction({
        contract: CONTRACT_ID,
        function: 'swap',
        args: [orderScVal(order)],
        auth,  // [signedMakerEntry] — pre-attached
      }),
    )
    .setTimeout(TIMEOUT)
    .build();

  const sim = await server.simulateTransaction(tx);   // enforcing mode: validates the maker sig here
  if (Api.isSimulationError(sim)) throw new Error(`${label} failed: ${sim.error}`);

  const ready = assembleTransaction(tx, sim).build();  // auth already attached, so this is preserved
  ready.sign(takerKp);                                  // the ONE Freighter signTransaction prompt
  const sent = await server.sendTransaction(ready);
  // ... poll getTransaction
}
```

### Pattern 3: Order struct -> ScVal — sorted-alphabetical symbol keys (load-bearing)
**What:** Soroban encodes a `#[contracttype] struct`'s fields as an `ScMap` with `Symbol` keys in
**sorted alphabetical order**, not struct declaration order. Getting this wrong produces an
`Order` that either fails to decode on-chain or, worse, decodes to different field values than
intended.
**When to use:** TAKER-06's canonical order encoding.
**Example:**
```javascript
// Source: tools/rfq-live-swap.mjs:94-110 (VERIFIED, proven working live — this exact
// function produced the args that settled tx 49fa69b2258d5... per CLAUDE.md Status)
function orderScVal(o) {
  const fields = {
    maker: new Address(o.maker).toScVal(),
    taker: new Address(o.taker).toScVal(),
    maker_token: new Address(o.maker_token).toScVal(),
    maker_amount: nativeToScVal(o.maker_amount, { type: 'i128' }),
    taker_token: new Address(o.taker_token).toScVal(),
    taker_amount: nativeToScVal(o.taker_amount, { type: 'i128' }),
    expiry: nativeToScVal(o.expiry, { type: 'u64' }),
    order_id: nativeToScVal(o.order_id, { type: 'u64' }),
    fee_bps: nativeToScVal(o.fee_bps, { type: 'u32' }),
  };
  const entries = Object.keys(fields)
    .sort()                                              // <-- the load-bearing line
    .map((k) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: fields[k] }));
  return xdr.ScVal.scvMap(entries);
}
```

### Pattern 4: Decode and walk a maker's authEntry invocation tree (TAKER-03's core mechanism)
**What:** `@stellar/stellar-sdk` ships `buildInvocationTree` / `walkInvocationTree`, purpose-built
for exactly this: turning a `SorobanAuthorizedInvocation` XDR tree into a plain object (or
walking it with a callback) so a client can show/verify what it is about to authorize.
**When to use:** TAKER-03's "decoded `authEntry` invocation tree matches order terms" check.
**Example:**
```typescript
// Source: node_modules/@stellar/stellar-sdk/lib/esm/base/invocation.d.ts:44-105 (VERIFIED,
// this is the SDK's own documented usage example, installed version 16.0.1)
import { xdr, buildInvocationTree } from '@stellar/stellar-sdk';

const entry = xdr.SorobanAuthorizationEntry.fromXDR(authEntryBase64, 'base64');
const tree = buildInvocationTree(entry.rootInvocation());
// tree.type === 'execute'
// tree.args = { source: 'C...(rfq_swap)', function: 'swap', args: [...natively-typed args] }
// tree.invocations = [ { type: 'execute', args: { source: maker_token, function: 'transfer', args: [...] } }, ... ]
```
**Caveat (see Assumptions Log A1):** the exact `args` order and shape `require_auth_for_args`
produces for THIS contract's tuple, and whether the `transfer` sub-invocations appear as 1 or 2
entries (2 when `fee_bps > 0`), has not been empirically dumped in this research session. Confirm
against a live simulation early (the D-12 stub maker, or a throwaway extension of
`tools/rfq-live-swap.mjs` that logs `JSON.stringify(buildInvocationTree(entries[makerIdx]
.rootInvocation()), null, 2)`) before finalizing `validate.ts`'s comparison logic.

### Anti-Patterns to Avoid
- **Hand-parsing `SorobanAuthorizedInvocation` XDR field-by-field:** the SDK's
  `buildInvocationTree`/`walkInvocationTree` already does this; re-implementing it duplicates a
  documented, tested SDK feature and is exactly the kind of "bug farm" the adopted spec warns
  against for hand-rolled crypto/encoding logic (§2, Design B rejection rationale).
- **Reusing `useSettlement` for RFQ:** `useSettlement` is scoped to the OTC lane's
  `maker_auth`/`taker_auth` Supabase columns and its module-scope `settleLock` serializes
  ThreadView settles specifically. RFQ settlement (D-03: no persistence) needs its own hook/module;
  do not attempt to route RFQ through `useSettlement` or its lock.
- **Calling `assembleTransaction` before attaching the maker's signed auth entry:**
  `assembleTransaction` only injects simulation-produced auth onto an operation that carries NONE
  [VERIFIED: src/core/fill.ts:144-156, comment "enforcing-mode simulation (auth pre-attached) →
  footprint + resource fee"]. The signed maker entry must be attached to the operation BEFORE the
  enforcing-mode `simulateTransaction` call, or the taker's own build will silently miss it.
- **Trusting `feeBps` from the quote without cross-checking `get_config`:** the contract rejects a
  mismatched `fee_bps` at settlement time (`Error::FeeMismatch`) [VERIFIED:
  contracts/rfq_swap/src/lib.rs:214-216], but TAKER-03 requires catching this BEFORE the wallet
  prompt, not after a failed simulation the user already saw a prompt for.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Decoding a Soroban auth-entry invocation tree | A custom XDR walker over `SorobanAuthorizedInvocation`/`SorobanAuthorizedFunction` | `buildInvocationTree`/`walkInvocationTree` from `@stellar/stellar-sdk` | Already installed, documented with a worked example in the SDK's own `.d.ts`, and exercises the same decode path the SDK itself trusts |
| Assembling a Soroban invoke-with-auth transaction | Manual `HostFunction`/footprint/resource-fee construction | `Operation.invokeContractFunction({contract, function, args, auth})` + `simulateTransaction`/`assembleTransaction` | Proven working end-to-end on Testnet (`tools/rfq-live-swap.mjs`); the same pattern `fill.ts` already uses for the OTC lane |
| Fee-bps / order-term freshness check | A bespoke on-chain-state cache | A single `get_config` read per validation pass (cheap, free simulated read) | The contract itself is the single source of truth for the current fee; caching risks quoting a stale fee that the contract then rejects |
| JSON-RPC 2.0 client plumbing | A generic JSON-RPC client library | Native `fetch` + `AbortSignal.timeout()` + a small typed request/response layer in `wire.ts` | The wire shape (§6) is simple request/response with no batching or notifications; a library adds a dependency for no real capability gain |

**Key insight:** every non-trivial mechanism this phase needs (free reads, mixed-credential
settlement, invocation-tree decoding) has already been exercised, end-to-end, against the real
deployed contracts by `tools/rfq-registry-live.mjs` and `tools/rfq-live-swap.mjs`. The safest path
is to lift those scripts' patterns directly rather than re-derive them from the SDK's general
documentation.

## Common Pitfalls

### Pitfall 1: `Order` ScVal field order must be alphabetical, not declaration order
**What goes wrong:** encoding the `Order` struct's ScMap with fields in the Rust struct's
declared order (`maker, taker, maker_token, maker_amount, taker_token, taker_amount, expiry,
order_id, fee_bps`) instead of sorted order produces a value that either fails `swap`'s arg
decode or — more dangerously — silently decodes with fields bound to the wrong keys.
**Why it happens:** `soroban_sdk`'s derive macro for `#[contracttype] struct` sorts field symbols
alphabetically when generating the map; this is not obvious from reading the Rust source alone.
**How to avoid:** always build the map via `Object.keys(fields).sort()` before mapping to
`ScMapEntry`, exactly as `tools/rfq-live-swap.mjs:106` does.
**Warning signs:** `swap` simulation fails with an argument-type/decode error, or (much worse)
succeeds but moves the wrong amounts.

### Pitfall 2: `assembleTransaction` silently drops pre-attached auth if simulated wrong
**What goes wrong:** if the maker's signed entry is attached AFTER simulation (or the operation
was simulated once without it, then rebuilt), `assembleTransaction` will inject whatever auth the
LATEST simulation produced — which for a taker-as-source call may be nothing at all for the maker
side, since the maker's own signature can only come from that pre-signed entry, never from
simulation.
**Why it happens:** `assembleTransaction`'s auth-injection is a convenience for the common case
(recording-mode simulation auto-fills all needed auth) and assumes you want simulation's answer,
not your own attached auth.
**How to avoid:** attach `auth: [signedMakerEntry]` on the `Operation.invokeContractFunction` call
itself, then simulate that exact operation in enforcing mode (`fill.ts`/`rfq-live-swap.mjs`
pattern); never call plain (non-enforcing) simulation after attaching real signatures.
**Warning signs:** settlement submits successfully but with the wrong (or missing) maker
authorization — should be caught by the enforcing-mode simulation raising an auth error first, but
verify this in a negative test (attach a stale/wrong entry, confirm rejection at simulation).

### Pitfall 3: `data-panel` name must be added to BOTH files or spacing breaks silently
**What goes wrong:** `intent.css`'s `[data-panel="…"]` rules track the desk's section names; a new
panel name present in `App.tsx` but absent from `intent.css` produces no error, just lost layout
(this exact bug already shipped once per CLAUDE.md Gotchas).
**Why it happens:** the coupling is purely by string match across two files with no compiler or
lint check.
**How to avoid:** grep `data-panel` in both `src/App.tsx` and `public/intent.css` after adding the
4th panel; this is D-01's explicit instruction.
**Warning signs:** the new RFQ panel renders with default/no spacing.

### Pitfall 4: E2E localhost stub is invisible to production CSP, which is correct — do not "fix" it
**What goes wrong:** a planner might assume the E2E stub maker origin needs adding to
`vercel.json` `connect-src` because "the desk fetches an external origin." It does not, in this
phase: `npm run preview` (used by `e2e:census`) serves via Vite's preview server, which does not
apply `vercel.json`'s `headers` block (that is Vercel-edge-only config) [VERIFIED:
vite.config.ts, no CSP-setting plugin present; tools/e2e/run-all.mjs:8 assumes `npm run preview`].
**Why it happens:** conflating "the browser fetches localhost" with "the deployed CSP must allow
it" — they are different environments entirely (D-11 makes this explicit).
**How to avoid:** make NO `vercel.json` change in this phase (D-11); the first real maker origin
addition is Phase 3's job.
**Warning signs:** none expected if D-11 is followed; a CSP violation in the E2E browser console
would indicate the stub maker origin is somehow being checked against `connect-src`, which should
not happen under `vite preview`.

### Pitfall 5: the currently deployed `rfq_swap` contract does NOT yet have `require_fill_guard`
**What goes wrong:** CLAUDE.md's Status section describes a 2026-08-19 DECISION to merge
`otc_swap` into `rfq_swap`, adding an `Order.require_fill_guard: bool` field and implying a new
wasm/contract id. Reading only that prose could lead a planner to assume the currently deployed
`RFQ_SWAP_CONTRACT_ID` already has this field.
**Why it happens:** the decision and the implementation are recorded in the same document but on
different dates; the merge is a DECISION, not yet BUILT.
**How to avoid:** the actual deployed contract source [VERIFIED: contracts/rfq_swap/src/lib.rs:67-85]
has exactly 9 `Order` fields (`maker, taker, maker_token, maker_amount, taker_token, taker_amount,
expiry, order_id, fee_bps`) — no `require_fill_guard`. This matches what
`tools/rfq-live-swap.mjs:94-105` encodes and what settled on Testnet 2026-08-18. Phase 2 settles
through THIS contract, unchanged. The `otc_swap` retirement/merge is not in `REQUIREMENTS.md`'s v1
scope (no `SWAP-0x` requirement references it) and is out of this phase's scope entirely.
**Warning signs:** a plan that references `require_fill_guard` in the taker's order encoding would
be building against a contract field that does not exist on the deployed instance.

### Pitfall 6: `rfq_swap` uses a `__constructor`, not `initialize` — no re-init, no admin race window
**What goes wrong:** assuming `rfq_swap` needs the same two-step deploy-then-initialize sequence
`rfq_registry` needs (documented in `otc-config.js`'s comment for `RFQ_REGISTRY_ID`).
**Why it happens:** the two sibling contracts deliberately use different initialization patterns
(documented in both contracts' header comments) [VERIFIED: contracts/rfq_swap/src/lib.rs:171-185,
contracts/rfq_registry/src/lib.rs:14-25]; conflating them could lead to unnecessary or incorrect
deploy-checklist entries in a plan.
**How to avoid:** this phase does not deploy or reset either contract, so it is informational only
— but if a plan touches the Testnet-reset checklist, `rfq_swap` needs `--admin`/`--fee-bps`/
`--fee-collector` constructor args at `deploy` time [VERIFIED: public/otc-config.js:31-35], while
`rfq_registry` needs the separate `initialize` invoke [VERIFIED: public/otc-config.js:41-51].
**Warning signs:** N/A for this phase — noted purely to prevent confusion if a Testnet reset
happens to fall inside Phase 2's execution window.

## Runtime State Inventory

Not applicable — this is a greenfield feature phase (new panel, new `src/core/rfq/*` modules, new
E2E driver), not a rename/refactor/migration phase. No existing runtime state changes name or
identity.

## Code Examples

### Registry discovery: two free reads + client-side intersection (TAKER-01)
```javascript
// Pattern verified live end-to-end by tools/rfq-registry-live.mjs steps 7 and 11
// (register -> discover-by-token -> eject -> discover-by-token confirms removal).
const [makerUrls, takerUrls] = await Promise.all([
  simulateRead(registry, 'get_urls_for_token', [new Address(makerTokenSac).toScVal()]),
  simulateRead(registry, 'get_urls_for_token', [new Address(takerTokenSac).toScVal()]),
]);
const commonUrls = makerUrls.value.filter((u) => takerUrls.value.includes(u));
```

### JSON-RPC 2.0 fan-out with per-request timeout, drop malformed (TAKER-02)
```typescript
// No SDK/library dependency — native fetch + AbortSignal.timeout(). Wire shape per
// docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md §6.
async function getMakerSideOrder(url: string, params: GetMakerSideOrderParams) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getMakerSideOrder', params }),
    signal: AbortSignal.timeout(3000), // 2-3s per TAKER-02
  }).catch(() => null);
  if (!res || !res.ok) return null; // drop: unreachable / non-2xx
  const body = await res.json().catch(() => null);
  if (!body?.result?.order || !body.result.authEntry) return null; // drop: malformed
  return body.result;
}

const results = await Promise.allSettled(makerUrls.map((u) => getMakerSideOrder(u, params)));
const quotes = results
  .filter((r) => r.status === 'fulfilled' && r.value !== null)
  .map((r) => (r as PromiseFulfilledResult<QuoteResult>).value);
```

### Trustline pre-flight reusing existing balance data (D-08, TAKER-05)
```typescript
// balances comes from the ALREADY-FETCHED useBalances(address) hook the desk already
// calls for the topbar strip — zero extra network cost, per D-08.
// balanceOf/canAfford semantics: absent key means no trustline (src/core/balances.ts:86-88).
import { balanceOf } from '../core/balances';

const makerTokenKey = makerToken; // e.g. 'USDC:GBJH2X...'
const hasTrustline = makerTokenKey === 'XLM' || balances?.[makerTokenKey] !== undefined;
// if !hasTrustline: show the passive one-liner (D-08); the actual changeTrust prompt
// happens at accept time via ensureTrustline(chainConfig, makerTokenKey, walletSigner)
// (src/core/fill.ts:73-85), reused as-is.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| AirSwap `getSignerSideOrderERC20` + EIP-712 `(v,r,s)` signature | Stellar `getMakerSideOrder` + one base64 `authEntry` (SorobanAuthorizationEntry) | Adopted 2026-08-17 (this repo) | The entire signature-scoping/domain-separation/nonce-bitmap surface AirSwap hand-rolls is replaced by host-native auth; validation shifts from "verify an ECDSA signature over a struct hash" to "decode and compare an invocation tree" |
| `SwapERC20.swapLight` (taker calls `msg.sender`-gated function, needs prior `approve`) | `rfq_swap::swap` (taker = tx source; no pre-approval; nested transfers ride inside the maker's own auth) | Same adoption | Taker signs exactly one transaction, no separate approve step — this is the whole "single signTransaction prompt" property TAKER-04 hinges on |

**Deprecated/outdated:** none specific to this phase's scope; the broadcast/intent fan-out layer
this phase's RFQ panel sits beside is itself the item slated for retirement, but only after the
RFQ protocol fully ships (RETIRE-01, Phase 4) — not touched in Phase 2.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `buildInvocationTree(entries[makerIdx].rootInvocation())` for the maker's `swap` auth entry produces a root `execute` node whose `args.args` is the exact 8-tuple passed to `require_auth_for_args` (`taker, maker_token, maker_amount, taker_token, taker_amount, expiry, order_id, fee_bps`), plus 1-2 `transfer` sub-invocation nodes (2 when `fee_bps > 0`). This exact tree SHAPE was reasoned from Soroban's `require_auth_for_args` semantics and the contract's `swap` body, not empirically dumped from a live simulation in this research session. | Architecture Patterns Pattern 4; Code Examples | `validate.ts`'s comparison logic could be built against a wrong assumed shape (e.g. wrong sub-invocation count, or the root args including/excluding a field incorrectly), causing either false-accept (security risk: a doctored quote passes validation) or false-reject (every honest quote is rejected). Mitigation: dump one real decoded tree from the stub maker's own signed entry (or extend `tools/rfq-live-swap.mjs` with a one-line `console.log(JSON.stringify(buildInvocationTree(...)))`) before finalizing `validate.ts`. |
| A2 | The maker server's `authEntry` in the JSON-RPC response is produced via the exact recording-mode-simulate-then-`authorizeEntry` flow the spec documents (§6 "Maker server: producing the signed auth entry") and that `tools/rfq-live-swap.mjs` exercises for a raw keypair signer — i.e. the D-12 stub maker will produce entries structurally identical to a real maker server's. | Summary; Common Pitfalls Pitfall 2 | If the stub maker takes a shortcut (e.g. hand-building an auth entry instead of using `authorizeEntry` on a recording-mode simulation), the E2E harness could pass while a real maker server (different codebase, Phase 3) produces subtly different entries that the taker's validation logic rejects. Mitigation: D-12 already specifies the stub maker must be "faithful" (real JSON-RPC, genuinely signed) — hold this line strictly during implementation. |
| A3 | No new npm dependency is needed anywhere in this phase, including for JSON-RPC client plumbing. | Standard Stack | Low risk — the wire protocol (§6) is simple request/response JSON-RPC 2.0 with no WSS (explicitly out per D-12) and no batching; native `fetch` is well-precedented in this repo (`useBalances.ts` already uses raw `fetch` against Horizon). |

**If this table is empty:** N/A — see above.

## Open Questions

1. **Exact `authEntry` invocation-tree shape for `rfq_swap::swap`'s maker auth entry**
   - What we know: the field order (`taker, maker_token, maker_amount, taker_token,
     taker_amount, expiry, order_id, fee_bps`) from the contract source, and that
     `sim.result.auth` returns one address-credential entry for the maker plus nothing for the
     taker (confirmed live: `tools/rfq-live-swap.mjs` `check('taker needs no detached
     Address-credential entry', ...)` passes).
   - What's unclear: the precise JS shape `buildInvocationTree` returns for this specific tree
     (argument value types after `scValToNative`-style conversion inside the tree, and how many
     `transfer` sub-invocation nodes appear and in what order relative to the fee transfer).
   - Recommendation: the first implementation task for TAKER-03 should be a throwaway script
     (extend `tools/rfq-live-swap.mjs` or write a new one-off) that dumps
     `JSON.stringify(buildInvocationTree(entries[makerIdx].rootInvocation()), null, 2)` against a
     real simulation, BEFORE writing `validate.ts`'s comparison assertions.

2. **Stub maker key management inside `tools/e2e/`**
   - What we know: D-10 requires the stub maker to be a real Friendbot-funded actor registered on
     the live registry, and D-12 requires it to genuinely sign `authEntry`s with that key.
   - What's unclear: whether the stub maker's key should be generated fresh per E2E run (matching
     `tools/rfq-registry-live.mjs`'s "creates its own throwaway maker actors via Friendbot, so it
     depends on no gitignored key file" pattern) or persisted like `e2e-keys.json`
     (`tools/e2e/prepare-keys.mjs`).
   - Recommendation: fresh-per-run (mirrors `rfq-registry-live.mjs` and `rfq-live-swap.mjs`, both
     of which use `Keypair.random()` + Friendbot rather than a persisted key file) keeps the E2E
     harness self-contained and avoids a second gitignored secrets file; the existing
     `e2e-keys.json` pattern is for the maker/taker DESK actors (already Freighter-mocked), which
     is a different concern from the stub MAKER SERVER's own signing key.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Node.js | build, vitest, all `tools/*.mjs` scripts, `npm run e2e:census` | Yes [VERIFIED: `node --version` this session] | v24.18.0 (package.json requires `>=20.19`) | — |
| npm | dependency install, all npm scripts | Yes [VERIFIED: `npm --version` this session] | 11.16.0 | — |
| `@stellar/stellar-sdk` | every on-chain interaction this phase adds | Yes, already installed | 16.0.1 | — |
| Playwright cached Chromium | E2E-01 driver extension | Yes [VERIFIED: `~/Library/Caches/ms-playwright/chromium-1223` present this session] | chromium-1223 (Playwright 1.60.0's pin) | `CHROME_PATH` override documented in `tools/e2e/lib.mjs` |
| Stellar CLI | not required by this phase (no contract build/deploy) | Yes, present anyway | 27.0.0 | — |
| Testnet RPC/Horizon/Friendbot reachability | all discovery reads, registration, settlement, E2E | Assumed reachable (external Testnet infra); not probed this session | — | none — E2E-01 and the desk itself hard-depend on Testnet availability, matching every prior phase's dependency profile |

**Missing dependencies with no fallback:** none identified.
**Missing dependencies with fallback:** none identified — the one external-network dependency
(Testnet RPC/Horizon/Friendbot) has no fallback but is an accepted standing dependency for this
entire milestone, not new to this phase.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.10` [VERIFIED: package.json:34] |
| Config file | `vite.config.ts` (`test.include: ['src/**/*.test.ts']`) [VERIFIED: vite.config.ts:36-39] |
| Quick run command | `npm test` (currently: 8 suites, 109 tests per CLAUDE.md) |
| Full suite command | `npm test` (same — no separate "quick" subset configured) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|-------------|
| TAKER-01 | Registry discovery + intersection | unit (pure logic against mocked reads) | `npx vitest run src/core/rfq/discover.test.ts` | ❌ Wave 0 |
| TAKER-02 | Fan-out timeout/drop-malformed behavior | unit (fetch mocked) | `npx vitest run src/data/rfqNetwork.test.ts` | ❌ Wave 0 |
| TAKER-03 | Quote validation (economics/feeBps/expiry/invocation tree) | unit (pure, fixture-driven) | `npx vitest run src/core/rfq/validate.test.ts` | ❌ Wave 0 |
| TAKER-04 | Settlement assemble/simulate/submit shape | unit for pure helpers (ScVal encode); live for the real flow | `npx vitest run src/core/rfq/settle.test.ts` (unit) + `node tools/e2e/run-all.mjs` (live) | ❌ Wave 0 (unit); live path exists via E2E-01 extension |
| TAKER-05 | Trustline pre-flight + expired-retry-once logic | unit (pure state-machine logic) | `npx vitest run src/core/rfq/validate.test.ts` or a dedicated retry test file | ❌ Wave 0 |
| TAKER-06 | Order canonical encoding golden vectors | unit (fixture-pinned) | `npx vitest run src/core/rfq/canonical.test.ts` | ❌ Wave 0 |
| CSP-01 | Zero CSP violations, no `unsafe-inline` | manual/E2E console check | browser console during `npm run e2e:census`; manual `dist/*.html` grep for inline `<script>` per CLAUDE.md checklist | existing check reused, no new file needed |
| E2E-01 | Full RFQ taker flow through mock Freighter + stub maker, settles for real | e2e (live Testnet) | `node tools/e2e/run-all.mjs` (extended) | ❌ Wave 0 (new stub-maker.mjs + driver extension) |

### Sampling Rate
- **Per task commit:** `npm test` (fast, pure-logic suites only touch `src/core/rfq/*` and
  `src/data/rfqNetwork.ts` — no network calls in unit tests)
- **Per wave merge:** `npm test` + `npm run build` (typecheck + bundle) + a manual CSP console
  check if the E2E wave touched anything network-facing
- **Phase gate:** `npm test` green, `npm run build` clean, `cargo test --manifest-path
  contracts/Cargo.toml` green (no contract changes expected, but the checklist item stands per
  CLAUDE.md's Verify-before-deploying list), and `node tools/e2e/run-all.mjs` (extended) passes
  with a real Testnet settlement before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/core/rfq/canonical.test.ts` + a new `fixtures/rfq-canonical-args.json` (or extend the
  existing fixtures file with an `rfq` section) — covers TAKER-06
- [ ] `src/core/rfq/validate.test.ts` — covers TAKER-03, TAKER-05 (expired-retry state machine)
- [ ] `src/core/rfq/discover.test.ts` — covers TAKER-01 (pure intersection/ranking logic against
  mocked read results)
- [ ] `src/data/rfqNetwork.test.ts` — covers TAKER-02 (fetch mocked, timeout/malformed-drop
  behavior)
- [ ] `tools/e2e/stub-maker.mjs` + driver extension — covers E2E-01 (no automated vitest
  equivalent; this is the live-Testnet check)
- [ ] Framework install: none — Vitest is already configured and covers `src/**` per the existing
  `include` glob; no new test-framework setup needed, only new test files under `src/core/rfq/`
  and `src/data/`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | No | No app-level authentication; identity is a connected wallet, consistent with the rest of the repo |
| V3 Session Management | No | No sessions; wallet connection state only (existing `WalletContext`) |
| V4 Access Control | Partial | On-chain access control only: `require_auth_for_args` (maker) and `require_auth` (taker, source account) inside `rfq_swap::swap`, already deployed and covered by this phase's Common Pitfalls / Don't Hand-Roll sections |
| V5 Input Validation | Yes | Quote validation (TAKER-03): economics/feeBps/expiry/invocation-tree checks are precisely an input-validation boundary between an untrusted maker server and a signed transaction; token resolution restricted to `src/core/tokens.ts`'s curated allow-list (TAKER-05), never raw addresses from a maker response |
| V6 Cryptography | No new work | This phase never hand-rolls signature verification — it decodes and compares already-verified (by the host, at settlement time) auth-entry contents; the SDK's `authorizeEntry`/host verification is the only cryptographic operation involved, and it is not this phase's code |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Malicious/compromised maker server returns a quote with drifted economics, wrong `feeBps`, or an `authEntry` whose invocation tree doesn't match the stated order (arbitrary-contract-call / token-substitution hazard, per spec §7.3) | Tampering, Spoofing | TAKER-03's pre-wallet-prompt validation: economics match, `feeBps == get_config().fee_bps`, decoded invocation-tree args match exactly — reject before any signature is even requested |
| Maker server returns a token address not on the curated allow-list (a "dishonest by design" token contract, per spec §7.3) | Tampering | Tokens resolve ONLY from `src/core/tokens.ts` (TAKER-05); never trust a token address that arrives inside the maker's JSON-RPC response |
| Slow/rate-limit-abusing maker server used to stall the taker past a quote's expiry (or to probe for retry behavior) | Denial of Service | 2-3s AbortSignal timeout per maker (TAKER-02); NO automatic periodic re-fan-out (D-05, explicitly to stay rate-limit friendly per the documented `-33605` error code) |
| Taker signs a transaction whose auth entry has expired mid-flow (slow wallet interaction), and a naive "just retry" auto-signs a possibly-different, unseen price | Tampering (of the effective price the user consents to) | D-09's price-guarded retry: auto-refresh once ONLY if the fresh price is equal-or-better; otherwise stop and force explicit re-confirmation — "the taker never signs at a price they have not seen" |
| Registry read returns a maker URL that is itself malicious (registry is permissionless, stake-gated only, not vetted) | Spoofing | Unaffected by trust: the maker's returned quote/authEntry still goes through full TAKER-03 validation regardless of registry membership; a malicious registered maker can at worst return a bad or malformed quote, which validation drops (matches the spec's documented trust model, §3 "maker servers are untrusted price sources") |

## Sources

### Primary (HIGH confidence)
- `docs/superpowers/specs/2026-08-17-rfq-protocol-architecture-design.md` — the adopted RFQ
  architecture (§6 wire protocol, §7 security analysis, §4 `rfq_swap` interface); read in full
  this session
- `contracts/rfq_swap/src/lib.rs` — deployed contract source, read in full this session
- `contracts/rfq_registry/src/lib.rs` — deployed contract source (function signatures + header
  comments), read this session
- `tools/rfq-live-swap.mjs`, `tools/rfq-registry-live.mjs` — proven live-Testnet reference
  implementations of the exact patterns this phase needs, read in full this session
- `src/core/fill.ts`, `src/core/canonical.ts`, `src/core/tokens.ts`, `src/core/balances.ts`,
  `src/data/useBalances.ts`, `src/config.ts`, `public/otc-config.js`, `src/App.tsx`,
  `src/wallet/kit.ts` — existing code this phase reuses/mirrors, all read this session
- `node_modules/@stellar/stellar-sdk` type definitions (`base/invocation.d.ts`,
  `base/generated/next.d.ts`) — confirmed the installed SDK's `buildInvocationTree`/
  `walkInvocationTree` export and `SorobanAuthorizationEntry`/`SorobanAuthorizedInvocation` shape,
  version 16.0.1 matching `package.json`'s pin, read this session
- `tools/e2e/lib.mjs`, `freighter-mock.mjs`, `driver.mjs`, `run-all.mjs` — existing E2E harness
  patterns E2E-01 extends, read in full this session
- `vercel.json`, `vite.config.ts`, `package.json` — CSP/build/dependency configuration, read this
  session

### Secondary (MEDIUM confidence)
- none beyond the primary sources above — this research relied entirely on in-repo source and the
  installed SDK's own type definitions, no external web search was needed given the depth of
  existing in-repo documentation and proof scripts

### Tertiary (LOW confidence)
- npm registry version check for `@stellar/stellar-sdk` (`17.0.1` latest vs. `16.0.1` pinned) —
  informational only, not acted on

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; every capability already proven against the
  installed SDK version by existing live-proof scripts
- Architecture: HIGH — the system diagram and module layout follow directly from the adopted spec
  and the existing `fill.ts`/`canonical.ts` isolation pattern already in production in this repo
- Pitfalls: HIGH for patterns verified against live scripts (ScVal field order, assembleTransaction
  auth injection, CSP/preview-server behavior, contract field set); MEDIUM for the invocation-tree
  exact shape (Assumption A1) pending an empirical dump early in implementation

**Research date:** 2026-08-29
**Valid until:** 30 days (stable: no contract changes, no new dependencies; the one perishable
fact — `@stellar/stellar-sdk` registry version drift — does not affect correctness at the pinned
version)
