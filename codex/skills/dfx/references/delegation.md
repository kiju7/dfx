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

With `collaboration.spawn_agent`, use `fork_turns: "none"` for a fresh brief when
selecting another model; `"all"` inherits the parent and cannot take overrides.
Other runtimes have different fork semantics: inspect their schema first.
Applicable user, developer and repository constraints must survive a fresh fork.

Respect available concurrency, including the parent and other active agents.
Queue work when slots are full; capacity pressure is not a task failure. Close
finished agents when that host supports it and their context is no longer useful.
Do not make optional reviews compete with implementation on the critical path.

## Decomposition

Partition by coupled behavior and code dependencies, not job titles. Settle shared
API/schema contracts before parallel consumers implement them. Different files
can still have dependency or build-artifact conflicts. Give shared files a single
writer; serialize integration. Use separate worktrees when independent branches
or conflicting builds justify them, not for every read-only review.

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
brief. Load specialist guidance only for the risk being examined. Do not create
an agent for every available role or repeat a full planning/review chain per file.
