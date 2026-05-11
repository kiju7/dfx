import { nowMs, ulid } from '@agent-forge/shared';
import { getReader, getWriter } from '../client.js';

export interface HandoverRow {
  id: string;
  task_id: string | null;
  title: string;
  content_md: string;
  tags_json: string;
  file_path: string;
  created_at: number;
  updated_at: number;
}

export function upsert(input: {
  task_id?: string | null;
  title: string;
  content_md: string;
  tags?: string[];
  file_path: string;
}): string {
  const db = getWriter();
  const existing = db
    .prepare('SELECT id FROM handover_docs WHERE file_path = ?')
    .get(input.file_path) as { id: string } | undefined;
  const now = nowMs();
  const tags_json = JSON.stringify(input.tags ?? []);
  if (existing) {
    db.prepare(
      `UPDATE handover_docs SET title = ?, content_md = ?, tags_json = ?, task_id = ?, updated_at = ?
       WHERE id = ?`
    ).run(input.title, input.content_md, tags_json, input.task_id ?? null, now, existing.id);
    return existing.id;
  }
  const id = ulid();
  db.prepare(
    `INSERT INTO handover_docs (id, task_id, title, content_md, tags_json, file_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.task_id ?? null, input.title, input.content_md, tags_json, input.file_path, now, now);
  return id;
}

export function listRecent(limit = 50): HandoverRow[] {
  return getReader()
    .prepare('SELECT * FROM handover_docs ORDER BY updated_at DESC LIMIT ?')
    .all(limit) as unknown as HandoverRow[];
}

export interface SearchHit {
  id: string;
  title: string;
  file_path: string;
  task_id: string | null;
  updated_at: number;
  snippet: string;
  rank: number;
}

export function search(query: string, limit = 20): SearchHit[] {
  if (!query.trim()) return [];
  const sanitized = query
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => `"${tok.replace(/"/g, '""')}"`)
    .join(' ');
  return getReader()
    .prepare(
      `SELECT h.id, h.title, h.file_path, h.task_id, h.updated_at,
              snippet(handover_docs_fts, 1, '[', ']', '…', 12) AS snippet,
              bm25(handover_docs_fts) AS rank
       FROM handover_docs_fts
       JOIN handover_docs h ON h.rowid = handover_docs_fts.rowid
       WHERE handover_docs_fts MATCH ?
       ORDER BY rank LIMIT ?`
    )
    .all(sanitized, limit) as unknown as SearchHit[];
}

export function getById(id: string): HandoverRow | undefined {
  return getReader().prepare('SELECT * FROM handover_docs WHERE id = ?').get(id) as
    | HandoverRow
    | undefined;
}
