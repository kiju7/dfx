---
description: Report agent-forge runtime state — health, recent requests, cost so far
argument-hint: ""
---

Give a one-screen status report on agent-forge.

1. **Health**: hit `http://127.0.0.1:4317/health` and `http://127.0.0.1:3000/`. Show which are up.

2. **Active model**: read the orchestrator log (latest background task output containing `agent-forge.*orchestrator`) and quote the `[orchestrator] model overrides:` line.

3. **Live tasks**: run this SQLite query and render as a small table:
   ```sql
   SELECT status, COUNT(*) AS n FROM tasks GROUP BY status ORDER BY n DESC;
   ```

4. **Recent requests** (last 10):
   ```sql
   SELECT id, type, substr(title,1,40) AS title, status, datetime(updated_at/1000,'unixepoch','localtime') AS upd FROM requests ORDER BY updated_at DESC LIMIT 10;
   ```

5. **Cost totals** (lifetime + last 24h):
   ```sql
   SELECT printf('$%.4f', SUM(cost_usd)) AS lifetime FROM task_costs;
   SELECT printf('$%.4f', SUM(cost_usd)) AS last_24h FROM task_costs WHERE created_at > (strftime('%s','now') - 86400) * 1000;
   ```

6. **QC leaderboard top 5**:
   ```sql
   SELECT agent_id, ROUND(total_points,2) AS pts, findings_count AS n FROM qc_scores ORDER BY total_points DESC LIMIT 5;
   ```

7. **Worktrees still alive** (should normally be just `main`):
   `git worktree list`.

Keep the output compact — the user just wants a glance.
