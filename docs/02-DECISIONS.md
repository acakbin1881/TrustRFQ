# Product and Architecture Decisions

## TrustRFQ is the hackathon product name

**Decision:** The project should be presented as TrustRFQ for the Boundless x Trustless Work hackathon.

**Reason:** The hackathon version is focused on Trustless Work escrow integration and RFQ-based P2P OTC settlement.

## Specific product, not generic escrow

**Decision:** TrustRFQ is a P2P OTC RFQ escrow product, not a general-purpose escrow builder.

**Reason:** The hackathon brief explicitly rewards specific products. A focused OTC desk is easier to demo and has a clearer trust problem.

## Private RFQ, not public auction

**Decision:** Quotes are hidden from competing makers. The RFQ creator sees all quotes and manually accepts one.

**Reason:** OTC behavior is negotiated and private. Public bidding would turn the product into an auction and weaken the product story.

## Trustless Work is the hackathon escrow target

**Decision:** The hackathon implementation should prioritize Trustless Work primitives, docs, APIs, SDKs, and Escrow Viewer integration.

**Reason:** The event is specifically about building with Trustless Work. The best demo should show the escrow state through Trustless Work tooling.

## Supabase remains the off-chain RFQ database

**Decision:** RFQs, quotes, deals, and event history remain in Supabase unless a later architecture decision replaces them.

**Reason:** The RFQ negotiation layer is off-chain application state. Trustless Work should handle escrow coordination, not every product table.

## Escrow Viewer is part of the demo proof

**Decision:** Accepted deals should expose an Escrow Viewer path when a Trustless Work escrow exists.

**Reason:** Judges need to verify that the product is using Trustless Work, not only simulating escrow state.

## Manual acceptance remains required

**Decision:** The best quote does not automatically win. The RFQ creator manually accepts one valid quote.

**Reason:** OTC trades consider counterparty, timing, and terms, not only price.

## Research is not final yet

**Decision:** Current user-problem wording is provisional.

**Reason:** The user will provide GPT Deep Research material with better problem, market, and user evidence. Docs should be rewritten from that source when available.