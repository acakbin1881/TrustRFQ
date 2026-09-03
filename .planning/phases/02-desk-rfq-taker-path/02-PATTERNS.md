# Phase 2: Desk RFQ Taker Path - Pattern Map

**Mapped:** 2026-09-03
**Files analyzed:** 11 (new) + 2 (modified)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/core/rfq/wire.ts` | model/utility (types + error codes) | request-response | `src/core/canonical.ts` (pure module header/isolation discipline) | role-match |
| `src/core/rfq/canonical.ts` | utility (signature boundary) | transform | `src/core/canonical.ts` + `tools/rfq-live-swap.mjs:94-110` (`orderScVal`) | exact (same struct-encoding problem, different contract) |
| `src/core/rfq/validate.ts` | service (pure validation) | transform | `src/core/balances.ts` (pure, fail-closed core module) + `tools/rfq-live-swap.mjs` invocation-tree checks | role-match |
| `src/core/rfq/discover.ts` | service (pure ranking/intersection) | transform | `src/core/oracle.ts` (pure math module, no network) | role-match |
| `src/core/rfq/settle.ts` | service (chain ops) | request-response | `src/core/fill.ts` (isolation pattern: injected `WalletSigner`, no Supabase, no UI) | exact |
| `src/data/rfqNetwork.ts` | service (the ONE network module: RPC reads + JSON-RPC fan-out) | request-response | `src/data/useFairPrice.ts` + `src/data/useBalances.ts` (fetch-based network module pattern) | role-match |
| `src/ui/RfqPanel.tsx` | component (thin panel shell) | request-response | `src/ui/OfferList.tsx` + `src/ui/SettlementStrip.tsx` (list + settlement-strip composition) | role-match |
| `src/App.tsx` (modified) | shell/route | request-response | itself — existing `TabName`/`data-panel`/`SectionSheet` wiring | exact |
| `public/intent.css` (modified) | config/style | n/a | itself — existing `[data-panel="incoming"]` rule block | exact |
| `tools/e2e/stub-maker.mjs` | service (JSON-RPC server, test-only) | request-response | `tools/rfq-live-swap.mjs` (auth-entry production) + `tools/rfq-registry-live.mjs` (Friendbot actor + registration lifecycle) | role-match |
| `tools/e2e/rfq-driver.mjs` (or driver.mjs extension) | test | event-driven / browser automation | `tools/e2e/driver.mjs` (click-census driver pattern) | exact |
| `fixtures/rfq-canonical-args.json` (or extended `fixtures/canonical-args.json`) | test fixture | n/a | `fixtures/canonical-args.json` + `src/core/canonical.test.ts` | exact |

## Pattern Assignments

### `src/core/rfq/settle.ts` (service, request-response — chain ops)

**Analog:** `src/core/fill.ts` (full file read, 166 lines)

**Isolation-boundary header comment to replicate** (`src/core/fill.ts:1-16`):
```typescript
// ---------------------------------------------------------------------------
// On-chain settlement — chain operations only.
// ---------------------------------------------------------------------------
// Two deliberate boundaries:
//   1. The wallet is INJECTED as a WalletSigner (the SEP-43 subset the flows
//      need) instead of importing the kit — so this module never touches UI
//      state and the signing dependency is visible in the signature.
//   2. No Supabase, no toasts: DB writes and user feedback live in the caller
//      (useSettlement). This module talks to the chain and nothing else.
```
For RFQ: the taker is the tx source and NO `signAuthEntry` is ever called on the taker's own leg (mirrors `tools/rfq-live-swap.mjs`'s proof that the taker needs no detached Address-credential entry) — `settle.ts`'s `WalletSigner` slice can therefore drop `signAuthEntry` entirely and only needs `signTransaction`.

**`WalletSigner` interface to reuse verbatim** (`src/core/fill.ts:21-38`):
```typescript
export interface WalletSigner {
  address: string;
  signTransaction(
    xdr: string,
    opts: { address: string; networkPassphrase: string },
  ): Promise<{ signedTxXdr: string }>;
}
```
(drop `signAuthEntry` — RFQ settle.ts never signs an auth entry itself, only the maker's server does that, off-repo)

**`ChainConfig` shape to reuse** (`src/core/fill.ts:40-45`), pointed at `RFQ_SWAP_CONTRACT_ID` instead of `OTC_CONTRACT_ID`:
```typescript
export interface ChainConfig {
  rpcUrl: string;
  horizonUrl: string;
  passphrase: string;
  contractId: string;
}
const rpc = (c: ChainConfig) => new Stellar.rpc.Server(c.rpcUrl);
```

**`ensureTrustline` — reuse AS-IS, do not reimplement** (`src/core/fill.ts:72-85`):
```typescript
export async function ensureTrustline(c: ChainConfig, tokenStr: string, signer: WalletSigner): Promise<void> {
  const { asset, native } = assetFor(tokenStr);
  if (native) return;
  const h = horizon(c);
  const acct = await h.loadAccount(signer.address);
  if (acct.balances.some((b) => 'asset_code' in b && b.asset_code === asset.code && b.asset_issuer === asset.issuer)) return;
  const tx = new Stellar.TransactionBuilder(acct, { fee: Stellar.BASE_FEE, networkPassphrase: c.passphrase })
    .addOperation(Stellar.Operation.changeTrust({ asset })).setTimeout(180).build();
  const { signedTxXdr } = await signer.signTransaction(tx.toXDR(), {
    address: signer.address, networkPassphrase: c.passphrase,
  });
  await h.submitTransaction(Stellar.TransactionBuilder.fromXDR(signedTxXdr, c.passphrase) as Stellar.Transaction);
}
```
Import this directly from `src/core/fill.ts` rather than duplicating it (CONTEXT.md canonical_refs explicitly names it reusable as-is for the maker-token leg).

**Settlement with pre-attached auth — mirror `submitFill`'s shape** (`src/core/fill.ts:135-165`), but adapted to the LIVE-PROVEN mixed-credential pattern from `tools/rfq-live-swap.mjs:294-345` (the settle() helper) since `rfq_swap::swap` takes ONE pre-signed maker entry, not two:
```javascript
// Source: tools/rfq-live-swap.mjs:296-324 (VERIFIED live on Testnet 2026-08-18)
async function settle(takerKp, order, auth, label) {
  const account = await server.getAccount(takerKp.publicKey());
  const tx = new TransactionBuilder(account, { fee: FEE, networkPassphrase: NETWORK })
    .addOperation(
      Operation.invokeContractFunction({
        contract: CONTRACT_ID,
        function: 'swap',
        args: [orderScVal(order)],
        auth,  // [signedMakerEntry] — pre-attached BEFORE simulate, per Pitfall 2
      }),
    )
    .setTimeout(TIMEOUT)
    .build();
  const sim = await server.simulateTransaction(tx);   // enforcing mode
  if (Api.isSimulationError(sim)) throw new Error(`${label} failed: ${sim.error}`);
  const ready = assembleTransaction(tx, sim).build();  // auth already attached, preserved
  ready.sign(takerKp);                                  // the ONE Freighter signTransaction prompt
  const sent = await server.sendTransaction(ready);
  // ... poll getTransaction (mirror fill.ts's waitForTx, src/core/fill.ts:62-70)
}
```

**`waitForTx` — reuse pattern verbatim** (`src/core/fill.ts:62-70`):
```typescript
export async function waitForTx(server: Stellar.rpc.Server, hash: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const r = await server.getTransaction(hash);
    if (r.status === Stellar.rpc.Api.GetTransactionStatus.SUCCESS) return hash;
    if (r.status === Stellar.rpc.Api.GetTransactionStatus.FAILED) throw new Error('Transaction failed on-chain.');
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error('Timed out waiting for confirmation.');
}
```

**Anti-pattern from RESEARCH.md, load-bearing:** never call `assembleTransaction` before the maker's signed auth entry is attached to the operation — `assembleTransaction` only injects simulation-produced auth onto an operation carrying NONE (`src/core/fill.ts:144-156` comment: "enforcing-mode simulation (auth pre-attached) → footprint + resource fee"). Attach `auth: [signedMakerEntry]` on `Operation.invokeContractFunction` itself, then simulate that exact operation in enforcing mode.

---

### `src/core/rfq/canonical.ts` (utility, transform — signature boundary)

**Analog:** `src/core/canonical.ts` (full file, 108 lines) + `tools/rfq-live-swap.mjs:94-110` (`orderScVal`, the exact struct this new file must encode)

**Header-comment discipline to replicate** (`src/core/canonical.ts:1-20`):
```typescript
// ---------------------------------------------------------------------------
// Canonical order encoding — the signature boundary.
// ---------------------------------------------------------------------------
// This module is PURE — no wallet, no network, no DOM, no `window`. It takes the
// network passphrase as an argument rather than reading a global, which is what
// lets the .test.ts pin its output against a fixtures JSON.
```

**The load-bearing sorted-key ScVal encoder to port** (`tools/rfq-live-swap.mjs:94-110`, VERIFIED live settling tx `49fa69b2258d5...`):
```javascript
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
CRITICAL (Pitfall 1 in RESEARCH.md): field order MUST be `Object.keys(fields).sort()`, alphabetical, never Rust declaration order (`maker, taker, maker_token, maker_amount, taker_token, taker_amount, expiry, order_id, fee_bps`). Getting this wrong either fails decode or silently binds fields to the wrong keys.

