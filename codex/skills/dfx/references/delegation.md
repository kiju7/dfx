# Native delegation and task contracts

## Host adapter

Use the tool schema actually exposed in this session, not an assumed SDK:

| Host surface | Dispatch | Follow-up / results |
|---|---|---|
| `collaboration` tools | `spawn_agent` with `task_name`, `message`, `model`, `reasoning_effort`, `fork_turns` | `send_message` for active work, `followup_task` for an idle agent, `wait_agent` and notifications |
| Codex native tools exposing `spawn_agent` | Use the available schema; common fields include `message`, `agent_type`, `model`, `reasoning_effort`, `fork_context` | Use available `send_input`, `wait`, `close_agent` equivalents |
| No native delegation tools | Work locally if that still achieves the request; disclose that delegation is unavailable |

Never call Claude `Task`, invent a tool/role, or start a nested `codex exec`
process to bypass missing native delegation. A list of specialist Markdown files
does not register native agents. Express the specialty in the bounded task brief
unless the host actually exposes a configured role.

**Cross-vendor review (optional):** a reviewer from a different model family
catches blind spots shared by same-family models. Use one only for high-impact
changes and only through a surface the user has explicitly allowed (a configured
review tool, or an external CLI such as `claude -p` run read-only in the sandbox
with the user's permission). Present it as an external review, never as a native
agent, and skip it silently when unavailable.

With `collaboration.spawn_agent`, use `fork_turns: "none"` for a fresh brief when
selecting another model; `"all"` inherits the parent and cannot take overrides.
Other runtimes have different fork semantics: inspect their schema first.
Applicable user, developer and repository constraints must survive a fresh fork.

Respect available concurrency, including the parent and other active agents.
Budget concurrency by actual process load (builds and test suites running at the
same time), not by agent count; two workers each running a full build can stall
the machine. Queue work when slots are full; capacity pressure is not a task
failure. Close
finished agents when that host supports it and their context is no longer useful.
Do not make optional reviews compete with implementation on the critical path.

## Decomposition

Partition by coupled behavior and code dependencies, not job titles. Settle shared
API/schema contracts before parallel consumers implement them. Different files
can still have dependency or build-artifact conflicts: a shared Git index, shared
build outputs (`target/`, `dist/`, `node_modules/`), cross-package symbol
resolution where one worker's unfinished code breaks another's compile, and
shared config files (`package.json`, `pom.xml`). A real incident: six format
handlers in disjoint directories were judged parallel-safe, and the run ended in
cross-package test failures and lost updates. Give shared files a single writer;
serialize integration and builds. With split ownership, workers run only checks
scoped to their own files; the coordinator runs the shared test suite and full
build once after integration and returns deltas to the existing owner. Use separate worktrees when independent
branches or conflicting builds justify them, not for every read-only review.
For N similar tasks, let the first be the reference implementation and pass its
result and patterns to the following briefs.

Each task needs only the fields that help its owner:

```text
Goal: user-visible result or specific question
Context: relevant requirements, decisions, file/symbol pointers
Write scope: permitted files/modules, existing user changes to preserve
Inputs/dependencies: what is ready and what must be awaited
Done when: observable acceptance criteria and relevant checks
Return: changes/findings, evidence, unresolved items and proposed handoffs
Constraints: applicable instructions and permissions; no recursive delegation
```

The owner may refine its implementation after reading the code. If the goal,
contract or ownership must change, report the evidence to the coordinator.
Avoid repeating discovery that is already supported by current artifacts.

## Roles as task modes

- **Explore:** answer a bounded uncertainty with paths and evidence; read-only.
- **Build:** own a cohesive behavior through focused verification.
- **Review:** independently inspect the requirement, diff and related code;
  return substantiated findings. No implementation edits unless explicitly assigned.
- **Integrate:** reconcile completed work and verify shared behavior; normally
  the coordinator rather than an additional permanent agent.

Domain knowledge (database, UI, security, performance) belongs in the relevant
brief. Load only the matching sections of [domains.md](domains.md) for the risk
being examined. Do not create an agent for every available role or repeat a full
planning/review chain per file.
