import type { AgentRole, AgentStatus } from '@agent-forge/shared';
import { nowMs } from '@agent-forge/shared';
import { getReader, getWriter } from '../client.js';

export interface AgentRow {
  id: string;
  role: AgentRole;
  display_name: string;
  definition_md_path: string;
  current_task_id: string | null;
  status: AgentStatus;
  spawned_at: number;
  last_seen_at: number;
}

export function upsert(row: {
  id: string;
  role: AgentRole;
  display_name: string;
  definition_md_path: string;
}): void {
  const db = getWriter();
  const now = nowMs();
  db.prepare(
    `INSERT INTO agents (id, role, display_name, definition_md_path, current_task_id, status, spawned_at, last_seen_at)
     VALUES (?, ?, ?, ?, NULL, 'idle', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       role = excluded.role,
       display_name = excluded.display_name,
       definition_md_path = excluded.definition_md_path,
       last_seen_at = excluded.last_seen_at`
  ).run(row.id, row.role, row.display_name, row.definition_md_path, now, now);
}

export function setStatus(id: string, status: AgentStatus, taskId: string | null = null): AgentStatus {
  const db = getWriter();
  const before = db.prepare('SELECT status FROM agents WHERE id = ?').get(id) as
    | { status: AgentStatus }
    | undefined;
  const prev = before?.status ?? 'offline';
  db.prepare(
    `UPDATE agents SET status = ?, current_task_id = ?, last_seen_at = ? WHERE id = ?`
  ).run(status, taskId, nowMs(), id);
  return prev;
}

export function listAll(): AgentRow[] {
  return getReader().prepare('SELECT * FROM agents ORDER BY role, id').all() as unknown as AgentRow[];
}

export function byId(id: string): AgentRow | undefined {
  return getReader().prepare('SELECT * FROM agents WHERE id = ?').get(id) as
    | AgentRow
    | undefined;
}

// leaderboard() removed — QC reward system fully retired. If you want
// finding counts per QC agent for an analytics view, query qc_findings
// directly: `SELECT qc_agent_id, COUNT(*) FROM qc_findings GROUP BY qc_agent_id`.
