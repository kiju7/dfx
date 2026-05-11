import { nowMs, ulid } from '@agent-forge/shared';
import { getReader, getWriter } from '../client.js';

export type DecisionKind =
  | 'triage'
  | 'pm-breakdown'
  | 'ralph-route'
  | 'escalation'
  | 'merge'
  | 'other';

export interface DecisionRow {
  id: string;
  request_id: string | null;
  task_id: string | null;
  kind: DecisionKind;
  scope: string;
  title: string;
  rationale_md: string;
  created_at: number;
}

export function record(input: {
  request_id?: string | null;
  task_id?: string | null;
  kind: DecisionKind;
  scope?: string;
  title: string;
  rationale_md?: string;
}): string {
  const id = ulid();
  getWriter()
    .prepare(
      `INSERT INTO decisions (id, request_id, task_id, kind, scope, title, rationale_md, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.request_id ?? null,
      input.task_id ?? null,
      input.kind,
      input.scope ?? '',
      input.title,
      input.rationale_md ?? '',
      nowMs()
    );
  return id;
}

export function listRecent(limit = 100): DecisionRow[] {
  return getReader()
    .prepare('SELECT * FROM decisions ORDER BY created_at DESC LIMIT ?')
    .all(limit) as unknown as DecisionRow[];
}

export function byRequest(requestId: string): DecisionRow[] {
  return getReader()
    .prepare('SELECT * FROM decisions WHERE request_id = ? ORDER BY created_at')
    .all(requestId) as unknown as DecisionRow[];
}
