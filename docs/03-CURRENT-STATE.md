# Current State

Last updated: 2026-05-01

---

## What works

- Full clickable mock flow: Home → RFQs → New RFQ → RFQ Detail → Submit Quote → Accept Quote → Deal Page
- RFQ detail page has two clearly separated role views driven by `CURRENT_USER_ADDRESS`:
  - **Creator view** (rfq-1 in the demo): shows submitted quotes with accept buttons, below-minimum quotes grouped separately, "only you can see submitted quotes" note
  - **Maker view** (rfq-2, rfq-3 in the demo): shows submission form only, no competing quotes visible, post-submit confirmation screen, no accept button
- RFQ list page: "Review quotes →" button for creator's own RFQs, "Submit quote →" for others, "your RFQ" tag on creator rows
- Private RFQ model enforced in UI:
  - "Private RFQ · Quotes are visible only to the RFQ creator · Not a public auction" amber banner
  - Maker view explicitly states makers cannot see competing quotes
- Minimum receive amount is a hard floor:
  - Quote submission blocked below minimum with inline error message
  - Pre-existing below-minimum quotes shown as invalid with "Below minimum" badge
  - Accept button hidden for invalid quotes; "Cannot accept" shown instead
  - Valid and invalid quotes listed in separate groups
- OTC-size mock amounts (250,000 XLM, 100,000 USDC, 75,000 EURC)
- One intentionally invalid quote (quote-2 on rfq-1: 48,500 USDC < 50,000 minimum)
- Deal page shows 5-step escrow timeline with mock fund/settle/refund actions
- Build passes cleanly — 6 routes, zero TypeScript errors

---

## What is mocked

- All data is hardcoded in `apps/web/src/lib/mock-data.ts`
- RFQ creation writes nothing to a database
- Quote submission updates local React state only
- Quote acceptance navigates to a pre-built deal ID (no real deal creation)
- Fund/settle/refund buttons update local React state only
- No wallet connection
- No Supabase
- No Stellar SDK
- No Soroban contract calls

---

## Known issues

- None blocking Milestone 1 acceptance criteria
- `apps/web/public/` still contains default Next.js placeholder SVGs (cosmetic, harmless)
- Remote GitHub branches `origin/main` and `origin/dev` are stale (2 commits behind master) — can be deleted

---

## Milestone 1 status

**In progress — awaiting sign-off.** All technical acceptance criteria are met:
- Build passes ✅
- Lint passes ✅ (zero errors)
- RFQ creator view and maker view are clearly separated ✅
- Makers cannot see competing quotes ✅
- Accept buttons are only available in creator view ✅
- Private RFQ model enforced in UI ✅
- No auction/bidding language ✅
- Below-minimum quotes cannot be accepted ✅
- Deal page shows escrow lifecycle interactively ✅
- No real blockchain/database/wallet calls ✅

Pending: user sign-off before Milestone 2 begins.