**`Order` struct fields (from `contracts/rfq_swap/src/lib.rs`, 9 fields, NO `require_fill_guard` yet — Pitfall 5):**
`maker, taker, maker_token, maker_amount, taker_token, taker_amount, expiry, order_id, fee_bps`.

**Decimal-to-i128 helper to mirror** (`src/core/canonical.ts:64-67`, `toStroops`):
```typescript
export function toStroops(s: string): bigint {
  const [whole, frac = ''] = String(s).split('.');
  return BigInt(whole || '0') * 10000000n + BigInt((frac + '0000000').slice(0, 7));
}
```

**Golden-vector test structure to mirror** (`src/core/canonical.test.ts`, full file, 86 lines) — describe blocks per pure function, fixture-driven `for (const v of fixtures.vectors)`, plus an explicit "tamper guard" test (`it('changes when an amount changes...')`) and a determinism test. New file: `src/core/rfq/canonical.test.ts` against a new/extended fixtures JSON (TAKER-06).

---

### `src/core/rfq/validate.ts` (service, transform — pure validation before any wallet prompt)

**Analog:** `src/core/balances.ts` (pure, fail-closed discipline) + the invocation-tree walk pattern from `@stellar/stellar-sdk`

**Fail-closed header discipline to replicate** (`src/core/balances.ts:1-19` style comment): validation must FAIL CLOSED — an unrecognized/undecodable auth entry, a mismatched `feeBps`, or an economics mismatch is treated as invalid, never defaulted to valid. Same posture as `canAfford`'s "unknown balance (null map) is never treated as spendable."

