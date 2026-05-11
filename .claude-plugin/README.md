# `.claude-plugin/`

Plugin manifest for distributing agent-forge as a Claude Code plugin.

## Files

- `plugin.json` — declarative metadata (name, version, commands path, agents path, services, env vars).
- This directory is read by Claude Code plugin loaders / marketplaces. The actual install logic lives in `../install.sh`.

## Install paths

### 1. Currently working — one-line bootstrap

```bash
curl -fsSL https://raw.githubusercontent.com/kiju7/agent-forge/main/install.sh | bash
```

This is what `plugin.json`'s `install.oneLiner` points to. It clones the repo, runs `pnpm install + migrate`, makes the initial commit, and registers `~/.claude/commands/forge.md` globally with path substitution.

### 2. Future — Claude Code plugin marketplace

When Claude Code's plugin marketplace standardizes, the manifest here is already shaped for it:

```bash
# hypothetical future syntax
claude plugin install kiju7/agent-forge
```

The marketplace will read `.claude-plugin/plugin.json` and run the declared `install.command`.

### 3. Local development

```bash
git clone https://github.com/kiju7/agent-forge.git
cd agent-forge
# inspect / load via dev flag
claude --plugin-dir .
```

## Why a manifest if `install.sh` already works?

- **Distribution-readable** — search engines, plugin directories, and `claude plugin info` can read structured metadata instead of parsing a shell script.
- **Forward-compatible** — if Claude Code's plugin marketplace lands, agent-forge plugs in with zero additional work.
- **Service declarations** — the `services` array documents the two long-lived processes (orchestrator on `:4317`, dashboard on `:54317`) so external tooling can health-check or supervise them.
- **Env var schema** — the `env` block is self-documenting, replacing the need to read README's "환경변수" table.

## What's NOT in the manifest

- `agent-forge` is an **external system** (Node daemon + Next.js dashboard + SQLite), not a pure-Claude-Code skill set. The plugin manifest is metadata; the heavy lifting is still in `install.sh` and the orchestrator's own lifecycle.
- Sub-agent definitions inside `agents/<role>/lead.md` are loaded by the orchestrator at boot via `packages/agents/md-loader.ts`, not by Claude Code itself. They're declared here for discoverability only.
