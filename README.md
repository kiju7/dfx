# agent-forge

Multi-agent engineering system. Triage routes a user request to specialist agents (PM/UX/Frontend/Backend/Daemon/AI/QC). Multiple QC agents inspect the output in parallel and earn reward points for findings. Failures auto-loop through Ralph Loop until resolved or escalated.

## Stack

- TypeScript / pnpm workspaces
- Claude Agent SDK + Claude Code CLI (subprocess agents)
- Git worktree per task for isolation
- Next.js 15 App Router + SSE
- SQLite (better-sqlite3) — single-writer (orchestrator) + readers (dashboard)

## One-time setup

```bash
# enable pnpm (Node 20+, ships with corepack)
corepack enable pnpm

# install deps
pnpm install

# initial commit so worktree branching works
git add -A && git commit -m "scaffold: multi-agent engineering system"

# create db, register agent definitions
pnpm migrate
```

Set `ANTHROPIC_API_KEY` (or arrange for Claude Code CLI auth) in your shell before running the orchestrator.

## Run

Three terminals:

```bash
# 1) orchestrator daemon — owns the DB, spawns agents
pnpm orchestrator

# 2) dashboard — http://localhost:3000
pnpm dashboard

# 3) smoke test (optional, after the other two are up)
pnpm smoke
```

Submit requests via `http://localhost:3000/new` or `POST http://127.0.0.1:4317/requests`.

## Layout

| Path | Purpose |
|---|---|
| `agents/` | YAML-frontmatter MD definitions per agent (1st-class, git-tracked) |
| `apps/orchestrator/` | Node daemon: triage, dispatch, worktree, Ralph Loop, IPC server |
| `apps/dashboard/` | Next.js read-only UI + request submission form |
| `packages/db/` | SQLite schema, migrations, typed queries |
| `packages/agents/` | Claude Agent SDK adapter, MD loader, tool/path guard hooks |
| `packages/qc-rewards/` | Severity × reward_weight × novelty score formula |
| `packages/shared/` | Enums, ULID, SSE event types, zod schemas |
| `docs/handover/` | Handover docs (source of truth for cross-session knowledge) |
| `data/` | Runtime: SQLite DB, events.ndjson, git worktrees (gitignored) |

## Phase

Phase 1 MVP: only `triage`, `frontend-lead`, `qc-edgecase`, `qc-security` agents are wired. PM/UX/Backend/Daemon/AI agents + handover FTS UI come in Phase 2.

See `docs/adr/` and `AGENTS.md` for lessons accumulated by past Ralph Loop runs.
