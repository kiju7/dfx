---
description: Run the agent-forge multi-agent engineering pipeline natively inside Claude Code (triage → PM → parallel dev subagents → 4× QC → Ralph fix loop). No external services.
argument-hint: "[your engineering request — bug / feature / fix / qc]"
---

The user invoked `/forge` to run the agent-forge native multi-agent pipeline. Their request follows.

> $ARGUMENTS

Now invoke the **forge** skill to drive the pipeline. The skill spawns Task-tool subagents (`triage`, `pm`, `frontend`, `backend`, `database`, `devops`, `daemon`, `ux`, `ai`, and four `qc-*` reviewers) in parallel layers, collects results, runs an auto-fix loop on findings, and emits one consolidated summary.

If `$ARGUMENTS` is empty, ask the user once for the request and then start the pipeline. Do not start any background services — this is the native, in-session pipeline.
