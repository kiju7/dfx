# ADR 0001 — System architecture

Status: accepted (Phase 3)
Date: 2026-05-11

## Context

We needed a system where heterogeneous "engineer" agents (PM, UX, Frontend, Backend, Daemon, AI) and a competitive QC pool can collaborate on user requests with full auditability, parallel work, and automatic bug fixing. The system must run locally for a single user and produce real git commits, not synthetic patches.

## Decisions

### D1. Three processes, one SQLite, single writer

- The orchestrator is the only process that writes to `data/app.db`. The dashboard reads only. Agents do not touch the DB; they emit text the orchestrator interprets.
- WAL mode + `busy_timeout=5000` makes concurrent readers safe.
- Trade-off: a single writer is a future scaling bottleneck. Acceptable because the bottleneck is Claude latency, not DB throughput.

### D2. Git worktree per task, squash-merge on success

- Each dispatched task gets its own branch under `data/worktrees/<request_id>/<agent>-<n>/`. Agents only edit there.
- On QC pass: rebase-free squash merge into main. On fail/max_iter: park the worktree (`git worktree lock`).
- This is the only mechanism keeping multi-agent parallelism safe — agents can't trample each other.

### D3. Multi-QC with reward scoring

- Each task is reviewed by *every* QC agent in parallel. Findings are scored:
  `severity_weight × spec.reward_weight × novelty_factor (0.3 if duplicate category on the same task else 1.0)`.
- Encourages QC diversity and discourages spammy duplicate reporting.

### D4. Ralph Loop with cross-domain isolation

- A non-nit finding triggers Ralph. The finding's `category` maps to a specialist role.
- If the role is the same as the original developer, Ralph reuses that worktree (the dev knows the context).
- If the role differs (e.g. backend task → a11y finding → frontend), Ralph creates a *fresh worktree from main*. This avoids the Phase 2 failure mode where a follow-up edited an unrelated file inside the parent's worktree and broke the parent's merge.

### D5. JSON-first agent contracts

- Triage, PM-breakdown, and QC all return JSON. The shared `runAgentForJson` helper retries once with a strict reminder when parsing fails.
- Output extraction tries (a) all fenced ```json blocks, (b) all balanced top-level `{…}` candidates, preferring the last that parses. Robust against models that "think out loud" before concluding.

### D6. SSE over `data/events.ndjson` (no Redis)

- Orchestrator appends one JSON line per event. Dashboard tails the file and pushes via SSE.
- Simple, no broker. Append-only file is restart-safe (no in-memory queue to lose).

### D7. AGENTS.md as a feed-forward learning loop

- Ralph appends a one-line lesson on every meaningful exit (resolved finding, max iterations, escalation).
- Triage reads the tail of `## Lessons` and includes them in its routing prompt. Over time, routing decisions reflect prior Ralph experience without retraining.

### D8. Handover docs as the source of truth

- On every task `done`, the orchestrator writes a markdown summary to `docs/handover/<date>-<slug>-<task6>.md` (git-tracked) and indexes it in `handover_docs` + FTS5.
- Future agents (and humans) search the same surface. The file is canonical; the DB row is just the index.

### D9. ADR-lite decision log

- Triage, PM-breakdown, Ralph routing, and escalation each write a `decisions` row with kind/scope/title/rationale_md.
- `/decisions` page shows them as a timeline. Lets us audit "why did the system route this way?" without re-running agents.

### D10. Cost is a first-class column, not a log

- Every Claude invocation records `total_cost_usd` + token breakdown + turns to `task_costs`.
- Per-task and per-request totals appear in the dashboard so the user catches runaway costs early.

## Consequences

- The orchestrator is restart-safe and crash-recoverable (lifecycle.ts marks orphans as `blocked` on boot).
- Adding a new specialist role is purely a new MD file under `agents/<role>/<name>.md` plus a category mapping in `packages/shared/src/enums.ts`. No orchestrator change required.
- Adding a new QC strategy is the same — drop in `agents/qc/qc-*.md`. The leaderboard, scoring, and parallel dispatch all pick it up automatically.
- Migrations are forward-only; SQLite limitations mean schema changes that need to drop NOT NULL require a rebuild-table pattern (see `0004_task_costs_request_id.sql`).
- A persistent open question is what to do when triage misroutes consistently for a class of request. Today the only mechanism is AGENTS.md hints; we may need explicit overrides.

## Alternatives considered

- **LangGraph orchestration**: graph DSL would be nice but conflicts with our Ralph + worktree primitives; we'd end up reimplementing them anyway.
- **Per-agent process isolation via Docker**: stronger sandbox than worktree but heavier setup; worktree+PreToolUse path guard covers ~95% of accidents.
- **Postgres instead of SQLite**: would unlock multi-writer, but we don't need it. SQLite WAL has been zero-friction.
- **`better-sqlite3` instead of `node:sqlite`**: blocked by Node 24 native build incompatibility at the time of building. node:sqlite is built-in and good enough.
