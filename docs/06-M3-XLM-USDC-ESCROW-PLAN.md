# Trustless Work Escrow Integration Plan

## Status

Planned for the Boundless x Trustless Work hackathon.

This file replaces the old M3-first mindset for the hackathon. The current priority is not to prove a custom Stellar/Soroban settlement path first. The current priority is to make TrustRFQ a clear Trustless Work application.

## Goal

Connect accepted RFQ deals to Trustless Work escrow primitives.

The product flow should remain:

```txt
RFQ -> quote -> manual acceptance -> deal -> Trustless Work escrow -> viewer verification
```

## Why Trustless Work fits

Trustless Work provides non-custodial, milestone-based escrow primitives for stablecoins. TrustRFQ uses those primitives for a specific product: P2P OTC stablecoin deals where counterparties do not want to send first.

## Integration options to confirm

Before implementation, use official Trustless Work docs to choose the fastest reliable path:

- BackOffice dApp + Escrow Viewer for concept validation
- Blocks SDK for prebuilt UI components
- React SDK for custom frontend integration
- REST API for direct integration
- MCP/AI-native tooling if useful during development

## Deal to escrow mapping

An accepted RFQ deal should map into an escrow payload with:

- Maker/RFQ creator address
- Taker/quote maker address
- Asset and amount terms
- Funding requirement
- Unlock condition
- Expiry/refund path
- Escrow Viewer reference

Exact field names must come from the selected Trustless Work SDK/API docs.

## Supabase additions to consider

Do not add these until implementation is approved, but likely fields include:

- `trustless_work_escrow_id`
- `trustless_work_status`
- `escrow_viewer_url`
- `escrow_created_at`
- `escrow_last_synced_at`
- `release_tx_hash`
- `refund_tx_hash`

These may go on `deals` or a new escrow table depending on the final integration shape.

## UI requirements

Deal page should eventually show:

- Accepted RFQ terms
- Parties
- Escrow status
- Funding/release/refund state
- Escrow id
- Button/link to Escrow Viewer

## Demo acceptance criteria

The hackathon demo is strong if:

- The product is clearly TrustRFQ, not the old prototype name.
- The RFQ flow remains understandable.
- Accepted quote creates or references a Trustless Work escrow.
- Escrow status is visible in the app.
- Escrow Viewer verifies the state.
- The unlock condition is clear.

## Research reminder

Update the problem and solution language after the GPT Deep Research pass. This file should eventually explain the exact user segment and why Trustless Work escrow solves their specific trust problem.