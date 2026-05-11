import Link from 'next/link';
import { queries } from '@agent-forge/db';

export const dynamic = 'force-dynamic';

const kindColors: Record<string, string> = {
  triage: '#1f3a93',
  'pm-breakdown': '#5e3b8c',
  'ralph-route': '#1a472a',
  escalation: '#7d1f1f',
  merge: '#3d2e08',
  other: '#30363d',
};

export default function DecisionsPage() {
  const rows = queries.decisions.listRecent(100);

  return (
    <>
      <h1>Decisions</h1>
      <p style={{ color: '#8b949e' }}>
        오케스트레이터가 내린 트리아지·라우팅·에스컬레이션 결정의 ADR-lite 로그.
      </p>
      {rows.length === 0 ? (
        <p>아직 결정된 항목이 없습니다.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>when</th>
              <th>kind</th>
              <th>scope</th>
              <th>title</th>
              <th>request / task</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td>{new Date(d.created_at).toLocaleString()}</td>
                <td>
                  <span
                    style={{
                      background: kindColors[d.kind] ?? '#30363d',
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    {d.kind}
                  </span>
                </td>
                <td><code style={{ fontSize: 11 }}>{d.scope}</code></td>
                <td>
                  <div>{d.title}</div>
                  {d.rationale_md && (
                    <details style={{ marginTop: 4 }}>
                      <summary style={{ cursor: 'pointer', fontSize: 11, color: '#8b949e' }}>
                        rationale
                      </summary>
                      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 4 }}>
                        {d.rationale_md}
                      </pre>
                    </details>
                  )}
                </td>
                <td>
                  {d.request_id && (
                    <Link href={`/requests/${d.request_id}`}>r/{d.request_id.slice(-6)}</Link>
                  )}
                  {d.task_id && (
                    <>
                      {' '}
                      <Link href={`/tasks/${d.task_id}`}>t/{d.task_id.slice(-6)}</Link>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
