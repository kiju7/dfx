import { queries, getWriter, closeAll } from '@agent-forge/db';
import { publish } from './events/publisher.js';

interface OrphanRow {
  id: string;
  status: string;
}

export function recoverOrphans(): { tasks: number; agents: number } {
  const db = getWriter();
  // Tasks that were mid-flight at the time of the last shutdown.
  const orphans = db
    .prepare(
      `SELECT id, status FROM tasks WHERE status IN ('pending', 'in_progress', 'qc')`
    )
    .all() as unknown as OrphanRow[];

  for (const t of orphans) {
    db.prepare(
      `UPDATE tasks SET status = 'blocked', updated_at = ?, ended_at = COALESCE(ended_at, ?)
       WHERE id = ?`
    ).run(Date.now(), Date.now(), t.id);
    queries.messages.append({
      task_id: t.id,
      sender_kind: 'system',
      sender_id: 'orchestrator',
      body_md: `Recovered on boot: previous run did not complete (status was \`${t.status}\`). Marked as blocked.`,
    });
    publish('task.status_changed', {
      taskId: t.id,
      from: t.status as 'in_progress',
      to: 'blocked',
    });
  }

  // Any agent the previous run flagged busy is now offline.
  const busy = db
    .prepare(`SELECT id FROM agents WHERE status = 'busy'`)
    .all() as Array<{ id: string }>;
  for (const a of busy) {
    db.prepare(
      `UPDATE agents SET status = 'offline', current_task_id = NULL, last_seen_at = ? WHERE id = ?`
    ).run(Date.now(), a.id);
  }

  return { tasks: orphans.length, agents: busy.length };
}

export function checkpoint(): void {
  try {
    getWriter().exec('PRAGMA wal_checkpoint(PASSIVE);');
  } catch {
    /* ignore */
  }
}

export interface ShutdownContext {
  inFlight: Set<string>; // task_ids
}

export function installShutdownHandlers(ctx: ShutdownContext): void {
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[orchestrator] ${signal} received — draining (${ctx.inFlight.size} in-flight task(s))`);
    // Best-effort: mark in-flight tasks as blocked so the next boot sees them.
    for (const taskId of ctx.inFlight) {
      try {
        queries.tasks.setStatus(taskId, 'blocked');
        queries.messages.append({
          task_id: taskId,
          sender_kind: 'system',
          sender_id: 'orchestrator',
          body_md: `Aborted by ${signal} during graceful shutdown.`,
        });
      } catch {
        /* ignore */
      }
    }
    checkpoint();
    closeAll();
    // Give event publisher a moment to flush, then exit.
    setTimeout(() => process.exit(0), 50);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
