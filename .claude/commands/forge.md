---
description: Enter agent-forge interactive mode — boot the system, then treat every following message as a request
argument-hint: "[optional first request]"
---

You are now in **agent-forge interactive mode**. From this point on, treat every subsequent user message in this session as a description of a task to submit to agent-forge, unless it's an obvious meta-command (e.g. "stop", "status", "show last", "switch model"). The user does NOT need to prefix follow-up messages with any slash command.

Steps for THIS message only:

1. **Boot if needed.**
   - `curl -sf http://127.0.0.1:4317/health` and `curl -sf http://127.0.0.1:3000/`.
   - If either is down, start them as background processes:
     - `cd /Users/jd-kimkiju/Projects/agent-forge && AGENT_FORGE_MODEL=claude-opus-4-7 pnpm orchestrator`
     - `cd /Users/jd-kimkiju/Projects/agent-forge && pnpm dashboard`
   - Poll until both respond.

2. **Welcome the user** with a short status:
   ```
   agent-forge ready · Opus 4.7 (dev/QC) · http://localhost:3000
   ```
   Plus a one-line hint: "Describe the task in any message and I'll submit it; say 'status' / 'stop' / 'tail' / 'last' / 'switch to sonnet' for meta-actions."

3. **Handle the first request** in `$ARGUMENTS` if non-empty: treat it as a task description, classify, submit, tail to completion, and summarize (cost / commits / findings). If empty, just wait.

For every subsequent user turn while this mode is active:

- **Task descriptions** (default) — classify into `bug|feature|qc|fix`, draft title + body_md, POST to `http://127.0.0.1:4317/requests`, tail `data/events.ndjson` for that requestId until `request.status_changed` hits `done` or `blocked`, then summarize commits + cost + findings.

- **Meta-actions** — recognize these literal intents (Korean and English):
  - "status" / "상태" → run the `/forge-status` flow
  - "tail" / "이벤트" / "방금 뭐 했어" → tail last 30 events
  - "stop" / "종료" / "꺼" → kill background processes (`TaskStop`), report ports free
  - "last" / "마지막" / "최근 결과" → show the last terminal request: id, commits, cost, key decisions
  - "switch to sonnet" / "소넷으로" → tell the user to `/forge-stop`, then start a new session without `AGENT_FORGE_MODEL` set (or run start without the env var). Do not silently change models mid-stream.
  - "help" / "도움" → list the meta-actions briefly.

- **Genuinely ambiguous messages** — if you can't tell whether something is a task or a meta-action (e.g. a single word, or a question), ask the user "task로 받을까요, status/stop 같은 거 의도하셨나요?" once instead of guessing.

Warn proactively if a single request's running cost exceeds $5 or wall-clock exceeds 8 minutes.

Stay in interactive mode until the user says stop / 끝 / exit, or the conversation moves to obviously unrelated topics.
