---
description: Enter agent-forge interactive mode — auto-boots the system, then treats every following message as a request
argument-hint: "[optional first request]"
---

You are now in **agent-forge interactive mode**. From this point on, treat every subsequent user message in this session as a description of a task to submit to agent-forge, unless it's an obvious meta-command (see below). The user does NOT prefix follow-up messages with any slash command.

## This message — auto-boot

1. **Check whether agent-forge is already up:**
   - `curl -sf http://127.0.0.1:4317/health` — orchestrator
   - `curl -sf http://127.0.0.1:54317/` — dashboard
   If both respond, skip to step 3.

2. **If anything is down**, start it as a background process with the Bash tool (`run_in_background=true`):
   - Orchestrator: `cd /Users/jd-kimkiju/Projects/agent-forge && pnpm orchestrator`
     (Do NOT set `AGENT_FORGE_MODEL` — auto-tier picks the model per task.)
   - Dashboard: `cd /Users/jd-kimkiju/Projects/agent-forge && pnpm dashboard`
   Poll until both endpoints respond.

3. **Welcome:**
   ```
   agent-forge ready · auto-tier (Sonnet default, Opus on complex) · http://localhost:54317
   Describe your task; I'll classify, submit, and report.
   Meta: "status" · "stop" · "tail" · "last" · "switch to opus/sonnet" · "help".
   ```

4. **Handle the first request** in `$ARGUMENTS` if non-empty: treat as a task description (see "Task descriptions" below). Otherwise wait.

## For every subsequent user turn

### Task descriptions (default — anything that doesn't match a meta below)

1. **Classify** into `bug | feature | qc | fix`:
   - `fix` — small, single-domain, clear scope
   - `bug` — defect report (may need diagnosis)
   - `feature` — new functionality (likely PM-breakdown)
   - `qc` — explicit quality check / audit
2. **Draft** a clean title (≤ 80 chars) and body_md (concise: which files/areas, expected outcome, non-obvious constraints). Don't over-explain — agents read the code themselves.
3. **POST** to `http://127.0.0.1:4317/requests` with the JSON, capture the returned `id`.
4. **Print a single live-link line** right away (no formatting block, just a plain line):

   ```
   🔗 Live: http://localhost:54317/tasks/<id>
   ```

5. **Stream events with Monitor**, NOT a bash tail loop. Strict rules:
   - Run exactly **one** Monitor tool on `tail -F /Users/jd-kimkiju/Projects/agent-forge/data/events.ndjson | grep -E '"(requestId|taskId)":"<id>|<known-task-ids>"'` (use a single grep that grows as new task ids appear, or simpler — match the requestId).
   - Each notification = one line from `events.ndjson`. **Render one short text line per notification** in your reply. Do NOT batch, do NOT include the raw JSON, do NOT call TaskOutput to snapshot.
   - Render mapping (see emoji table below).
   - Stop the Monitor when `request.status_changed` reaches `done` or `blocked` (use `stop_pattern` in Monitor with regex like `"request\.status_changed".*"(done|blocked)"`).
   - Hard cap: 540s. If Monitor times out, print `⌛ timeout — see browser dashboard` and stop.

6. **Summary at end** (single message after Monitor exits):
   - Final status, new commits (`git log --oneline -5`)
   - Total cost (`SELECT SUM(cost_usd) FROM task_costs WHERE request_id='<id>' OR task_id IN (SELECT id FROM tasks WHERE request_id='<id>')`)
   - Findings count (resolved / total)
   - Decisions worth surfacing

7. **Warn proactively** if cost > $5 or wall-clock > 8 minutes.

#### Line-by-line rendering — strict format

Agent role emojis:
- triage 🧭 · pm 📋 · frontend 🎨 · backend 🛠 · database 🗄 · devops 🚀
- daemon ⚙️ · ux ✨ · ai 🤖 · qc 🔍 · orchestrator/ralph 🔁

One event → exactly one line. **No code blocks, no bullets, no nesting.** Indent activity lines with three spaces:

| Event kind                        | Render this single line |
|---|---|
| `request.received`                | (skip — already covered by step 4 link line) |
| `request.status_changed`          | `▶ <to>` (e.g. `▶ executing`) once, but skip `triage→executing` if it's right after task.created |
| `task.created` (agent X starts)   | `<emoji> <DisplayName>  ▸ <title-short>` (no body) |
| `task.status_changed` qc→done     | `   ✓ <agent> done` |
| `task.status_changed` qc→blocked  | `   ⤴ <agent> blocked` |
| `task.status_changed` qc→failed   | `   ✗ <agent> failed` |
| `agent.activity` reading          | `   📂 <target>` |
| `agent.activity` editing          | `   ✏️ <target>` |
| `agent.activity` writing          | `   📝 <target>` |
| `agent.activity` searching        | `   🔎 <target>` |
| `agent.activity` running          | `   🐚 <target>` (Bash head ≤ 60 chars) |
| `agent.activity` fetching         | `   🌐 <target>` |
| `agent.activity` other            | `   · <tool>` |
| `qc.finding`                      | `   ⚠️ <severity>/<category> — <title>` (omit nit) |
| `ralph.iteration`                 | `🔁 <agent> Ralph iter <N>` |
| `ralph.exit qc_passed`            | `   ✓ resolved` |
| `ralph.exit max_iter`             | `   ✗ exhausted` |
| `ralph.exit aborted`              | `   ⤴ escalated` |

Hard rule: **no JSON, no Markdown headings, no Task Output snapshots, no bash `until` loops in foreground.** Just plain text lines, indented as above. The browser at `http://localhost:54317/tasks/<id>` is the rich view; chat is the lightweight tail.

Noise suppression: same-target reading/searching called 3+ times in <5s → emit only the first; keep a tiny in-memory set and skip duplicates.

End example:

```
🔗 Live: http://localhost:54317/tasks/01KRAMPM95...
🧭 Triage ▸ direct · frontend · complexity=simple
🎨 Frontend Lead  ▸ Kanban card hover brightness
   📂 apps/dashboard/app/globals.css
   ✏️ apps/dashboard/app/globals.css
   🐚 pnpm --filter @agent-forge/dashboard build
   ✓ frontend-lead done
🔍 qc-edgecase  ▸ review
🔍 qc-ux        ▸ review
   ⚠️ minor/ui — hardcoded color literals
🔁 frontend-lead Ralph iter 1
   ✏️ apps/dashboard/app/globals.css
   ✓ resolved
▶ done
```

Final summary message after that (cost / commit / findings).

### Meta-actions (Korean and English literal intents)

- **`status` / `상태`** — health check + per-status task counts + 24h cost + top-5 QC leaderboard + active worktrees. Use SQLite queries against `data/app.db`.

- **`tail` / `tail N` / `이벤트` / `방금 뭐 했어`** — `tail -n N data/events.ndjson` (default 30), render as table with timestamp + kind + key payload fields.

- **`stop` / `종료` / `꺼`** — stop the **orchestrator only** (kill the `pnpm orchestrator` background task or `kill $(lsof -ti:4317)`). **Leave the dashboard running** so the user can still browse history at http://localhost:54317. Confirm: 4317 free, 54317 still up.

- **`stop all` / `전부 종료` / `대시보드도 꺼`** — stop both orchestrator (4317) and dashboard (54317). Confirm both ports free.

- **`stop dashboard` / `대시보드만 꺼`** — stop the dashboard only (rare, mainly for port reclaim).

- **`last` / `마지막` / `최근 결과`** — most recent terminal request: id, commits, cost breakdown, key decisions, handover doc path if any.

- **`switch to opus` / `오푸스로`** — stop, then start with `AGENT_FORGE_MODEL=claude-opus-4-7 pnpm orchestrator`. Confirm boot log shows the override.
- **`switch to sonnet` / `소넷으로`** — stop, then restart **without** any `AGENT_FORGE_MODEL` env (returns to auto-tier with Sonnet baseline).
- **`switch to auto` / `자동으로`** — same as switch to sonnet (auto-tier is the default behavior).

- **`help` / `도움`** — list the meta-actions briefly.

- **`exit` / `quit` / `끝` / `bye`** — leave interactive mode. Do NOT stop the servers; just stop treating subsequent messages as tasks. The user can still resume with `/forge`.

### Ambiguous (one word, a question, etc.)

If you can't tell whether something is a task or a meta-action, ask once: "task로 받을까요, 아니면 status/stop/tail 같은 거 의도하셨나요?" instead of guessing.

## Behavior notes

- Stay in interactive mode until the user types exit/끝/bye, or the conversation clearly moves to unrelated topics.
- Don't auto-submit anything in the boot step — only honor `$ARGUMENTS`.
- Never silently switch models mid-stream; only via the explicit meta commands.