**Invocation-tree decode/walk — use the SDK helper, do not hand-roll** (RESEARCH.md Pattern 4, `node_modules/@stellar/stellar-sdk/lib/esm/base/invocation.d.ts`):
```typescript
import { xdr, buildInvocationTree } from '@stellar/stellar-sdk';
const entry = xdr.SorobanAuthorizationEntry.fromXDR(authEntryBase64, 'base64');
const tree = buildInvocationTree(entry.rootInvocation());
// tree.args = { source: 'C...(rfq_swap)', function: 'swap', args: [...] }
// tree.invocations = [ { type: 'execute', args: { source: maker_token, function: 'transfer', args: [...] } }, ... ]
```
Open question (RESEARCH.md Assumptions Log A1): the exact shape has NOT been empirically dumped this session — first implementation task should extend `tools/rfq-live-swap.mjs`-style logging (`console.log(JSON.stringify(buildInvocationTree(...)))`) against a real simulation before finalizing comparison assertions.

**`feeBps` cross-check source** (`contracts/rfq_swap/src/lib.rs:309-316`, `get_config`): validate `feeBps == get_config().fee_bps` BEFORE any wallet prompt — the contract itself rejects a mismatch at settlement (`Error::FeeMismatch`, `lib.rs:214-216`) but that is too late per TAKER-03.

