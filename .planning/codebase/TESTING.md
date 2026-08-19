# Testing Patterns

**Analysis Date:** 2026-08-18

## Test Framework

**Runner:**
- Vitest 4.1.10 (configured in `vite.config.ts`)
- Config: `test: { environment: 'node', include: ['src/**/*.test.ts'] }`
- Run: `npm test` (all tests), no watch mode configured

**Assertion library:**
- Vitest's built-in `expect()` API
- Imports: `import { describe, expect, it } from 'vitest'`

**Run commands:**
```bash
npm test              # Run all tests once
npm run typecheck     # TypeScript type checking only (tsc --noEmit)
npm run build         # Build + typecheck (tsc --noEmit && vite build)
cargo test --manifest-path contracts/Cargo.toml   # Rust contract tests (23 total)
```

## Test File Organization

**Location pattern:**
- Co-located with source: `src/core/address.ts` → `src/core/address.test.ts`
- Non-test files excluded: `package.json`, `vite.config.ts` not included
- Rust contracts: `contracts/otc_swap/src/test.rs`, `contracts/rfq_swap/src/test.rs`

**Naming:**
- TypeScript: `{module}.test.ts` (e.g., `canonical.test.ts`, `balances.test.ts`)
- Rust: `test.rs` module within the contract crate

**Count:**
- 8 TypeScript test suites (all in `src/core/` and `src/wallet/`)
- 109 total assertions across TypeScript
- 23 Rust contract tests (6 in `otc_swap`, 17 in `rfq_swap`)

**Test files:**
```
src/core/canonical.test.ts        - Signature boundary, golden vectors
src/core/address.test.ts          - Address validation, checksum
src/core/balances.test.ts         - Horizon account parsing, liabilities
src/core/oracle.test.ts           - Price feed, cross-rate, staleness
src/core/tokens.test.ts           - Token allow-list, amount validation
src/core/pairs.test.ts            - Pair key generation, ordering
src/core/negotiation.test.ts      - Round logic, payload determinism
src/wallet/authSignature.test.ts  - Auth entry double-encoding fix
```

## Test Structure

**Suite organization:**
```typescript
import { describe, expect, it } from 'vitest';
import { functionToTest } from './module';

describe('functionToTest', () => {
  it('happy path description', () => {
    expect(functionToTest('input')).toBe('expected');
  });

  it('edge case description', () => {
    expect(functionToTest('edge')).toBeNull();
  });

  describe('nested context', () => {
    it('related scenario', () => {
      // grouped under parent
    });
  });
});
```

**Patterns:**
- One `describe` block per function/class
- Flat list of `it` blocks for normal cases
- Nested `describe` for context grouping (rare; most tests are flat)
- Multiple assertions per test when they test the same code path (e.g., both `expect` calls in one `it`)

**Assertion types used:**
```typescript
expect(x).toBe(y)                    // strict equality
expect(x).toEqual(y)                 // deep equality (objects)
expect(x).toBeNull()                 // null check
expect(x).toBeCloseTo(y, precision)  // floating-point comparison
expect(x).toThrow()                  // error thrown
expect(() => fn()).toThrow(/pattern/)// error + message pattern
expect(x).not.toBe(y)                // negation
```

## Mocking

**Framework:** None in TypeScript tests
- Pure functions don't need mocks
- Network requests are never tested (no HTTP mocks configured)
- No mock dependencies in `package.json`

**Patterns:**
- Golden vectors (fixtures/canonical-args.json) replace mocking for Stellar SDK behavior
- Test data: inline fixture builders (e.g., `order()`, `round()` factories)
- Rust: `soroban_sdk::testutils` traits mock auth and ledger state

**What NOT to mock:**
- Pure functions in `src/core/*` — test directly
- Crypto operations (`StrKey`, `Buffer`) — use real implementations
- Stellar SDK helpers — capture bytes in golden vectors instead

**Rust mocking (Soroban tests):**
```rust
use soroban_sdk::testutils::{
  Address as _, Ledger as _, MockAuth, MockAuthInvoke, AuthorizedFunction, ...
};

env.mock_all_auths();              // auto-pass all require_auth calls
env.mock_auths(&[MockAuth { ... }]); // selective: only listed addresses pass
env.ledger().set_timestamp(10_000);  // set ledger time
env.ledger().set_sequence_number(seq); // set ledger sequence
```

