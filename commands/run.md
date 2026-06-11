---
description: Run the dfx multi-agent engineering pipeline natively inside Claude Code (triage → Tech Lead → parallel dev subagents → 4× QC → Ralph fix loop). No external services.
argument-hint: "[your engineering request — bug / feature / fix / qc]"
---

The user invoked `/dfx:run` to run the dfx native multi-agent pipeline. Their request follows.

> $ARGUMENTS

Now invoke the **dfx** skill to drive the pipeline. The skill spawns Task-tool subagents (`triage`, `lead`, `frontend`, `backend`, `database`, `devops`, `daemon`, `ux`, `ai`, and four `qc-*` reviewers) in parallel layers, collects results, runs an auto-fix loop on findings, and emits one consolidated summary.

If `$ARGUMENTS` is empty, ask the user once for the request and then start the pipeline. Do not start any background services — this is the native, in-session pipeline.