**Token resolution constraint (TAKER-05):** never trust a token address arriving inside the maker's JSON-RPC response — resolve only through `src/core/tokens.ts`'s `isKnownToken`/`TOKENS` allow-list (`src/core/tokens.ts:34-45`), the same quarantine boundary `orderTokensKnown` already enforces for the OTC lane.

---

### `src/core/rfq/discover.ts` (service, transform — pure ranking/intersection)

**Analog:** `src/core/oracle.ts` (pure math module, full file, 45 lines)

**Purity discipline to replicate** (`src/core/oracle.ts:1-11` header): no window, no network, no wallet — pure functions over already-fetched data, unit-testable off any runtime.

**Client-side intersection pattern (TAKER-01), VERIFIED live by `tools/rfq-registry-live.mjs` steps 7 and 11:**
```javascript
const [makerUrls, takerUrls] = await Promise.all([
  simulateRead(registry, 'get_urls_for_token', [new Address(makerTokenSac).toScVal()]),
  simulateRead(registry, 'get_urls_for_token', [new Address(takerTokenSac).toScVal()]),
]);
const commonUrls = makerUrls.value.filter((u) => takerUrls.value.includes(u));
```
The two `get_urls_for_token` RPC reads themselves belong in `src/data/rfqNetwork.ts` (the ONE network module); `discover.ts` takes the two already-fetched arrays and does the pure `.filter(...)` intersection plus D-04's price-based ranking (`quotes.sort((a, b) => ...)`, best preselected).

---

### `src/data/rfqNetwork.ts` (service, request-response — the ONE network module)

**Analog:** `src/data/useFairPrice.ts` (fetch/cache pattern) + `src/data/useBalances.ts` (fetch + defensive-parse pattern) + `tools/rfq-registry-live.mjs:152-163` (`simulateRead`, the free zero-balance-source-account read)

