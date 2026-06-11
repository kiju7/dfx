# dfx

Multi-agent engineering pipeline that runs natively inside Claude Code via `Task` subagents. The user invokes `/dfx:run "<request>"` (plugin commands are namespaced `/<plugin>:<command>`); an orchestrator skill triages, decomposes via Tech Lead (which reads code first), dispatches parallel specialists, runs QC reviewers, and auto-fixes findings — all in one Claude Code session with no external services.

## Layout

```
.claude-plugin/
  plugin.json                  # Plugin manifest
  marketplace.json             # Marketplace entry — enables /plugin install
skills/run/SKILL.md          # /dfx:run entry point + pipeline orchestration (read this for the flow)
agents/                        # 13 native subagents (triage, lead, 7 devs, 4 QC)
```

Claude Code 플러그인은 **플러그인 루트** 의 `agents/`, `skills/` 를 자동 스캔. `.claude/` 안에 넣으면 안 잡힘. 진입점은 `run` 스킬 — 별도 command 파일 없음 (커맨드명이 플러그인명과 겹쳐 `/dfx:dfx` 로 중복되던 문제를 피하려 스킬을 `run` 으로 둠 → `/dfx:run`).

## How a /dfx:run invocation flows

1. User: `/dfx:run "<request>"` → invokes the `run` skill (`skills/run/SKILL.md`) directly; the request arrives as `$ARGUMENTS`
2. The skill's body becomes the orchestration instructions for THIS conversation
3. The assistant spawns subagents via `Task(subagent_type: "<name>", prompt: "...")` calls
4. **Parallel layers** = multiple Task calls in one assistant message; **sequential** = separate messages
5. Subagents return structured output (JSON for triage/lead/qc, `TASK_DONE` / `ESCALATE:` / `SUGGEST_REVISION:` for devs)
6. Skill emits one consolidated summary at the end

## Subagent roles

- `triage` (haiku) — routing decision, JSON output, read-only
- `lead` (fable) — Tech Lead. Reads code first, then decomposes into sub-tasks. May escalate ambiguity to user. JSON output, read-only. Highest reasoning load (decomposition / per-subtask model tier / Acceptance Review), so runs on Claude Fable 5.
- Devs (Read/Edit/Write/Bash): `frontend`, `backend`, `database`, `devops`, `daemon`, `ux`, `ai` — each with scoped allowed paths in the prompt body. Frontmatter default model is `opus`; the **Tech Lead assigns a per-subtask difficulty `tier` (`standard` | `deep`)** which the orchestrator maps to a `Task` `model` override at dispatch (`standard`→opus, `deep`→fable; falls back to opus if the runtime rejects per-call override / `fable`).
- QC (sonnet, read-only, JSON): `qc-edgecase`, `qc-security`, `qc-perf`, `qc-ux`

## Editing rules

- New role or QC reviewer → add an `.md` file under `agents/` with frontmatter `name | description | model | tools`. Reference it from `skills/run/SKILL.md` routing.
- Pipeline shape changes → edit `skills/run/SKILL.md` only.
- Per-run audit log lives at `_workspace/<run-id>/` (gitignored). Each phase appends a file: `00-request.md`, `01-triage.json`, `02-plan.json`, `03-impl/`, `04-qc/`, `05-ralph/`, `06-review/`, `99-summary.md`.
- Tech Lead has 6 modes (see `agents/lead.md`): initial plan / user-escalation / dev-SUGGEST_REVISION handling / **Acceptance Review** (Ralph 수렴 패턴, APPROVE 까지 반복) / **Bug Triage & Reproduction** (kind=bug + 재현 불명 시 dev/QC 한테 repro task 발주 후 plan) / **Verification Choice** (검증 방식 선택지가 의미있을 때 사용자에게 informed question).
- Dev / QC subagents have a special `Repro 모드` activated when their sub-task has `kind: "repro"` — they investigate (not change code) and return `REPRO_REPORT` instead of `WORK_SUMMARY` / findings.
