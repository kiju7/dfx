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

export interface DailyCount {
  qc_agent_id: string;
  bucket_day: number;
  findings: number;
  points: number;
}

export function dailyForLastDays(days: number): DailyCount[] {
  const sinceMs = Date.now() - days * 86_400_000;
  return getReader()
    .prepare(
      `SELECT
         qc_agent_id,
         CAST(created_at / 86400000 AS INTEGER) * 86400000 AS bucket_day,
         COUNT(*)                        AS findings,
         COALESCE(SUM(reward_points), 0) AS points
       FROM qc_findings
       WHERE created_at >= ?
       GROUP BY qc_agent_id, bucket_day
       ORDER BY qc_agent_id, bucket_day`
    )
    .all(sinceMs) as unknown as DailyCount[];
}
