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

4. **Print one quiet line** with the live dashboard link, then go silent:

   ```
   🔗 http://localhost:54317/tasks/<id>  ·  live activity in the browser
   ```

5. **Wait for completion — quietly.** This is the part most prone to chat pollution; follow these rules strictly:

   - Run **exactly one Bash command in the background** that does the actual waiting. Use this pattern (substitute `<id>`):

     ```bash
     REQ=<id>
     until grep -q "\"request\.status_changed\".*\"requestId\":\"$REQ\".*\"to\":\"\(done\|blocked\)\"" \
       /Users/jd-kimkiju/Projects/agent-forge/data/events.ndjson 2>/dev/null; do sleep 4; done
     ```

   - **Do NOT** start Monitor. **Do NOT** call TaskOutput while it runs. **Do NOT** print activity events as they arrive. The browser has the live view; chat doesn't repeat it.

   - **Optional heartbeat** — at most one short status line every 30 seconds while waiting. Plain text, no code block. Example: `… 1m 12s · 2 agents 진행 중`. If you'd rather stay silent, that's also fine. Never emit more than one heartbeat in any 25-second window.

   - Hard wall-clock cap **540s**. If exceeded, print `⌛ timeout — http://localhost:54317/tasks/<id>` and stop.

6. **One consolidated summary** when the wait command exits (a single message — no streaming):

   ```
   ▶ done · commit abc1234 · $0.18 · 1 finding resolved

   what happened
   · frontend-lead   edited apps/dashboard/app/globals.css
   · qc-ux           raised 1 minor (resolved by Ralph)

   🔗 http://localhost:54317/tasks/<id>   (full activity)
   ```

   Source the bullets from SQLite (`messages`, `qc_findings`, `git log -1`) — not from re-tailing events. Keep it to ≤ 6 bullets total. If `blocked`, say why ("ESCALATE: ..." or escalation decision) and link to /tasks/[id].

7. **Cost warning** — if `SELECT SUM(cost_usd) ...` > $5 by the time you summarize, lead the summary with `⚠ $X spent`.

Hard rules (for chat hygiene):
- **No per-event chat lines.** No emoji activity stream. No "Reading apps/dashboard/...".
- **No Monitor tool.** No TaskOutput snapshots. No bash `until` loop in the foreground.
- **No code blocks dumping JSON.** Summary uses prose / bullets only.
- The browser dashboard at `http://localhost:54317/tasks/<id>` is the live view. Chat is just "submitted → quiet → done summary".

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