**Free read-only registry/contract read — VERIFIED, reuse directly** (`tools/rfq-registry-live.mjs:147-163`):
```javascript
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
Used for both TAKER-01 registry discovery reads and TAKER-03's `get_config` read.

**JSON-RPC 2.0 fan-out with timeout/drop-malformed (TAKER-02), no library needed:**
```typescript
async function getMakerSideOrder(url: string, params: GetMakerSideOrderParams) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getMakerSideOrder', params }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const body = await res.json().catch(() => null);
  if (!body?.result?.order || !body.result.authEntry) return null;
  return body.result;
}
const results = await Promise.allSettled(makerUrls.map((u) => getMakerSideOrder(u, params)));
```
Mirrors `useBalances.ts`'s defensive-parse discipline (`res.status === 404` special-case, `try/catch` around `res.json()`) and `useFairPrice.ts`'s in-flight-staleness guard (`pairRef.current !== pair` there → analogous "this fan-out is stale, a newer amount/pair supersedes it" guard here).

**Caching pattern to consider (not required, but precedented)** (`src/data/useFairPrice.ts:15-24`):
```typescript
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { data: PriceData | null; at: number }>();
```
D-05 explicitly forbids automatic periodic re-fan-out, so `rfqNetwork.ts` should NOT cache quotes across re-quote clicks (each "Refresh quotes" is a deliberate, uncached network hit) — this is a deliberate DEPARTURE from the `useFairPrice` caching pattern, noted so the planner doesn't copy the cache Map by default.

---

### `src/ui/RfqPanel.tsx` (component, request-response — thin panel shell)

**Analog:** `src/ui/OfferList.tsx` (list-of-rows + expand pattern) + `src/ui/SettlementStrip.tsx` (settlement stepper + action-button-by-state pattern) + `src/App.tsx` (panel/tab wiring)

**List-of-rows-with-selection pattern to mirror** (`src/ui/OfferList.tsx:32-78`): a `useState<string | null>` for the selected/expanded row id, `.map()` over the array rendering a summary row that expands on click — for RfqPanel this becomes the ranked quote list with best-preselected (D-04) instead of expand/collapse.

**Settlement-state-driven action button pattern to mirror** (`src/ui/SettlementStrip.tsx:27-85`): a small pure function of `(status, myOk, otherOk)` deciding which single action/message to render — RfqPanel's in-panel confirmation (D-03) should follow the same "one state, one action" discipline: idle → "Accept quote" CTA; settling → busy message; settled → tx-hash link (mirrors `settle__msg` + `EXPLORER` link at `SettlementStrip.tsx:46-49`); failed → `.settle__err` raw error text (`SettlementStrip.tsx:80-82`).

**Explorer link + truncation helpers to reuse as-is:**
```typescript
import { EXPLORER } from '../config';
import { isTxHash, trunc } from '../core/tokens';
// <a href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noopener noreferrer">View transaction ↗</a>
```

**Do NOT reuse `useSettlement` — build a separate hook/module** (RESEARCH.md Anti-Pattern, explicit): `useSettlement` (`src/ui/useSettlement.ts`) is scoped to the OTC lane's `maker_auth`/`taker_auth` Supabase columns and its module-scope-adjacent `txBusy` ref serializes ThreadView settles specifically. RFQ settlement (D-03: no persistence) needs its own hook; do not route RFQ through `useSettlement` or attempt to share its lock. The BUSY-REF discipline itself (`const txBusy = useRef(false)`, guard-then-finally-reset, `src/ui/useSettlement.ts:38,48,63-64`) is still worth mirroring in a new RFQ-scoped hook, just not the same instance.

**Component composition constraint (D-07, per UI-SPEC.md):** compose `TokenSelect`, `Toast` only — `AddressSeal` is explicitly NOT needed (no maker identity shown).

---

### `src/App.tsx` (modified — 4th nav tab + data-panel)

**Analog:** itself, existing 3-tab pattern (`src/App.tsx:37, 94, 134-144, 158-195`)

**`TabName` union to extend** (`src/App.tsx:37`):
```typescript
type TabName = 'create' | 'incoming' | 'sent'; // → add | 'rfq'
```

**`SectionSheet` options array to extend** (`src/App.tsx:138-142`):
```typescript
options={[
  { id: 'create', label: 'New offer', glyph: '+' },
  { id: 'incoming', label: 'Incoming', glyph: '↓', count: incomingCount },
  { id: 'sent', label: 'Sent', glyph: '↑', count: sentCount },
  // + { id: 'rfq', label: 'RFQ', glyph: '⇄' }  — no count (D-03: nothing to count)
] as const}
```

**Panel div pattern to replicate** (`src/App.tsx:158-160`):
```jsx
<div className={tab === 'create' ? 'panel is-active' : 'panel'} data-panel="create">
  <Ticket address={address} refreshBalances={refreshBalances} onSent={onSent} />
