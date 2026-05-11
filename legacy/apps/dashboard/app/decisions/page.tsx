import Link from 'next/link';
import { queries } from '@agent-forge/db';

export const dynamic = 'force-dynamic';

const KIND_META: Record<string, { color: string; bg: string; emoji: string }> = {
  triage:         { color: 'var(--d-triage-color)',     bg: 'var(--d-triage-bg)',     emoji: '🧭' },
  'pm-breakdown': { color: 'var(--d-pm-color)',         bg: 'var(--d-pm-bg)',         emoji: '📋' },
  'ralph-route':  { color: 'var(--d-route-color)',      bg: 'var(--d-route-bg)',      emoji: '🔁' },
  escalation:     { color: 'var(--d-escalation-color)', bg: 'var(--d-escalation-bg)', emoji: '⚠️' },
  merge:          { color: 'var(--d-merge-color)',       bg: 'var(--d-merge-bg)',      emoji: '🟢' },
  other:          { color: 'var(--d-other-color)',       bg: 'var(--d-other-bg)',      emoji: '·'  },
};

export default function DecisionsPage() {
  const rows = queries.decisions.listRecent(100);

  return (
    <>
      <h1>Decisions</h1>
      <p style={{ color: 'var(--fg-muted)' }}>
        오케스트레이터가 내린 트리아지·라우팅·에스컬레이션 결정의 ADR-lite 로그.
      </p>
      {rows.length === 0 ? (
        <div className="empty">아직 결정된 항목이 없습니다.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>when</th>
              <th>kind</th>
              <th>scope</th>
              <th>title</th>
              <th>links</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const km = KIND_META[d.kind] ?? KIND_META.other!;
              return (
                <tr key={d.id}>
                  <td style={{ color: 'var(--fg-muted)', fontSize: 12 }}>
                    {new Date(d.created_at).toLocaleString()}
                  </td>
                  <td>
                    <span
                      style={{
                        background: km.bg,
                        color: km.color,
                        padding: '3px 8px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                        border: `1px solid ${km.color}33`,
                      }}
                    >
                      {km.emoji} {d.kind}
                    </span>
                  </td>
                  <td><code style={{ fontSize: 11 }}>{d.scope}</code></td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{d.title}</div>
                    {d.rationale_md && (
                      <details style={{ marginTop: 6 }}>
                        <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--fg-muted)' }}>
                          rationale 펼치기
                        </summary>
                        <pre style={{
                          whiteSpace: 'pre-wrap',
                          fontSize: 12,
                          marginTop: 6,
                          background: 'var(--bg-sunken)',
                          padding: 10,
                          borderRadius: 6,
                        }}>
                          {d.rationale_md}
                        </pre>
                      </details>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {d.request_id && (
                      <Link href={`/requests/${d.request_id}`} style={{ fontSize: 12 }}>
                        r/{d.request_id.slice(-6)}
                      </Link>
                    )}
                    {d.task_id && (
                      <>
                        {' · '}
                        <Link href={`/tasks/${d.task_id}`} style={{ fontSize: 12 }}>
                          t/{d.task_id.slice(-6)}
                        </Link>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
