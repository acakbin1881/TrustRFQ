---
phase: 03-live-full-rfq-loop
reviewed: 2026-09-14T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - /Users/acakbin1881/Projects/trustrfq-maker-server/README.md
  - /Users/acakbin1881/Projects/trustrfq-maker-server/api/rpc.ts
  - /Users/acakbin1881/Projects/trustrfq-maker-server/fixtures/rfq-order-vectors.json
  - /Users/acakbin1881/Projects/trustrfq-maker-server/scripts/bootstrap.mjs
  - /Users/acakbin1881/Projects/trustrfq-maker-server/scripts/live-proof.mjs
  - /Users/acakbin1881/Projects/trustrfq-maker-server/src/config.ts
  - /Users/acakbin1881/Projects/trustrfq-maker-server/src/order.test.ts
  - /Users/acakbin1881/Projects/trustrfq-maker-server/src/order.ts
  - /Users/acakbin1881/Projects/trustrfq-maker-server/src/signing.test.ts
  - /Users/acakbin1881/Projects/trustrfq-maker-server/src/signing.ts
  - /Users/acakbin1881/Projects/trustrfq-maker-server/src/wire.ts
  - /Users/acakbin1881/Projects/TrustRFQ/docs/evidence/live-rfq-run.json
  - /Users/acakbin1881/Projects/TrustRFQ/docs/evidence/live-rfq-run.md
  - /Users/acakbin1881/Projects/TrustRFQ/package.json
  - /Users/acakbin1881/Projects/TrustRFQ/public/otc-config.js
  - /Users/acakbin1881/Projects/TrustRFQ/tools/e2e/rfq-driver.mjs
  - /Users/acakbin1881/Projects/TrustRFQ/vercel.json
findings:
  critical: 1
  warning: 6
  info: 3
  total: 10
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-09-14
**Depth:** standard
**Files Reviewed:** 17 (11 in the sibling `trustrfq-maker-server` repo, 6 in `TrustRFQ`)
**Status:** issues_found

## Summary

This phase wires up the maker quote server (a separate `trustrfq-maker-server` repo), the live
E2E driver that discovers it purely through `rfq_registry`, and the committed evidence artifacts
proving a full RFQ loop settled on Testnet. The core signature boundary
(`order.ts`/`orderToScVal`, golden-vector pinned; `signing.ts`'s RECORDING-mode-sim →
`authorizeEntry` sequence) is sound and matches the design's stated invariants. Pricing math
(`priceQuote`) is correct against its own test table and the live-proof evidence's exact deltas.

The most serious finding is a hardcoded, developer-specific absolute filesystem path in
`tools/e2e/rfq-driver.mjs` that runs unconditionally on every invocation of the live driver — the
exact script this phase's evidence record depends on for reproducibility after a Testnet reset —
which will crash (`ENOENT`) for anyone other than the original author on the original machine,
directly undermining the milestone's own stated reproducibility goal. The rest of the findings are
lower-severity robustness, DRY, and documentation gaps: an unbounded-mint bug in the maker
bootstrap script, a missing bounds check on a maker-configured spread, fragile string-based error
classification, a floating-point balance computation that breaks the codebase's own
"never float for money" convention, and an independent, untested re-implementation of the
signature-boundary ScVal encoding in `live-proof.mjs`. Accepted-by-design gaps (no maker-side rate
limiting, wide-open CORS on `/api/rpc`, the maker secret in a platform env var) are called out in
the project context and are not re-flagged here except where something goes beyond what was
accepted.

## Critical Issues

### CR-01: Hardcoded developer-specific absolute path breaks the live driver for anyone but the original author

**File:** `/Users/acakbin1881/Projects/TrustRFQ/tools/e2e/rfq-driver.mjs:263`
**Issue:** `openTakerUsdcTrustline` reads the demo-keys file via a literal absolute path:

```js
async function openTakerUsdcTrustline(takerKp) {
  const keys = JSON.parse(readFileSync('/Users/acakbin1881/Projects/TrustRFQ/demo-keys.json', 'utf8'));
  ...
}
```

