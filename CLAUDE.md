# agent-forge

Multi-agent engineering pipeline that runs natively inside Claude Code via `Task` subagents. The user invokes `/forge "<request>"`; an orchestrator skill triages, decomposes (PM), dispatches parallel specialists, runs QC reviewers, and auto-fixes findings — all in one Claude Code session with no external services.

## Layout

```
.claude-plugin/plugin.json     # Plugin manifest
.claude/
  commands/forge.md            # /forge entry point
  skills/forge/SKILL.md        # Pipeline orchestration logic (read this for the flow)
  agents/                      # 13 native subagents (triage, pm, 7 devs, 4 QC)
legacy/                        # Previous external system (Node orchestrator + Next.js dashboard + SQLite) — kept for reference, NOT used by the native pipeline
```

## How a /forge invocation flows

1. User: `/forge "<request>"` → invokes `.claude/commands/forge.md`
2. That command instructs the assistant to invoke the `forge` skill
3. The skill's body becomes the orchestration instructions for THIS conversation
4. The assistant spawns subagents via `Task(subagent_type: "<name>", prompt: "...")` calls
5. **Parallel layers** = multiple Task calls in one assistant message; **sequential** = separate messages
6. Subagents return structured output (JSON for triage/pm/qc, `TASK_DONE` / `ESCALATE:` for devs)
7. Skill emits one consolidated summary at the end

## Subagent roles

- `triage` (haiku) — routing + complexity verdict, JSON output, read-only
- `pm` (sonnet) — multi-domain subtask decomposition, JSON output, read-only
- Devs (sonnet, Read/Edit/Write/Bash): `frontend`, `backend`, `database`, `devops`, `daemon`, `ux`, `ai` — each with scoped allowed paths in the prompt body
- QC (sonnet, read-only, JSON): `qc-edgecase`, `qc-security`, `qc-perf`, `qc-ux`

## Editing rules

- New role or QC reviewer → add an `.md` file under `.claude/agents/` with frontmatter `name | description | model | tools`. Reference it from `.claude/skills/forge/SKILL.md` routing.
- Pipeline shape changes → edit `.claude/skills/forge/SKILL.md` only.
- Do NOT touch `legacy/` to change behavior — that's the previous external system and is unwired.

## What legacy/ used to do (for context)

External Node daemon `apps/orchestrator` + Next.js `apps/dashboard` + SQLite at `data/app.db`. Triage / dispatch / Ralph Loop / git worktrees / cost tracking / FTS5 handover search all lived there. The current native pipeline trades those features for clean parent-chat output (subagent isolation), zero infra, and instant install.
