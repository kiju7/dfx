---
task_id: 01KRA7653FFZ0XWKP2EGJ6FPK4
agent_id: pm-lead
date: 2026-05-11
tags: [pm]
---

# Add /version: orchestrator endpoint + dashboard footer label

(no summary)

## Commit

`743b94f`

```diffstat
apps/dashboard/app/layout.tsx       |   1 +
 apps/dashboard/tsconfig.tsbuildinfo |   2 +-
 apps/orchestrator/src/dispatcher.ts | 277 ++++++++++++++++++++++++++----------
 apps/orchestrator/src/triage.ts     |  22 ++-
 package.json                        |   3 +-
 packages/db/src/queries/index.ts    |   1 +
 packages/shared/src/agent.ts        |  14 ++
 scripts/smoke.ts                    |  77 +++++++---
 8 files changed, 297 insertions(+), 100 deletions(-)
```

## QC findings (0)

_None._

## Ralph runs (0)

_None._
