import type { Severity } from '@agent-forge/shared';
import { nowMs, ulid } from '@agent-forge/shared';
import { getReader, getWriter } from '../client.js';

export interface FindingRow {
  id: string;
  task_id: string;
  qc_agent_id: string;
  severity: Severity;
  category: string;
  title: string;
  detail_md: string;
  reward_points: number;
  resolved_at: number | null;
  created_at: number;
}

export function insert(input: {
  task_id: string;
  qc_agent_id: string;
  severity: Severity;
  category: string;
  title: string;
  detail_md?: string;
  reward_points: number;
}): string {
  const id = ulid();
  getWriter()
    .prepare(
      `INSERT INTO qc_findings (id, task_id, qc_agent_id, severity, category, title, detail_md, reward_points, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.task_id,
      input.qc_agent_id,
      input.severity,
      input.category,
      input.title,
      input.detail_md ?? '',
      input.reward_points,
      nowMs()
    );
  return id;
}

export function categoriesForTask(taskId: string): string[] {
  const rows = getReader()
    .prepare('SELECT DISTINCT category FROM qc_findings WHERE task_id = ?')
    .all(taskId) as Array<{ category: string }>;
  return rows.map((r) => r.category);
}

export function byTask(taskId: string): FindingRow[] {
  return getReader()
    .prepare('SELECT * FROM qc_findings WHERE task_id = ? ORDER BY created_at')
    .all(taskId) as unknown as FindingRow[];
}

export function resolve(id: string): void {
  getWriter().prepare('UPDATE qc_findings SET resolved_at = ? WHERE id = ?').run(nowMs(), id);
}

export function getById(id: string): FindingRow | undefined {
  return getReader().prepare('SELECT * FROM qc_findings WHERE id = ?').get(id) as
    | FindingRow
    | undefined;
}
