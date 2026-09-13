# Phase 3: Live Full RFQ Loop - Pattern Map

**Mapped:** 2026-09-13
**Files analyzed:** 10 (sibling-repo files created by this phase + this-repo files modified)
**Analogs found:** 10 / 10 (all analogs live in THIS repo; the sibling repo has no prior code of
its own — everything there is a port)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `trustrfq-maker-server/api/rpc.ts` | route (serverless handler) | request-response (JSON-RPC 2.0 over HTTP) | `tools/e2e/stub-maker.mjs` (`startHttp`/`handleModedRequest`/happy path branch, lines 413-556) | exact (logic port, transport swapped http→Vercel) |
| `trustrfq-maker-server/src/signing.ts` | service | request-response (sign one quote) | `tools/e2e/stub-maker.mjs` (`signQuote`, `toContractOrder`, `orderScVal`, `isAddressCredential`, lines 208-326) | exact |
| `trustrfq-maker-server/src/order.ts` | utility (pure encode/decode) | transform | `src/core/rfq/order.ts` (whole file, 68 lines) | exact — verbatim-copy candidate |
| `trustrfq-maker-server/src/wire.ts` | model (pure types + constants) | transform | `src/core/rfq/wire.ts` (whole file, 64 lines) | exact — verbatim-copy candidate |
| `trustrfq-maker-server/src/config.ts` | config | request-response (env read) | `stub-maker.mjs`'s top-of-file `process.env.*` reads (lines 69-79) + `src/config.ts` (this repo's typed `window.*` reader pattern) | role-match |
| `trustrfq-maker-server/scripts/bootstrap.mjs` | utility (one-shot admin script) | batch | `tools/rfq-registry-live.mjs` (`invokeRegistry`, lines 178-193) + `stub-maker.mjs`'s `setup()` (lines 559-593) | exact |
| `trustrfq-maker-server/.gitignore` + local key-file convention | config | file-I/O | `tools/derive-keys.mjs` (whole file) — gitignored secret-file output pattern | role-match |
| `tools/e2e/rfq-driver.mjs` (extended: real-maker mode) | test (E2E driver) | event-driven / request-response | itself, `spawnStubMaker` (lines 191-230) and the `maker.url` consumption sites (lines 277, 826, 860, 878) — new code should mirror this shape, not replace it | exact (modification, not new file) |
| `vercel.json` (`connect-src` addition) | config | — | itself, existing `connect-src` origin list (line 18) | exact |
| `docs/<date>-live-rfq-run.md` | test (evidence record) | batch | no prior analog of this exact shape in this repo; nearest precedent is the narrative evidence blocks already embedded in `CLAUDE.md`'s Status section (e.g. the 2026-08-18 `rfq_swap` and 2026-08-26 `rfq_registry` live-proof paragraphs) | role-match (no dedicated `docs/*.md` run-record analog exists yet) |

## Pattern Assignments

### `trustrfq-maker-server/api/rpc.ts` (route, request-response)

**Analog:** `tools/e2e/stub-maker.mjs`

**CORS pattern** (lines 385-390, 513-517):
```javascript
const MODE_HEADER = 'x-e2e-mode'; // drop this header in the real server — it is a test-only knob
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};
// ...
if (req.method === 'OPTIONS') {
  res.writeHead(204, CORS_HEADERS);
  res.end();
  return;
}
```
Wide-open `'*'` is deliberate (header comment lines 379-384): a real maker server cannot know every
taker origin in advance; the maker's signature over terms is the actual trust boundary, not CORS
(RESEARCH.md Security Domain, "Cross-origin requests" row).

**Method dispatch / JSON-RPC envelope** (lines 525-548):
```javascript
let msg;
try { msg = JSON.parse(body); }
catch {
  res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
  return;
}
if (msg.method !== 'getMakerSideOrder') {
  res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32601, message: 'Method not found' } }));
  return;
}
try {
  const result = await handleGetMakerSideOrder(msg.params);
  res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
} catch (e) {
  res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -33600, message: String(e?.message || e) } }));
}
```
Port this into the Vercel handler shape (`export default function handler(req, res)`), dropping the
`x-e2e-mode` dispatch (`handleModedRequest`) entirely — D-03 excludes every failure knob from the
reference maker's v1 surface. Only the happy-path branch (stub-maker.mjs lines 500-502) survives.

