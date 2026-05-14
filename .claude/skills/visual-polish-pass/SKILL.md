---
name: visual-polish-pass
description: Review and improve a finished TrustRFQ UI slice for premium fintech/Web3 quality, visual hierarchy, spacing, and product clarity.
context: fork
disable-model-invocation: true
allowed-tools:
  - Read
  - Edit
  - Glob
  - Grep
  - Bash(git status)
  - Bash(git diff *)
model: opus
effort: high
---

Run a product-specific visual polish pass.

Evaluate:

- trust problem legibility within five seconds
- hierarchy of primary action vs secondary details
- spacing rhythm and alignment
- typography scale and density
- state chips and banners
- above-the-fold clarity on deal/escrow pages
- whether the UI feels like private OTC settlement rather than a generic crypto dashboard

Improve only the requested slice. Do not add new product surfaces.

After editing, report:

- what became clearer
- what still feels generic
- any state gaps left unresolved