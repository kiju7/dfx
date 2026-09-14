# Domain notes (attach only the relevant sections to a brief)

Each section is a short set of cautions that can be pasted into a worker or
reviewer brief. Use only the sections matching the risk at hand; never all of them.

## Common (every build brief)

- Detect stack and conventions from `package.json`/`go.mod`/`pyproject.toml`,
  `AGENTS.md`/`README.md`, and the neighbors of the files being edited. No new
  technologies.
- Minimal change. No drive-by cleanup or premature abstraction.
- Run typecheck, lint and build before completion. If observable logic changes,
  add a reproducer that fails before and passes after, in the project's test
  infrastructure (or a temporary directory when none exists).
- Check the brief's assumptions against the code before editing. Grep hits are
  candidates; confirm via imports and real call sites. Resolve verbs such as
  "disable/clean up/simplify" by checking for toggles, flags or config branches;
  when two readings remain reasonable, return a decision request instead of guessing.

## Frontend

- Match the framework (Next.js/Vite/Vue/plain) and CSS approach (Tailwind/modules/plain). No new `any`.
- Server/client component boundaries, unnecessary re-renders and missing memoization belong to the performance lens.

## Backend

- Business logic in the business layer. Validate untrusted input at the boundary; trust types inside.
- Wrap multi-step writes in transactions per project pattern. Exercise consumers of changed success/failure contracts.

## Database

- Forward-only migrations: never edit a committed migration; add the next sequence.
- Keep old reads working during rollout; drop in a later migration.
- Indexes only for concrete query patterns; composite indexes equality-first, range-last.
- Constraints and triggers enforce invariants, not business rules.

## Daemon / worker

- Restart-safe (idempotent): a retried half-finished job yields the same result.
- No unbounded queues: cap, drop with a reason, or block. Every socket/watcher/connection has a teardown path.
- Event schemas change additively only.

## DevOps / infrastructure

- Declarative first (YAML/Dockerfile/Terraform over shell). Pin versions, no `latest`, commit lockfiles.
- No inline secrets; use env or a secret manager. Do not touch application code.

## AI / prompts / agent definitions

- Agent definition frontmatter is the canonical schema for the host; keep it valid.
- Do not weaken existing tool/path/permission guards without a stated reason. If a structured output contract changes, update its consumers.

## UX

- Colors, spacing and typography come from design tokens; no inline values. Body contrast at least 4.5:1, visible focus, ARIA only when needed.
- Preserve the existing voice and terminology rules.

## Review lenses (give a reviewer only the relevant ones)

- **Edge cases:** null/empty/0/negative/NaN/huge input, off-by-one, single element, Unicode/emoji/RTL, concurrency (missing await, races), error paths (unhandled rejection, missing try/catch).
- **Security:** injection (SQL/command/prompt), XSS and untrusted HTML, auth/authorization bypass (server actions, middleware), secret exposure (.env, client bundles), path traversal and unsafe filesystem access, agent permission escape.
- **Performance:** N+1, sync I/O in loops, main-thread blocking (large parse/sort/regex backtracking), listener leaks, missing indexes on hot queries, serialized awaits that could run in parallel.
- **UX/accessibility:** keyboard navigation and tab order, contrast, empty/loading/error states, 44px touch targets, label/role correctness, copy and token consistency.

Reviewers find new (untracked) files with `git status` first, because `git diff HEAD`
does not show them. Candidates are executed, reproduced or rendered before being
reported; unreproduced hypotheses are downgraded to `suspected`. Decisions the brief
marks as intentional are not findings.
