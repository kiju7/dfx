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

## When the coordinator is already strong

If the parent runs on Sol or Astra, handing a coupled task to a same-tier worker
adds briefing cost and misunderstanding risk without adding capability. Delegate
only when at least one applies:

- **Parallelism:** two or more independent slices shorten wall time.
- **Context protection:** bulk reading, long logs or repeated checks would fill
  the coordinator's context.
- **Independence:** a review must not be primed by the implementer's conclusion.

Otherwise do the work locally and spend coordinator tokens on judgment and
coupled edits.

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
