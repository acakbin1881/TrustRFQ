---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 0
total_count: 2
last_updated: 2026-09-14T12:14:24.683Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 03 | deviation | docs/evidence/live-rfq-run.json |  | Canonical Task 3 run's cspViolations is non-empty (12 entries) — all pre-existing dead/orphaned rfq_registry entries (127.0.0.1:4610, localhost:4174/4175/4180), never the maker origin; applies the human-approved 03-02 precedent. | open |  | 2026-09-14T12:14:24.630Z |  |
| 2 | 03 | deviation | tools/e2e/rfq-driver.mjs |  | npm run e2e:rfq (stub lane) fails deterministically at d12-slow in this session; reproduced identically on unmodified HEAD (diff-equivalence proof), confirmed pre-existing/environmental, not caused by 03-03's changes. See deferred-items.md. | open |  | 2026-09-14T12:14:24.683Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "03",
    "file": "docs/evidence/live-rfq-run.json",
    "line": null,
    "description": "Canonical Task 3 run's cspViolations is non-empty (12 entries) — all pre-existing dead/orphaned rfq_registry entries (127.0.0.1:4610, localhost:4174/4175/4180), never the maker origin; applies the human-approved 03-02 precedent.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-14T12:14:24.630Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "03",
    "file": "tools/e2e/rfq-driver.mjs",
    "line": null,
    "description": "npm run e2e:rfq (stub lane) fails deterministically at d12-slow in this session; reproduced identically on unmodified HEAD (diff-equivalence proof), confirmed pre-existing/environmental, not caused by 03-03's changes. See deferred-items.md.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-14T12:14:24.683Z",
    "resolved_at": null
  }
]
````
