# Evidence, recovery and handoff

## Completion criteria

Before substantial edits, identify the observable behavior that establishes
success. A small request needs a short criterion, not a large specification.

- Bug: reproduce when feasible, verify the fix and an appropriate regression path.
- API: exercise changed success/failure contracts and affected consumers.
- UI: inspect the rendered result and relevant interaction when tooling permits.
- Refactor: verify preserved behavior with existing checks and targeted gaps.

Use test output, observed behavior and inspected code as evidence. A passing test
only supports what it exercises. Do not weaken acceptance criteria, remove failing
tests, or relabel an unexecuted check as passing to obtain a clean result. Separate
pre-existing environment failures from failures introduced by the change.

Use a fresh reviewer for changes where independent judgment has value. Give it
the user intent, diff/base reference, relevant files and test commands/results;
do not prime it with the implementer's conclusion. It should examine the actual
diff and related code. Security, performance and UX reviews are conditional, not
four mandatory votes; give a reviewer only the lens sections it needs from
[domains.md](domains.md). Findings need impact and code/reproduction evidence; a
speculative style preference is not an automatic fix requirement. Reviewers must
find new (untracked) files with `git status` because `git diff HEAD` omits them,
and must downgrade findings they could not reproduce to `suspected`.

## Bounded recovery

Fix justified findings and recheck affected behavior. Reuse unchanged passing
evidence only if subsequent changes cannot invalidate it. Verify the integrated
result when independently passing slices interact.

Default stopping policy: after two repair attempts with no new evidence or
improvement on the same issue, reassess cause and scope. Allow one materially
different plan or stronger-model handoff; if it still makes no progress, record
the blocker and hand off honestly. User budgets or limits override this default.
Progress means a reproduced cause, corrected contract, resolved finding, or
newly passing relevant check, not more messages. Do not start indefinite QC loops.

## Minimal durable record

For a delegated/multi-step run use a unique directory under
`_workspace/dfx/<run-id>/` in the target project (UTC timestamp plus random suffix
or `mkdtemp`, never a shared `/tmp/dfx-current-run-id`). Keep it out of commits;
use local Git excludes where needed without changing tracked ignore rules merely
for bookkeeping. The coordinator is the sole writer of shared run state; workers
can own separate evidence files if needed. Never store credentials or raw secret
tool output. Do not create this record for a trivial edit.

Maintain one `run.json`, using the existing run on an explicit resume:

```json
{
  "status": "running",
  "request": "user's requested outcome",
  "requirements": [{"id": "R1", "criterion": "observable behavior", "evidence": []}],
  "tasks": [{
    "id": "T1", "goal": "bounded result", "depends_on": [],
    "write_scope": [], "status": "pending", "agent_id": null,
    "requested_model": null, "requested_effort": null,
    "confirmed_model": null, "confirmed_effort": null,
    "routing_reason": "", "repair_attempts": 0, "evidence": []
  }],
  "decisions": [],
  "blockers": [],
  "usage": {"input_tokens": null, "output_tokens": null, "source": null}
}
```

Task statuses: `pending`, `running`, `verified`, `blocked`. Run statuses:
`running`, `ready_for_review`, `blocked`, `cancelled`. Set `ready_for_review` only
when required work and checks are satisfied; state any remaining manual checks
as limitations and keep required unperformed checks blocking. Write updated JSON
to a sibling temporary file then replace it atomically. On resume inspect current
files/diff and recorded evidence before reusing results; do not restart completed
work solely because conversation context was compacted.

`run.json` is a recovery aid, not a scheduler, sandbox or enforced token budget.
Record only usage exposed by the runtime, with its source and scope; do not sum
overlapping parent/child totals. Keep values null if unavailable. Requested model
settings can be recorded immediately, confirmed settings only from runtime metadata.

Produce a short `report.md` at handoff: requirement outcomes with evidence,
material changes, unexecuted checks/blockers, and model/effort choices. Match the
user's language. Human final review follows completed authorized local work;
publishing, merging and deployment follow the user's actual authorization.
