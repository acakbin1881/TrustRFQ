# Frontend Scope Rule

TrustRFQ UI work must stay inside the private RFQ -> quote -> accepted deal -> escrow settlement product.

Allowed product surfaces:

- demo entry page
- buyer RFQ list
- create RFQ page
- RFQ detail and quote comparison
- seller quote submission
- accepted deal / escrow detail page

Do not add:

- generic escrow dashboards
- admin analytics
- notification centers
- KYC/compliance suites
- chat systems
- fiat onramp flows
- public marketplace browsing
- order book or AMM surfaces
- subscription or invoice flows
- broad settings pages unrelated to demo readiness

Top-level navigation should center on RFQs, Quotes, and Deals. Escrow is infrastructure inside the deal flow, not the primary product category.