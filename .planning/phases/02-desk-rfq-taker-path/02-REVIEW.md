---
phase: 02-desk-rfq-taker-path
reviewed: 2026-09-12T15:10:00Z
depth: standard
delta_review: true
delta_base_reviewed: 2026-09-11T11:48:58Z
delta_base_files_reviewed: 23
files_reviewed: 4
files_reviewed_list:
  - src/core/rfq/validate.ts
  - src/core/rfq/validate.test.ts
  - src/data/rfqNetwork.ts
  - src/data/rfqNetwork.test.ts
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 02: Code Review Report — Desk RFQ Taker Path

**Reviewed:** 2026-09-12T15:10:00Z (delta pass; full baseline reviewed 2026-09-11T11:48:58Z)
**Depth:** standard
**Files Reviewed (this delta):** 4 — `src/core/rfq/validate.ts`, `src/core/rfq/validate.test.ts`,
`src/data/rfqNetwork.ts`, `src/data/rfqNetwork.test.ts` (the full set of 23 files carried over from
the 2026-09-11 baseline is unchanged otherwise; see `delta_base_*` frontmatter)
**Status:** issues_found

## Summary

This is a DELTA review layered on top of the 2026-09-11 full review (7 findings, 23 files). Exactly
one gap-closure plan (02-06) landed since then, touching only the four files listed above, to close
CR-01 ("a single malformed maker response poisons the entire fan-out pass"). I re-traced the fix by
hand rather than trusting the plan's own SUMMARY: `validateQuote` now guards the two previously
unguarded `toAtomic` calls (`ctx.request.takerAmount`, `order.takerAmount`) in the economics section
with a `tryToAtomic` helper that converts a throw into a `malformed_field` rejection, and
`fanOutMakerSideOrder` now wraps the `validateQuote` call site in a per-quote `try`/`catch` backstop
that never touches the shared per-pass `get_config`/ledger reads. I confirmed by code inspection
(not just by re-reading the tests) that: (1) no `catch` path in either file can produce an accept or
a default numeric value — every catch either returns `null` (converted to an explicit rejection one
line later) or pushes a `FanOutRejection`; (2) the per-pass `readSwapConfig()`/`getLatestLedger()`
reads are still inside the outer `Promise.all` and a failure there still rejects the whole
`fanOutMakerSideOrder` promise, unaffected by the new inner `try`/`catch`; (3) genuine
`undecodable_entry` (base64/XDR decode failure) and `tree_mismatch` (credential/invocation-tree
shape/value failures) rejection reasons are unchanged and still returned from their original code
paths — the new `malformed_field` checks for `order.makerAmount`/`order.takerAmount` inside the
tree section are placed *before* the tree-args comparison so a genuinely uninterpretable amount is
no longer misclassified as `tree_mismatch`, and the auth-entry-decode/credential-check paths were not
touched by this plan at all. **CR-01 is resolved** and moved to Resolved Issues below. **CR-02**
(CSP `connect-src` does not cover maker origins) is untouched by these four files; per the
discuss-phase record it is a deferred item locked to Phase 3 by decision D-11, so it is kept listed
but not double-counted as an open, actionable phase-02 gap in this delta's totals. WR-01/WR-02/WR-03
and IN-01/IN-02 from the baseline review are unaffected (no UI or E2E file changed) and are carried
forward unchanged. This delta pass surfaces two new WARNINGs (an untested new guard branch, and an
overloaded backstop rejection reason) and two new INFO items (incomplete coverage of the
`malformed_field` reason for `order.expiry`/`order.orderId`, and silent type-coercion leniency for
non-string JSON amounts) from the four changed files.

## Resolved Issues

### CR-01 (RESOLVED by 02-06): A single malformed/malicious maker response poisoned the ENTIRE fan-out pass

**Originally:** `src/core/rfq/validate.ts:168-169`, propagating from `src/data/rfqNetwork.ts:138-143`
(see the 2026-09-11 review text for the full original writeup — preserved here for record; not
reproduced verbatim since it now describes code that no longer exists).

