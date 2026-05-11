---
description: Help — list all agent-forge commands and the typical flow
argument-hint: ""
---

List the agent-forge slash commands available in this project and the typical usage flow. Don't run anything.

Commands:

- `/forge-start`  — boot orchestrator + dashboard (Opus 4.7 for dev/QC, Haiku for triage)
- `/forge-stop`   — shut down both servers
- `/forge-submit <text>` — submit a request in natural language; I'll classify it, POST it, and tail to completion
- `/forge-status` — health + recent requests + cost totals + leaderboard
- `/forge-tail [N]` — show last N raw SSE events

Typical flow:

1. `/forge-start`
2. open http://localhost:3000 (board) and http://localhost:3000/decisions (rationale log) in a browser
3. `/forge-submit "change the kanban card hover color to brighten slightly"`
4. watch the events; when done, review the commit and cost
5. `/forge-stop` when done

Cost note: Opus 4.7 dev/QC is ~5× Sonnet — a single PM-breakdown feature can run $5–15. Use `/forge-status` to monitor spend; stop and switch to Sonnet (unset `AGENT_FORGE_MODEL`) if you want cheaper runs.