Every other function in this same file that needs the same file (`usdcSacId`, `usdcTokenValue`,
`fundTakerUsdc`, `snapshotBalances`) resolves it relative to the already-computed `REPO_ROOT`
(`path.join(REPO_ROOT, 'demo-keys.json')`). `openTakerUsdcTrustline` is called unconditionally at
the top of `main()` on every run (stub and LIVE alike) — it is not an edge case, it is on the
critical path of the exact script this phase's `docs/evidence/live-rfq-run.json` /
`live-rfq-run.md` depend on for reproducibility. `live-rfq-run.md` explicitly names
reproducibility-after-a-Testnet-reset as one of the four success criteria this record proves; a
script that only runs on one specific developer's home directory on one specific machine fails
that criterion for anyone else (a teammate, CI, or the same author after moving/cloning the repo
elsewhere).
**Fix:**
```js
async function openTakerUsdcTrustline(takerKp) {
  const keys = JSON.parse(readFileSync(path.join(REPO_ROOT, 'demo-keys.json'), 'utf8'));
  ...
}
```

## Warnings

### WR-01: Maker bootstrap's USDC "inventory mint" is not idempotent despite being logged as such

**File:** `/Users/acakbin1881/Projects/trustrfq-maker-server/scripts/bootstrap.mjs:168-180`
**Issue:** The log line reads `'opening USDC trustline + minting demo balance (idempotent)...'`, but
only the trustline-open step is actually gated on a check:

```js
if (!hasTrustline) {
  await submitClassic(makerKp, [Operation.changeTrust({ asset: USDC, limit: TRUST_LIMIT })]);
  ...
}
await submitClassic(issuerKp, [
  Operation.payment({ destination: makerKp.publicKey(), asset: USDC, amount: MAKER_USDC_FUNDING }),
]);
```
The payment mint runs unconditionally on every invocation. The README documents `npm run bootstrap`
as safe to "run any time" for recovery, and this same script is the one named in
`docs/evidence/live-rfq-run.md`'s post-reset recovery steps — re-running it (including a rerun
after a partial failure) silently mints another `MAKER_USDC_FUNDING` (default 1000) USDC into the
maker's account every time, contradicting the "idempotent" claim in its own log output.
**Fix:** Gate the mint on the maker's current USDC balance, mirroring the trustline check:
```js
const usdcLine = acct.balances.find((b) => b.asset_code === 'USDC' && b.asset_issuer === issuerKp.publicKey());
const currentUsdc = usdcLine ? parseFloat(usdcLine.balance) : 0;
if (currentUsdc < parseFloat(MAKER_USDC_FUNDING)) {
  await submitClassic(issuerKp, [Operation.payment({ destination: makerKp.publicKey(), asset: USDC, amount: MAKER_USDC_FUNDING })]);
  log(`  minted ${MAKER_USDC_FUNDING} USDC to the maker.`);
} else {
  log('  USDC balance already sufficient, skipping mint.');
}
```

### WR-02: `SPREAD_BPS` has no bounds check; a misconfigured value >10000 silently yields a negative `makerAmount`

**File:** `/Users/acakbin1881/Projects/trustrfq-maker-server/src/config.ts:38` and
`/Users/acakbin1881/Projects/trustrfq-maker-server/src/signing.ts:100`
**Issue:** `config.ts` reads `SPREAD_BPS` straight from the env with no range validation:
```ts
export const SPREAD_BPS = BigInt(process.env.SPREAD_BPS || '0');
```
`priceQuote` then does `makerAtomic = (makerAtomic * (10000n - SPREAD_BPS)) / 10000n;`. If an
operator sets `SPREAD_BPS` above `10000` (a typo, e.g. `50000` instead of `500`), `10000n -
SPREAD_BPS` goes negative, and every quote silently computes a negative `makerAmount` — which then
gets signed and returned to a taker as a nonsensical/negative order rather than the server refusing
to boot or refusing to quote. This is a configuration-time footgun, not taker-exploitable, but it
fails silently rather than loudly.
**Fix:** Validate at module load, matching the fail-fast style already used for `MAKER_SECRET`:
```ts
if (SPREAD_BPS < 0n || SPREAD_BPS > 10000n) {
  throw new Error(`SPREAD_BPS must be between 0 and 10000, got ${SPREAD_BPS}`);
}
```

