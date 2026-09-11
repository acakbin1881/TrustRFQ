---
phase: 02-desk-rfq-taker-path
reviewed: 2026-09-11T11:48:58Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - README.md
  - fixtures/rfq-auth-tree.json
  - fixtures/rfq-order-vectors.json
  - package.json
  - public/intent.css
  - src/App.tsx
  - src/core/fill.ts
  - src/core/rfq/discover.test.ts
  - src/core/rfq/discover.ts
  - src/core/rfq/order.test.ts
  - src/core/rfq/order.ts
  - src/core/rfq/retry.test.ts
  - src/core/rfq/retry.ts
  - src/core/rfq/settle.ts
  - src/core/rfq/validate.test.ts
  - src/core/rfq/validate.ts
  - src/core/rfq/wire.ts
  - src/data/rfqNetwork.test.ts
  - src/data/rfqNetwork.ts
  - src/ui/RfqPanel.tsx
  - tools/e2e/rfq-driver.mjs
  - tools/e2e/run-all.mjs
  - tools/e2e/stub-maker.mjs
findings:
  critical: 2
  warning: 3
  info: 2
  total: 7
status: issues_found
---

# Phase 02: Code Review Report — Desk RFQ Taker Path

**Reviewed:** 2026-09-11T11:48:58Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

The RFQ taker path is well-isolated (pure `src/core/rfq/*`, single network call site in
`src/data/rfqNetwork.ts`, no `useSettlement` reintroduced in `App.tsx`, `RfqWalletSigner` correctly
narrowed to one method), and the golden-vector/fixture-pinned tests for order encoding and quote
validation are genuinely adversarial (tamper-single-byte cases, a real captured auth tree, mutation
of every field the tree check protects). That discipline makes the two BLOCKER findings below more
consequential, not less: `validateQuote`'s own header comment promises "an unrecognised shape... is
a rejection, never a default-accept," but the implementation does not actually hold that promise for
every field, and the CSP the RFQ fetches must run under is not actually satisfied by those fetches.
Both are provable, not speculative. Three further WARNINGs cover state-staleness and dead-guard
issues in `RfqPanel.tsx`; two INFO items are documentation/portability notes.

## Critical Issues

### CR-01: A single malformed/malicious maker response poisons the ENTIRE fan-out pass, not just that one quote

**File:** `src/core/rfq/validate.ts:168-169`, propagating from `src/data/rfqNetwork.ts:138-143`

**Issue:** `validate.ts`'s own header comment states the module "FAILS CLOSED... an unrecognised
shape, an undecodable entry, or any field this module cannot positively verify... is a rejection,
never a default-accept" — implying rejection is scoped to the one offending quote. That guarantee is
not actually implemented for the "economics" check:

```ts
// src/core/rfq/validate.ts:168-169
const requestTakerAtomic = toAtomic(ctx.request.takerAmount);
const orderTakerAtomic = toAtomic(order.takerAmount);   // order.takerAmount is MAKER-CONTROLLED
```

`order` comes straight from the maker's raw JSON-RPC response (`src/data/rfqNetwork.ts:69-95`), and
the only validation `getMakerSideOrder` performs is `result?.order && result?.authEntry` being
truthy — no shape/type check on `takerAmount`/`makerAmount`/`expiry`/`orderId`. `toAtomic`
(`src/core/rfq/order.ts:22-25`) calls `BigInt(whole || '0')` on the string's integer part with no
try/catch anywhere in this call path; a maker that returns a non-numeric `takerAmount` (missing
field → `String(undefined)` = `"undefined"`, scientific notation, a stray comma, anything
`BigInt()` rejects) makes `toAtomic` throw a raw `SyntaxError`.

That throw is never caught locally. `validateQuote` has no top-level try/catch (only the
auth-entry-decode section at the bottom does), so the exception propagates out of `validateQuote`
straight into `fanOutMakerSideOrder`'s synchronous loop:

```ts
// src/data/rfqNetwork.ts:138-143
for (const s of settled) {
  if (s.status !== 'fulfilled' || s.value.result === null) continue;
  const verdict = validateQuote(s.value.result, ctx);   // <-- unguarded call
  ...
}
```

which is itself unguarded, so the whole `fanOutMakerSideOrder` promise rejects. The effect: if 9 of
10 registered makers answer with genuinely valid, correctly signed quotes and 1 sends a garbage
amount field (malicious or just buggy), the taker gets ZERO quotes and a generic "Couldn't refresh
quotes" toast (`src/ui/RfqPanel.tsx:216-222`) — every well-behaved maker's quote is silently
discarded along with the bad one. Since `rfq_registry` registration is permissionless (stake-gated,
not identity-gated), any staked maker — or anyone who can get a maker's URL fetched — can
deny quotes to every taker for a pair this way, on every refresh, until manually identified and
ejected. This is the opposite of "fail closed per-quote"; it is "fail closed for everyone."

