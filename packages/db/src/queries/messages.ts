import type { SenderKind } from '@agent-forge/shared';
import { nowMs, ulid } from '@agent-forge/shared';
import { getReader, getWriter } from '../client.js';

export interface MessageRow {
  id: string;
  task_id: string | null;
  sender_kind: SenderKind;
  sender_id: string;
  recipient_id: string | null;
  body_md: string;
  created_at: number;
}

export function append(input: {
  task_id?: string | null;
  sender_kind: SenderKind;
  sender_id: string;
  recipient_id?: string | null;
  body_md: string;
}): string {
  const id = ulid();
  getWriter()
    .prepare(
      `INSERT INTO messages (id, task_id, sender_kind, sender_id, recipient_id, body_md, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.task_id ?? null,
      input.sender_kind,
      input.sender_id,
      input.recipient_id ?? null,
      input.body_md,
      nowMs()
    );
  return id;
}

export function byTask(taskId: string): MessageRow[] {
  return getReader()
    .prepare('SELECT * FROM messages WHERE task_id = ? ORDER BY created_at')
    .all(taskId) as unknown as MessageRow[];
}
