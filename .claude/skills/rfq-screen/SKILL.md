---
name: rfq-screen
description: Build or refine a TrustRFQ screen that belongs to the private RFQ + OTC stablecoin escrow workflow. Use for RFQ creation, quote comparison, accepted-deal views, or escrow state UX.
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
  - Bash(npm run typecheck)
model: opus
effort: high
---

Implement the TrustRFQ screen requested in $ARGUMENTS.

Requirements:

- Stay inside the private RFQ + OTC stablecoin escrow product.
- Do not introduce generic escrow dashboard concepts.
- Do not use freelancer, task, invoice, payroll, or marketplace listing language.
- The screen must clearly answer:
  1. what the user asked for,
  2. what counterparties offered,
  3. whether funds are locked in escrow,
  4. what action is waiting on whom,
  5. what on-chain proof exists.

Before editing:

- list required user states,
- identify reused patterns in the existing codebase,
- identify exact files to change.

After editing:

- run lint/typecheck when available,
- list any missing states,
- list any copy that still sounds generic.