import type { TaskStatus } from '@agent-forge/shared';
import { nowMs, ulid } from '@agent-forge/shared';
import { getReader, getWriter } from '../client.js';

export interface TaskRow {
  id: string;
  request_id: string;
  parent_task_id: string | null;
  agent_id: string | null;
  title: string;
  description_md: string;
  status: TaskStatus;
  worktree_path: string | null;
  branch_name: string | null;
  depth: number;
  started_at: number | null;
  ended_at: number | null;
  created_at: number;
  updated_at: number;
}

export function insert(input: {
  request_id: string;
  parent_task_id?: string | null;
  agent_id?: string | null;
  title: string;
  description_md?: string;
  worktree_path?: string | null;
  branch_name?: string | null;
  depth?: number;
}): string {
  const db = getWriter();
  const id = ulid();
  const now = nowMs();
  db.prepare(
    `INSERT INTO tasks
     (id, request_id, parent_task_id, agent_id, title, description_md, status, worktree_path, branch_name, depth, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.request_id,
    input.parent_task_id ?? null,
    input.agent_id ?? null,
    input.title,
    input.description_md ?? '',
    input.worktree_path ?? null,
    input.branch_name ?? null,
    input.depth ?? 0,
    now,
    now
  );
  return id;
}

export function setStatus(id: string, status: TaskStatus): TaskStatus {
  const db = getWriter();
  const row = db.prepare('SELECT status FROM tasks WHERE id = ?').get(id) as
    | { status: TaskStatus }
    | undefined;
  const prev = row?.status ?? 'pending';
  const now = nowMs();
  const ended = status === 'done' || status === 'failed' ? now : null;
  const started = status === 'in_progress' ? now : null;
  db.prepare(
    `UPDATE tasks SET status = ?, updated_at = ?,
       started_at = COALESCE(started_at, ?),
       ended_at   = COALESCE(?, ended_at)
     WHERE id = ?`
  ).run(status, now, started, ended, id);
  return prev;
}

export function setWorktree(id: string, path: string, branch: string): void {
  getWriter()
    .prepare(`UPDATE tasks SET worktree_path = ?, branch_name = ?, updated_at = ? WHERE id = ?`)
    .run(path, branch, nowMs(), id);
}

export function setAgent(id: string, agentId: string): void {
  getWriter()
    .prepare(`UPDATE tasks SET agent_id = ?, updated_at = ? WHERE id = ?`)
    .run(agentId, nowMs(), id);
}

export function getById(id: string): TaskRow | undefined {
  return getReader().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as
    | TaskRow
    | undefined;
}

/**
 * id 목록을 IN (?) 단일 쿼리로 일괄 조회한다.
 * ids가 비어 있으면 DB 왕복 없이 빈 배열을 반환한다.
 */
export function getByIds(ids: string[]): TaskRow[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  return getReader()
    .prepare(`SELECT * FROM tasks WHERE id IN (${placeholders})`)
    .all(...ids) as unknown as TaskRow[];
}

export function byRequest(requestId: string): TaskRow[] {
  return getReader()
    .prepare('SELECT * FROM tasks WHERE request_id = ? ORDER BY created_at')
    .all(requestId) as unknown as TaskRow[];
}

export function recentRelated(needle: string, limit = 10): TaskRow[] {
  // Sanitise the needle for FTS5: strip special chars, collapse whitespace,
  // append '*' so each token becomes a prefix query.
  const term = needle
    .slice(0, 64)
    .replace(/["*^]/g, ' ')   // strip FTS5 operator chars
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t}"*`)    // prefix-match each token
    .join(' ');

  if (!term) return [];

  return getReader()
    .prepare(
      `SELECT t.* FROM tasks t
       JOIN tasks_fts ON tasks_fts.rowid = t.rowid
       WHERE tasks_fts MATCH ?
       ORDER BY t.created_at DESC LIMIT ?`
    )
    .all(term, limit) as unknown as TaskRow[];
}

export function listByStatus(status: TaskStatus): TaskRow[] {
  return getReader()
    .prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at')
    .all(status) as unknown as TaskRow[];
}
