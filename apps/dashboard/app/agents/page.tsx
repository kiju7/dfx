import { queries } from '@agent-forge/db';

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

  // Build day buckets covering the last DAYS days (including today).
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
  const sparkMax = Math.max(
    1,
    ...Object.values(perAgent).flatMap((arr) => arr)
  );

  const totalMax = Math.max(1, ...leaderboard.map((r) => r.total_points));

  return (
    <>
      <h1>Agents</h1>

      <h2>QC leaderboard (last {DAYS} days)</h2>
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>QC agent</th>
            <th>total points</th>
            <th style={{ width: 220 }}>distribution</th>
            <th>findings</th>
            <th>trend</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((row, i) => {
            const widthPct = (row.total_points / totalMax) * 100;
            const spark = perAgent[row.id] ?? [];
            return (
              <tr key={row.id}>
                <td>{i + 1}</td>
                <td>{row.display_name} ({row.id})</td>
                <td>{row.total_points.toFixed(2)}</td>
                <td>
                  <div
                    style={{
                      background: '#21262d',
                      height: 14,
                      borderRadius: 3,
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        width: `${widthPct}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #1f3a93, #58a6ff)',
                        borderRadius: 3,
                      }}
                    />
                  </div>
                </td>
                <td>{row.findings_count}</td>
                <td>
                  <svg width={SPARK_WIDTH} height={SPARK_HEIGHT} aria-label="trend">
                    <path
                      d={buildSpark(spark, sparkMax)}
                      fill="none"
                      stroke="#58a6ff"
                      strokeWidth={1.5}
                    />
                    {spark.map((v, idx) => (
                      <circle
                        key={idx}
                        cx={idx * (SPARK_WIDTH / Math.max(1, spark.length - 1))}
                        cy={SPARK_HEIGHT - (v / sparkMax) * SPARK_HEIGHT}
                        r={1.5}
                        fill={v > 0 ? '#58a6ff' : '#30363d'}
                      />
                    ))}
                  </svg>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Registered agents</h2>
      <table className="table">
        <thead>
          <tr>
            <th>id</th>
            <th>role</th>
            <th>status</th>
            <th>current task</th>
            <th>last seen</th>
          </tr>
        </thead>
        <tbody>
          {all.map((a) => (
            <tr key={a.id}>
              <td>{a.id}</td>
              <td>{a.role}</td>
              <td>{a.status}</td>
              <td>{a.current_task_id?.slice(-8) ?? '—'}</td>
              <td>{new Date(a.last_seen_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
