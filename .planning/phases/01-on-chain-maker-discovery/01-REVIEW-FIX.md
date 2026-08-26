---
phase: 01-on-chain-maker-discovery
fixed_at: 2026-08-26T16:41:00Z
review_path: .planning/phases/01-on-chain-maker-discovery/01-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-08-26T16:41:00Z
**Source review:** .planning/phases/01-on-chain-maker-discovery/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 3
- Fixed: 3
- Skipped: 0
- Out of scope (Info, not attempted): 1 (IN-01)

## Fixed Issues

### CR-01: `initialize` has no auth check, so the first caller — not necessarily the deployer — becomes permanent admin

**Files modified:** `contracts/rfq_registry/src/lib.rs`, `contracts/rfq_registry/src/test.rs`, `public/otc-config.js`, `contracts/rfq_registry/test_snapshots/test/*.json` (regenerated snapshots)
**Commit:** `66c5773`
**Applied fix:** Added `admin.require_auth();` in `initialize`, right after the re-init guard and before any argument validation. This keeps the plain `initialize` entry point (the `__constructor` pattern is explicitly rejected for this contract per REG-01/REG-03 and the file's header comment) while closing the specific attack of an outsider naming the *intended* admin's own address without being able to sign for it. It does **not** fully eliminate front-running (an attacker can still race `initialize` naming and signing for *itself*), but it shrinks the blast radius from "hijack the intended deploy, unrecoverable" to "attacker can only self-install, detectable by reading `get_config().admin` back before publishing the contract id, and recoverable by redeploying before the id goes live."
- Updated `read_only_calls_succeed_with_no_auth_mocked_and_emit_no_events` (test.rs), which previously called `initialize` with zero mocked auths on an `Env` that never calls `mock_all_auths()`; it now mocks the admin's auth for that one call, with a corrected comment.
- Added a new test, `initialize_rejects_caller_who_cannot_sign_for_the_named_admin`: an attacker calls `initialize` naming the intended admin, with only the attacker's own auth mocked — the call must fail (asserted via `try_initialize` + `.is_err()`), and the intended admin's own properly-authorized call subsequently succeeds. **Mutation-verified**: commenting out `admin.require_auth();` made this exact test go red (`FAILED ... initialize must reject a caller who cannot sign for the named admin`); restoring the line made it green again. All other 59 pre-existing tests were unaffected by the mutation.
- Added a deploy-time safety note to `public/otc-config.js`'s `RFQ_REGISTRY_ID` comment block: after `initialize`, run `stellar contract invoke ... -- get_config` and confirm `admin` reads back as the intended deployer address **before** pasting the contract id into this file. This documents the residual self-install race the fix does not close, per the orchestrator's binding instruction.
- **Not redeployed / not reconfigured**: per binding constraint, `RFQ_REGISTRY_ID` in `public/otc-config.js`/`src/config.ts` was left pointing at the already-live instance (`CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G`, admin already verified correct). This fix only lands on-chain at the **next** Testnet redeploy (the quarterly reset, or an earlier deliberate redeploy). Rebuilding the contract after this fix produces a new wasm hash for `rfq_registry.wasm` (`f57bb116ac66b9d676c7d636c4f45a853f23abd6732aab5916740948e80674e4`, previously `72974865…` per CLAUDE.md's Status section) — this is expected and only takes effect on the next deploy; no provenance claim in CLAUDE.md was broken since CLAUDE.md is gitignored in this repo and this session did not commit changes to it.

### WR-01: Stake transferred from the maker before the corresponding `MakerConfig` write, unlike the refund paths

**File modified:** `contracts/rfq_registry/src/lib.rs`
**Commit:** `294f751`
**Applied fix:** Reordered both flagged call sites to checks-effects-interactions, matching `remove_tokens`/`eject`:
- `set_url`'s first-registration branch (`None =>` arm): the new `MakerConfig` is now written (and its TTL bumped) *before* the `token::Client::transfer` call, instead of after.
- `add_tokens`: the maker's own updated `MakerConfig` (with `staked` incremented) is now written *before* the `token::Client::transfer` call; the per-token `Token(t)` list writes inside the loop were already correctly ordered before any transfer and were left untouched.
- No test changes were needed — the reordering does not change observable state for any existing test (the invariant this fix protects against, a reentrant `stake_token`, is not exercised by the current test suite, consistent with the review's own framing of this as "currently inert" hardening). All 60 `rfq_registry` tests and the full 83-test workspace suite pass unchanged.

### WR-02: Bounded-list cap comparisons use unchecked `u32` addition instead of the codebase's own `checked_*` pattern

**File modified:** `contracts/rfq_registry/src/lib.rs`
**Commit:** `4c73903`
**Applied fix:** Replaced the two plain `u32 + u32` cap comparisons with `checked_add(...).ok_or(Error::MathOverflow)?`, matching the file's existing `checked_mul_count` discipline for cost arithmetic:
- `add_tokens`: `cfg.tokens.len() + tokens.len() > MAX_TOKENS_PER_MAKER` → `cfg.tokens.len().checked_add(tokens.len()).ok_or(Error::MathOverflow)?`.
- `add_protocols`: `cfg.protocols.len() + protocols.len() > MAX_PROTOCOLS_PER_MAKER` → `cfg.protocols.len().checked_add(protocols.len()).ok_or(Error::MathOverflow)?`.
- No test changes were needed — the existing boundary-value tests (exact-boundary, cross-boundary-batch) exercise realistic input sizes far below `u32::MAX`, so behavior is unchanged for every existing test. The fix only changes behavior for an unrealistic overflow input, converting a host-trap panic into the typed `Error::MathOverflow`, consistent with the rest of the file's numeric-safety philosophy. All 60 `rfq_registry` tests and the full 83-test workspace suite pass.

## Skipped Issues (out of scope)

### IN-01: `tools/rfq-registry-live.mjs` hardcodes a demo token address that isn't on the documented Testnet-reset checklist

**File:** `tools/rfq-registry-live.mjs:80`
**Reason:** Out of scope for this fix pass — `fix_scope` was `critical_warning`; Info-tier findings are not attempted. No changes made.
**Original issue:** `USDC_SAC` derives from a hardcoded demo-issuer G-address not cross-referenced in the Testnet-reset checklist alongside `src/core/tokens.ts`'s own demo-issuer note. See `01-REVIEW.md` for full detail.

## Verification

- `cargo test --manifest-path contracts/Cargo.toml` (all 3 crates, run in the isolated worktree): **83 passed, 0 failed** (`otc_swap` 6, `rfq_registry` 60 — was 59, +1 new mutation-verified test, `rfq_swap` 17).
- `npm run typecheck` (tsc --noEmit): clean.
- `npm test` (vitest): 8 suites, 109 tests, all passed.
- `cd contracts && stellar contract build`: both wasms built, `wasm32v1-none` target.
  - `otc_swap.wasm` hash unchanged: `83f60b854089d1a93644483968e04b5661fef3b6006966fdead4d1221b5a4df3` — matches CLAUDE.md's pinned value; the bytecode-matches-source claim for the deployed `otc_swap` instance still holds.
  - `rfq_swap.wasm` hash unchanged: `9d9d19dfbf831fa210226eb2c39ae1f8d06c893e9de30c33196b88faaa7d869d`.
  - `rfq_registry.wasm` hash changed (expected, this contract was the fix target): `f57bb116ac66b9d676c7d636c4f45a853f23abd6732aab5916740948e80674e4`. **Not deployed** — per binding constraint, the live instance (`CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G`) is unchanged and this fix lands on-chain only at the next redeploy.
- Mutation test for the CR-01 auth check: verified live (see CR-01 section above) — the new test goes red when `admin.require_auth()` is removed, green when restored.
- All verification above ran inside the isolated review-fix git worktree (`.claude/worktrees/rf-01-*`, on temp branch `gsd-reviewfix/01-*`), fast-forwarded onto `feat/rfq-registry` and torn down after the fix commits landed. Re-running these same commands from the main checkout on `feat/rfq-registry` after the fast-forward should reproduce identical results, since the worktree carried no divergent `node_modules`/toolchain — it is not a separately provisioned environment.

## Explicitly not done (binding constraints, not skips)

- Did not redeploy `rfq_registry` or change `RFQ_REGISTRY_ID` in `public/otc-config.js` / `src/config.ts` — the live Testnet instance predates this fix and stays as-is until the next deploy.
- Did not touch `CLAUDE.md` (gitignored in this repo; any edits would not be committed and were not made).
- Did not modify `.claude/settings.json` or `.gsd/` (left untouched, as instructed).

---

_Fixed: 2026-08-26T16:41:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
