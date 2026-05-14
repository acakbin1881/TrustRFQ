# TrustRFQ Agent Instructions

These instructions apply to every coding agent working in this repository.

## Product identity

TrustRFQ is a hackathon-focused OTC RFQ product for stablecoin trades. It uses a private RFQ and quote flow, then protects accepted deals with Trustless Work escrow primitives.

Do not redesign this into:

- a generic escrow platform
- a public auction
- a public bidding marketplace
- an order book
- an AMM/swap UI
- an automatic best-price winner system
- a market maker engine

The product rule is simple: private RFQ, private quotes, manual acceptance, escrow-backed settlement.

## Current technical state

The current codebase includes the earlier full technical prototype:

- Supabase persistence
- RFQs, quotes, deals, and escrow events
- Mock identity switcher
- Private creator/maker views
- Backend-state escrow event testing
- Stellar/Soroban folders preserved from prior planning

Do not change code unless the user explicitly asks. When the user asks for writing, docs, naming, or planning, edit only written information.

## Hackathon direction

The Boundless x Trustless Work hackathon direction is now the priority:

1. Perfect the UI.
2. Integrate Trustless Work escrow primitives.
3. Show live or verifiable escrow state in the Trustless Work Escrow Viewer.
4. Keep the demo focused on P2P stablecoin OTC escrow.
5. Prepare public repo, demo URL/video, and submission copy.

## Product questions every feature should answer

- What trust problem are we solving?
- Who are the parties?
- What condition unlocks funds?
- What happens if the condition is not met before expiry?
- Who resolves disputes, or is the path condition-based?
- How can a judge verify the escrow state?

## Current docs

Read these before changing behavior or planning:

```txt
docs/01-MILESTONES.md
docs/02-DECISIONS.md
docs/03-CURRENT-STATE.md
docs/04-NEXT-TASK.md
docs/05-M2-SUPABASE-TESTING.md
docs/06-M3-XLM-USDC-ESCROW-PLAN.md
```

## Hard product rules

Preserve these rules unless the user explicitly changes product direction:

- RFQ creator can see submitted quotes.
- Makers cannot see competing quotes.
- Makers cannot accept quotes.
- Minimum receive amount is a hard floor.
- Below-minimum quotes are invalid.
- Expired quotes are invalid.
- Closed or expired RFQs cannot receive quotes.
- RFQ creator manually accepts one valid, non-expired quote.
- Accepted quote closes the RFQ and rejects non-selected quotes.
- Accepted quote creates exactly one deal.
- Deal lifecycle is escrow settlement, not instant swap.

## Documentation research reminder

The current problem/solution language is provisional. The user is using GPT Deep Research for the real problem framing. When that material arrives, update every similar section across:

- `README.md`
- `docs/01-MILESTONES.md`
- `docs/02-DECISIONS.md`
- `docs/03-CURRENT-STATE.md`
- `docs/04-NEXT-TASK.md`
- `docs/06-M3-XLM-USDC-ESCROW-PLAN.md`
- `CLAUDE.md`

Use the user's research notes as the source of truth for the problem, users, market, solution, and demo proof.

## Technical paths

```txt
apps/web/src/lib/mock-data.ts          Shared types and mock fallback data
apps/web/src/lib/supabase.ts           Supabase browser client
apps/web/src/lib/database.types.ts     Supabase table types
apps/web/src/lib/rfq-repository.ts     RFQ/quote/deal persistence helpers
apps/web/src/lib/identity.ts           Temporary mock identity switcher
apps/web/src/components/IdentitySelector.tsx
apps/web/src/app/rfqs/page.tsx
apps/web/src/app/rfqs/new/page.tsx
apps/web/src/app/rfqs/[id]/page.tsx
apps/web/src/app/deals/[id]/page.tsx
supabase/migrations/001_initial_schema.sql
```

## Commands

From repo root:

```powershell
npm.cmd run lint
npm.cmd run build
npm run dev
```

On Windows, prefer `npm.cmd` for lint/build.
## Claude specialized skills

For design work, use specialized Claude skills instead of broad prompts:

- `landing-page` for the TrustRFQ demo entry page and Mercury-inspired first viewport.
- `design-system` for typography, color, surfaces, status, tables, timelines, proof cards, and component patterns.
- `visual-polish-pass` after a UI slice is built.
- `scope-audit` before accepting broad UI changes.

Do not ask Claude to "make the whole app beautiful" in one pass. Give it one slice and the matching skill.