---
description: Stop the running agent-forge orchestrator and dashboard
argument-hint: ""
---

Shut agent-forge down cleanly.

1. Find the background tasks running `pnpm orchestrator` and `pnpm dashboard` (use TaskList if available, otherwise grep for the processes via `ps aux | grep -E "agent-forge.*(orchestrator|dashboard)"`).
2. Stop them with `TaskStop` if they're background-tracked tasks. Otherwise `kill <pid>` for each.
3. Confirm both ports are free:
   - `curl -sf http://127.0.0.1:4317/health` should fail
   - `curl -sf http://127.0.0.1:3000/` should fail
4. Tell the user the system is stopped. The next `/forge-start` will recover any in-flight tasks marked as `blocked`.
