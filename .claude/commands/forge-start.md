---
description: Boot agent-forge orchestrator + dashboard (Opus 4.7 for dev/QC, Haiku for triage)
argument-hint: ""
---

Boot agent-forge inside this Claude Code session.

1. Check whether the servers are already up:
   - `curl -sf http://127.0.0.1:4317/health` — orchestrator
   - `curl -sf http://127.0.0.1:3000/` — dashboard
   If both respond, tell the user "already running" and stop.

2. Otherwise, start them as background processes using the Bash tool with `run_in_background=true`:
   - `cd /Users/jd-kimkiju/Projects/agent-forge && AGENT_FORGE_MODEL=claude-opus-4-7 pnpm orchestrator`
   - `cd /Users/jd-kimkiju/Projects/agent-forge && pnpm dashboard`

3. Wait until `curl -sf http://127.0.0.1:4317/health` and `curl -sf http://127.0.0.1:3000/` both succeed (poll with `until ... do sleep 1; done`).

4. Report:
   - `orchestrator: http://127.0.0.1:4317`
   - `dashboard:    http://localhost:3000`
   - model override (read the orchestrator's stdout log to confirm Opus is active)
   - the two background task IDs so the user can reference them for `/forge-stop`.

Do NOT submit a sample request. Just confirm the system is up.
