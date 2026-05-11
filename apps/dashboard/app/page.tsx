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

  // task 별 미해결 finding 카운트 — 카드에 ⚠ 배지로 노출
  const openCounts = queries.findings.openCountsByTask();
  const severityCounts = queries.findings.severityCountsForOpen();
  const totalOpen = severityCounts.reduce((a, c) => a + c.count, 0);
  const highOpen = severityCounts
    .filter((c) => c.severity === 'major' || c.severity === 'critical' || c.severity === 'blocker')
    .reduce((a, c) => a + c.count, 0);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1>Task Board</h1>
        <LiveBoard />
      </div>
      <p style={{ color: 'var(--fg-muted)' }}>
        Tasks across all requests. <Link href="/new">새 요청 제출 →</Link>
        {totalOpen > 0 && (
          <>
            {' '}·{' '}
            <Link href="/issues">
              <span style={{
                background: highOpen > 0
                  ? 'color-mix(in srgb, var(--sv-major) 18%, white)'
                  : 'var(--bg-sunken)',
                color: highOpen > 0 ? '#9a3412' : 'var(--fg-muted)',
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid color-mix(in srgb, var(--sv-major) 25%, transparent)',
              }}>
                ⚠ {totalOpen} open issues
                {highOpen > 0 && ` (${highOpen} high)`}
              </span>
            </Link>
          </>
        )}
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
                const issues = openCounts.get(t.id);
                return (
                  <Link href={`/tasks/${t.id}`} key={t.id} className="card-link">
                    <div className="card">
                      <div className="title">{t.title}</div>
                      <div className="meta">
                        {meta && (
                          <span className={`avatar sm role-${meta.role}`} style={{ width: 18, height: 18, fontSize: 9 }} title={meta.displayName} role="img" aria-label={meta.displayName}>
                            {meta.initial}
                          </span>
                        )}
                        <span>{meta?.displayName ?? 'unassigned'}</span>
                        {issues && issues.total > 0 && (
                          <span
                            title={`${issues.high} high · ${issues.total - issues.high} low`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              padding: '1px 6px',
                              borderRadius: 999,
                              fontSize: 10,
                              fontWeight: 600,
                              background: issues.high > 0
                                ? 'color-mix(in srgb, var(--sv-major) 18%, white)'
                                : 'var(--bg-sunken)',
                              color: issues.high > 0 ? '#9a3412' : 'var(--fg-muted)',
                              border: issues.high > 0
                                ? '1px solid color-mix(in srgb, var(--sv-major) 30%, transparent)'
                                : '1px solid var(--border)',
                            }}
                          >
                            ⚠ {issues.total}
                            {issues.high > 0 && (
                              <span style={{
                                fontSize: 9,
                                opacity: 0.85,
                              }}>
                                · {issues.high}↑
                              </span>
                            )}
                          </span>
                        )}
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
