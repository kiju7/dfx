---
name: dfx
description: Deliver coding tasks with adaptive Codex agent delegation, GPT model selection, and evidence-based verification. Use for dfx requests or autonomous multi-agent implementation and review.
---

# dfx for Codex

Own the requested outcome through implementation, verification, and a concise
human review handoff. Choose the smallest useful team and context for the work.
This skill explicitly requests native subagent delegation when independent work
or a separate review justifies it. It does not require delegation for every task.

## Choose the work shape

- **Small, clear change:** implement and check directly. Skip a separate triage,
  planning agent, journal and review committee.
- **Coupled change:** keep discovery, implementation and focused tests with one
  owner. Add an independent reviewer when judgment or regression risk warrants it.
- **Independent changes:** identify dependencies and assign cohesive, verifiable
  slices to workers in parallel. You integrate and verify the combined result.
- **Uncertain cause or design:** obtain targeted evidence or a bounded alternative
  analysis before committing to an implementation. Replan when evidence invalidates
  assumptions; do not ask multiple agents to duplicate the same broad exploration.

Do not split solely by frontend/backend/database titles. Keep tightly connected
changes together; assign shared contracts and files to one writer at a time.
Read only the project instructions and code needed for the current decision.

**Change principles (every owner):**
- Surface ambiguity and assumptions instead of guessing (see the gate below).
- Write the minimum code that solves the request. No unrequested abstractions,
  options or "future-proofing".
- Touch only what the request requires. Do not tidy, refactor or reformat
  neighboring code; report other problems instead of fixing them.
- Define completion criteria before editing and judge the end by them.

**Design gate (conditional):** only when the request has two or more readings
and the choice materially changes the deliverable, read the code first and then
ask the user with two or three options and a recommendation. If the user cannot
answer (unattended run), proceed on the recommendation and record the assumption
in the report. Make routine judgment calls yourself.

## Delegate deliberately

Before the first delegation, read [routing.md](references/routing.md) for model
and effort selection and [delegation.md](references/delegation.md) for the host
adapter and task contract. Use only capabilities actually exposed by the host.
Select model and effort separately per task; respect explicit user choices.
Start difficult, high-impact work with a capable model rather than forcing a
cheap-first failure cascade. Continue useful independent work while workers run. When the coordinator is
already a strong model, delegate only for parallelism, context protection or
independent review (routing.md).

Give workers goals, boundaries and acceptance criteria rather than prescribing
every implementation step. Pass the relevant context, not the full conversation
by default. Workers report recommended handoffs to you; they do not recursively
grow a team. Reuse an agent when its prior context is still useful. Attach only
the relevant sections of [domains.md](references/domains.md) to a brief.

## Verify and converge

Read [verification.md](references/verification.md) when reviewing, handling failed
checks, or resuming a multi-step run. Judge completion by requirements and observed
evidence, not an agent's confidence score or an empty findings list. Run checks
proportional to the change and recheck affected behavior after fixes. Do not repeat
unchanged verification merely because another stage ended. Default independent review
is **one pass over the full diff after all edits**, not one per task; review a
slice early only when later work builds on its shared contract or it is hard to
revert. Security, performance and UX lenses are added only for matching risk; a cross-vendor
reviewer is optional and only through means the user has allowed (delegation.md).

For multi-step or delegated work, keep a compact run record using the format in
that reference. Continue authorized local edit/check/fix work without repeated
permission handoffs. Ask only when missing user intent materially changes the
outcome or an action requires authority that has not been granted. Delegation
does not grant permission to publish, merge, deploy, or change external systems.

## Return for human review

Report the outcome, material changes, requirements checked with evidence, and
unresolved issues or unexecuted checks. For delegated work, include a compact
model/effort selection summary and why escalation was needed, if any. Runtime
usage is optional evidence: report unavailable usage as unknown, never as zero
or a fabricated token/cost estimate. Finish the implementation and verification
that are possible before handing off; do not label blocked work complete.