**Fix:** Wrap `validateQuote`'s body (or at minimum every `toAtomic`/numeric-field read that touches
maker-controlled input) in a try/catch that returns a `reject('undecodable_entry' | new reason,
...)` for that one quote, and/or wrap the `validateQuote` call site in `fanOutMakerSideOrder` in a
try/catch that converts a thrown error into a per-quote `FanOutRejection` instead of failing the
whole pass:

```ts
for (const s of settled) {
  if (s.status !== 'fulfilled' || s.value.result === null) continue;
  try {
    const verdict = validateQuote(s.value.result, ctx);
    if (verdict.accepted) accepted.push(verdict.quote);
    else rejections.push({ url: s.value.url, rejection: verdict.rejection });
  } catch (e) {
    rejections.push({ url: s.value.url, rejection: { reason: 'undecodable_entry', detail: String(e) } });
  }
}
```

### CR-02: The RFQ maker fetches are not covered by the deployed CSP `connect-src` allow-list

**File:** `src/data/rfqNetwork.ts:75` (fetch call), `vercel.json:18` (CSP header)

**Issue:** `getMakerSideOrder` does `fetch(url, ...)` where `url` is an arbitrary maker-registered
HTTPS endpoint discovered on-chain via `rfq_registry` — by design, any maker can register any
origin. `vercel.json`'s `Content-Security-Policy` header (the one actually served in production)
sets:

```
connect-src 'self' https://soroban-testnet.stellar.org https://horizon-testnet.stellar.org
  https://zaflldqvenbgfaxtzbjc.supabase.co wss://zaflldqvenbgfaxtzbjc.supabase.co;
```

No maker origin can ever be in that static list (it is not knowable at build time), so every
`fetch()` to a real maker server will be blocked by the browser's CSP on the deployed site — the
entire RFQ discovery/quoting path is inert in production; it only appears to work locally because
`vite dev`/`vite preview` never serve `vercel.json`'s headers, which is exactly the environment the
E2E harness (`tools/e2e/rfq-driver.mjs`, `stub-maker.mjs`) runs against. This is honestly tracked in
`README.md:500-501` ("The deployed site cannot reach maker servers... maker origins are not in the
CSP yet") and the roadmap (`README.md:519-521` lists "maker origins in the CSP" as remaining phase-2
work) — so the gap is known, not hidden. It is called out here at BLOCKER severity per this review's
instructions (a known gap is still a gap that blocks the feature from working once deployed) rather
than because the implementation team was unaware.

**Fix:** Before this lane is exposed to real maker servers, either (a) relax `connect-src` to `*`
scoped narrowly (accepting that a discovery protocol's origin set is inherently open, and
documenting why `connect-src *` differs from a blanket CSP weakening), or (b) proxy maker fetches
through a same-origin serverless function that then makes the outbound call server-side (keeping
`connect-src 'self'` intact for the browser). Given CLAUDE.md's own framing of the CSP as a
deliberately maintained allow-list, this is a decision to make explicitly, not to discover in
production.

## Warnings

### WR-01: RfqPanel never refreshes balances after opening a trustline or settling — stale trustline note and stale balance strip

**File:** `src/ui/RfqPanel.tsx:170-171, 182 (refreshQuotes)`, `src/App.tsx:200`

**Issue:** `RfqPanel` receives `balances` but no `refreshBalances` callback:

```tsx
// src/App.tsx:200
{address ? <RfqPanel address={address} balances={balances} /> : null}
```

compare to the OTC lane, where `Ticket`/`OfferList` are handed `refreshBalances` and call it after
any balance-affecting action. `RfqPanel` calls `ensureTrustline` twice on the taker's behalf (once
in `refreshQuotes` when `needsTrustline` is true, once inside `settleQuote` as a fail-safe) and
settles a real on-chain transfer of `order.makerToken` into the taker's wallet — both events change
the taker's real balances — but nothing in `RfqPanel` ever calls `useBalances`'s `refresh()`.
`useBalances` (`src/data/useBalances.ts`) only fetches on mount/address-change or on an explicit
`refresh()` call; there is no polling. Result: the passive "You'll need a trustline for..." note
(`src/ui/RfqPanel.tsx:319-321`) can keep showing after the trustline genuinely exists (misleading,
though harmless since `ensureTrustline` itself re-checks live state), and the topbar `BalanceStrip`
never reflects a completed RFQ settlement's real balance change until some unrelated action (e.g.
switching to the OTC tab and sending an order) happens to trigger a refresh.

**Fix:** Thread `refreshBalances` down to `RfqPanel` (as already done for the OTC lane) and call it
after a successful `ensureTrustline` in `refreshQuotes` and after a successful `settleQuote` in
`accept()`.

### WR-02: `refreshQuotes`'s `busy.current` guard never blocks `refreshQuotes` itself — it only reads a flag `accept()` writes

