# Trustless Work Rule

Trustless Work is the escrow layer, not the whole product identity.

Preferred hackathon mapping:

- one accepted quote becomes one Trustless Work escrow deal
- use one settlement milestone for demo clarity
- buyer funds escrow
- seller marks settlement sent / milestone complete
- buyer approves after receipt
- funds are released

Primary integration path: React SDK.
Secondary: Escrow Viewer for proof and Backoffice for setup/testing.
Use Blocks SDK only selectively as reference or to borrow wallet/UI scaffolding if blocked.

Deal pages must show:

- contract ID
- network
- asset
- amount
- current escrow state
- next required action
- Escrow Viewer CTA when available

Before implementation, confirm exact SDK/API field names from official Trustless Work docs.