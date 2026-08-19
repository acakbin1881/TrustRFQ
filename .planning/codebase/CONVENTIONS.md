# Coding Conventions

**Analysis Date:** 2026-08-18

## Naming Patterns

**Files:**
- React components: PascalCase (e.g., `Ticket.tsx`, `ThreadView.tsx`, `BalanceStrip.tsx`)
- Modules/utilities: camelCase (e.g., `canonical.ts`, `address.ts`, `pairs.ts`, `tokens.ts`)
- Test files: Match source name + `.test.ts` suffix (e.g., `address.test.ts`)

**Functions:**
- camelCase: `checkAddress`, `parseAccountBalances`, `fillCanonicalArgs`, `signFillAuth`
- Prefixes used for categories:
  - Predicates: `is*` (e.g., `isKnownToken`, `isExpired`, `isStale`)
  - Formatters: `fmt*` (e.g., `fmtBalance`, `fmtRate`, `fmtRemaining`)
  - Parsers: `parse*` (e.g., `parseAccountBalances`)
  - Validators: `valid*` / `check*` (e.g., `validAmount`, `checkAddress`)
  - Creators: `compose*` / `create*` (e.g., `composeBroadcastPayload`)
  - Converters: `to*` / `from*` / `*For` (e.g., `toStroops`, `assetFor`, `tokenLabel`)

**Variables:**
- camelCase: `makerAmount`, `takerToken`, `balances`, `balanceOf`
- Constants: UPPER_CASE with underscores (e.g., `MAX_AMOUNT`, `ADDR_RE`, `DEFAULT_MAKER_TOKEN`)
- Module-scope state: camelCase (e.g., `settleLock`, `repairedFor`)
- Boolean state: prefix with question clarity (e.g., `open`, `busy`, `loading`, `funded`, `known`)

**Types/Interfaces:**
- PascalCase: `Order`, `Side`, `Setup`, `FillTerms`, `SignedTerms`, `BalanceMap`
- Props interfaces: `ComponentNameProps` (e.g., `TicketProps`, `ThreadViewProps`)
- Union types: lowercase keys (e.g., `type Side = 'maker' | 'taker'`)

## Code Style

**Formatting:**
- 2-space indentation (observed consistently across all files)
- No external formatter config (Prettier/ESLint not configured); style enforced by convention
- Line breaks: Long logical expressions broken into readable chunks (see `fmtRate` in `Ticket.tsx`)

**TypeScript strictness:**
- Strict mode enabled: `"strict": true`
- Unused variable detection: `"noUnusedLocals": true`, `"noUnusedParameters": true`
- Fallthrough cases blocked: `"noFallthroughCasesInSwitch": true`
- Module isolation enforced: `"isolatedModules": true`
- Verbatim module syntax: `"verbatimModuleSyntax": true` (avoids implicit type-only imports)

**React/JSX:**
- React 19 with strict mode (double-mount during development)
- **No `dangerouslySetInnerHTML`** — all text rendered through JSX auto-escapes
- Component state: hooks only, no class components
- Props are typed via interfaces, not inline `React.FC<{}>`

## Import Organization

**Order (strictly followed):**
1. External libraries (e.g., `import { useEffect, useState } from 'react'`)
2. Stellar SDK imports (e.g., `import * as Stellar from '@stellar/stellar-sdk'`)
3. Internal `core/` imports (e.g., `import { checkAddress } from '../core/address'`)
4. Internal `data/` imports (e.g., `import { insertOrder } from '../data/orders'`)
5. Internal `wallet/` imports (e.g., `import { walletSign } from '../wallet/kit'`)
6. Internal `ui/` or sibling imports (e.g., `import { TokenSelect } from './TokenSelect'`)
7. Type imports (e.g., `import type { Order } from '../core/types'`)

**Path aliases:**
- No path aliases configured; all imports use relative paths
- Vite buffer alias: bare `import { Buffer }` resolves to npm `buffer` package (not Node builtin) for test/browser consistency

**Path conventions:**
- `src/core/*`: pure business logic, no wallet/window/network state
- `src/data/*`: Supabase queries, React hooks, networking
- `src/wallet/*`: wallet SDK wrappers (Freighter via stellar-wallets-kit)
- `src/ui/*`: React components, view logic, Toast/hooks
- `fixtures/*`: golden test vectors (canonical-args.json)

## Comments & Documentation

**Module-level comments:**
- Extensive block comments at file top explain invariants, security boundaries, and porting notes
- Format: `// ---...---` separator, then explanation, then `// ---...---` close
- Example: `src/canonical.ts` explains the security boundary and signature determinism requirement
- Example: `src/fill.ts` documents the two deliberate module boundaries (injected wallet, no Supabase)

**JSDoc/TSDoc:**
- Used for public exports, especially security-critical functions
- Pattern: `/** description */` on the line before the export
- Example: `export function checkAddress(...)` has `/** self = the connected wallet, so we can reject an order addressed to yourself. */`

**Inline comments:**
- Explain "why" not "what"; code is readable enough for "what"
- Prefix with issue numbers when explaining gotchas (e.g., `// stellar-wallets-kit 1.9.5 bug (measured 2026-07-14)`)
- Defensive: flag unsafe patterns (e.g., `// never bare-element selector under .ticket__swap`)

