---
name: demo-state-seeding
description: Create or refresh deterministic TrustRFQ demo data for hackathon walkthroughs.
disable-model-invocation: true
allowed-tools:
  - Read
  - Edit
  - Write
  - Glob
  - Grep
  - Bash(git status)
  - Bash(git diff *)
model: opus
effort: medium
---

Prepare deterministic demo state for TrustRFQ.

Minimum demo data:

- one buyer
- two sellers
- three quotes
- one accepted quote
- one deal awaiting buyer funding
- one deal funded / seller action required
- one deal settlement sent / buyer confirmation required
- one released deal with proof-like contract ID and viewer CTA

Rules:

- Keep data realistic for OTC stablecoin settlement.
- Do not create marketplace, invoice, payroll, grants, or freelance scenarios.
- Demo states should support a fast live walkthrough without excessive manual typing.
- Never commit real secrets or real private keys.