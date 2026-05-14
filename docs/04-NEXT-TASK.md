# Next Task

Last updated: 2026-05-13

## Immediate next step

Do not change code until the next implementation request is explicit.

The next product work should be one of these, in order:

1. Finalize written problem framing after the user's GPT Deep Research pass.
2. Update UI copy and visible product naming to TrustRFQ.
3. Polish the RFQ/deal interface for the hackathon demo.
4. Confirm the Trustless Work integration path from official docs.
5. Implement the smallest reliable escrow integration path.
6. Add Escrow Viewer links/status to accepted deals.

## Hackathon demo target

The ideal demo flow:

```txt
Open TrustRFQ -> create RFQ -> submit quote -> accept quote -> create/link Trustless Work escrow -> show deal status -> open Escrow Viewer
```

## Questions to answer before Trustless Work implementation

- Which Trustless Work path is fastest and reliable for this product: Blocks SDK, React SDK, REST API, BackOffice dApp, or hybrid?
- What exact escrow payload maps to an accepted RFQ deal?
- Which party funds the escrow?
- What condition releases funds?
- What happens after expiry?
- Does the MVP need a resolver, or is it condition-based only?
- What Escrow Viewer URL format should be stored or generated?
- Which fields should be added to Supabase for escrow id, status, and viewer link?

## Product model to preserve

- Private RFQ, not public auction.
- RFQ creator sees submitted quotes.
- Makers cannot see competing quotes.
- RFQ creator manually accepts one valid quote.
- Accepted quote creates one escrow-backed deal.
- Trustless Work is the escrow proof layer for the hackathon.

## Still out of scope unless explicitly requested

- Mainnet
- Fiat rails
- KYC
- Public order book
- AMM/swap behavior
- Multi-chain expansion
- Production auth/RLS hardening
- Generic escrow platform behavior