import { defaultAgentsDir, loadAllAgents, findAgentById } from '@agent-forge/agents';
import { queries } from '@agent-forge/db';
import { findWorkspaceRoot, type AgentSpec } from '@agent-forge/shared';

const REPO_ROOT = findWorkspaceRoot();

let cache: AgentSpec[] = [];

export function loadRegistry(): AgentSpec[] {
  cache = loadAllAgents(defaultAgentsDir(REPO_ROOT), REPO_ROOT);
  for (const spec of cache) {
    queries.agents.upsert({
      id: spec.id,
      role: spec.role,
      display_name: spec.display_name ?? spec.id,
      definition_md_path: spec.definition_md_path,
    });
  }
  return cache;
}

export function all(): AgentSpec[] {
  if (cache.length === 0) loadRegistry();
  return cache;
}

export function byId(id: string): AgentSpec {
  return findAgentById(all(), id);
}

export function qcAgents(): AgentSpec[] {
  return all().filter((s) => s.role === 'qc');
}

export function firstByRole(role: AgentSpec['role']): AgentSpec | undefined {
  return all().find((s) => s.role === role);
}
