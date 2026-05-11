import { minimatch } from 'minimatch';
import { relative, resolve, isAbsolute } from 'node:path';
import type { AgentSpec } from '@agent-forge/shared';

export type HookDecision =
  | { action: 'allow' }
  | { action: 'block'; reason: string };

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob']);

function matchesAny(rel: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  for (const pat of patterns) {
    if (minimatch(rel, pat, { dot: true })) return true;
  }
  return false;
}

export interface ToolGuardArgs {
  spec: AgentSpec;
  cwd: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

export function evaluateToolUse(args: ToolGuardArgs): HookDecision {
  const { spec, cwd, toolName, toolInput } = args;

  if (EDIT_TOOLS.has(toolName)) {
    const filePath = toolInput['file_path'] ?? toolInput['notebook_path'];
    if (typeof filePath !== 'string') {
      return { action: 'block', reason: `${toolName} missing file_path` };
    }
    const rel = isAbsolute(filePath) ? relative(cwd, filePath) : filePath;
    if (rel.startsWith('..')) {
      return { action: 'block', reason: `path escapes cwd: ${filePath}` };
    }
    if (matchesAny(rel, spec.denied_paths)) {
      return { action: 'block', reason: `denied_paths matched: ${rel}` };
    }
    if (spec.allowed_paths.length > 0 && !matchesAny(rel, spec.allowed_paths)) {
      return { action: 'block', reason: `not in allowed_paths: ${rel}` };
    }
    return { action: 'allow' };
  }

  if (toolName === 'Bash') {
    const cmd = (toolInput['command'] as string | undefined) ?? '';
    const allowedBash = spec.tools
      .filter((t) => t.startsWith('Bash('))
      .map((t) => t.slice(5, -1));
    if (allowedBash.length === 0) {
      return { action: 'allow' };
    }
    const head = cmd.trim().split(/\s+/)[0] ?? '';
    const ok = allowedBash.some((pattern) => {
      if (pattern === '*') return true;
      if (pattern.endsWith(':*')) {
        const prefix = pattern.slice(0, -2);
        return head === prefix || head.startsWith(`${prefix}:`) || cmd.trim().startsWith(prefix);
      }
      return cmd.trim().startsWith(pattern);
    });
    return ok ? { action: 'allow' } : { action: 'block', reason: `bash not allowed: ${head}` };
  }

  if (READ_TOOLS.has(toolName)) return { action: 'allow' };
  return { action: 'allow' };
}

export function resolvePath(cwd: string, p: string): string {
  return isAbsolute(p) ? p : resolve(cwd, p);
}