**Error handling pattern:** every failure returns HTTP 200 with a JSON-RPC `error` object (never a
non-200 status for a business-logic failure) — mirrors `stub-maker.mjs` throughout. Keep this: the
taker's `rfqNetwork.ts` reads the JSON-RPC envelope, not the HTTP status, for business errors.

---

### `trustrfq-maker-server/src/signing.ts` (service, request-response)

**Analog:** `tools/e2e/stub-maker.mjs` lines 208-326 (`toAtomic`, `atomicToDecimal`, `orderScVal`,
`isAddressCredential`, `toContractOrder`, `signQuote`)

**Core pattern — RECORDING-mode probe + authorizeEntry** (lines 279-326):
```javascript
async function signQuote(order) {
  const contract = new Contract(RFQ_SWAP_CONTRACT_ID);
  const contractOrder = toContractOrder(order);
  const probeSource = new Account(order.taker, String(order.orderId));
  const probe = new TransactionBuilder(probeSource, { fee: FEE, networkPassphrase: NETWORK })
    .addOperation(contract.call('swap', orderScVal(contractOrder)))
    .setTimeout(TIMEOUT)
    .build();

  const sim = await server.simulateTransaction(probe); // recording mode: op carries no auth yet
  if (Api.isSimulationError(sim)) throw new Error(`recording sim failed: ${sim.error}`);

  const entries = sim.result?.auth ?? [];
  const makerIdx = entries.findIndex((e) => isAddressCredential(e, makerKp.publicKey()));
  if (makerIdx < 0) throw new Error('simulation produced no maker auth entry');

  const validUntil = latestLedgerSeq + 180;
  const signedMaker = await authorizeEntry(entries[makerIdx], makerKp, validUntil, NETWORK);
  return { authEntry: signedMaker.toXDR('base64'), signatureExpirationLedger: validUntil };
}
```
Non-negotiable: this exact RECORDING-mode-sim → `authorizeEntry` sequence (RESEARCH.md's "Don't
Hand-Roll" table — a hand-built `SorobanAuthorizationEntry` is the "classic bug farm" the adopted
spec rejected). Drop the `expired` param (D-09 test-only knob) and the `CAPTURE_AUTH_TREE` branch;
keep `probeSource`'s throwaway-account-with-unique-sequence trick (lines 282-304) — a constant
sequence caused a live `HostError: Error(Auth, ExistingValue)` collision this session's history
documents, so `order.orderId` must stay part of the probe tuple.

**Ledger-sequence caching** (lines 148-154, 587-589): background `setInterval(refreshLedgerSeq,
5000)` rather than a per-request `getLatestLedger()` call — this is the dominant latency saving
that keeps quote generation under the taker's 3s fetch timeout (RESEARCH.md Pitfall 1). Carry this
pattern into the Vercel function, but note Vercel serverless functions don't persist `setInterval`
state across cold starts the way a long-lived process does — either read `getLatestLedger()` once
per invocation (accept the extra ~50-100ms) or use Vercel's function-instance warm-reuse (module-
scope state does survive a WARM invocation, just not a cold one).

