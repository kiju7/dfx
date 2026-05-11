# agent-forge

Multi-agent engineering pipeline that runs natively inside Claude Code via `Task` subagents. The user invokes `/forge "<request>"`; an orchestrator skill triages, decomposes via Tech Lead (which reads code first), dispatches parallel specialists, runs QC reviewers, and auto-fixes findings — all in one Claude Code session with no external services.

## Layout

```
.claude-plugin/
  plugin.json                  # Plugin manifest
  marketplace.json             # Marketplace entry — enables /plugin install
commands/forge.md              # /forge entry point
skills/forge/SKILL.md          # Pipeline orchestration logic (read this for the flow)
agents/                        # 13 native subagents (triage, lead, 7 devs, 4 QC)
```

Claude Code 플러그인은 **플러그인 루트** 의 `commands/`, `agents/`, `skills/` 를 자동 스캔. `.claude/` 안에 넣으면 안 잡힘.

## How a /forge invocation flows

1. User: `/forge "<request>"` → invokes `commands/forge.md`
2. That command instructs the assistant to invoke the `forge` skill
3. The skill's body becomes the orchestration instructions for THIS conversation
4. The assistant spawns subagents via `Task(subagent_type: "<name>", prompt: "...")` calls
5. **Parallel layers** = multiple Task calls in one assistant message; **sequential** = separate messages
6. Subagents return structured output (JSON for triage/lead/qc, `TASK_DONE` / `ESCALATE:` / `SUGGEST_REVISION:` for devs)
7. Skill emits one consolidated summary at the end

## Subagent roles

- `triage` (haiku) — routing decision, JSON output, read-only
- `lead` (opus) — Tech Lead. Reads code first, then decomposes into sub-tasks. May escalate ambiguity to user. JSON output, read-only.
- Devs (opus, Read/Edit/Write/Bash): `frontend`, `backend`, `database`, `devops`, `daemon`, `ux`, `ai` — each with scoped allowed paths in the prompt body
- QC (sonnet, read-only, JSON): `qc-edgecase`, `qc-security`, `qc-perf`, `qc-ux`

## Editing rules

- New role or QC reviewer → add an `.md` file under `agents/` with frontmatter `name | description | model | tools`. Reference it from `skills/forge/SKILL.md` routing.
- Pipeline shape changes → edit `skills/forge/SKILL.md` only.
- Per-run audit log lives at `_workspace/<run-id>/` (gitignored). Each phase appends a file: `00-request.md`, `01-triage.json`, `02-plan.json`, `03-impl/`, `04-qc/`, `05-ralph/`, `06-review/`, `99-summary.md`.
- Tech Lead has 4 modes (see `agents/lead.md`): initial plan / user-escalation / dev-SUGGEST_REVISION handling / **Acceptance Review** (Ralph 수렴 패턴, APPROVE 까지 반복).
