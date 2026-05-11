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
}): string {
  const id = ulid();
  getWriter()
    .prepare(
      `INSERT INTO qc_findings (id, task_id, qc_agent_id, severity, category, title, detail_md, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.task_id,
      input.qc_agent_id,
      input.severity,
      input.category,
      input.title,
      input.detail_md ?? '',
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
}

// Count-only daily rollup. Reward points are gone; severity-weighted views, if
// ever needed, should be computed in the consumer from `severity`.
export function dailyForLastDays(days: number): DailyCount[] {
  const sinceMs = Date.now() - days * 86_400_000;
  return getReader()
    .prepare(
      `SELECT
         qc_agent_id,
         CAST(created_at / 86400000 AS INTEGER) * 86400000 AS bucket_day,
         COUNT(*) AS findings
       FROM qc_findings
       WHERE created_at >= ?
       GROUP BY qc_agent_id, bucket_day
       ORDER BY qc_agent_id, bucket_day`
    )
    .all(sinceMs) as unknown as DailyCount[];
}

export interface IssueRow extends FindingRow {
  task_title: string;
  task_status: string;
  task_agent_id: string | null;
  request_id: string;
  ralph_run_id: string | null;
  ralph_exit_reason: string | null;
}

/**
 * 모든 finding 을 task / ralph_run 컨텍스트와 함께 반환. /issues 페이지의 단일 쿼리.
 * - `onlyOpen=true` → resolved_at IS NULL 만
 * - 정렬: severity rank (blocker>critical>major>minor>nit) → created_at DESC
 */
export function listIssues(opts: { onlyOpen?: boolean; limit?: number } = {}): IssueRow[] {
  const limit = opts.limit ?? 500;
  const filter = opts.onlyOpen ? 'WHERE f.resolved_at IS NULL' : '';
  return getReader()
    .prepare(
      `SELECT
         f.*,
         t.title  AS task_title,
         t.status AS task_status,
         t.agent_id AS task_agent_id,
         t.request_id AS request_id,
         r.id AS ralph_run_id,
         r.exit_reason AS ralph_exit_reason
       FROM qc_findings f
       JOIN tasks t ON t.id = f.task_id
       LEFT JOIN ralph_runs r ON r.finding_id = f.id
       ${filter}
       ORDER BY
         CASE f.severity
           WHEN 'blocker'  THEN 0
           WHEN 'critical' THEN 1
           WHEN 'major'    THEN 2
           WHEN 'minor'    THEN 3
           WHEN 'nit'      THEN 4
           ELSE 5
         END,
         f.created_at DESC
       LIMIT ?`
    )
    .all(limit) as unknown as IssueRow[];
}

export interface SeverityCount {
  severity: string;
  count: number;
}

export function severityCountsForOpen(): SeverityCount[] {
  return getReader()
    .prepare(
      `SELECT severity, COUNT(*) AS count
       FROM qc_findings
       WHERE resolved_at IS NULL
       GROUP BY severity`
    )
    .all() as unknown as SeverityCount[];
}
