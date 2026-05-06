# Next Task

Last updated: 2026-05-05

---

## Immediate next step

Smoke test the full Milestone 2 backend flow using the identity switcher.

The identity switcher is now in the nav. All pages use the selected identity for role detection. A single browser is enough to test creator and maker roles by switching identity.

Use `docs/05-M2-SUPABASE-TESTING.md` as the operator checklist for Supabase table checks and pass criteria.

Steps:
1. Start `npm run dev` (or use Vercel deployment).
2. Set identity to **RFQ Creator** and create a new RFQ. Confirm the row appears in the `rfqs` Supabase table.
3. Set identity to **Maker A** and open that RFQ. Confirm maker view is shown (submit quote form, no competing quotes). Submit a quote. Confirm the row appears in the `quotes` table.
4. Set identity back to **RFQ Creator** and open the same RFQ. Confirm creator view is shown (submitted quotes list). Accept the quote. Confirm:
   - Row in `deals` table.
   - Row in `escrow_events` table (event type `deal_created`).
   - Non-selected quotes have status `rejected`.
   - RFQ status is `closed`.
5. Try submitting a new quote as Maker B on the now-closed RFQ. Confirm it is blocked.
6. Run `npm run lint` and `npm run build`.
7. If all pass: update docs and commit M2 as complete.

---

## Product model to preserve

- Private RFQ, not public auction.
- RFQ creator sees submitted quotes.
- Makers cannot see competing quotes.
- RFQ creator manually accepts one valid quote.
- Accepted quote creates one bilateral escrow deal.
- RFQ creator funds the RFQ sell side.
- Quote maker funds the quoted receive side.
- Settlement uses escrow settlement with atomic final release.

---

## Still out of scope

- Real wallet transaction signing.
- Stellar SDK transaction building.
- Soroban contract.
- Real on-chain settlement.
- Production auth.
- Trustless Work integration.
