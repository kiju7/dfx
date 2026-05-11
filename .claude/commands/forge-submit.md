---
description: Submit a request to agent-forge and tail it to completion
argument-hint: "<natural language describing the change>"
---

Submit a request to agent-forge based on the user's description and report results.

User's request: $ARGUMENTS

Steps:

1. **Classify the request.** Pick the best `type` for the orchestrator from `bug` | `feature` | `qc` | `fix`:
   - `fix` — small, single-domain code change with clear scope
   - `bug` — defect report (may need diagnosis)
   - `feature` — new functionality (likely PM-breakdown)
   - `qc` — explicit quality check / audit
   Default to `fix` when unsure.

2. **Draft a clean title and body.** Title ≤ 80 chars. Body specifies which files/areas, expected outcome, and any non-obvious constraints. Keep it short — the agents will read the code.

3. **Verify the orchestrator is up** with `curl -sf http://127.0.0.1:4317/health`. If not, tell the user to run `/forge-start` first and stop.

4. **Submit** via:
   ```
   curl -X POST http://127.0.0.1:4317/requests \
     -H 'content-type: application/json' \
     -d '{"type":"<type>","title":"<title>","body_md":"<body>"}'
   ```
   Capture the returned `id`.

5. **Tail events.** Use the Bash tool to run a foreground (NOT background) `until` loop that polls `data/events.ndjson` for events whose `payload.requestId` matches the submitted id, up to 540 seconds. Print each event kind + key payload fields. Exit when `request.status_changed` reaches `done` or `blocked`.

6. **Summarize** when terminal state is reached:
   - Final status
   - New commits added (`git log --oneline -5`)
   - Total cost (query `data/app.db`: `SELECT SUM(cost_usd) FROM task_costs WHERE request_id='<id>' OR task_id IN (SELECT id FROM tasks WHERE request_id='<id>')`)
   - QC findings count (resolved / total)
   - Any decisions worth surfacing from the `decisions` table

7. **Warn proactively** if cost exceeds $5 or wall-clock exceeds 8 minutes.
