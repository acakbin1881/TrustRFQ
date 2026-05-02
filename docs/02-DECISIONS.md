# Product & Architecture Decisions

Key decisions made during this project, with reasons.

---

## Private RFQ, not public auction

**Decision:** Quotes are hidden from competing makers. The RFQ creator sees all quotes; takers cannot see each other's quotes.

**Reason:** This is OTC behavior. Public bidding would turn this into an auction. OTC trades are negotiated privately between two counterparties. The product must reflect that.

---

## Stellar Testnet only for MVP

**Decision:** No mainnet. Testnet only until contract is audited and E2E flow is proven stable.

**Reason:** Smart contract bugs on mainnet cost real money with no recovery path.

---

## Soroban for escrow

**Decision:** The escrow contract is a single Soroban contract deployed once on testnet. Each deal is an instance keyed by a unique deal ID.

**Reason:** Soroban is Stellar's native smart contract platform. Keeps everything on one chain.

---

## Supabase for off-chain state

**Decision:** RFQs, quotes, and deals are stored in Supabase. The contract only holds escrow state.

**Reason:** On-chain storage is expensive and slow for negotiation flow. Off-chain DB handles the RFQ/quote lifecycle; on-chain handles custody and settlement.

---

## Freighter for wallet

**Decision:** Freighter is the only supported wallet for MVP.

**Reason:** Freighter is the standard Stellar browser wallet. Adding more wallets is out of MVP scope.

---

## No dispute resolution

**Decision:** The contract state machine handles all outcomes. No human arbitration.

**Reason:** Disputes add trusted third parties, which defeats the purpose of escrow. The rules are simple enough that disputes should not occur: either both funded and settled, or expired and refunded.

---

## Minimum receive amount is a hard floor

**Decision:** Quotes below the RFQ's minimum receive amount are invalid and cannot be accepted.

**Reason:** The maker set a minimum for a reason. Accepting below-minimum quotes would violate the maker's stated terms.

---

## RFQ creator manually accepts one valid quote

**Decision:** The best quote does not automatically win. The RFQ creator reviews all valid quotes and manually accepts one.

**Reason:** OTC trades are negotiated, not auctioned. The counterparty relationship, timing, and trust matter — not just price. Automatic winner selection would turn this into an auction.

---

## Accepted quote closes the RFQ

**Decision:** When the RFQ creator accepts a quote, the RFQ status changes to closed and all other quotes are effectively rejected. A deal is created.

**Reason:** An RFQ can only result in one deal. Accepting one quote implicitly closes all others.

---

## Deal moves into escrow settlement

**Decision:** Once a deal is created from an accepted quote, both parties must deposit their assets into the Soroban escrow contract. Settlement is atomic. Refund is available after expiry.

**Reason:** This is the core safety guarantee of the product. Neither party needs to trust the other — the contract enforces the swap.
