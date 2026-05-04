# Next Task

Last updated: 2026-05-04

---

## Immediate next step

Deploy to Vercel and run multi-user smoke test for Milestone 2.

Supabase is already connected and RFQ writes are confirmed. The remaining M2 tests require two different user identities (creator + maker), which is only possible with Vercel deployment and two separate browsers/devices.

Steps:
1. Deploy to Vercel with environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_STELLAR_NETWORK=TESTNET`
   - `NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org`
2. Smoke test from two different devices/browsers:
   - Device A: create RFQ → confirm row in `rfqs` table
   - Device B: submit quote on that RFQ → confirm row in `quotes` table
   - Device A: accept the quote → confirm rows in `deals` and `escrow_events` tables
   - Verify closed RFQ rejects new quotes
3. If all pass: update docs and commit M2 as complete.

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

- Freighter wallet.
- Stellar SDK.
- Soroban contract.
- Real on-chain settlement.
- Production auth.
- Trustless Work integration.
