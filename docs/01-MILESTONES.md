# TrustRFQ Milestones

## Milestone 1 - Private RFQ prototype

**Status:** Complete

The product already has a working private RFQ prototype:

- RFQ list
- RFQ creation
- RFQ detail page
- Private quote submission
- Creator-only quote review
- Manual quote acceptance
- Deal creation
- Deal lifecycle page
- Mock fallback data

Core rule: this is private RFQ and escrow settlement, not public bidding or an auction.

## Milestone 2 - Supabase persistence

**Status:** Complete

The prototype already includes Supabase-backed persistence:

- `rfqs`
- `quotes`
- `deals`
- `escrow_events`
- Repository layer with Supabase/mock fallback
- Mock identity switcher for creator/maker testing
- Deal event recording for backend-state escrow testing

This milestone proves the off-chain RFQ lifecycle works. It does not prove real escrow settlement yet.

## Milestone 3 - Hackathon UI polish

**Status:** Planned

Goal: make TrustRFQ feel like a polished OTC stablecoin escrow product for the Boundless x Trustless Work hackathon.

Planned work:

- Replace old prototype-facing product copy in the UI where needed.
- Improve homepage framing around TrustRFQ and the hackathon use case.
- Make RFQ list and detail pages easier to scan.
- Make creator vs maker states obvious.
- Make accepted deal and escrow state visually clear.
- Add better empty, loading, expired, and error states.
- Keep the product focused on RFQ -> quote -> deal -> escrow.

Acceptance criteria:

- UI clearly says TrustRFQ.
- UI explains the trust problem without over-explaining.
- Judges can understand the product in under one minute.
- Flow remains private RFQ, not auction/order book/swap.
- `npm.cmd run lint` and `npm.cmd run build` pass after code changes.

## Milestone 4 - Trustless Work escrow integration

**Status:** Planned

Goal: connect accepted deals to Trustless Work escrow primitives for the hackathon demo.

Planned work:

- Confirm current Trustless Work integration path from official docs.
- Decide between Blocks SDK, React SDK, REST API, or BackOffice-assisted demo path.
- Add Trustless Work configuration and helper layer.
- Map an accepted RFQ deal into a Trustless Work escrow.
- Store escrow id/status/reference in Supabase.
- Show escrow status on the deal page.
- Add an Escrow Viewer link for judge verification.
- Keep mock fallback if API credentials are missing.

Acceptance criteria:

- Accepted deal can create or reference a Trustless Work escrow.
- Deal page shows escrow id/status or clear demo state.
- Escrow Viewer can be opened from the product or demo script.
- The unlock condition and refund/failure path are clear.

## Milestone 5 - Hackathon submission package

**Status:** Planned

Goal: prepare everything needed for submission.

Deliverables:

- Public repository ready
- Demo URL or recorded walkthrough
- Short demo script
- Team/project banner
- Submission description
- Optional documentation link
- Final check that docs, UI copy, and demo story match

## Milestone 6 - Post-hackathon startup path

**Status:** Future

Goal: turn TrustRFQ from a hackathon prototype into the Stellar startup product.

Possible work:

- Production auth/wallet identity
- Stronger RLS and backend permissions
- Real settlement flows
- Trustless Work production integration
- Trade history
- Counterparty reputation
- Resolver/dispute workflow if needed
- Mainnet readiness only after security review

## Research reminder

Problem framing, target users, market proof, and solution positioning are placeholders until the GPT Deep Research pass is provided by the user.