# Supabase Testing Notes

## Purpose

Supabase is the off-chain state layer for TrustRFQ. It stores the RFQ lifecycle while Trustless Work should handle the escrow layer for the hackathon integration.

Supabase currently supports:

- RFQ persistence
- Quote persistence
- Deal creation
- Escrow event history
- Mock identity testing
- Mock fallback when env vars are missing

## Project reference

Supabase project from the copied technical prototype:

- Dashboard: https://supabase.com/dashboard/project/vzitlzzbdnnxigexopdj
- Project ref: `vzitlzzbdnnxigexopdj`
- Local migration: `supabase/migrations/001_initial_schema.sql`

Do not put Supabase secrets in this file. Keep real values in `.env.local` and Vercel environment variables only.

## Required environment variables

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Existing Stellar variables may remain while the prototype evolves:

```txt
NEXT_PUBLIC_STELLAR_NETWORK=TESTNET
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_CONTRACT_ID
```

Planned Trustless Work variables should be added only after confirming official docs.

## Tables

`rfqs`

- Stores private RFQ requests.
- Key fields: creator, sell asset, sell amount, buy asset, minimum receive amount, status, expiry.

`quotes`

- Stores private maker quotes for one RFQ.
- Competing makers should not see each other's quotes.

`deals`

- Stores the accepted-quote deal.
- Future Trustless Work fields may include escrow id, status, and viewer link.

`escrow_events`

- Stores app-level event history.
- For the hackathon, this should eventually record Trustless Work escrow status changes or references.

## Testing goal

Supabase testing should prove the app-level RFQ flow still works before and after Trustless Work integration:

1. Create RFQ.
2. Submit quote.
3. Accept quote.
4. Create deal.
5. Record escrow/deal event.
6. Display status on deal page.

## Research reminder

If the final GPT Deep Research framing changes the target user or exact trade flow, update the testing notes to match the new demo path.