**Resolution verified in this delta review:**
- `src/core/rfq/validate.ts:98-104` adds a module-private `tryToAtomic()` that calls the
  pre-existing `toAtomic` inside a `try`/`catch`, returning `null` (never a fallback numeric value)
  on any throw.
- Both previously-unguarded economics-section call sites now route through it:
  `src/core/rfq/validate.ts:187-193` (`ctx.request.takerAmount`) and `:194-200`
  (`order.takerAmount`), each returning an explicit `reject('malformed_field', ...)` with a detail
  string that names the field and its provenance (desk request vs. maker response) — checked by
  hand against the source, not just the tests.
- The two maker-controlled amount reads inside the auth-tree section (`order.makerAmount` at
  `:285-291`, `order.takerAmount` at `:292-298`) are guarded the same way, placed before the
  `rootArgsMatch` tree comparison so a genuinely uninterpretable amount reports `malformed_field`
  rather than being swallowed into `tree_mismatch`.
- `src/data/rfqNetwork.ts:140-150` wraps only the `validateQuote` call and its two verdict branches
  in a `try`/`catch`, converting any exception the pure layer does not itself classify into a
  per-quote `FanOutRejection`. Traced by hand: this `try`/`catch` sits entirely inside the `for`
  loop that runs after the shared `Promise.all([readSwapConfig(), getLatestLedger(), ...])` at
  `:121-125`, so a config/ledger read failure still rejects the whole pass (verified against
  `src/data/rfqNetwork.test.ts`'s `rejects the whole pass when the per-pass get_config read fails`
  test, and confirmed the code shape independently supports that claim rather than trusting the test
  name alone).
- Test coverage: `validate.test.ts`'s new `malformed_field (02-06 gap closure)` block (4 cases: non-
  numeric, non-numeric, absent, wrong-type-object) plus a companion `economics_mismatch` block
  proving interpretable-but-wrong values (empty string, negative, hex) are deliberately NOT folded
  into `malformed_field`; `rfqNetwork.test.ts`'s mixed-pass isolation test and a structural
  mutation-style test (`vi.spyOn` forcing an unclassified throw) that specifically proves the
  network-layer catch is load-bearing rather than dead code once the pure layer became total for
  known fields.

**Verdict:** The fan-out-poisoning DoS this finding described is closed. Fail-closed is preserved in
both directions (no accept-on-malformed, and the per-pass shared reads still fail the whole pass).

## Critical Issues

None open. (CR-01 resolved above; CR-02 deferred below — not counted as an open phase-02 blocker.)

### CR-02 (DEFERRED to Phase 3, decision D-11): The RFQ maker fetches are not covered by the deployed CSP `connect-src` allow-list

**File:** `src/data/rfqNetwork.ts:75` (fetch call, unchanged by this delta), `vercel.json:18` (CSP
header)

**Status note:** This finding is unchanged by the 02-06 gap-closure plan — none of the four files in
this delta touch the fetch call site's CSP exposure. Per the discuss-phase record for this phase,
resolving the CSP gap (proxying maker fetches through a same-origin function, or relaxing
`connect-src`) is a locked deferral to Phase 3 (decision D-11), not phase-02 scope. It remains listed
here for traceability (the underlying defect is real and was independently confirmed on
2026-09-11 — see the original writeup preserved in the 2026-09-11 review text) but is excluded from
this delta's `critical` count in the frontmatter because there is nothing actionable to fix inside
phase 02 given the D-11 decision. Do not let this exclusion be read as "not a bug" — it is a real,
confirmed defect whose fix is scheduled, not skipped.

**Original fix guidance (unchanged, still applies when Phase 3 picks this up):** proxy maker fetches
through a same-origin serverless function, or relax `connect-src` deliberately and document why.

## Warnings

### WR-01: RfqPanel never refreshes balances after opening a trustline or settling — stale trustline note and stale balance strip

**File:** `src/ui/RfqPanel.tsx:170-171, 182 (refreshQuotes)`, `src/App.tsx:200`

Unaffected by this delta — `RfqPanel.tsx` and `App.tsx` did not change in 02-06. Carried forward
verbatim from the 2026-09-11 review; see that review's full text for detail and fix.

