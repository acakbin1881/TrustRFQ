---
name: visual-polish-pass
description: Review and improve a finished TrustRFQ UI slice for premium fintech/Web3 quality, Mercury-inspired motion restraint, hierarchy, spacing, and product clarity.
context: fork
disable-model-invocation: true
allowed-tools:
  - Read
  - Edit
  - Glob
  - Grep
  - Bash(git status)
  - Bash(git diff *)
  - Bash(npm run lint)
  - Bash(npm.cmd run lint)
model: opus
effort: high
---

Run a product-specific visual polish pass.

Review the requested slice as if it will be shown live to hackathon judges.

Evaluate:

- trust problem legibility within five seconds
- whether the page feels like private OTC settlement, not generic escrow software
- first-viewport composition and product visual clarity
- typography hierarchy and line length
- spacing rhythm and alignment
- card density and scanability
- status chip meaning and contrast
- next-action hierarchy
- whether funds locked / waiting party / proof are visible
- motion restraint: animated details should explain state or add premium feel, not distract
- color discipline: restrained teal/blue/green accents, amber for attention, red only for risk/error

Mercury-inspired polish standard:

- calm
- premium
- finance-grade
- subtle movement
- confident typography
- product visual above decoration

Fix only the requested slice. Do not add new product surfaces.

After editing, report:

- what became clearer
- what still feels generic
- any missing UI states
- whether lint passed