### WR-03: Unclassified signing errors are returned to any caller verbatim, unsanitized

**File:** `/Users/acakbin1881/Projects/trustrfq-maker-server/api/rpc.ts:91-97`
**Issue:**
```ts
} catch (e) {
  if (e instanceof RfqSigningError) {
    writeRpcError(res, msg.id ?? null, e.code, e.message);
    return;
  }
  writeRpcError(res, msg.id ?? null, RFQ_ERROR.CANNOT_PROVIDE_ORDER, String((e as Error)?.message || e));
}
```
`classifySimError` (in `signing.ts`) only sanitizes/classifies errors thrown from the
`simulateTransaction` call inside `signQuote`. Any other unexpected exception (an SDK error from
`authorizeEntry`, a network failure, a bug elsewhere) is stringified and returned raw in the
JSON-RPC error body. Combined with the (accepted) wide-open CORS policy, any caller on the internet
can trigger arbitrary internal exceptions and read back their raw `.message` text, which may leak
implementation details (stack fragments, internal identifiers) beyond what the wire protocol's
error taxonomy intends to expose. Not exploitable against the signature boundary itself, but an
information-disclosure smell worth tightening.
**Fix:** Fall back to a generic, non-leaking message for unclassified errors, and log the real one
server-side instead:
```ts
} catch (e) {
  if (e instanceof RfqSigningError) {
    writeRpcError(res, msg.id ?? null, e.code, e.message);
    return;
  }
  console.error('unclassified signing error:', e);
  writeRpcError(res, msg.id ?? null, RFQ_ERROR.CANNOT_PROVIDE_ORDER, 'Unable to provide an order.');
}
```

### WR-04: `classifySimError` classifies host errors by fragile substring matching on message text

**File:** `/Users/acakbin1881/Projects/trustrfq-maker-server/src/signing.ts:167-172`
**Issue:**
```ts
function classifySimError(err: unknown): RfqSigningError {
  const msg = String(err);
  if (/trustline/i.test(msg)) return new RfqSigningError(RFQ_ERROR.TAKER_TRUSTLINE_MISSING, msg);
  if (/balance|insufficient/i.test(msg)) return new RfqSigningError(RFQ_ERROR.MAKER_INVENTORY_UNAVAILABLE, msg);
  return new RfqSigningError(RFQ_ERROR.CANNOT_PROVIDE_ORDER, msg);
}
```
This depends entirely on the exact English wording the Soroban host/SDK happens to emit for a
given simulation failure. A wording change in a future `@stellar/stellar-sdk` or RPC server version
(or simply a different underlying failure that happens to mention "balance" for an unrelated
reason) silently reclassifies the error into the wrong wire code, which the taker's client may key
UI/retry behavior off of (e.g. `TAKER_TRUSTLINE_MISSING` is exactly the code the D-08 trustline
pre-flight in the desk keys off of).
**Fix:** No structural fix is free here since Soroban simulation errors are not currently typed
distinctly, but at minimum add a regression test pinning today's exact error strings from a real
simulation failure (trustline-missing, insufficient-balance) so a future SDK upgrade that changes
the wording is caught by CI rather than discovered live.

### WR-05: `live-proof.mjs` computes exact atomic balances with floating-point arithmetic, against the codebase's own convention