### WR-02: `refreshQuotes`'s `busy.current` guard never blocks `refreshQuotes` itself — it only reads a flag `accept()` writes

**File:** `src/ui/RfqPanel.tsx:111, 143`

Unaffected by this delta. Carried forward verbatim.

### WR-03: `accept()` unconditionally re-quotes on every settlement failure, including unrelated ones (e.g. a user-cancelled wallet prompt)

**File:** `src/ui/RfqPanel.tsx:252-257`

Unaffected by this delta. Carried forward verbatim.

### WR-04 (NEW, 02-06 delta): The `fanOutMakerSideOrder` backstop catch labels every uncaught exception as `malformed_field`, even ones with nothing to do with a malformed value

**File:** `src/data/rfqNetwork.ts:140-150`

**Issue:** The new per-quote backstop is:

```ts
try {
  const verdict = validateQuote(s.value.result, ctx);
  if (verdict.accepted) accepted.push(verdict.quote);
  else rejections.push({ url: s.value.url, rejection: verdict.rejection });
} catch (e) {
  rejections.push({ url: s.value.url, rejection: { reason: 'malformed_field', detail: String(e) } });
}
```

Any exception thrown out of `validateQuote` for *any* reason — a genuine future bug in
`credentialAddress`, `buildInvocationTree`, an SDK internal error, a null-pointer slip introduced by
a later refactor — is reported to the dev console / E2E report as `reason: 'malformed_field'`, the
same label used for "this specific numeric field could not be interpreted." The `REJECT_REASON`
type's own doc comment defines `malformed_field` narrowly ("a maker- or desk-controlled decimal-
string amount could not be interpreted at all"), but this catch applies it to a strictly broader
class of failures. This is a real, if minor, observability regression: a developer triaging a spike
in `malformed_field` rejections in production would reasonably assume makers are sending bad amounts,
when the actual cause could be an unrelated internal bug in `validateQuote` itself — precisely the
"reason a bug elsewhere in validateQuote, not a maker-controlled field" scenario the plan's own
structural test (`rfqNetwork.test.ts`'s "the call-site catch isolates a throw... (structural
backstop)") deliberately manufactures to prove the catch is reachable, yet that same test asserts
`reason: 'malformed_field'` for it — cementing the mislabeling as expected behavior rather than
flagging it.

**Fix:** Give the backstop its own reason distinct from the field-level classification, e.g. add
`'internal_error'` to `REJECT_REASON` and use it in the catch:

```ts
} catch (e) {
  rejections.push({ url: s.value.url, rejection: { reason: 'internal_error', detail: String(e) } });
}
```

so a spike in `malformed_field` still reliably points at maker-controlled input, and a spike in
`internal_error` points at the desk's own code.

### WR-05 (NEW, 02-06 delta): The new `ctx.request.takerAmount` guard has zero test coverage

**File:** `src/core/rfq/validate.ts:187-193`; `src/core/rfq/validate.test.ts`

**Issue:** The economics section guards two call sites with `tryToAtomic`: `ctx.request.takerAmount`
(the desk's own request) and `order.takerAmount` (the maker's response). Every `malformed_field` test
in `validate.test.ts`'s new `describe('validateQuote — malformed_field (02-06 gap closure)')` block
tampers `order.takerAmount` / `order.makerAmount` only — none tampers `ctx.request.takerAmount`. The
guard at `validate.ts:187-193` (with its distinct detail text "this is the desk's own request, not
the maker's response") is therefore exercised by nothing: a typo in that branch (e.g. reusing the
maker-response detail string, or accidentally calling `reject('economics_mismatch', ...)` instead of
`'malformed_field'`) would not be caught by CI. The plan's own SUMMARY states this call site was
guarded "for consistency and future-proofing," but the coverage table (`coverage: D1-D6`) only lists
tests that hit the `order.*` fields, so this specific line's correctness rests on manual code reading
alone, which is exactly the failure mode this whole gap-closure plan exists to close for the other
three call sites.

**Fix:** Add a `malformed_field` test case that sets `ctx.request.takerAmount` (via `baseRequest({
takerAmount: <malformed value> })`) to a non-numeric value and asserts the rejection detail mentions
"desk's own request", mirroring the existing `order.takerAmount` case but for the request side.