## Test Structure Details

**TypeScript test suites breakdown:**

**1. Golden vectors (canonical.test.ts):**
```typescript
describe('fillCanonicalArgs', () => {
  for (const v of fixtures.vectors) {
    it(`reproduces the captured XDR for ${v.name}`, async () => {
      const args = await fillCanonicalArgs(v.order, PASSPHRASE);
      expect(args.map((a) => a.toXDR('base64'))).toEqual(v.fillArgsXdr);
    });
  }
});
```
- Iterates over `fixtures/canonical-args.json` vectors
- Byte-identical XDR comparison (signature boundary)
- Captures: test names, order objects, expected XDR output

**2. Validation tests (address.test.ts, tokens.test.ts):**
```typescript
describe('checkAddress', () => {
  it('accepts a valid address', () => {
    expect(checkAddress(A)).toBe('ok');
  });

  it('grades what is wrong', () => {
    expect(checkAddress('')).toBe('empty');
    expect(checkAddress('MA5ZSEJY')).toBe('start');
  });

  it('catches a one-character typo that ADDR_RE lets through', () => {
    const typo = `${A.slice(0, 30)}X${A.slice(31)}`;
    expect(checkAddress(typo)).toBe('checksum');
  });
});
```
- Tests discriminated return types
- Edge cases (empty, wrong prefix, wrong length, checksum failure)
- Real crypto validation (no mocks)

**3. Defensive parsing (balances.test.ts):**
```typescript
it('is defensive about garbage input and malformed entries', () => {
  expect(parseAccountBalances(null)).toEqual({});
  expect(parseAccountBalances(undefined)).toEqual({});
  expect(parseAccountBalances({ balances: 'nope' })).toEqual({});
  expect(parseAccountBalances({
    balances: [
      null,
      { asset_type: 'native' },  // missing balance
      { asset_type: 'native', balance: 'abc' }, // garbage
    ],
  })).toEqual({});
});
```
- All inputs tested: valid, partial, malformed, wrong types
- Consistent return type (always empty object on failure)
- Fail-closed behavior verified

**4. Determinism testing (canonical.test.ts, negotiation.test.ts):**
```typescript
it('is deterministic across calls', async () => {
  const a = await fillCanonicalArgs(v.order, PASSPHRASE);
  const b = await fillCanonicalArgs(v.order, PASSPHRASE);
  expect(a.map((x) => x.toXDR('base64'))).toEqual(b.map((x) => x.toXDR('base64')));
});

it('is deterministic across input property order', () => {
  const shuffled = { taker_amount, maker_token, ... };
  expect(composeBroadcastPayload(shuffled)).toBe(composeBroadcastPayload(b));
});
```
- Proves no floating-point math or Date.now() leaks into signatures
- Proves field reordering doesn't break payloads

**5. Parametrized testing (.each):**
```typescript
it.each([
  ['25.5000000', '25.5'],
  ['0.1234567', '0.1234567'],
  ['abc', '0'],
])('%j -> %j', (input, expected) => {
  expect(fmtBalance(input)).toBe(expected);
});
```
- Reduces boilerplate for multiple input/output pairs
- Used for formatting and validation roundtrips

**6. Error testing:**
```typescript
it('rejects invalid amount %j regardless of balance', (amount) => {
  expect(canAfford(map, 'XLM', amount)).toBe(false);
});

it('refuses anything that is not a 64-byte signature', () => {
  expect(() => authSignatureBytes(Buffer.alloc(32).toString('base64'))).toThrow(/64/);
});
```
- Invalid inputs expected to return false or throw
- Error messages checked with regex patterns

## Fixtures and Factories

**Test data factories:**
```typescript
// Negotiation test factories
const order = (over: Partial<Order> = {}): Order => ({
  id: 'ord-1',
  maker_address: MAKER,
  ...over, // overrides
});

const round = (over: Partial<RoundRow> = {}): RoundRow => ({
  n: 1,
  resolution: 'pending',
  ...over,
});
```

**Golden vector location:**
- `fixtures/canonical-args.json` — captured from live Stellar SDK on esm.sh
- Contains: `networkPassphrase`, `sacIds` map, test `vectors` array
- Each vector: `name`, `order`, `fillArgsXdr`, `canonicalPayload`
- Regenerated via `npm run capture` (dev tool only)

