import Link from 'next/link';
import { queries } from '@agent-forge/db';
import { TASK_STATUSES, type TaskStatus } from '@agent-forge/shared';
import LiveBoard from './LiveBoard';
import { getAgentMeta } from '../lib/agent-meta';

export const dynamic = 'force-dynamic';

const COLUMN_LABEL: Record<TaskStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  qc: 'QC',
  blocked: 'Blocked',
  done: 'Done',
  failed: 'Failed',
};

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
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1>Task Board</h1>
        <LiveBoard />
      </div>
      <p style={{ color: 'var(--fg-muted)' }}>
        Tasks across all requests. <Link href="/new">새 요청 제출 →</Link>
      </p>

      <div className="kanban">
        {TASK_STATUSES.map((status) => (
          <div className="column" key={status}>
            <h3>
              <span className={`status-dot ${status}`} />
              {COLUMN_LABEL[status]} <span style={{ color: 'var(--fg-subtle)' }}>· {byStatus[status].length}</span>
            </h3>
            {byStatus[status].length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--fg-subtle)', padding: '6px 4px' }}>—</div>
            ) : (
              byStatus[status].map((t) => {
                const meta = t.agent_id ? getAgentMeta(t.agent_id) : null;
                return (
                  <Link href={`/tasks/${t.id}`} key={t.id} style={{ color: 'inherit', textDecoration: 'none' }}>
                    <div className="card">
                      <div className="title">{t.title}</div>
                      <div className="meta">
                        {meta && (
                          <span className={`avatar sm role-${meta.role}`} style={{ width: 18, height: 18, fontSize: 9 }} title={meta.displayName}>
                            {meta.initial}
                          </span>
                        )}
                        <span>{meta?.displayName ?? 'unassigned'}</span>
                        <span style={{ marginLeft: 'auto', color: 'var(--fg-subtle)' }}>
                          {new Date(t.updated_at).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        ))}
      </div>
    </>
  );
}
