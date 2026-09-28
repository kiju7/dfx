# dfx

Adaptive multi-agent engineering delivery for Claude Code (v2). The user invokes `/dfx:dfx "<request>"` (plugin skills are namespaced `/<plugin>:<skill>`). The skill makes the current assistant the coordinator: it chooses the smallest useful team for the task, delegates bounded briefs to `Agent` subagents with per-task model selection, runs conditional independent review, and hands off with evidence. No fixed pipeline, no mandatory agent count, no external services.

## Layout

```
.claude-plugin/plugin.json | marketplace.json   # plugin manifest / marketplace entry
skills/dfx/SKILL.md                             # short entrypoint: work shapes, delegation, verification, handoff
skills/dfx/references/routing.md                # model selection (haiku/sonnet/opus/fable), escalation rules
skills/dfx/references/delegation.md             # Agent/Workflow adapter, decomposition, brief contract, roles as modes
skills/dfx/references/verification.md           # completion criteria, bounded recovery, Workflow loop, run.json/report.md
skills/dfx/references/domains.md                # domain checklists pasted into briefs only when relevant
agents/worker.md                                # build/explore owner (full tools, opus default, per-call model override)
agents/reviewer.md                              # read-only independent reviewer, JSON findings with evidence
codex/                                          # Codex entrypoint (see AGENTS.md); not scanned by the Claude plugin
scripts/                                        # Codex installer + tests; qc_stuck_trends.py reads v1 audit logs only
```

Claude Code scans `agents/` and `skills/` at the plugin root. Files under `.claude/` are not picked up. The entrypoint is the `dfx` skill itself (`$ARGUMENTS`); there is no separate command file. A `run` skill name collides with the built-in `run` skill, so keep `dfx`.

## How a run flows

1. `/dfx:dfx "<request>"` loads `skills/dfx/SKILL.md` into this conversation.
2. The coordinator picks a work shape: small change (do it directly), coupled change (one owner + optional reviewer), independent changes (parallel `dfx:worker` briefs, coordinator integrates), uncertain cause/design (targeted evidence first; conditional `AskUserQuestion` design gate).
3. Before the first delegation it reads `routing.md` and `delegation.md`; before review/repair/resume it reads `verification.md`. Domain notes come from `domains.md` per brief.
4. Parallel = several `Agent` calls in one assistant message. Concurrent writes to a shared worktree are forbidden: use `isolation: "worktree"` or disjoint ownership with serialized builds.
5. Multi-step runs keep `_workspace/dfx/<run-id>/run.json` and end with `report.md`. Trivial edits keep no record.
6. Convergence loops with 3+ review lenses or 2+ expected rounds may use the `Workflow` tool (`/dfx` is the opt-in; load `workflow-authoring` first).

## Editing rules

- Behavior changes go to `skills/dfx/SKILL.md` (keep it a short router) or the relevant reference; do not grow SKILL.md with recipes.
- Agent frontmatter `name | description | model | tools` is the schema. `worker` must not have `Agent` in its tools (no recursive delegation). `reviewer` stays read-only.
- Keep model names abstract (`haiku/sonnet/opus/fable`), never hardcode dated model IDs.
- Keep the Codex entrypoint (`codex/skills/dfx`) aligned in structure; do not translate Claude tool names literally.
- Policy changes are judged by comparing representative tasks (small edit, feature, coupled change, unknown-cause bug, high-impact change) against a single-agent baseline on the same revision: requirement completion, regressions, retries, elapsed time, human fixes, observable tokens. API dollar estimates and subscription quota are not interchangeable.
- Behavioral evaluations run in disposable directories, never in a user's application repo. Report limitations; smoke tests are not benchmarks.