**File:** `/Users/acakbin1881/Projects/trustrfq-maker-server/scripts/live-proof.mjs:105-115`
**Issue:**
```js
async function balances(pub) {
  const acct = await horizon.loadAccount(pub);
  const out = { XLM: 0n, USDC: 0n };
  for (const b of acct.balances) {
    if (b.asset_type === 'native') out.XLM = BigInt(Math.round(parseFloat(b.balance) * 1e7));
    else if (b.asset_code === 'USDC' && b.asset_issuer === USDC_ISSUER_PUB) {
      out.USDC = BigInt(Math.round(parseFloat(b.balance) * 1e7));
    }
  }
  return out;
}
```
Every other exact-atomic-unit computation in this milestone (`order.ts`'s `toAtomic`,
`rfq-driver.mjs`'s `snapshotBalances` in the sibling repo) deliberately avoids floating point for
exactly this reason — money-shaped values silently losing a stroop of precision through
`parseFloat`/`Math.round` is the class of bug the rest of the codebase goes out of its way to
avoid (see `order.ts`'s own header comment: "no floating point"). `live-proof.mjs`'s `check()`
assertions use exact `===` BigInt equality against these values, so a single stroop of
floating-point drift on an unlucky decimal value would produce a spurious `FAIL` in a script whose
entire purpose is to be trustworthy evidence.
**Fix:** Parse the fixed 7-decimal Horizon balance string directly, mirroring `rfq-driver.mjs`'s
own approach:
```js
function toAtomicFromHorizon(balanceStr) {
  return BigInt(balanceStr.replace('.', ''));
}
```

### WR-06: `live-proof.mjs` re-implements the signature-boundary ScVal encoding independently, with no shared test coverage

**File:** `/Users/acakbin1881/Projects/trustrfq-maker-server/scripts/live-proof.mjs:60-77`
**Issue:** `orderScVal` in this script duplicates the exact field set, sort-by-key behavior, and
type tags of `src/order.ts`'s `orderToScVal` — the module the project's own comments call "the
signature boundary" and pin with golden vectors (`order.test.ts` vs
`fixtures/rfq-order-vectors.json`). `live-proof.mjs`'s copy is a plain `.mjs` script and is not
covered by that golden-vector suite; its output is what actually gets submitted on-chain in the
`swap` invocation (`buildSwapOp`), not merely used for local bookkeeping. If a future edit to
`order.ts` (a field rename, a type change) is not mirrored here, the live-proof script would not
fail fast in CI — it would fail at runtime against Testnet with an opaque auth-entry-argument
mismatch, the exact failure mode the golden-vector test elsewhere in this repo exists to catch
before it reaches the network.
**Fix:** Either import `orderToScVal` from the compiled `src/order.js` (the script already imports
`@stellar/stellar-sdk` as an ESM dependency, so importing a sibling compiled module is consistent),
or add a one-time assertion at the top of `live-proof.mjs` that its local `orderScVal` output
matches `orderScValBase64` from `order.ts` for at least one of the committed fixture vectors.

## Info

### IN-01: `signing.ts` re-exports `MAKER_PUBLIC_URL` with a stale, inaccurate comment

**File:** `/Users/acakbin1881/Projects/trustrfq-maker-server/src/signing.ts:231-233`
**Issue:**
```ts
// Re-exported for scripts/bootstrap.mjs and scripts/live-proof.mjs, which
// print the registered public URL alongside their own output.
export { MAKER_PUBLIC_URL };
```
Neither `scripts/bootstrap.mjs` nor `scripts/live-proof.mjs` imports this. Both are plain `.mjs`
scripts (not built from `src/`) and read `process.env.MAKER_PUBLIC_URL` directly themselves
(`bootstrap.mjs:39`, `live-proof.mjs:32`). This re-export is unused dead code with a comment that
misdescribes the codebase as it currently stands.
**Fix:** Remove the re-export and its comment, or if a future consumer is intended, wire it up and
correct the comment to name that actual consumer.

### IN-02: Duplicate type definitions for the same wire shape

**File:** `/Users/acakbin1881/Projects/trustrfq-maker-server/src/wire.ts:52-59` and
`/Users/acakbin1881/Projects/trustrfq-maker-server/src/signing.ts:109-116`
**Issue:** `wire.ts`'s `MakerSideOrderResult` and `signing.ts`'s `SignedQuote` describe the
identical shape (`order`, `authEntry`, `signatureExpirationLedger`, `network`, `swapContract`)
under two different names in two different files.
**Fix:** Have `signing.ts` reuse `MakerSideOrderResult` from `wire.ts` (or have `wire.ts` alias to
it) rather than maintaining two independently-editable copies of the same contract.

### IN-03: Duplicate `node:fs` import statements

**File:** `/Users/acakbin1881/Projects/TrustRFQ/tools/e2e/rfq-driver.mjs:162,170`
**Issue:** Two separate import statements pull from the same module:
```js
import { mkdirSync, writeFileSync } from 'node:fs';
...
import { readFileSync } from 'node:fs';
```
**Fix:** Merge into one: `import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';`

---

_Reviewed: 2026-09-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
