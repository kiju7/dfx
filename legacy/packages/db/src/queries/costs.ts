import { nowMs, ulid } from '@agent-forge/shared';
import { getReader, getWriter } from '../client.js';

export interface CostRow {
  id: string;
  task_id: string | null;
  request_id: string | null;
  agent_id: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  turns: number;
  duration_ms: number;
  purpose: string;
  created_at: number;
}

export function record(input: {
  task_id?: string | null;
  request_id?: string | null;
  agent_id: string;
  cost_usd: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  turns?: number;
  duration_ms?: number;
  purpose: 'triage' | 'pm' | 'dev' | 'qc' | 'ralph' | 'other';
}): string {
  const id = ulid();
  getWriter()
    .prepare(
      `INSERT INTO task_costs
       (id, task_id, request_id, agent_id, cost_usd, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, turns, duration_ms, purpose, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.task_id ?? null,
      input.request_id ?? null,
      input.agent_id,
      input.cost_usd,
      input.input_tokens ?? 0,
      input.output_tokens ?? 0,
      input.cache_read_tokens ?? 0,
      input.cache_creation_tokens ?? 0,
      input.turns ?? 0,
      input.duration_ms ?? 0,
      input.purpose,
      nowMs()
    );
  return id;
}

export function byTask(taskId: string): CostRow[] {
  return getReader()
    .prepare('SELECT * FROM task_costs WHERE task_id = ? ORDER BY created_at')
    .all(taskId) as unknown as CostRow[];
}

export interface CostSummary {
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  turns: number;
  invocations: number;
}

export function summaryForTask(taskId: string): CostSummary {
  const r = getReader()
    .prepare(
      `SELECT
         COALESCE(SUM(cost_usd), 0)              AS cost_usd,
         COALESCE(SUM(input_tokens), 0)          AS input_tokens,
         COALESCE(SUM(output_tokens), 0)         AS output_tokens,
         COALESCE(SUM(cache_read_tokens), 0)     AS cache_read_tokens,
         COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
         COALESCE(SUM(turns), 0)                 AS turns,
         COUNT(*)                                AS invocations
       FROM task_costs WHERE task_id = ?`
    )
    .get(taskId) as unknown as CostSummary;
  return r;
}

export function summaryForRequest(requestId: string): CostSummary {
  const r = getReader()
    .prepare(
      `SELECT
         COALESCE(SUM(cost_usd), 0)              AS cost_usd,
         COALESCE(SUM(input_tokens), 0)          AS input_tokens,
         COALESCE(SUM(output_tokens), 0)         AS output_tokens,
         COALESCE(SUM(cache_read_tokens), 0)     AS cache_read_tokens,
         COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
         COALESCE(SUM(turns), 0)                 AS turns,
         COUNT(*)                                AS invocations
       FROM task_costs
       WHERE request_id = ? OR task_id IN (SELECT id FROM tasks WHERE request_id = ?)`
    )
    .get(requestId, requestId) as unknown as CostSummary;
  return r;
}
