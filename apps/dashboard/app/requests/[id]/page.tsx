import Link from 'next/link';
import { notFound } from 'next/navigation';
import { queries } from '@agent-forge/db';

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
      <p style={{ color: '#8b949e' }}>
        status: <b>{req.status}</b> · priority {req.priority} · created {new Date(req.created_at).toLocaleString()}
      </p>
      {req.body_md && (
        <pre style={{ background: '#161b22', padding: 12, borderRadius: 6 }}>{req.body_md}</pre>
      )}
      <p style={{ color: '#8b949e', fontSize: 13 }}>
        cost ${cost.cost_usd.toFixed(4)} · {cost.invocations} calls ·
        in {cost.input_tokens.toLocaleString()} / out {cost.output_tokens.toLocaleString()} tok ·
        cache {cost.cache_read_tokens.toLocaleString()} tok · turns {cost.turns}
      </p>

      <h2>Tasks ({tasks.length})</h2>
      <table className="table">
        <thead>
          <tr><th>id</th><th>title</th><th>agent</th><th>status</th><th>started</th></tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td><Link href={`/tasks/${t.id}`}>{t.id.slice(-8)}</Link></td>
              <td>{t.title}</td>
              <td>{t.agent_id ?? '—'}</td>
              <td>{t.status}</td>
              <td>{t.started_at ? new Date(t.started_at).toLocaleTimeString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
