---
name: landing-page
description: Design and implement the TrustRFQ landing/demo entry page with a Mercury-inspired premium fintech first viewport. Use when building or refining the home page.
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
model: opus
effort: high
---

Build or refine the TrustRFQ landing/demo entry page requested in $ARGUMENTS.

This is not a generic marketing landing page. It is the first screen of a private OTC settlement workspace.

Mercury-inspired qualities to borrow:

- calm premium fintech feeling
- serious money movement tone
- soft but confident typography
- generous spacing
- subtle animated grid/square movement
- cards that feel alive without becoming playful
- gentle color transitions inside product visuals
- strong first-viewport product visual that explains the product immediately
- restrained motion, not flashy crypto animation

Do not copy Mercury's exact layout, copy, brand, colors, or components.

Required first-viewport content:

- TrustRFQ product identity
- headline around private OTC settlement without blind trust
- supporting copy explaining private RFQ -> private quotes -> accepted quote -> escrow-backed deal -> proof
- primary CTA: Browse RFQs
- secondary CTA: Create RFQ
- Boundless x Trustless Work hackathon badge
- large animated product mockup showing:
  - RFQ card
  - accepted quote card
  - escrow state panel
  - contract ID / proof card
  - Escrow Viewer CTA placeholder
  - next action text

Required page sections:

1. Hero + animated product visual
2. Trust problem before/after
3. How it works
4. Live deal preview
5. Final CTA

Design rules:

- premium fintech/Web3
- serious, private, high-trust
- dark/deep navy base is acceptable
- use restrained teal/blue/green accents
- status colors must have meaning
- cards should be dense but readable
- motion should be slow and polished

Avoid:

- generic escrow dashboard
- public marketplace feel
- freelancer/project/task/invoice language
- KYC/compliance pages
- AMM/swap UI
- order book UI
- analytics dashboard cards
- random decorative crypto gradients
- overbuilt navigation

Implementation constraints:

- Use the existing Next.js/Tailwind app.
- Only edit the landing page and shared styling if absolutely needed.
- Preserve existing routes and app logic.
- Do not modify Supabase, RFQ repository, identity logic, or deal logic.

Before editing:

- inspect the current home page and global styles,
- list exact files to change,
- describe the first-viewport composition in 5 bullets.

After editing:

- run lint,
- explain which Mercury-inspired elements were used,
- list any remaining weak or generic parts.