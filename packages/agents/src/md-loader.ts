import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { AgentSpecSchema, type AgentSpec } from '@agent-forge/shared';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export class AgentDefinitionError extends Error {
  constructor(public readonly path: string, message: string) {
    super(`${path}: ${message}`);
  }
}

export function loadAgentSpec(absMdPath: string, repoRoot: string): AgentSpec {
  const text = readFileSync(absMdPath, 'utf8');
  const m = FRONTMATTER_RE.exec(text);
  if (!m) {
    throw new AgentDefinitionError(absMdPath, 'missing YAML frontmatter');
  }
  let raw: unknown;
  try {
    raw = parseYaml(m[1]!);
  } catch (e) {
    throw new AgentDefinitionError(absMdPath, `invalid YAML: ${(e as Error).message}`);
  }
  const parsed = AgentSpecSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AgentDefinitionError(
      absMdPath,
      `schema mismatch: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
    );
  }
  return {
    ...parsed.data,
    definition_md_path: relative(repoRoot, absMdPath) || absMdPath,
    body_md: m[2]?.trim() ?? '',
  };
}

export function loadAllAgents(agentsDir: string, repoRoot: string): AgentSpec[] {
  const out: AgentSpec[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) {
        walk(p);
      } else if (entry.endsWith('.md')) {
        out.push(loadAgentSpec(p, repoRoot));
      }
    }
  };
  walk(agentsDir);
  return out;
}

export function findAgentById(specs: AgentSpec[], id: string): AgentSpec {
  const found = specs.find((s) => s.id === id);
  if (!found) throw new Error(`agent not found: ${id}`);
  return found;
}

export function defaultAgentsDir(repoRoot: string): string {
  return resolve(repoRoot, 'agents');
}
