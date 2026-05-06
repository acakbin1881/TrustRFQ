# Milestone 3 XLM/USDC Escrow Plan

Last updated: 2026-05-05

## Decision

Milestone 3 starts with the core StellarBig settlement path, not the Trustless Work P2P use case.

M3 is only for Stellar-chain assets and only for the XLM/USDC pair.

Trustless Work P2P escrow moves to Milestone 4 because its documented P2P/OTC pattern is a one-sided stablecoin escrow model. That may be useful later, but the first core StellarBig settlement goal is a two-sided XLM/USDC escrow path.

## M3 Goal

Build the settlement path for accepted XLM/USDC RFQ deals:

1. RFQ creator creates an RFQ for XLM/USDC.
2. Quote maker submits a USDC quote.
3. RFQ creator accepts one valid quote.
4. Deal is created in Supabase.
5. RFQ creator funds the XLM side.
6. Quote maker funds the USDC side.
7. Settlement is available only after both sides are funded.
8. Settlement releases:
   - XLM to quote maker
   - USDC to RFQ creator
9. If expiry passes before completion, each depositor can recover their own deposited asset.

## Pair Scope

Supported in M3:

- XLM -> USDC
- USDC -> XLM if the deal terms require the reverse direction

Do not generalize to every asset pair yet. Keep M3 focused on XLM/USDC so the escrow state machine and UX are easy to verify.

## Product Rules

- This is still private RFQ, not public bidding.
- Makers cannot see competing quotes.
- RFQ creator manually accepts one valid quote.
- Accepted quote creates one bilateral deal.
- Settlement is escrow-backed, not a promise to pay later.
- Neither party should receive the other side's asset until both funding conditions are satisfied.

## Required Design Questions Before Coding

Answer these before implementation:

- Will M3 use a custom Soroban contract immediately, or first define a contract interface and keep UI mocked?
- How will native XLM and issued USDC be represented in the contract interface?
- What testnet USDC asset issuer/distributor will be used?
- What exact deal fields need to be added to Supabase for escrow contract ID and transaction hashes?
- Which deal page buttons become real wallet-signed actions?
- How will the app prevent settlement before both deposits are confirmed?
- How will expiry/refund be represented in Supabase and UI?

## Expected Supabase Additions

Likely additions to `deals` or a new escrow table:

- `escrow_contract_id`
- `escrow_network`
- `rfq_creator_fund_tx_hash`
- `quote_maker_fund_tx_hash`
- `settle_tx_hash`
- `refund_tx_hash`
- `onchain_status`
- `escrow_initialized_at`

Do not add these until the M3 implementation plan is approved.

## Out Of Scope

- Trustless Work P2P escrow integration
- Fiat rails
- BTC or non-Stellar assets
- Mainnet
- Production auth/RLS hardening
- Multi-asset support beyond XLM/USDC
- Public order book or AMM behavior

## M3 Completion Criteria

M3 is complete when:

- The XLM/USDC escrow path is designed and implemented for testnet.
- Both sides must fund before settlement is possible.
- Settlement releases XLM and USDC to the correct opposite parties.
- Refund path returns each side's own deposit after expiry.
- Supabase stores the required contract/status/tx references.
- UI clearly shows funding, settlement, and refund states.
- `npm.cmd run lint` passes.
- `npm.cmd run build` passes.
- A testnet walkthrough is documented.