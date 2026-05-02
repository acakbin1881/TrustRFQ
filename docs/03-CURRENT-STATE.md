# Current State

Last updated: 2026-05-01

---

## What works

- Full clickable mock flow: Home -> RFQs -> New RFQ -> RFQ Detail -> Submit Quote -> Accept Quote -> Deal Page
- RFQ detail page has two clearly separated role views driven by `CURRENT_USER_ADDRESS`:
  - **Creator view** (`rfq-1` in the demo): shows submitted quotes with accept buttons, below-minimum quotes grouped separately, and an "only you can see submitted quotes" note
  - **Maker view** (`rfq-2` in the demo): shows quote submission only, hides competing quotes, and has no accept button
  - **Closed/expired maker view** (`rfq-3` in the demo): blocks quote submission and shows `Quote submission is closed.`
- RFQ list page shows `Review quotes ->` for the current user's RFQs and `Submit quote ->` for other RFQs
- Private RFQ model is enforced in UI:
  - Quotes are visible only to the RFQ creator
  - Makers cannot see competing quotes
  - RFQ creator manually accepts one valid quote
  - No auction, bidding, outbid, order-book, or AMM language is used as product behavior
- Minimum receive amount is a hard floor:
  - Quote submission is blocked below minimum with an inline error
  - Pre-existing below-minimum quotes are shown as invalid
  - Invalid quotes cannot be accepted
- OTC-size mock amounts are used: 250,000 XLM, 100,000 USDC, 75,000 EURC
- Deal page shows a 5-step escrow lifecycle with mock fund/settle/refund actions
- Deal page now labels the bilateral escrow roles as `RFQ creator` and `Quote maker`
- Lint passes with zero errors

---

## What is mocked

- All data is hardcoded in `apps/web/src/lib/mock-data.ts`
- `CURRENT_USER_ADDRESS` is a mock identity used to switch between creator and maker views
- RFQ creation writes nothing to a database
- Quote submission updates local React state only
- Quote acceptance navigates to a pre-built deal ID; it does not create a real deal record
- Fund/settle/refund buttons update local React state only
- No wallet connection
- No Supabase
- No Stellar SDK
- No Soroban contract calls

---

## Known issues / non-blockers

- `apps/web/public/` still contains default Next.js placeholder SVGs; cosmetic only
- Production build may fail with `EPERM` if the local dev server is running because Windows locks generated `.next` files. Stop the dev server before running `npm.cmd run build`.
- Mock dates are generated from local mock data and will be replaced by persisted timestamps in Milestone 2.

---

## Milestone 1 status

**Complete.** Milestone 1 is ready for checkpoint/sign-off.

Verified:
- `npm.cmd run lint` passes
- Browser smoke checks pass for creator view, maker view, closed/expired RFQ view, and deal escrow view
- Private RFQ + bilateral escrow settlement model is represented correctly
- No real blockchain/database/wallet/backend logic has been added

Next: create a clean checkpoint/commit, then begin Milestone 2.