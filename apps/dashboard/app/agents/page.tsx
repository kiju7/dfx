import { queries } from '@agent-forge/db';
import { getAgentMeta } from '../../lib/agent-meta';

export const dynamic = 'force-dynamic';

export default function Agents() {
  const all = queries.agents.listAll();

  return (
    <>
      <h1>Team</h1>
      <p style={{ color: 'var(--fg-muted)' }}>
        agent-forge 에 등록된 모든 에이전트. QC 리워드/리더보드는 제거되었습니다 —
        QC 활동량은 각 task의 findings 섹션에서 확인하세요.
      </p>

      <h2>Registered agents</h2>
      <table className="table">
        <thead>
          <tr>
            <th>agent</th>
            <th>role</th>
            <th>status</th>
            <th>current task</th>
            <th>last seen</th>
          </tr>
        </thead>
        <tbody>
          {all.map((a) => {
            const meta = getAgentMeta(a.id);
            return (
              <tr key={a.id}>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <span className={`avatar role-${meta.role}`}>{meta.initial}</span>
                    <span>
                      <div style={{ fontWeight: 600 }}>
                        {meta.emoji && <span style={{ marginRight: 4 }}>{meta.emoji}</span>}
                        {meta.displayName}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>{a.id}</div>
                    </span>
                  </span>
                </td>
                <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{a.role}</span></td>
                <td>
                  <span className={`status-dot ${a.status === 'idle' ? 'done' : a.status === 'busy' ? 'in_progress' : 'pending'}`} />
                  {a.status}
                </td>
                <td>{a.current_task_id?.slice(-8) ?? '—'}</td>
                <td style={{ color: 'var(--fg-muted)', fontSize: 12 }}>
                  {new Date(a.last_seen_at).toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
