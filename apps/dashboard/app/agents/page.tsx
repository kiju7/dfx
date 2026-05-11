import { queries } from '@agent-forge/db';

export const dynamic = 'force-dynamic';

export default function Agents() {
  const all = queries.agents.listAll();
  const leaderboard = queries.agents.leaderboard();

  return (
    <>
      <h1>Agents</h1>

      <h2>QC leaderboard</h2>
      <table className="table">
        <thead>
          <tr><th>#</th><th>QC agent</th><th>total points</th><th>findings</th></tr>
        </thead>
        <tbody>
          {leaderboard.map((row, i) => (
            <tr key={row.id}>
              <td>{i + 1}</td>
              <td>{row.display_name} ({row.id})</td>
              <td>{row.total_points.toFixed(2)}</td>
              <td>{row.findings_count}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Registered agents</h2>
      <table className="table">
        <thead>
          <tr><th>id</th><th>role</th><th>status</th><th>current task</th><th>last seen</th></tr>
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
