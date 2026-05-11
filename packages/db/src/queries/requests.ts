import type { RequestStatus, RequestType } from '@agent-forge/shared';
import { nowMs, ulid } from '@agent-forge/shared';
import { getReader, getWriter } from '../client.js';

export interface RequestRow {
  id: string;
  type: RequestType;
  title: string;
  body_md: string;
  status: RequestStatus;
  priority: number;
  submitter: string | null;
  created_at: number;
  updated_at: number;
  closed_at: number | null;
}

export function insert(input: {
  type: RequestType;
  title: string;
  body_md?: string;
  priority?: number;
  submitter?: string | null;
}): string {
  const db = getWriter();
  const id = ulid();
  const now = nowMs();
  db.prepare(
    `INSERT INTO requests (id, type, title, body_md, status, priority, submitter, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'triage', ?, ?, ?, ?)`
  ).run(
    id,
    input.type,
    input.title,
    input.body_md ?? '',
    input.priority ?? 3,
    input.submitter ?? null,
    now,
    now
  );
  return id;
}

export function setStatus(id: string, status: RequestStatus): void {
  const db = getWriter();
  const now = nowMs();
  const closed = status === 'done' || status === 'cancelled' ? now : null;
  db.prepare(
    `UPDATE requests SET status = ?, updated_at = ?, closed_at = COALESCE(?, closed_at) WHERE id = ?`
  ).run(status, now, closed, id);
}

export function getById(id: string): RequestRow | undefined {
  return getReader()
    .prepare('SELECT * FROM requests WHERE id = ?')
    .get(id) as unknown as RequestRow | undefined;
}

export function listRecent(limit = 50): RequestRow[] {
  return getReader()
    .prepare(`SELECT * FROM requests ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as unknown as RequestRow[];
}
