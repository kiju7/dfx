import Link from 'next/link';
import { notFound } from 'next/navigation';
import { queries } from '@agent-forge/db';
import { getAgentMeta } from '../../../lib/agent-meta';

export const dynamic = 'force-dynamic';

export default async function RequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const req = queries.requests.getById(id);
  if (!req) notFound();
  const tasks = queries.tasks.byRequest(id);
  const cost = queries.costs.summaryForRequest(id);

  return (
    <>
      <h1>
        <span className={`badge ${req.type}`}>{req.type}</span> {req.title}
      </h1>
      <p style={{ color: 'var(--fg-muted)' }}>
        <span className={`status-dot ${req.status === 'done' ? 'done' : req.status === 'blocked' ? 'blocked' : 'in_progress'}`} />
        {req.status} · priority {req.priority} · created {new Date(req.created_at).toLocaleString()}
      </p>
      {req.body_md && (
        <pre style={{
          background: 'var(--bg-elev)',
          border: '1px solid var(--border)',
          padding: 14,
          borderRadius: 8,
          fontSize: 13,
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
        }}>{req.body_md}</pre>
      )}
      <p style={{ color: 'var(--fg-muted)', fontSize: 13 }}>
        cost <b style={{ color: 'var(--fg)' }}>${cost.cost_usd.toFixed(4)}</b> · {cost.invocations} calls ·
        in {cost.input_tokens.toLocaleString()} / out {cost.output_tokens.toLocaleString()} tok ·
        cache {cost.cache_read_tokens.toLocaleString()} tok · turns {cost.turns}
      </p>

      <h2>Tasks ({tasks.length})</h2>
      {tasks.length === 0 ? (
        <div className="empty">아직 디스패치된 태스크가 없습니다.</div>
      ) : (
        <table className="table">
          <thead>
            <tr><th>id</th><th>title</th><th>assignee</th><th>status</th><th>started</th></tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              const meta = t.agent_id ? getAgentMeta(t.agent_id) : null;
              return (
                <tr key={t.id}>
                  <td><Link href={`/tasks/${t.id}`}>{t.id.slice(-8)}</Link></td>
                  <td>{t.title}</td>
                  <td>
                    {meta ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span className={`avatar sm role-${meta.role}`} style={{ width: 20, height: 20, fontSize: 10 }}>
                          {meta.initial}
                        </span>
                        {meta.displayName}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--fg-subtle)' }}>unassigned</span>
                    )}
                  </td>
                  <td><span className={`status-dot ${t.status}`} />{t.status}</td>
                  <td>{t.started_at ? new Date(t.started_at).toLocaleTimeString() : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