</div>
// → <div className={tab === 'rfq' ? 'panel is-active' : 'panel'} data-panel="rfq">
//     <RfqPanel address={address} balances={balances} .../>
//   </div>
```

**CRITICAL Pitfall 3 (silent layout-loss):** the new `data-panel="rfq"` string must be added to BOTH `src/App.tsx` and `public/intent.css` in the same change. `public/intent.css` currently has NO `[data-panel="create"]` rule (create uses only base `.panel` styling) but DOES have dedicated `[data-panel="incoming"]` rules at lines 403-453 for its two-column grid layout (`.pairs-note`/`.pairs-glass`/`.intent-offers` placement) — grep `data-panel` in both files after adding the 4th panel to confirm the RFQ panel got its own rule block (even if minimal, matching create's plain-`.panel` baseline unless RfqPanel needs its own grid).

---

## Shared Patterns

### Chain-ops isolation (`src/core/*` purity rule)
**Source:** `src/core/fill.ts` (whole file) + `src/core/canonical.ts` (whole file)
**Apply to:** `src/core/rfq/canonical.ts`, `src/core/rfq/validate.ts`, `src/core/rfq/discover.ts` (pure, no network/wallet/window) and `src/core/rfq/settle.ts` (the one exception inside `core/rfq/` that talks to the chain, injected `WalletSigner`, mirrors `fill.ts` exactly). `src/data/rfqNetwork.ts` is the one designated network module for RPC reads + JSON-RPC fan-out, mirroring how `fill.ts` is the one network-talking module in the existing `core/` tree.

### Golden-vector discipline
**Source:** `src/core/canonical.test.ts` + `fixtures/canonical-args.json`
**Apply to:** `src/core/rfq/canonical.test.ts` + a new/extended fixtures file — same shape: `describe` blocks per pure function, `for (const v of fixtures.vectors)`, an explicit tamper-guard test, a determinism test.

### Enforcing-mode simulation with pre-attached auth
**Source:** `tools/rfq-live-swap.mjs:294-345` (`settle`) — VERIFIED live tx `49fa69b2258d5...`
**Apply to:** `src/core/rfq/settle.ts`. Never call plain/non-enforcing simulation after attaching real signatures; attach `auth` on the operation BEFORE `simulateTransaction`.

### Free read-only simulation (zero-balance source account)
**Source:** `tools/rfq-registry-live.mjs:152-163` (`simulateRead`)
**Apply to:** `src/data/rfqNetwork.ts` for both registry discovery reads (TAKER-01) and the `get_config` fee-bps cross-check (TAKER-03).

### Toast + status-progression + tx-link settlement feedback
**Source:** `src/ui/SettlementStrip.tsx` (stepper/action pattern) + `src/ui/Toast.tsx`'s `errMsg`/`ToastKind` convention (imported by `useSettlement.ts:16`)
**Apply to:** `src/ui/RfqPanel.tsx`'s in-panel confirmation and error surfacing — explicit Claude's Discretion instruction: "reuse the existing desk feedback patterns... no new UX invented."

### Trustline pre-flight reusing already-fetched balances
**Source:** `src/core/balances.ts` (`balanceOf`, absent-key-means-no-trustline semantics, lines 86-88) + `src/data/useBalances.ts` (already-polled Horizon data) + `ensureTrustline` (`src/core/fill.ts:73-85`)
**Apply to:** D-08's early passive note (zero extra network cost, read from the SAME `useBalances` instance `App.tsx` already threads to `Ticket`/`OfferList`) and the in-flow `changeTrust` prompt at accept time (reuse `ensureTrustline` unmodified).

### E2E driver + Friendbot-actor lifecycle
**Source:** `tools/e2e/driver.mjs` (click-tallying browser driver against the mock Freighter) + `tools/rfq-registry-live.mjs` (fresh-per-run `Keypair.random()` + Friendbot, register → discover → eject cycle) + `tools/rfq-live-swap.mjs` (auth-entry production a stub maker server must replicate faithfully per D-12/A2)
**Apply to:** `tools/e2e/stub-maker.mjs` (a real JSON-RPC 2.0 server producing genuinely signed `authEntry`s via `authorizeEntry` on a recording-mode simulation, exactly as `rfq-live-swap.mjs:225-230` does) and the RFQ taker driver extension (mirrors `driver.mjs`'s `Tally`/`click`/`step` helpers from `tools/e2e/lib.mjs`).

## No Analog Found

None — every file in this phase's scope has a direct or role-matched analog already in the repo; RESEARCH.md's own Standard Stack section confirms no new npm dependency and no genuinely novel architectural shape is needed (this phase wires existing, already-proven mechanisms together).

## Metadata

**Analog search scope:** `src/core/`, `src/data/`, `src/ui/`, `src/App.tsx`, `tools/`, `tools/e2e/`, `public/intent.css`, `contracts/rfq_swap/src/lib.rs`, `contracts/rfq_registry/src/lib.rs`
**Files scanned:** `src/core/fill.ts`, `src/core/canonical.ts`, `src/core/canonical.test.ts`, `src/core/tokens.ts`, `src/core/balances.ts`, `src/core/oracle.ts`, `src/data/useFairPrice.ts`, `src/data/useBalances.ts`, `src/App.tsx`, `src/ui/OfferList.tsx`, `src/ui/SettlementStrip.tsx`, `src/ui/useSettlement.ts`, `tools/rfq-live-swap.mjs`, `tools/rfq-registry-live.mjs`, `tools/e2e/driver.mjs`, `tools/e2e/run-all.mjs`, `public/intent.css` (data-panel rules)
**Pattern extraction date:** 2026-09-03