**Pricing pattern** (lines 338-351, `handleGetMakerSideOrder`):
```javascript
const takerAtomic = toAtomic(params.takerAmount);
const makerAtomic = takerAtomic * rate; // D-04: fixed configured rate + optional spread
const order = {
  maker: makerKp.publicKey(), taker: params.takerWallet,
  makerToken: params.makerToken, makerAmount: atomicToDecimal(makerAtomic),
  takerToken: params.takerToken, takerAmount: params.takerAmount,
  expiry: Math.floor(Date.now() / 1000) + ttlSec,
  orderId: orderCounter++, feeBps,
};
```
`RATE` becomes a config-read constant (D-04); `orderCounter` needs a process-survives-cold-start-
safe source (e.g. `Date.now()`-seeded, matching stub-maker.mjs line 118's own `Date.now() %
1_000_000` pattern — collision risk is already accepted at that granularity).

---

### `trustrfq-maker-server/src/order.ts` (utility, transform)

**Analog:** `src/core/rfq/order.ts` (verbatim copy target, per RESEARCH.md Pitfall 4)

**Full pattern** (lines 22-63): `toAtomic` (decimal string → atomic i128), `orderToScVal` (the
alphabetical-sorted-symbol-key ScMap encoding — "the load-bearing line", line 60 comment). Copy
this file's `toAtomic`/`orderToScVal` byte-for-byte; do not reimplement from memory. Note the
origin commit hash in a comment at copy time (RESEARCH.md's explicit mitigation for the
amount/decimals-drift pitfall). The sibling repo does not need `sacIdFor`/`tokenForSac` (those
depend on `src/core/tokens.ts`'s curated allow-list and `../canonical`, both this-repo-only) — the
maker server can take token SAC ids directly from its own config instead.

---

### `trustrfq-maker-server/src/wire.ts` (model, transform)

**Analog:** `src/core/rfq/wire.ts` (verbatim copy target)

**Full pattern** (lines 18-64): `RfqOrder`, `GetMakerSideOrderParams`, `MakerSideOrderResult`
interfaces and the `RFQ_ERROR` code map. Copy verbatim — this is the exact shape
`src/data/rfqNetwork.ts` (this repo, unchanged by this phase) decodes; any field rename or type
drift here fails silently downstream as a `malformed_field`/`tree_mismatch` rejection
(RESEARCH.md Pitfall 4), not a compile error.

---

### `trustrfq-maker-server/src/config.ts` (config, request-response)

**Analog:** `stub-maker.mjs` top-of-file env reads (lines 69-79) for WHAT to read; `src/config.ts`
(this repo) for the "one typed reader module, everything else imports from it" convention.

**Pattern to port** (stub-maker.mjs lines 69-79):
```javascript
const PORT = Number(process.env.STUB_MAKER_PORT || 4174);
const RFQ_SWAP_CONTRACT_ID = process.env.RFQ_SWAP_CONTRACT_ID || 'CCNP7626WIJVWVTBPLPG6QM77TY6JBU42D4PYONUFTDEPIIW6ZFJQIDT';
const RFQ_REGISTRY_ID = process.env.RFQ_REGISTRY_ID || 'CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G';
```
Departure required (Pattern 2 in RESEARCH.md): `MAKER_SECRET` must NOT default to
`Keypair.random()` the way stub-maker.mjs line 101 does — it must throw loudly if unset:
```typescript
const secret = process.env.MAKER_SECRET;
if (!secret) throw new Error('MAKER_SECRET env var not set');
export const makerKeypair = Keypair.fromSecret(secret);
```
Fallback contract ids (`RFQ_SWAP_CONTRACT_ID`/`RFQ_REGISTRY_ID`) can keep the `|| '<current
deployed id>'` default pattern — matches `public/otc-config.js`'s own "current deployed id lives
inline, update on Testnet reset" convention.

---

### `trustrfq-maker-server/scripts/bootstrap.mjs` (utility, batch)

**Analog:** `tools/rfq-registry-live.mjs` (`invokeRegistry`, lines 178-193) + `stub-maker.mjs`'s
`setup()` (lines 559-593)

**Registration pattern** (shared verbatim between both analogs):
```javascript
async function invokeRegistry(kp, fnName, args) {
  const account = await server.getAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, { fee: FEE, networkPassphrase: NETWORK })
    .addOperation(registry.call(fnName, ...args))
    .setTimeout(TIMEOUT)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) throw new Error(`${fnName} failed: ${sim.error}`);
  const ready = rpc.assembleTransaction(tx, sim).build();
  ready.sign(kp);
  const sent = await server.sendTransaction(ready);
  const final = await server.pollTransaction(sent.hash, { attempts: 20, sleepStrategy: () => 1000 });
  if (final.status !== 'SUCCESS') throw new Error(`${fnName} tx ${final.status}`);
  return sent.hash;
}
// bootstrap.mjs calls: invokeRegistry(makerKp, 'set_url', [...]) then
// invokeRegistry(makerKp, 'add_tokens', [...]) — run ONCE, out of band.
```

**Fund + trustline + inventory pattern** (stub-maker.mjs `setup()`, lines 559-574):
```javascript
await friendbot(makerKp.publicKey());
const acct = await horizon.loadAccount(makerKp.publicKey());
const hasTrustline = acct.balances.some((b) => b.asset_code === 'USDC' && b.asset_issuer === issuerKp.publicKey());
if (!hasTrustline) {
  await submitClassic(makerKp, [Operation.changeTrust({ asset: USDC, limit: TRUST_LIMIT })]);
}
await submitClassic(issuerKp, [Operation.payment({ destination: makerKp.publicKey(), asset: USDC, amount: MAKER_USDC_FUNDING })]);
```
Critical departure from both analogs (RESEARCH.md Pitfall 3, D-12): `bootstrap.mjs` must load an
EXISTING `MAKER_SECRET` if one is already configured and fail loudly rather than silently
generating a fresh `Keypair.random()` — re-running with a new key orphans the old registry entry
permanently (no way to `eject` without the old secret). Mirror `tools/e2e/prepare-keys.mjs`'s
`--fresh-maker`-style explicit-flag convention (referenced in RESEARCH.md Pitfall 3) for the one
legitimate first-time-setup case.

**Idempotent set_url pattern:** a second `set_url` call is a free in-place update (D-06, verified
live by `tools/rfq-registry-live.mjs` per RESEARCH.md Pattern 3) — safe to always call `set_url` +
`add_tokens` unconditionally on every bootstrap run rather than branching on "already registered."

---

### `trustrfq-maker-server` key-custody / gitignore convention

**Analog:** `tools/derive-keys.mjs` (whole file) — this repo's established pattern for
"secrets never land in a tracked file, only in a named OUT path."

**Pattern:**
```javascript
const OUT = process.env.OUT;
if (!OUT) throw new Error('set OUT');
// ... writeFileSync(OUT, JSON.stringify(found, null, 2) + '\n');
```
Mirrors `demo-keys.json` / `e2e-keys.json` (both gitignored in this repo). The sibling repo's own
`.gitignore` should carry the same entries (`*-keys.json`, `.vercel`, `node_modules`, `dist/` —
RESEARCH.md's Runtime State Inventory "Build artifacts" row) as this repo's existing `.gitignore`.

---

### `tools/e2e/rfq-driver.mjs` (modification: real-maker mode)

**Analog:** itself — `spawnStubMaker` (lines 191-230) return shape and its consumption sites.

**Pattern to extend, not replace** (lines 826, 860, 878 consume `maker.url` as an opaque string):
```javascript
const isMakerUrl = (url) => url === maker.url || url === `${maker.url}/`;
await page.route(maker.url, async (route) => { /* ... */ });
```
Per RESEARCH.md's "Extending the E2E driver" code example: skip `spawnStubMaker()` entirely for the
real-maker scenario and supply `{ url: 'https://<sibling-origin>/api/rpc', pubkey: '<known maker G...>' }`
directly — no change needed to the URL-consuming call sites, since they already operate purely on
the string. Add a CLI flag / env var (e.g. `REAL_MAKER_URL`) gating which path `main()` takes.

**Report-writing pattern** (line 131, 1071-1073):
```javascript
const REPORT = process.env.REPORT || path.join(SCRATCH, `report-rfq-${RUN_ID}.json`);
// ...
const body = tally.writeReport(REPORT, { ...meta(), status: 'ok', failedStep: null });
console.log(`REPORT ${REPORT}`);
```
This is the existing JSON-artifact emission D-11 reuses; extend `meta()`/the report body with the
two settlement tx hashes (XLM→USDC and USDC→XLM, D-09) and the four balance deltas per swap rather
than inventing a new report mechanism.

---

### `vercel.json` (modification: `connect-src`)

**Analog:** itself, line 18.

**Pattern:**
```json
"connect-src 'self' https://soroban-testnet.stellar.org https://horizon-testnet.stellar.org https://zaflldqvenbgfaxtzbjc.supabase.co wss://zaflldqvenbgfaxtzbjc.supabase.co"
```
D-06: append the maker's real https origin (e.g. `https://trustrfq-maker-server.vercel.app`) to
this space-separated list, by hand — no wildcard (`https:`) per the curated allow-list posture
(CLAUDE.md Gotchas: "the CSP is an allow-list: keep it in sync with the code"). Verify zero CSP
violations in-browser after the change (same verification step CLAUDE.md's "Verify before
deploying" checklist already requires for other CSP-affecting changes).

---

### `docs/<date>-live-rfq-run.md` (evidence record)

**No close analog exists as a dedicated file**; nearest precedent is the narrative structure of
`CLAUDE.md`'s own Status-section live-proof paragraphs (e.g. the 2026-08-18 `rfq_swap` entry: maker
address, tx hash, exact balance deltas, re-run command) and `tools/tradesize/report.mjs`'s pattern
of writing a dated, reproducible artifact to `runs/<stamp>-*.json`. Structure the new file as:
maker address, registry entry (URL + tokens), the quotes (both directions), all tx hashes, the four
balance deltas per swap, the desk deployment URL, the manual-run note, post-reset re-run
instructions (D-11) — modeled on the CLAUDE.md paragraphs' level of concrete detail, not on any
existing template file (none exists).

## Shared Patterns

### CORS (all HTTP-facing maker code)
**Source:** `tools/e2e/stub-maker.mjs` lines 385-390, 513-517
**Apply to:** `api/rpc.ts` only (the single HTTP entry point)
```javascript
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};
```

### JSON-RPC 2.0 error envelope (every maker response)
**Source:** `tools/e2e/stub-maker.mjs` lines 525-548, and the wire error codes in
`src/core/rfq/wire.ts` `RFQ_ERROR`
**Apply to:** `api/rpc.ts`'s every response path
```javascript
{ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -33600, message: '...' } }
```
Always HTTP 200; business errors travel in the JSON-RPC `error` field, never the HTTP status.

### RECORDING-mode simulate + authorizeEntry (the one cryptographic operation in this phase)
**Source:** `tools/e2e/stub-maker.mjs` lines 279-326, also proven in `tools/rfq-live-swap.mjs`
**Apply to:** `signing.ts` only
Never hand-build a `SorobanAuthorizationEntry`; always derive it from a RECORDING-mode
`simulateTransaction`'s `sim.result.auth`, then `authorizeEntry(entry, keypair, validUntilLedger,
networkPassphrase)`.

### Registry invocation (assemble → sign → send → poll)
**Source:** `tools/rfq-registry-live.mjs` lines 178-193, identical in `stub-maker.mjs` lines 178-193
**Apply to:** `scripts/bootstrap.mjs`
```javascript
const sim = await server.simulateTransaction(tx);
if (Api.isSimulationError(sim)) throw new Error(...);
const ready = rpc.assembleTransaction(tx, sim).build();
ready.sign(kp);
const sent = await server.sendTransaction(ready);
const final = await server.pollTransaction(sent.hash, { attempts: 20, sleepStrategy: () => 1000 });
if (final.status !== 'SUCCESS') throw new Error(...);
```

### Gitignored secret-file convention
**Source:** `tools/derive-keys.mjs`, this repo's `demo-keys.json`/`e2e-keys.json` gitignore entries
**Apply to:** the sibling repo's local-dev key file + `.gitignore`

### Curated allow-list discipline (tokens, CSP origins)
**Source:** `src/core/tokens.ts` (TOKENS array) and `vercel.json`'s `connect-src` list
**Apply to:** the maker server's own token-pair config (only quote configured pairs, reject with
`-33601` otherwise — RESEARCH.md Security Domain "Tampering" row) and this repo's `vercel.json`
change

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `docs/<date>-live-rfq-run.md` | test (evidence record) | batch | No prior file of exactly this shape exists in this repo; use CLAUDE.md's own live-proof paragraph structure as the closest available template (documented above under Pattern Assignments), not a dedicated `docs/*.md` analog. |
| Vercel `functions`/env-var config for the sibling repo (`vercel.json` in the NEW repo, `MAKER_SECRET` Sensitive env var setup) | config | file-I/O | This repo's own `vercel.json` has no `functions`/serverless-specific block to copy from (it is a static-site deploy only); follow RESEARCH.md's Vercel-docs-sourced pattern (Sensitive env var scoped to Production) instead of a codebase analog. |

## Metadata

**Analog search scope:** `tools/e2e/`, `tools/`, `src/core/rfq/`, `src/config.ts`, `vercel.json`,
`public/otc-config.js`
**Files scanned:** `tools/e2e/stub-maker.mjs` (620 lines, full read), `tools/e2e/rfq-driver.mjs`
(grepped + targeted line refs), `tools/rfq-registry-live.mjs` (grepped + targeted line refs),
`src/core/rfq/order.ts` (68 lines, full read), `src/core/rfq/wire.ts` (64 lines, full read),
`vercel.json` (27 lines, full read), `public/otc-config.js` (63 lines, full read),
`tools/derive-keys.mjs` (43 lines, full read)
**Pattern extraction date:** 2026-09-13
