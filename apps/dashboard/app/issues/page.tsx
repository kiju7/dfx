import Link from 'next/link';
import { queries } from '@agent-forge/db';
import {
  CATEGORY_TO_ROLE,
  SEVERITIES,
  type Severity,
  type AgentRole,
} from '@agent-forge/shared';
import { getAgentMeta } from '../../lib/agent-meta';

export const dynamic = 'force-dynamic';

const SEVERITY_ORDER: Severity[] = ['blocker', 'critical', 'major', 'minor', 'nit'];

interface SearchParams {
  state?: 'open' | 'all';
  severity?: string;
  category?: string;
  role?: string;
}

function pickRole(category: string): AgentRole {
  return (CATEGORY_TO_ROLE as Record<string, AgentRole>)[category] ?? 'pm';
}

function ralphStatusLabel(row: ReturnType<typeof queries.findings.listIssues>[number]): {
  label: string;
  bg: string;
  color: string;
} {
  if (row.resolved_at !== null) {
    return { label: '✓ resolved', bg: 'color-mix(in srgb, var(--st-done) 15%, white)', color: '#15803d' };
  }
  if (!row.ralph_run_id) {
    return { label: 'unassigned', bg: 'color-mix(in srgb, #f97316 15%, white)', color: '#c2410c' };
  }
  if (row.ralph_exit_reason === 'qc_passed') {
    return { label: '✓ fixed', bg: 'color-mix(in srgb, var(--st-done) 15%, white)', color: '#15803d' };
  }
  if (row.ralph_exit_reason === 'max_iter' || row.ralph_exit_reason === 'aborted' || row.ralph_exit_reason === 'error') {
    return { label: '✗ ' + row.ralph_exit_reason, bg: 'color-mix(in srgb, #ef4444 15%, white)', color: '#b91c1c' };
  }
  return { label: '진행 중', bg: 'color-mix(in srgb, #3b82f6 15%, white)', color: '#1d4ed8' };
}

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const state = params.state === 'all' ? 'all' : 'open';
  const filterSeverity = params.severity ?? '';
  const filterCategory = params.category ?? '';
  const filterRole = params.role ?? '';

  const counts = queries.findings.severityCountsForOpen();
  const countMap = new Map<string, number>(counts.map((c) => [c.severity, c.count]));

  // single fetch — filter client-side for simplicity (limit 500)
  const all = queries.findings.listIssues({ onlyOpen: state === 'open' });

  const filtered = all.filter((row) => {
    if (filterSeverity && row.severity !== filterSeverity) return false;
    if (filterCategory && row.category !== filterCategory) return false;
    if (filterRole && pickRole(row.category) !== filterRole) return false;
    return true;
  });

  const allCategories = Array.from(new Set(all.map((r) => r.category))).sort();
  const allRoles = Array.from(new Set(all.map((r) => pickRole(r.category)))).sort();

  return (
    <>
      <h1>Issues</h1>
      <p style={{ color: 'var(--fg-muted)' }}>
        모든 QC finding 의 누적 보드. 처리 안 된 issue 는 backlog 로 남아 다음 라운드에 잡혀요.
        실무 트래커처럼 사용하세요 — 묻혀버린 건 없음.
      </p>

      {/* severity totals (open only) */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12, marginBottom: 18 }}>
        {SEVERITY_ORDER.map((s) => (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className={`severity ${s}`}>{s}</span>
            <span style={{ fontWeight: 600 }}>{countMap.get(s) ?? 0}</span>
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg-muted)' }}>
          open 합계: <b style={{ color: 'var(--fg)' }}>{counts.reduce((a, c) => a + c.count, 0)}</b>
        </span>
      </div>

      {/* filters */}
      <form method="get" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
        <label style={{ fontSize: 11, color: 'var(--fg-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          상태
          <select name="state" defaultValue={state} style={selectStyle()}>
            <option value="open">open 만</option>
            <option value="all">전체 (resolved 포함)</option>
          </select>
        </label>
        <label style={{ fontSize: 11, color: 'var(--fg-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          severity
          <select name="severity" defaultValue={filterSeverity} style={selectStyle()}>
            <option value="">전부</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 11, color: 'var(--fg-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          category
          <select name="category" defaultValue={filterCategory} style={selectStyle()}>
            <option value="">전부</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 11, color: 'var(--fg-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          assignee role
          <select name="role" defaultValue={filterRole} style={selectStyle()}>
            <option value="">전부</option>
            {allRoles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          style={{
            padding: '7px 14px',
            background: 'var(--accent)',
            color: 'white',
            border: 0,
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          적용
        </button>
      </form>

      {filtered.length === 0 ? (
        <div className="empty">조건에 맞는 issue 없음.</div>
      ) : (
        <table className="table findings">
          <thead>
            <tr>
              <th>severity</th>
              <th>category</th>
              <th>title</th>
              <th>QC</th>
              <th>→ role</th>
              <th>status</th>
              <th>task</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const qc = getAgentMeta(row.qc_agent_id);
              const role = pickRole(row.category);
              const status = ralphStatusLabel(row);
              return (
                <tr key={row.id}>
                  <td><span className={`severity ${row.severity}`}>{row.severity}</span></td>
                  <td><code style={{ fontSize: 11 }}>{row.category}</code></td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{row.title}</div>
                    {row.detail_md && (
                      <details style={{ marginTop: 4 }}>
                        <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--fg-muted)' }}>
                          detail
                        </summary>
                        <pre style={{
                          whiteSpace: 'pre-wrap',
                          fontSize: 12,
                          marginTop: 6,
                          background: 'var(--bg-sunken)',
                          padding: 10,
                          borderRadius: 6,
                        }}>{row.detail_md}</pre>
                      </details>
                    )}
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span className={`avatar sm role-${qc.role}`} style={{ width: 20, height: 20, fontSize: 10 }}>
                        {qc.initial}
                      </span>
                      <span style={{ fontSize: 12 }}>{qc.displayName}</span>
                    </span>
                  </td>
                  <td>
                    <span
                      className={`avatar sm role-${role}`}
                      style={{ width: 20, height: 20, fontSize: 10 }}
                      title={role}
                    >
                      {role.slice(0, 1).toUpperCase()}
                    </span>
                    <span style={{ fontSize: 12, marginLeft: 6 }}>{role}</span>
                  </td>
                  <td>
                    <span style={{
                      background: status.bg,
                      color: status.color,
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}>
                      {status.label}
                    </span>
                  </td>
                  <td>
                    <Link href={`/tasks/${row.task_id}`} style={{ fontSize: 12 }}>
                      ⌗ {row.task_id.slice(-6)}
                    </Link>
                    <div style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>
                      {row.task_title.slice(0, 40)}
                    </div>
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

function selectStyle(): React.CSSProperties {
  return {
    background: 'var(--bg-elev)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '6px 8px',
    fontSize: 12,
    color: 'var(--fg)',
  };
}
