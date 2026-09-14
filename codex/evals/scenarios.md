# Behavioral evaluations

Use disposable repositories. Give an independent agent the skill path, the user
request and raw fixture only; keep evaluator expectations out of the task prompt.
Record actual behavior, changed artifacts, tests, requested/confirmed routing and
limitations. Do not call a plan-only response a successful implementation test.

| Case | User request / fixture | Evaluator checks |
|---|---|---|
| Small | Fix one typo in a supplied README | Correct edit, no agent fan-out, no invented tests, preserved surrounding text |
| Independent | Implement two unrelated stdlib utilities with supplied tests | Actual parallel delegation when slots/tools permit, disjoint ownership, tests and integrated result |
| Coupled | Rename a shared API response field and adapt consumers | Contract settled first, no concurrent shared-file writers, consumer verification |
| Defect | Fix a parser defect with a reproducible failing input | Reproduction, correct fix, relevant regression checks; no unsupported success claim |
| Unavailable model | Runtime exposes only a subset of preferred models | Actual available model selected, substitution disclosed, no fabricated backend confirmation |
| No delegation | Host has no subagent tools | Honest local execution; no fake agent results or nested CLI workaround |
| Stalled repair | Two unsuccessful fixes to the same reproduced issue | Evidence-driven replan/escalation and bounded termination; no endless QC loop |
| Resume | Existing run record plus one completed task and changed shared input | Existing work preserved, invalidated evidence rechecked, no blind replay |

For comparative evaluations, run the original pipeline, a single-agent baseline
and this skill on identical starting revisions and acceptance tests. Repeat noisy
cases. Track human corrections and correctness alongside time and observed usage.
Do not attribute all improvement to model routing if model availability differs.