## Info

### IN-01: README roadmap lists "trustline pre-flight" and "expired-entry retry" as remaining work that the reviewed code already implements

**File:** `README.md:519-521`

Unaffected by this delta. Carried forward verbatim.

### IN-02: Hardcoded absolute developer-machine path in the E2E harness

**File:** `tools/e2e/rfq-driver.mjs:172`, `tools/e2e/stub-maker.mjs:111`

Unaffected by this delta. Carried forward verbatim.

### IN-03 (NEW, 02-06 delta): `order.expiry` and `order.orderId` are not guarded by `tryToAtomic`, so a malformed value in either is misclassified as `tree_mismatch` rather than `malformed_field`

**File:** `src/core/rfq/validate.ts:279-313`

**Issue:** 02-06's stated scope was "all four maker/request numeric reads" (the two amounts, at two
call sites each). `order.expiry` and `order.orderId` are also maker-controlled numeric fields, read
via `asBigInt(treeExpiry) === BigInt(order.expiry)` and `asBigInt(treeOrderId) ===
BigInt(order.orderId)` inside the `rootArgsMatch` computation (`:300-313`). Fail-closed is preserved
— a non-numeric `order.expiry` or `order.orderId` throws inside the inner `try`/`catch`
(`:301-313`), which is itself nested inside the outer tree-section `try`/`catch` (`:258-338`), so the
exception is caught and reported as `tree_mismatch`, never crashes the pass and never accepts. But
this is a less precise reason than `malformed_field` would give: "the signed tree disagreed with the
quote" is not actually what happened; the field simply could not be parsed at all. This is the same
distinction the plan itself was careful to draw for the amount fields (a dedicated code comment at
`:281-284` explicitly says an uninterpretable amount "must not [be] folded into 'the signed tree
disagreed'") but the same care was not extended to `expiry`/`orderId`. Not a security or DoS issue
(no crash, no accept), a classification-completeness gap.

**Fix:** If the classification precision this plan established for amounts is meant to be a general
invariant, extend the same `tryToAtomic`-style guard (or an equivalent `try { BigInt(...) } catch`
helper) to `order.expiry` and `order.orderId` before the `rootArgsMatch` comparison, or explicitly
document why these two fields are exempt.

### IN-04 (NEW, 02-06 delta): `toAtomic`/`tryToAtomic` silently coerces non-string JSON types via `String(...)`, so a maker sending a JSON number instead of a decimal string is not rejected as a "wrong type"

**File:** `src/core/rfq/order.ts:22-25` (`toAtomic`), `src/core/rfq/validate.ts:98-104`
(`tryToAtomic`)

**Issue:** `RfqOrder.takerAmount`/`makerAmount` are typed as `string` (`wire.ts:22-24`, "Amounts are
DECIMAL STRINGS, never numbers"). `toAtomic` does `String(s).split('.')`, so a maker JSON response
carrying `takerAmount: 5` (a JSON number, not the spec'd string) stringifies to `"5"` and parses
successfully to `50000000n` — no rejection at all, `malformed_field` or otherwise. The 02-06 test
suite's "wrong-JSON-type" case only tries an object (`takerAmount: {}`), which does throw (`String({})`
= `"[object Object]"`, not `BigInt`-parseable) and is correctly rejected — but a JSON number, which is
just as much a spec violation, sails through unflagged. This does not create a value-mismatch or
accept-with-wrong-value bug (the numeric value is parsed correctly), so it is not a security issue,
but it is inconsistent with the module's stated design goal of positively verifying every field
rather than being lenient about maker input shape.

**Fix:** If the wire contract really requires a string, add an explicit `typeof value !== 'string'`
check in `tryToAtomic` (or at the wire-decode boundary) so a maker cannot silently deviate from the
documented type contract. Otherwise, update the header comment/tests to acknowledge that numeric
JSON values are deliberately tolerated.

---

_Reviewed: 2026-09-12T15:10:00Z (delta pass on top of the 2026-09-11T11:48:58Z full review)_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
