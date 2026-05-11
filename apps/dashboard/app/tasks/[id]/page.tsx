import { notFound } from 'next/navigation';
import Link from 'next/link';
import { queries } from '@agent-forge/db';
import LiveBoard from '../../LiveBoard';
import LiveActivity from './LiveActivity';
import { getAgentMeta } from '../../../lib/agent-meta';

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

  const taskAgent = task.agent_id ? getAgentMeta(task.agent_id) : null;

  return (
    <>
      <h1>{task.title}</h1>
      <LiveBoard />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, marginBottom: 14 }}>
        {taskAgent && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className={`avatar sm role-${taskAgent.role}`} title={taskAgent.displayName}>
              {taskAgent.initial}
            </span>
            <span style={{ fontWeight: 600 }}>{taskAgent.displayName}</span>
          </span>
        )}
        <span style={{ color: 'var(--fg-muted)' }}>·</span>
        <span style={{ color: 'var(--fg-muted)', fontSize: 13 }}>
          <span className={`status-dot ${task.status}`} />{task.status}
        </span>
        <span style={{ color: 'var(--fg-muted)' }}>·</span>
        <Link href={`/requests/${task.request_id}`} style={{ fontSize: 13 }}>
          request {task.request_id.slice(-8)}
        </Link>
      </div>

      {task.worktree_path && (
        <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
          worktree <code>{task.worktree_path}</code> · branch <code>{task.branch_name}</code>
        </p>
      )}

      {(task.status === 'in_progress' || task.status === 'qc') && (
        <>
          <h2>Live activity</h2>
          <div style={{
            background: 'var(--bg-elev)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 16,
            marginTop: 8,
          }}>
            <LiveActivity taskId={id} />
          </div>
        </>
      )}

      <h2>Cost</h2>
      <p style={{ color: 'var(--fg-muted)' }}>
        총 <b style={{ color: 'var(--fg)' }}>${costSummary.cost_usd.toFixed(4)}</b> · {costSummary.invocations} calls ·
        in {costSummary.input_tokens.toLocaleString()} tok / out {costSummary.output_tokens.toLocaleString()} tok ·
        cache read {costSummary.cache_read_tokens.toLocaleString()} tok ·
        turns {costSummary.turns}
      </p>
      {costDetail.length > 0 && (
        <table className="table">
          <thead>
            <tr><th>when</th><th>agent</th><th>purpose</th><th>cost</th><th>in / out</th><th>cache</th><th>turns</th><th>ms</th></tr>
          </thead>
          <tbody>
            {costDetail.map((c) => {
              const m = getAgentMeta(c.agent_id);
              return (
                <tr key={c.id}>
                  <td>{new Date(c.created_at).toLocaleTimeString()}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span className={`avatar sm role-${m.role}`} style={{ width: 20, height: 20, fontSize: 10 }}>
                        {m.initial}
                      </span>
                      {m.displayName}
                    </span>
                  </td>
                  <td>{c.purpose}</td>
                  <td>${c.cost_usd.toFixed(4)}</td>
                  <td>{c.input_tokens.toLocaleString()} / {c.output_tokens.toLocaleString()}</td>
                  <td>{c.cache_read_tokens.toLocaleString()}</td>
                  <td>{c.turns}</td>
                  <td>{c.duration_ms.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h2>QC findings ({findings.length})</h2>
      {findings.length === 0 ? (
        <div className="empty">아직 발견된 finding이 없습니다.</div>
      ) : (
        <table className="table findings">
          <thead>
            <tr><th>severity</th><th>category</th><th>title</th><th>QC</th><th>resolved</th></tr>
          </thead>
          <tbody>
            {findings.map((f) => {
              const qc = getAgentMeta(f.qc_agent_id);
              return (
                <tr key={f.id}>
                  <td><span className={`severity ${f.severity}`}>{f.severity}</span></td>
                  <td>{f.category}</td>
                  <td>{f.title}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span className={`avatar sm role-${qc.role}`} style={{ width: 20, height: 20, fontSize: 10 }}>
                        {qc.initial}
                      </span>
                      {qc.displayName}
                    </span>
                  </td>
                  <td>{f.resolved_at ? '✓' : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h2>Ralph runs ({ralph.length})</h2>
      {ralph.length === 0 ? (
        <div className="empty">Ralph 발동된 적 없음 — QC 통과 또는 finding 미발생.</div>
      ) : (
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
      )}

      <h2>Conversation</h2>
      {messages.length === 0 ? (
        <div className="empty">아직 메시지 없음.</div>
      ) : (
        <div className="thread">
          {messages.map((m) => {
            const meta = getAgentMeta(m.sender_id);
            const isSystem = m.sender_kind === 'system' && meta.role === 'system';
            return (
              <div className={`msg ${isSystem ? 'system' : ''}`} key={m.id}>
                <span className={`avatar role-${meta.role}`} title={meta.displayName}>
                  {meta.initial}
                </span>
                <div className="msg-body">
                  <div className="msg-head">
                    <span className="msg-name">
                      {meta.emoji && <span style={{ marginRight: 4 }}>{meta.emoji}</span>}
                      {meta.displayName}
                      <span className="role-tag">{meta.role}</span>
                    </span>
                    <span className="msg-time">{new Date(m.created_at).toLocaleString()}</span>
                  </div>
                  <div className="msg-text">{m.body_md}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