**File:** `src/ui/RfqPanel.tsx:111, 143`

**Issue:**

```tsx
const busy = useRef(false);           // line 111
...
const refreshQuotes = useCallback(async () => {
  if (!canQuote || busy.current) return;   // line 143 — reads busy.current
  ...
```

`busy.current` is only ever set to `true`/`false` inside `accept()` (lines 229, 284). `refreshQuotes`
reads it but never sets it, so nothing actually prevents `refreshQuotes` from being invoked
re-entrantly against itself — the check only ever blocks a refresh while a settlement is in flight.
In practice the UI's `disabled={!canQuote || fieldsDisabled}` on the Refresh button (line 325)
happens to prevent a user double-click from reaching this path today, but the guard as written reads
as (and is commented nowhere to clarify it is not) a general "don't run while busy" lock; a future
caller of `refreshQuotes` that bypasses the disabled button (a second render path, a test harness
calling the hook directly, a keyboard-triggered double-submit) would not actually be blocked.

**Fix:** Either set `busy.current = true`/`false` around `refreshQuotes`'s own body too (mirroring
`accept()`), or rename/re-scope the ref (e.g. `settling.current`) and drop the check from
`refreshQuotes` so the code doesn't imply protection it doesn't provide.

### WR-03: `accept()` unconditionally re-quotes on every settlement failure, including unrelated ones (e.g. a user-cancelled wallet prompt)

**File:** `src/ui/RfqPanel.tsx:252-257`

**Issue:**

```tsx
} catch (settleFailure) {
  const fresh = await fetchOneFreshQuote(attemptQuote.order, address);   // always called
  const decision = retryDecision({
    failure: settleFailure, seenPrice, freshQuote: fresh, attemptsAlready: attempts,
  });
```

`fetchOneFreshQuote` (a network round-trip to the maker's `get_maker` registry entry plus a
validated re-quote) fires for every `settleQuote` failure before `retryDecision` even gets to
classify it — including a plain user-cancelled `signTransaction` prompt, a network blip, or any
failure `isExpiredAuthFailure` will immediately reject. `retryDecision`'s own guard order comment
(`src/core/rfq/retry.ts:73-76`) says "a non-expiration failure... stops before price ever enters the
decision" — true for the *decision*, but the *re-quote fetch* itself already happened regardless,
adding latency before the error surfaces and issuing an unnecessary request to the maker for a
failure that was never going to retry.

**Fix:** Check `isExpiredAuthFailure(settleFailure)` before calling `fetchOneFreshQuote`, and only
fetch when it is true:

```tsx
} catch (settleFailure) {
  const fresh = isExpiredAuthFailure(settleFailure)
    ? await fetchOneFreshQuote(attemptQuote.order, address)
    : null;
  const decision = retryDecision({ failure: settleFailure, seenPrice, freshQuote: fresh, attemptsAlready: attempts });
```

## Info

### IN-01: README roadmap lists "trustline pre-flight" and "expired-entry retry" as remaining work that the reviewed code already implements

**File:** `README.md:519-521`

**Issue:** The Phase 2 roadmap entry reads "Remaining: trustline pre-flight, expired-entry retry,
maker origins in the CSP, RFQ driver folded into `npm run e2e:census`" — but `src/core/rfq/retry.ts`
(`needsTrustline`, `retryDecision`, `isExpiredAuthFailure`), its full test coverage
(`retry.test.ts`), `RfqPanel.tsx`'s wiring of both, and `tools/e2e/rfq-driver.mjs`'s `TRUSTLINE`,
`RETRY_EQUAL`, and `RETRY_WORSE` scenarios all exist and are exercised in this same file set. Only
"maker origins in the CSP" (CR-02 above) and the `npm run e2e:census` folding genuinely remain
unaddressed.

**Fix:** Update the roadmap line to reflect what actually shipped in this phase, so the next reader
doesn't have to re-derive it from the diff.

### IN-02: Hardcoded absolute developer-machine path in the E2E harness

**File:** `tools/e2e/rfq-driver.mjs:172`, `tools/e2e/stub-maker.mjs:111`

**Issue:** Both files read the demo issuer's secret key via a hardcoded absolute path:

```js
const keys = JSON.parse(readFileSync('/Users/acakbin1881/Projects/TrustRFQ/demo-keys.json', 'utf8'));
```

This only works on this specific machine/checkout location; any other clone (CI, another
contributor, a worktree at a different path) will fail with `ENOENT` the instant this scenario runs.
Test-harness code carries a looser bar per this review's scope, so this is INFO rather than a
WARNING, but it is a straightforward portability bug worth a one-line fix.

**Fix:** Derive the path from `REPO_ROOT` (already imported from `./lib.mjs` in both files) instead
of a literal absolute string, e.g. `path.join(REPO_ROOT, 'demo-keys.json')`.

---

_Reviewed: 2026-09-11T11:48:58Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
