import type { RalphExitReason } from '@agent-forge/shared';
import { nowMs, ulid } from '@agent-forge/shared';
import { getReader, getWriter } from '../client.js';

export interface RalphRunRow {
  id: string;
  task_id: string;
  iterations: number;
  max_iterations: number;
  exit_reason: RalphExitReason | null;
  finding_id: string | null;
  log_path: string | null;
  started_at: number;
  ended_at: number | null;
}

export function start(input: {
  task_id: string;
  finding_id?: string | null;
  max_iterations?: number;
}): string {
  const id = ulid();
  getWriter()
    .prepare(
      `INSERT INTO ralph_runs (id, task_id, iterations, max_iterations, finding_id, started_at)
       VALUES (?, ?, 0, ?, ?, ?)`
    )
    .run(id, input.task_id, input.max_iterations ?? 5, input.finding_id ?? null, nowMs());
  return id;
}

export function bumpIteration(id: string): number {
  const db = getWriter();
  db.prepare('UPDATE ralph_runs SET iterations = iterations + 1 WHERE id = ?').run(id);
  const row = db.prepare('SELECT iterations FROM ralph_runs WHERE id = ?').get(id) as
    | { iterations: number }
    | undefined;
  return row?.iterations ?? 0;
}

export function finish(id: string, reason: RalphExitReason): void {
  getWriter()
    .prepare('UPDATE ralph_runs SET exit_reason = ?, ended_at = ? WHERE id = ?')
    .run(reason, nowMs(), id);
}

export function byTask(taskId: string): RalphRunRow[] {
  return getReader()
    .prepare('SELECT * FROM ralph_runs WHERE task_id = ? ORDER BY started_at DESC')
    .all(taskId) as unknown as RalphRunRow[];
}

export function getById(id: string): RalphRunRow | undefined {
  return getReader().prepare('SELECT * FROM ralph_runs WHERE id = ?').get(id) as
    | RalphRunRow
    | undefined;
}
