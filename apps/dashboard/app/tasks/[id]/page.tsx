import { notFound } from 'next/navigation';
import Link from 'next/link';
import { queries } from '@agent-forge/db';
import LiveBoard from '../../LiveBoard';

export const dynamic = 'force-dynamic';

export default async function TaskDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = queries.tasks.getById(id);
  if (!task) notFound();
  const messages = queries.messages.byTask(id);
  const findings = queries.findings.byTask(id);
  const ralph = queries.ralph.byTask(id);
  const costSummary = queries.costs.summaryForTask(id);
  const costDetail = queries.costs.byTask(id);

  return (
    <>
      <h1>{task.title}</h1>
      <LiveBoard />
      <p style={{ color: '#8b949e' }}>
        agent: <b>{task.agent_id ?? '—'}</b> · status: <b>{task.status}</b> ·
        request: <Link href={`/requests/${task.request_id}`}>{task.request_id.slice(-8)}</Link>
      </p>
      {task.worktree_path && (
        <p style={{ fontSize: 12, color: '#8b949e' }}>
          worktree: <code>{task.worktree_path}</code> · branch: <code>{task.branch_name}</code>
        </p>
      )}

      <h2>Cost</h2>
      <p style={{ color: '#8b949e' }}>
        총 <b>${costSummary.cost_usd.toFixed(4)}</b> · {costSummary.invocations} calls ·
        in {costSummary.input_tokens.toLocaleString()} tok / out {costSummary.output_tokens.toLocaleString()} tok ·
        cache read {costSummary.cache_read_tokens.toLocaleString()} tok ·
        turns {costSummary.turns}
      </p>
      {costDetail.length > 0 && (
        <table className="table">
          <thead>
            <tr><th>when</th><th>agent</th><th>purpose</th><th>cost</th><th>in/out</th><th>cache</th><th>turns</th><th>ms</th></tr>
          </thead>
          <tbody>
            {costDetail.map((c) => (
              <tr key={c.id}>
                <td>{new Date(c.created_at).toLocaleTimeString()}</td>
                <td>{c.agent_id}</td>
                <td>{c.purpose}</td>
                <td>${c.cost_usd.toFixed(4)}</td>
                <td>{c.input_tokens.toLocaleString()} / {c.output_tokens.toLocaleString()}</td>
                <td>{c.cache_read_tokens.toLocaleString()}</td>
                <td>{c.turns}</td>
                <td>{c.duration_ms.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>QC findings ({findings.length})</h2>
      <table className="table findings">
        <thead>
          <tr><th>severity</th><th>category</th><th>title</th><th>QC</th><th>points</th><th>resolved</th></tr>
        </thead>
        <tbody>
          {findings.map((f) => (
            <tr key={f.id}>
              <td><span className={`severity ${f.severity}`}>{f.severity}</span></td>
              <td>{f.category}</td>
              <td>{f.title}</td>
              <td>{f.qc_agent_id}</td>
              <td>{f.reward_points.toFixed(2)}</td>
              <td>{f.resolved_at ? '✓' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Ralph runs ({ralph.length})</h2>
      <table className="table">
        <thead>
          <tr><th>id</th><th>iterations</th><th>max</th><th>exit</th></tr>
        </thead>
        <tbody>
          {ralph.map((r) => (
            <tr key={r.id}>
              <td>{r.id.slice(-8)}</td>
              <td>{r.iterations}</td>
              <td>{r.max_iterations}</td>
              <td>{r.exit_reason ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Timeline</h2>
      <div className="timeline">
        {messages.map((m) => (
          <div className="timeline-row" key={m.id}>
            <div className="ts">{new Date(m.created_at).toLocaleString()} · {m.sender_kind}/{m.sender_id}</div>
            <div className="body">{m.body_md}</div>
          </div>
        ))}
      </div>
    </>
  );
}
