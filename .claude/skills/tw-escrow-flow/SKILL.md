---
name: tw-escrow-flow
description: Implement or review the Trustless Work escrow flow for an accepted TrustRFQ quote. Use when wiring initialize, funding, milestone status, approval, release, or viewer links.
disable-model-invocation: true
allowed-tools:
  - Read
  - Edit
  - Write
  - Glob
  - Grep
  - Bash(git status)
  - Bash(git diff *)
  - Bash(npm run lint)
  - Bash(npm.cmd run lint)
  - Bash(npm run build)
  - Bash(npm.cmd run build)
model: opus
effort: high
---

Use the TrustRFQ hackathon escrow flow:

1. Off-chain RFQ and quote live in app/Supabase state.
2. Accept quote creates one deal.
3. Initialize one Trustless Work escrow for that deal.
4. Sign and send the transaction through the wallet.
5. Store `contractId` and returned escrow data immediately.
6. Buyer funds escrow.
7. Seller marks settlement sent / milestone complete.
8. Buyer approves milestone after receipt.
9. Release funds and update deal state.
10. Expose Escrow Viewer CTA wherever proof matters.

Implementation notes:

- Prefer Trustless Work React SDK as primary path.
- Use Backoffice and Escrow Viewer for setup and proof.
- Keep the UI specific to private OTC RFQ settlement.
- Do not turn the product into a generic escrow admin console.
- Show wallet disconnected, wrong network, low XLM, missing trustline, signing, and failed transaction states where relevant.
- Confirm exact SDK/API field names from official docs before coding.