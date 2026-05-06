# Next Task

Last updated: 2026-05-05

---

## Immediate next step

Create the detailed Milestone 3 implementation plan for Stellar-only XLM/USDC bilateral escrow settlement.

Milestone 2 is complete: Supabase persistence, identity-switcher testing, quote acceptance, deal creation, escrow event recording, expired RFQ synchronization, lint, build, and backend audit all passed.

M3 is now the core StellarBig settlement path:

- only Stellar chain
- only XLM/USDC pair for this milestone
- both sides fund escrow
- settlement releases XLM to quote maker and USDC to RFQ creator
- refund returns each side's own deposit after expiry

Trustless Work P2P escrow is moved to Milestone 4 because its documented P2P/OTC model is one-sided stablecoin escrow, not the first core XLM/USDC bilateral settlement target.

Use `docs/06-M3-XLM-USDC-ESCROW-PLAN.md` as the starting plan.

Before coding M3, define:

- whether M3 begins with a custom Soroban contract or a contract-interface plan
- how native XLM and issued USDC are represented
- which Stellar testnet USDC asset/issuer will be used
- which Supabase fields are needed for contract IDs and tx hashes
- which deal page buttons become wallet-signed actions
- how settlement is blocked until both sides are funded
- how expiry and refund are represented in UI and Supabase

---

## Product model to preserve

- Private RFQ, not public auction.
- RFQ creator sees submitted quotes.
- Makers cannot see competing quotes.
- RFQ creator manually accepts one valid quote.
- Accepted quote creates one bilateral escrow deal.
- RFQ creator funds the RFQ sell side.
- Quote maker funds the quoted receive side.
- Settlement uses escrow settlement with atomic final release for the XLM/USDC path.

---

## Still out of scope until explicitly planned

- Trustless Work integration code in M3.
- Mainnet.
- Production auth.
- Production RLS hardening.
- Fiat rails.
- BTC or non-Stellar assets.
- Asset pairs beyond XLM/USDC.