**Error-code documentation:**
- Error/warning codes mapped to user messages (e.g., `ADDR_MSG: Record<Exclude<AddrCode, 'ok'>, string>`)
- Return type discriminators documented (e.g., `AddrCode = 'ok' | 'empty' | 'start' | 'charset' | 'length' | 'checksum' | 'self'`)

## Error Handling

**Pure function pattern (`src/core/*`):**
- Validation returns discriminated union types (e.g., `AddrCode`) or boolean predicates
- Parsing returns `null` on malformed input (e.g., `pairTokens` returns `[string, string] | null`)
- Computations throw on logic errors (e.g., `pairKey` throws on unknown/equal tokens: `throw new Error(...)`)
- Defensive parsing: returns empty objects or `false` on garbage input (see `parseAccountBalances` test coverage)

**React hook pattern (`src/data/*` and `src/ui/*`):**
- Network errors caught and logged to console.warn OR toasted to UI
- Failed fetches set state to `null` (unknown ≠ zero)
- Successful fetch sets state to result (empty object if unfunded)
- Async operations guarded by abort-ref pattern (see `useBalances` `addrRef` guard)

**UI error reporting:**
- Toast system: `useToast()` returns `toast(message, 'err' | 'info')`
- Error messages are user-facing, generated by helper functions (e.g., `errMsg` wraps error objects)
- Validation errors display before submission (Ticket gate logic)

**Stellar/chain errors:**
- Simulation errors (e.g., amount tamper) caught as `Error` objects and surfaced
- On-chain failures: `waitForTx` throws after 30 polls (90 seconds)
- Signature verification: throws on invalid/mismatched auth (from `authorizeEntry`)

## Logging

**Framework:**
- `console.warn(...)` for error reporting (dev/test only; production filters)
- `console.log(...)` rarely used; debug state logged once on mount if verbose
- No centralized logger; direct console output

**Patterns:**
- Error context: `console.warn('Label:', error)` (e.g., `console.warn('Balance load failed:', err)`)
- Events: not logged (Supabase realtime is the event source)
- Silent failures: `catch (...) => console.warn(...)` then continue (e.g., useSettlement error paths)

**User-facing errors:**
- Toast notifications via `useToast()` for interactive feedback
- Structured: message, error code, optional details
- Example: `errMsg(error)` formats an error object into a displayable string

## Function Design

**Size guideline:**
- Prefer < 50 lines for testability
- Complex logic broken into named helpers (e.g., `chWidth`, `amountClass` in Ticket for sizing logic)
- Average module size: 50–200 lines (pure modules are smaller; component modules are larger)

**Parameters:**
- Typed as specific interfaces, not generic objects
- Injected dependencies (e.g., `WalletSigner` interface in `fill.ts`, `ChainConfig` in chain ops)
- No optional parameters except where documented (e.g., `self?: string | null` in `checkAddress`)

**Return values:**
- Explicit types: discriminated unions preferred (e.g., `AddrCode` union), not booleans + side-effect
- Async: always return a Promise (never fire-and-forget)
- Side-effect free in `src/core/*` (pure functions only)

**Examples:**
```typescript
// Pure: returns discriminated type
export function checkAddress(raw: string, self?: string | null): AddrCode

// Pure: returns null on parse failure
export function pairTokens(key: string): [string, string] | null

// Hook: returns { state, refresh fn, loading flag }
export function useBalances(address: string | null): 
  { balances, funded, loading, refresh }

// UI component: render prop for conditional logic
export function ThreadView({ order, side, ... }: ThreadViewProps)
```

## Module Design

**Exports:**
- Named exports preferred (e.g., `export function checkAddress(...)`)
- Type exports: `export type Order = { ... }`
- Barrel files: none used; direct imports from source files
- Single responsibility: one main export per file, helpers as side exports

**Files with "primary export + helpers" pattern:**
- `address.ts`: `checkAddress` (primary), `normalizeAddress`, `ADDR_MSG` (helpers)
- `tokens.ts`: `TOKENS` allow-list (primary), `isKnownToken`, `validAmount`, `tokenLabel` (helpers)

**Pure module conventions (`src/core/*`):**
- No imports of `config.ts` or window state
- `chainConfig` passed as parameter, never read from globals
- Network URLs/passphrases injected, not hardcoded
- Testable without mocks

**Hook conventions (`src/data/*`):**
- Only called at component level (not inside loops/conditions)
- State on disconnect: cleared to `null` (not empty)
- State on load failure: `null` (unknown ≠ zero), not `false`
- Realtime: subscribed via Supabase's `on()` for live updates

**Component conventions (`src/ui/*`):**
- Props always typed via interface (no inline types)
- Handlers prefixed with `on*` (e.g., `onSent`, `onChanged`, `onRoundsError`)
- CSS classes locked to design tokens (see CLAUDE.md gotchas: class names are a contract)
- Module-scope locks for serialization (see `settleLock` pattern in ThreadView)

---

*Convention analysis: 2026-08-18*