## Coverage

**Requirements:**
- No enforced target; pragmatic coverage of security-critical paths
- High coverage in `src/core/*` (pure, testable functions)
- Moderate coverage in `src/data/*` (hooks hard to test without React testing library)
- Low coverage in `src/ui/*` (integration tested via E2E instead)

**What is covered:**
- All Stellar SDK argument encodings (golden vectors)
- All token/amount validation (edge cases)
- All address validation (including checksum)
- All balance parsing (including malformed input)
- Signature bytes normalization (kit workaround)
- Oracle price calculations (overflow, staleness)
- Negotiation logic (round threading, counters)

**What is NOT covered:**
- React component rendering (tested via `tools/e2e/` instead)
- Supabase hooks (no DB in tests)
- Wallet interactions (mocked as `WalletSigner` interface)
- Network errors (tested in E2E only)
- Settlement signing flow (E2E only; see `tools/rfq-live-swap.mjs`)

## Test Types

**Unit tests (all in src/):**
- Pure function tests: `canonical.test.ts`, `address.test.ts`, `tokens.test.ts`
- Hook unit tests: none (hooks require React context, deferred to E2E)
- Scope: single function or module

**Integration tests:**
- None in the test suite
- E2E tests cover the full flow (see `tools/e2e/run-all.mjs`)

**E2E tests:**
- Location: `tools/e2e/` (Playwright headless)
- Run: `npm run e2e:census`
- Coverage: full maker+taker flow through settlement
- Two wallets: mocked Freighter via postMessage protocol
- Settles: real Testnet transactions

**Contract unit tests (Rust):**
- Location: `contracts/otc_swap/src/test.rs` (6 tests), `contracts/rfq_swap/src/test.rs` (17 tests)
- Run: `cargo test --manifest-path contracts/Cargo.toml`
- Framework: Soroban SDK's `Env::default()` (real host simulation, no mocks)
- Patterns:
  ```rust
  #[test]
  fn fill_swaps_both_legs() {
    let s = setup(100, 250);
    s.client.fill(&s.maker, &s.taker, ...);
    assert_eq!(s.ta.balance(&s.maker), 0);
  }
  ```

**Live proof tests:**
- `tools/rfq-live-swap.mjs`: RFQ contract settlement proof
- Run: `node tools/rfq-live-swap.mjs`
- Setup: generates Friendbot-funded actors, submits real Testnet tx
- Verifies: both signatures accepted, replay rejected with `ExistingValue`

## Common Patterns

**Async testing:**
```typescript
it('is deterministic across calls', async () => {
  const a = await fillCanonicalArgs(v.order, PASSPHRASE);
  const b = await fillCanonicalArgs(v.order, PASSPHRASE);
  expect(a).toEqual(b);
});
```
- Async functions awaited in tests
- No explicit done() callback needed (Vitest handles it)

**Error testing:**
```typescript
it('rejects expired order', () => {
  const s = setup(100, 250);
  s.env.ledger().set_timestamp(10_000);
  const r = s.client.try_fill(..., past_expiration);
  assert!(r.is_err());
});
```
- `try_*` methods return `Result` for assertions
- Panicking functions tested via `.toThrow()` in JS

**Setup and teardown:**
- Vitest: no global setup hooks configured
- TypeScript: each test is independent (no shared state)
- Rust: `setup()` helper initializes contract + actors per test
- Cleanup: automatic (Env dropped at test end)

**Data-driven testing:**
```typescript
for (const [token, expected] of Object.entries(fixtures.sacIds)) {
  it(`derives ${token.split(':')[0]} -> ${expected.slice(0, 8)}…`, () => {
    expect(sacIdFor(token, PASSPHRASE)).toBe(expected);
  });
}
```
- Loops generate test cases dynamically
- Useful for fixture coverage and parametrization

## Test Snapshots (Rust)

**Soroban snapshot pattern:**
- Auto-written to `test_snapshots/<module>/<test>.<n>.json` on first run
- Captures: events emitted, final storage state
- Committed to git: regression tripwire on unrelated changes
- Location: `contracts/otc_swap/test_snapshots/` (6 files tracked)

---

*Testing analysis: 2026-08-18*
