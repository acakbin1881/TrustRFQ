# Current State

Last updated: 2026-05-13

## What works now

The TrustRFQ codebase currently contains the full RFQ technical prototype copied from the existing Stellar startup work.

Working pieces:

- Private RFQ flow
- RFQ creation
- RFQ list and detail pages
- Private quote submission
- Creator-only quote visibility
- Manual quote acceptance
- Deal creation
- Deal lifecycle page
- Supabase persistence
- `rfqs`, `quotes`, `deals`, and `escrow_events` tables
- Repository layer with Supabase/mock fallback
- Mock identity selector for creator/maker testing
- Backend-state funding, settlement, refund, and event recording

## What is still temporary

- Identity is a mock switcher, not wallet auth.
- Funding and settlement buttons are backend-state tests, not Trustless Work actions yet.
- Escrow events are persisted, but escrow is not yet connected to Trustless Work.
- Existing Stellar/Soroban folders remain from the earlier technical path.
- Some UI copy may still need to be updated to TrustRFQ and the hackathon story.

## Hackathon direction

TrustRFQ should now move toward the Boundless x Trustless Work hackathon goal:

1. Polish the UI.
2. Keep the private RFQ flow intact.
3. Connect accepted deals to Trustless Work escrow primitives.
4. Show escrow state in-app.
5. Link to the Trustless Work Escrow Viewer.
6. Prepare submission docs and demo.

## What must not change accidentally

- Do not turn RFQs into public auctions.
- Do not expose competing quotes to makers.
- Do not auto-select a winner.
- Do not turn the app into an AMM/swap UI.
- Do not replace the product with a generic escrow builder.

## Verification status

Previous technical prototype status indicated lint/build and Supabase flow were working. Re-run checks after any code changes:

```powershell
npm.cmd run lint
npm.cmd run build
```

No code was changed by this documentation update.

## Research reminder

The user will provide GPT Deep Research material. Update this file when the final problem statement, target user, and market evidence are ready.