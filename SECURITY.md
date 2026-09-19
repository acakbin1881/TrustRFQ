# Security policy

TrustRFQ targets **Stellar Testnet only** and has not been audited. Do not use it with real funds.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private
vulnerability reporting on this repository ("Security" tab, "Report a vulnerability").
You will get an acknowledgement within a week.

## In scope

- The settlement contracts (`contracts/rfq_swap`, `contracts/otc_swap`) and the maker
  registry (`contracts/rfq_registry`): any way to settle terms that were not signed, to
  replay a signed entry, to charge more than the signed fee, or to withdraw stake that
  was not paid.
- Quote validation and settlement in `packages/sdk`: any quote that reaches a wallet
  prompt without passing every check, or any transaction the SDK signs that differs
  from the validated quote.
- The desk's signing paths in `apps/desk/src/core` and `apps/desk/src/wallet`.

## Out of scope

- Public reads of the Supabase coordination database (an accepted Testnet trade-off).
- Availability of the reference maker server or of Testnet itself.
- Findings that require a compromised wallet extension or browser.

There is no bounty programme at this stage.
