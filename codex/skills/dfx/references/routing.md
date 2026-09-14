# Model and effort routing

These are starting policies, not measured performance guarantees. Check the
current host's model list/schema before dispatch; do not browse model docs on
every task or edit user config just to force a preferred model.

| Task evidence | Preferred model | Initial effort |
|---|---|---|
| Bounded extraction, lookup, mechanically checkable edits | `gpt-5.6-luna` | `low` or `medium` |
| Scoped implementation/tests following established patterns | `gpt-5.6-terra` | `medium` |
| Ambiguous planning, coupled changes, independent correctness review | `gpt-5.6-sol` | `medium` or `high` |
| Difficult architecture, subtle cross-system defects, high-impact reasoning | `gpt-6-astra` | `high` |

Choose `xhigh` only when unresolved reasoning warrants it and the model supports
it; `max` is exceptional, not a default. Do not equate role names with models:
a small plan can stay local, a mechanical implementation can use Luna, and a
subtle implementation can start on Astra. The parent model is already selected
by the host; do not claim to switch it by writing instructions or settings.

For each dispatch, briefly record model, effort and rationale. The objective is
successful completion including rework, elapsed time and human review effort,
not the cheapest individual call. Simple tool execution rarely needs its own
agent. High token prices alone do not make a capable model poor value.

## Adapt from evidence

- Missing facts: retrieve the specific code/logs/contracts, not more reasoning.
- Wrong scope or dependency: revise the task contract and ownership first.
- Bounded coding mistake: return the delta to the existing owner.
- Persisting reasoning failure: choose stronger effort or a more capable model;
  send a short handoff with failed approaches so the successor does not repeat them.
- Unavailable model/effort: use a listed, suitable alternative if the user has
  allowed automatic selection. Record the substitution. Never silently inherit
  the expensive parent and report that the requested cheap model ran.
- Explicit user model constraint: do not substitute against it; explain the
  unavailable capability and continue independent work where possible.

Prefer no more than one evidence-driven model escalation per unchanged task;
after that reassess the plan or report the concrete blocker. Do not cycle through
every model tier. Do not change a running agent's model unless the host explicitly
supports that operation; otherwise hand off to a new agent with the selected model.

Full-history forks may prohibit model/effort overrides in some hosts. Use a fresh
context with a self-contained brief in that case. Record requested settings and
runtime-confirmed settings separately; an accepted request is not independent
proof of which backend served it.

## Improve the policy

Compare representative tasks from a common clean revision: small edits, normal
features, coupled changes, unclear defects and high-impact changes. Compare a
single-agent baseline with adaptive delegation. Track requirement completion,
regressions, retries, wall time, human corrections and observed token usage when
available. Preserve the task and evaluation environment. Do not optimize using
model self-scores alone or claim savings from one smoke run. API dollar estimates
and subscription quota consumption are not interchangeable.
