# Claude skill smoke evaluation — 2026-09-14 (v2.0.0)

Independent coordinators (`general-purpose`, requested `opus`) received only the
skill path and a raw request in a disposable Git fixture. They did not receive
expected routing decisions. `dfx:worker` / `dfx:reviewer` were not installed in
the session (the installed plugin was still v1), so the fallback path was exercised.
The `Workflow` tool was forbidden by the evaluator.

## Case: small change

Request: fix one README typo and implement `slugify` and `windows` in two files;
preserve the supplied test file.

- Work shape chosen: direct implementation. No Agent calls, no run record,
  references not opened (their read triggers did not fire).
- Supplied 2 tests passed; 15 ad-hoc edge checks run inline, no files added.
- Report listed the Hangul-collapses-to-dash decision as something to confirm.

## Case: independent changes with explicit delegation

Request: implement `wrap_text` and `render_table` in two modules, delegate each to
a worker in parallel, then one independent edge-case reviewer; preserve tests.

- Two `general-purpose` workers (`sonnet`) with disjoint file ownership and a
  ban on running the shared suite; one `general-purpose` reviewer (`opus`),
  read-only constraints stated in the prompt. Repair went back to the existing
  owner via `SendMessage`, not a new agent.
- Reviewer returned 9 reproduced findings; 3 fixed and re-verified, 6 recorded
  as limitations in the report.
- `_workspace/dfx/<run-id>/run.json` reached `ready_for_review`; `report.md`
  written in Korean; `_workspace/` excluded via `.git/info/exclude`; no commit.
- Supplied tests passed after integration and after repair.

## Gaps found and addressed in the same change

- Split-ownership mode did not say who runs the shared test suite → stated
  (workers: scoped checks; coordinator: suite once after integration).
- No degraded mode when `Workflow` is unavailable → parallel `Agent` lenses
  bounded by the stopping policy.
- `usage` source guidance → Agent completion notification token totals may be
  recorded with source; `confirmed_model` stays `null`.

## Limits

These are smoke runs. They show the work-shape selection, fallback, ownership
and record rules are followable; they do not measure quality, cost or speed
against v1 or a single-agent baseline. Model identity was not confirmed by the
runtime. Coordinator-reported subagent totals: about 48k and 124k tokens.
