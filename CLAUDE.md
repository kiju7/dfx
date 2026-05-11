# agent-forge

Multi-agent engineering system. A user request flows through triage → specialist agents (PM, UX, Frontend, Backend, Daemon, AI) → multiple QC agents (parallel, rewarded by findings) → Ralph Loop auto-fix → merge.

## Architecture

Three processes share one SQLite file (`data/app.db`):

- `apps/orchestrator` — Node daemon, **the only DB writer**. Owns triage, dispatch, git worktrees, Ralph Loop, IPC server.
- `apps/dashboard` — Next.js (App Router). RSC reads DB readonly, SSE pushes changes from `data/events.ndjson`.
- Claude Code subprocesses spawned by `packages/agents` — work in isolated git worktrees. They never touch DB directly; they RPC to orchestrator.

Single writer + WAL mode for concurrency safety.

## Agent definitions

Every agent's role, model, tool allowlist, allowed paths, escalation rules live in `agents/<role>/<name>.md` as YAML frontmatter + guidelines. The loader (`packages/agents/src/md-loader.ts`) parses these into `AgentSpec`.

## Isolation policy

Each task default-runs in a git worktree under `data/worktrees/<requestId>/<agent>-<n>/`. On success: squash-merge to main, prune worktree. On failure: park 24h, append lesson to `AGENTS.md`, then prune. Trivial fixes with triage confidence > 0.9 may edit main directly (still gated by PreToolUse hook).

## Ralph Loop

QC finding → fixed routing by category (ui→frontend, api→backend, ...) → resume dev session, re-inject finding via Stop hook. Escalate to triage re-run if: same finding fails twice, finding tagged `requires_spec_change`/`ambiguous_requirement`/`cross-domain`, fix needs paths outside allowed, or blocker severity across ≥2 domains.

## QC reward formula

```
reward_points = severity_weight × spec.reward_weight × novelty_factor
  severity_weight = { nit:0, minor:1, major:3, critical:8, blocker:20 }
  novelty_factor  = 0.3 if same category already found this task, else 1.0
```

Leaderboard in `/agents`. Top scorers get dispatch priority in next round.

## Communication

Source of truth = SQLite (`messages`, `tasks`, `qc_findings`). Notification channel = `data/events.ndjson` append-only → dashboard tails it for SSE. Agents do NOT message each other directly — every intent surfaces as a task comment for auditability + handover.

## Handover docs

`docs/handover/<YYYY-MM-DD>-<slug>.md` is the source of truth (git-tracked). Orchestrator mirrors them into `handover_docs` table + FTS5 index. `/handover` page searches them.

## Phase

Currently Phase 1 MVP: only triage + frontend dev agent + 2 QC agents (edgecase, security) + Ralph Loop. PM/UX/Backend/Daemon/AI and FTS handover UI are Phase 2.
