import { queries } from '@agent-forge/db';
import { getAgentMeta } from '../../lib/agent-meta';

export const dynamic = 'force-dynamic';

const DAYS = 7;
const SPARK_WIDTH = 140;
const SPARK_HEIGHT = 28;

function buildSpark(values: number[], max: number): string {
  if (values.length === 0 || max <= 0) return '';
  const stepX = SPARK_WIDTH / Math.max(1, values.length - 1);
  return values
    .map((v, i) => {
      const x = i * stepX;
      const y = SPARK_HEIGHT - (v / max) * SPARK_HEIGHT;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

export default function Agents() {
  const all = queries.agents.listAll();
  const leaderboard = queries.agents.leaderboard();
  const daily = queries.findings.dailyForLastDays(DAYS);

  const startOfTodayMs = Math.floor(Date.now() / 86_400_000) * 86_400_000;
  const buckets: number[] = [];
  for (let i = DAYS - 1; i >= 0; i--) buckets.push(startOfTodayMs - i * 86_400_000);

  const perAgent: Record<string, number[]> = {};
  for (const row of leaderboard) perAgent[row.id] = buckets.map(() => 0);
  for (const d of daily) {
    const idx = buckets.indexOf(d.bucket_day);
    if (idx >= 0 && perAgent[d.qc_agent_id]) {
      perAgent[d.qc_agent_id]![idx] = d.findings;
    }
  }
  const sparkMax = Math.max(1, ...Object.values(perAgent).flatMap((arr) => arr));
  const totalMax = Math.max(1, ...leaderboard.map((r) => r.total_points));

  return (
    <>
      <h1>Team</h1>

      <h2>QC leaderboard <span style={{ fontWeight: 400, color: 'var(--fg-muted)', fontSize: 13 }}>· 최근 {DAYS}일</span></h2>
      {leaderboard.length === 0 ? (
        <div className="empty">아직 QC 활동 없음.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>QC agent</th>
              <th>total points</th>
              <th style={{ width: 220 }}>distribution</th>
              <th>findings</th>
              <th>trend ({DAYS}d)</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((row, i) => {
              const meta = getAgentMeta(row.id);
              const widthPct = (row.total_points / totalMax) * 100;
              const spark = perAgent[row.id] ?? [];
              return (
                <tr key={row.id}>
                  <td style={{ fontWeight: 700, color: i === 0 ? '#eab308' : i === 1 ? '#9ca3af' : i === 2 ? '#a16207' : 'var(--fg-muted)' }}>
                    {i + 1}
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <span className={`avatar role-${meta.role}`}>{meta.initial}</span>
                      <span>
                        <div style={{ fontWeight: 600 }}>{meta.displayName}</div>
                        <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>{row.id}</div>
                      </span>
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{row.total_points.toFixed(2)}</td>
                  <td>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${widthPct}%` }} />
                    </div>
                  </td>
                  <td>{row.findings_count}</td>
                  <td>
                    <svg width={SPARK_WIDTH} height={SPARK_HEIGHT} aria-label="trend">
                      <path d={buildSpark(spark, sparkMax)} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
                      {spark.map((v, idx) => (
                        <circle
                          key={idx}
                          cx={idx * (SPARK_WIDTH / Math.max(1, spark.length - 1))}
                          cy={SPARK_HEIGHT - (v / sparkMax) * SPARK_HEIGHT}
                          r={1.5}
                          fill={v > 0 ? 'var(--accent)' : 'var(--border-strong)'}
                        />
                      ))}
                    </svg>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

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
                <td><span className={`status-dot ${a.status === 'idle' ? 'done' : a.status === 'busy' ? 'in_progress' : 'pending'}`} />{a.status}</td>
                <td>{a.current_task_id?.slice(-8) ?? '—'}</td>
                <td style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{new Date(a.last_seen_at).toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
