---
name: design-system
description: Create or refine TrustRFQ's specialized design system for private RFQ, quote comparison, OTC deal state, and Trustless Work escrow proof UX.
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

Create or refine a TrustRFQ-specific design system.

The design system must support a private RFQ + OTC stablecoin escrow product. It must not become a generic dashboard kit.

Define and apply patterns for:

- typography scale
- color palette
- spacing rhythm
- cards and surfaces
- status badges
- buttons
- form fields
- quote comparison tables
- deal timeline
- escrow state panels
- next-action rails
- proof / contract ID components
- wallet readiness states

Required domain components or patterns:

- TrustProblemBanner
- RfqCard
- QuoteComparisonTable
- QuoteDetailDrawer
- AcceptedQuoteHeader
- SettlementConditionCard
- CounterpartyPanel
- EscrowStatePanel
- DealTimeline
- NextActionRail
- OnChainProofCard
- WalletReadinessPanel
- ViewerLinkButton
- EventLog
- StatusBadge

Design qualities:

- premium fintech/Web3
- private trading workspace
- serious money movement
- dense but readable information
- restrained motion and color
- clear hierarchy around next action
- visible escrow proof and contract ID

Do not introduce:

- generic DashboardCard/DataWidget abstractions
- generic escrow admin patterns
- marketplace catalog cards
- freelancer/client/project/task/invoice language
- analytics cards unrelated to the RFQ/deal workflow

Before editing:

- identify current repeated UI patterns,
- decide whether a small shared component file is needed,
- name exact files to change.

After editing:

- run lint,
- report which design tokens/components were created or refined,
- report any pages still using weak/generic UI.