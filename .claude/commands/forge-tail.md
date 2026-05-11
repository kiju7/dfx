---
description: Tail the last N agent-forge events from data/events.ndjson
argument-hint: "[count, default 30]"
---

Show recent agent-forge SSE events.

1. Parse `$ARGUMENTS` as a positive integer (default 30 if empty or invalid).
2. `tail -n <N> /Users/jd-kimkiju/Projects/agent-forge/data/events.ndjson`.
3. For each line, extract `ts`, `kind`, and the most relevant payload fields:
   - `request.received` → requestId, title
   - `request.status_changed` / `task.status_changed` → from → to + ids
   - `task.created` / `task.assigned` → taskId, agentId
   - `qc.finding` → severity/category/title/rewardPoints/qcAgentId
   - `ralph.iteration` / `ralph.exit` → runId, iteration / reason
   - `message.new`, `artifact.added`, `agent.status_changed` — just the kind + ids
4. Format as a small table sorted oldest → newest with a human-readable timestamp.
