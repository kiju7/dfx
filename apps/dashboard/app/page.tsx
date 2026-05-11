import Link from 'next/link';
import { queries } from '@agent-forge/db';
import { TASK_STATUSES, type TaskStatus } from '@agent-forge/shared';
import LiveBoard from './LiveBoard';

export const dynamic = 'force-dynamic';

export default function Page() {
  const byStatus: Record<TaskStatus, ReturnType<typeof queries.tasks.listByStatus>> = {
    pending: [],
    in_progress: [],
    qc: [],
    blocked: [],
    done: [],
    failed: [],
  };
  for (const s of TASK_STATUSES) byStatus[s] = queries.tasks.listByStatus(s);

  return (
    <>
      <h1>Task Board</h1>
      <p style={{ color: '#8b949e' }}>
        Tasks across all requests. <Link href="/new">Submit a new request</Link>.
      </p>
      <LiveBoard />
      <div className="kanban">
        {TASK_STATUSES.map((status) => (
          <div className="column" key={status}>
            <h3>{status} ({byStatus[status].length})</h3>
            {byStatus[status].map((t) => (
              <Link href={`/tasks/${t.id}`} key={t.id} className="card-link">
                <div className="card">
                  <div className="title">{t.title}</div>
                  <div className="meta">
                    {t.agent_id ?? 'unassigned'} · {new Date(t.updated_at).toLocaleTimeString()}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
