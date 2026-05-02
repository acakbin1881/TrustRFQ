#!/usr/bin/env bash
# docs-gate.sh — blocks Claude Code from finishing if source files changed
# without a corresponding update to docs/03-CURRENT-STATE.md or docs/04-NEXT-TASK.md.
#
# Configured as a Stop hook in .claude/settings.json.
# Exit 2 blocks the stop. Messages go to stderr so Claude sees them.
#
# Manual run: bash scripts/docs-gate.sh

CHANGED=$(git status --porcelain 2>/dev/null | awk '{print $2}')

# No app/source changes → nothing to enforce
APP_CHANGED=$(echo "$CHANGED" | grep -E "^(apps/|contracts/|packages/|src/)")
[ -z "$APP_CHANGED" ] && exit 0

# Both required docs updated → all good
DOC03=$(echo "$CHANGED" | grep -F "docs/03-CURRENT-STATE.md")
DOC04=$(echo "$CHANGED" | grep -F "docs/04-NEXT-TASK.md")
[ -n "$DOC03" ] && [ -n "$DOC04" ] && exit 0

# Missing updates — print to stderr and block
{
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  DOCS GATE — update required before this task is complete   ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
  echo "Source files changed:"
  echo "$APP_CHANGED" | sed 's/^/  /'
  echo ""
  echo "Missing doc updates:"
  [ -z "$DOC03" ] && echo "  docs/03-CURRENT-STATE.md  ← update What works / What is mocked"
  [ -z "$DOC04" ] && echo "  docs/04-NEXT-TASK.md       ← update next steps if they changed"
  echo ""
  echo "Update the above files, then Claude can finish."
} >&2

exit 2
