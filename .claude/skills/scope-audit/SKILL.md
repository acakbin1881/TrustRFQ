---
name: scope-audit
description: Audit changed files for product drift away from TrustRFQ's private RFQ + OTC stablecoin escrow focus.
disable-model-invocation: true
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash(git status)
  - Bash(git diff *)
model: opus
effort: high
---

Run a hard anti-bloat audit.

Flag any changed route, component, copy, or interaction that drifts toward:

- generic escrow dashboard
- freelance marketplace
- invoice tool
- payroll product
- grants tool
- crowdfunding app
- public exchange
- public marketplace
- admin analytics
- KYC/compliance suite
- notification center
- fiat onramp
- multi-chain abstraction

Also check that important pages answer:

- who is waiting on whom
- whether funds are locked
- what action is next
- what on-chain proof exists

Report findings by file and suggest the smallest correction.