# agent-forge

Multi-agent engineering system. A user request flows through triage → PM (if needed) → specialist agents (Frontend / Backend / Daemon / UX / AI) → multiple QC agents in parallel → Ralph Loop auto-fix → squash-merge.

## End-to-end flow

```
 ┌─────────────┐
 │  /new form  │
 │  or POST    │
 │  /requests  │──┐
 └─────────────┘  │
                  ▼
           ┌────────────┐  feature/cross-domain   ┌──────────────────┐
           │  Triage    │────────────────────────▶│  PM breakdown    │
           │  (Haiku)   │                         │  → N subtasks    │
           └─────┬──────┘                         └────────┬─────────┘
                 │ direct (small fix)                      │
                 ▼                                         ▼
       ┌──────────────────────── waves (depends_on) ──────────────┐
       │  Frontend  Backend  Daemon  UX  AI                       │
       │   each in its own git worktree from main                 │
       └─────────────────────────┬───────────────────────────────┘
                                 ▼
                       multi-QC (parallel)
                  edgecase / security / perf / ux
                                 │
                 ┌───────────────┼───────────────┐
                 │               │               │
        no findings        findings(non-nit)   parse fail
                 │               │               │
                 ▼               ▼               ▼
             merge       Ralph Loop          ignored
                          (re-routes
                          to category's
                          role; if
                          cross-domain,
                          fresh worktree)
                                 │
                                 ▼
                            qc_passed → merge
                            max_iter  → fail+park
                            escalate  → blocked (PM)
```

Three processes share one SQLite file (`data/app.db`):

- **`apps/orchestrator`** — Node daemon. Only DB writer. Owns triage, dispatch, worktrees, Ralph Loop, IPC. HTTP on `127.0.0.1:4317`.
- **`apps/dashboard`** — Next.js App Router on `:3000`. RSC reads DB read-only; SSE pushes from `data/events.ndjson`.
- **Claude Code subprocesses** — spawned per agent invocation. They never touch DB directly; orchestrator owns persistence.

## One-time setup

```bash
# Node 20+ via corepack
corepack enable pnpm

pnpm install
pnpm migrate        # creates data/app.db with 10 tables + FTS5 + triggers

# initial commit (required so git worktree branching works)
git add -A && git commit -m "initial"
```

Ensure either `ANTHROPIC_API_KEY` is set in the shell or `claude` CLI is logged in (`claude auth status` to check).

## Run

```bash
# Terminal A — orchestrator (only DB writer)
pnpm orchestrator

# Terminal B — dashboard on http://localhost:3000
pnpm dashboard

# Submit a request via the form at /new, or via curl:
curl -X POST http://127.0.0.1:4317/requests \
  -H 'content-type: application/json' \
  -d '{"type":"fix","title":"Rename Board heading","body_md":"..."}'
```

Smoke scenarios:
```bash
pnpm smoke           # scenario=direct (Phase 1 baseline)
pnpm smoke:pm        # scenario=breakdown — exercises PM, multi-worktree, multi-QC
```

## Repo layout

| Path | Purpose |
|---|---|
| `agents/` | YAML-frontmatter MD definitions per agent (git-tracked, 1st-class) |
| `apps/orchestrator/` | Triage, dispatch, worktree, Ralph Loop, IPC, lifecycle |
| `apps/dashboard/` | Next.js read-only UI + request submission form |
| `packages/db/` | Schema (`migrations/000{1..5}*.sql`), typed queries |
| `packages/agents/` | Claude Agent SDK adapter, MD loader, path/tool hooks |
| `packages/qc-rewards/` | severity × reward_weight × novelty score formula |
| `packages/shared/` | Enums, ULID, SSE events, zod schemas, workspace path |
| `docs/handover/` | Auto-generated handover MD files (source of truth) |
| `docs/adr/` | System architecture decisions |
| `data/` | Runtime DB / events / git worktrees (all gitignored) |

## Agent roster

```
triage           (Haiku)   routing only
pm-lead          (Sonnet)  feature breakdown
frontend-lead   ┐
backend-lead    │
daemon-lead     │ (Sonnet) domain specialists
ux-lead         │
ai-lead         ┘
qc-edgecase     ┐
qc-security     │ (Sonnet, parallel multi-QC)
qc-perf         │
qc-ux           ┘
```

## Dashboard pages

| Route | What |
|---|---|
| `/` | Kanban across all task statuses, SSE live update |
| `/new` | Submit a new request |
| `/requests/[id]` | Request detail, child tasks, total cost |
| `/tasks/[id]` | Task detail + cost breakdown + QC findings + Ralph runs + timeline |
| `/agents` | QC leaderboard (with last-7-day sparklines) + agent roster |
| `/decisions` | ADR-lite log: every triage/PM/Ralph/escalation decision with rationale |
| `/handover` | FTS5 search over auto-generated handover docs |
| `/handover/[id]` | Handover document detail |

## Operational notes

- **Cost**: every Claude invocation records `total_cost_usd`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `turns`, `duration_ms` to `task_costs`. Per-task and per-request totals are visible in the dashboard. A typical PM-breakdown feature spans ~10–15 invocations and costs roughly $0.50–$2 with cache reuse.
- **Graceful shutdown**: SIGINT/SIGTERM marks in-flight tasks as `blocked`, runs a WAL checkpoint, and closes DB cleanly. On next boot any leftover `in_progress`/`pending`/`qc` tasks are recovered (status → `blocked` with a system message) so the board never lies.
- **Worktree merges**: `squashMerge` auto-stashes any uncommitted changes on main before checkout and pops them after. If stash pop conflicts, the stash is kept and `git stash list` recovers it.
- **Ralph routing**: a finding's `category` (ui/api/db/...) maps to a role. If that role differs from the original developer, Ralph spawns a fresh worktree from main rather than mutating the parent's worktree — avoids cross-domain merge conflicts.

## Troubleshooting

- `spawn node ENOENT` from a Claude Code subprocess → `corepack enable pnpm` again in the shell that runs orchestrator; the SDK inherits PATH from there.
- `claude auth` issues → run `claude` once in your shell to refresh login; orchestrator picks it up on next request.
- `git worktree add` fails with no commits → ensure the initial commit exists.
- `data/app.db` missing tables → `rm data/app.db* && pnpm migrate`.
- Dashboard SSE never updates → the orchestrator and dashboard must be reading the same `data/events.ndjson`. Both default to the workspace root (auto-discovered via `pnpm-workspace.yaml`).

## Migrations

| # | Purpose |
|---|---|
| `0001_init` | Core tables: requests, tasks, agents, messages, artifacts, qc_findings, qc_scores (trigger), ralph_runs, handover_docs |
| `0002_handover_fts` | FTS5 virtual table over handover_docs + sync triggers |
| `0003_task_costs` | Per-invocation cost & token tally |
| `0004_task_costs_request_id` | Add nullable `request_id` so triage/PM costs can record before a task exists |
| `0005_decisions` | ADR-lite decision log |

## Phase history

- **Phase 1 MVP** — triage + frontend-lead + qc-edgecase + qc-security + Ralph Loop + SSE dashboard
- **Phase 2** — PM breakdown + 5 specialist agents + 2 more QC + handover FTS5 + AGENTS.md feedback loop
- **Phase 3** — JSON output strictness + retry, Ralph isolated worktree, auto-stash safe merge, cost tracking, decision log, leaderboard trend, graceful shutdown/recovery, full docs
