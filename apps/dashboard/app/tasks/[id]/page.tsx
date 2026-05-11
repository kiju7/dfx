import { notFound } from 'next/navigation';
import Link from 'next/link';
import { queries } from '@agent-forge/db';
import LiveBoard from '../../LiveBoard';
import LiveActivity from './LiveActivity';
import { getAgentMeta, type AgentMeta } from '../../../lib/agent-meta';

export const dynamic = 'force-dynamic';

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

/**
 * id 표시용 말미 n자 슬라이스.
 * id가 n자 미만이면 앞을 '·'로 패딩해 항상 n자폭을 유지한다.
 * → 레이아웃이 id 길이에 무관하게 일정한 너비를 갖는다.
 */
function tailId(id: string, n: number): string {
  if (id.length >= n) return id.slice(-n);
  return id.padStart(n, '·');
}

// ─── Finding + ralph run 연결 타입 ───────────────────────────────────────────

type RalphRunRow = ReturnType<typeof queries.ralph.byTask>[number];
type FindingRow = ReturnType<typeof queries.findings.byTask>[number];

interface FindingWithRalph {
  finding: FindingRow;
  /** finding_id로 매칭된 ralph run (없으면 null) */
  ralphRun: RalphRunRow | null;
  /** ralph run → task → agent_id 로 얻은 에이전트 메타 (없으면 null) */
  followupAgent: AgentMeta | null;
}

// ─── 상태 배지 헬퍼 ──────────────────────────────────────────────────────────

/**
 * ralph run의 상태를 결정:
 * - ended_at null  → 진행 중 (blue)
 * - exit_reason === 'qc_passed' → 처리 완료 (green)
 * - exit_reason === 'aborted' | 'max_iter' | 'error' → 실패 (red)
 * - null (ralph run 자체 없음) → unassigned (orange)
 */
function ralphStatusBadge(ralphRun: RalphRunRow | null): {
  label: string;
  color: string;
  bg: string;
} {
  if (!ralphRun) {
    // unassigned → orange 강조
    return {
      label: 'unassigned',
      color: '#c2410c',
      bg: 'color-mix(in srgb, #f97316 18%, white)',
    };
  }
  if (ralphRun.ended_at === null) {
    return {
      label: '처리 중',
      color: '#1d4ed8',
      bg: 'color-mix(in srgb, #3b82f6 15%, white)',
    };
  }
  if (ralphRun.exit_reason === 'qc_passed') {
    return {
      label: '처리 완료',
      color: '#15803d',
      bg: 'color-mix(in srgb, var(--st-done) 15%, white)',
    };
  }
  if (
    ralphRun.exit_reason === 'aborted' ||
    ralphRun.exit_reason === 'max_iter' ||
    ralphRun.exit_reason === 'error'
  ) {
    return {
      label: '실패',
      color: '#b91c1c',
      bg: 'color-mix(in srgb, #ef4444 15%, white)',
    };
  }
  // exit_reason이 알 수 없는 값인 경우 → 에스컬레이션
  return {
    label: '에스컬레이션',
    color: '#b45309',
    bg: 'color-mix(in srgb, #f59e0b 15%, white)',
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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

  // ── finding별 ralph run + followup agent 연결 ──
  // Decision: ralph run은 finding_id 컬럼으로 finding을 참조한다.
  // ralph run이 있으면 그 task_id로 담당 task를 조회해 agent_id를 꺼낸다.
  // getById 호출은 finding당 최대 1회이며 SQLite read라 성능 문제 없음.
  const findingsWithRalph: FindingWithRalph[] = findings.map((f) => {
    const ralphRun = ralph.find((r) => r.finding_id === f.id) ?? null;
    if (!ralphRun) {
      return { finding: f, ralphRun: null, followupAgent: null };
    }
    const followupTask = queries.tasks.getById(ralphRun.task_id);
    const followupAgent =
      followupTask?.agent_id ? getAgentMeta(followupTask.agent_id) : null;
    return { finding: f, ralphRun, followupAgent };
  });

  // Live Activity 패널 가시성 & 모드
  // - in_progress / qc → 'active' (SSE 연결, 자동 스크롤, 높이 제한)
  // - done / blocked / failed → 'done' (SSE 닫힘, 완전 펼침)
  // - pending → hide (시작 전이라 보여줄 활동 없음)
  const liveActivityStatus: 'active' | 'done' =
    task.status === 'in_progress' || task.status === 'qc' ? 'active' : 'done';
  const showLiveActivity = task.status !== 'pending';

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
          request {tailId(task.request_id, 8)}
        </Link>
      </div>

      {task.worktree_path && (
        <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
          worktree <code>{task.worktree_path}</code> · branch <code>{task.branch_name}</code>
        </p>
      )}

      {showLiveActivity && (
        <>
          <h2>Live activity</h2>
          <div style={{
            background: 'var(--bg-elev)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 16,
            marginTop: 8,
          }}>
            <LiveActivity taskId={id} status={liveActivityStatus} />
          </div>
        </>
      )}

      <h2>Cost</h2>
      <p style={{ color: 'var(--fg-muted)' }}>
        총 <b style={{ color: 'var(--fg)' }}>${(costSummary?.cost_usd ?? 0).toFixed(4)}</b> · {costSummary?.invocations ?? 0} calls ·
        in {(costSummary?.input_tokens ?? 0).toLocaleString()} tok / out {(costSummary?.output_tokens ?? 0).toLocaleString()} tok ·
        cache read {(costSummary?.cache_read_tokens ?? 0).toLocaleString()} tok ·
        turns {costSummary?.turns ?? 0}
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

      {/* ── QC findings (카드형) ─────────────────────────────────────────── */}
      <h2>QC findings ({findings.length})</h2>
      {findings.length === 0 ? (
        <div className="empty">아직 발견된 finding이 없습니다.</div>
      ) : (
        <table className="table findings">
          <thead>
            <tr>
              <th>severity</th>
              <th>category</th>
              <th>title</th>
              <th>QC</th>
              <th>→ agent</th>
              <th>resolved</th>
            </tr>
          </thead>
          <tbody>
            {findingsWithRalph.map(({ finding: f, ralphRun: rr, followupAgent }) => {
              const qc = getAgentMeta(f.qc_agent_id);
              const badge = ralphStatusBadge(rr);

              return (
                /* details로 인라인 펼침 — 클릭 시 ralph run 상세 표시 */
                <tr key={f.id}>
                  <td><span className={`severity ${f.severity}`}>{f.severity}</span></td>
                  <td>{f.category}</td>
                  <td>
                    {/* details: summary = finding 제목, 펼치면 ralph 상세 */}
                    <details style={{ cursor: 'pointer' }}>
                      <summary style={{
                        listStyle: 'none',
                        fontWeight: 500,
                        color: 'var(--fg)',
                        userSelect: 'none',
                      }}>
                        {/* ▶/▼ 커스텀 토글 아이콘 (CSS ::-webkit-details-marker 숨김 대안) */}
                        <span aria-hidden="true" style={{
                          display: 'inline-block',
                          width: 14,
                          fontSize: 9,
                          color: 'var(--fg-subtle)',
                          marginRight: 4,
                        }}>▶</span>
                        {f.title}
                      </summary>

                      {/* ── ralph run 상세 패널 ──────────────────────── */}
                      <div style={{
                        marginTop: 8,
                        padding: '10px 12px',
                        background: 'var(--bg-sunken)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        fontSize: 12,
                        lineHeight: 1.6,
                        color: 'var(--fg-muted)',
                      }}>
                        {rr ? (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px' }}>
                              <span style={{ color: 'var(--fg-subtle)' }}>run id</span>
                              <code style={{ fontSize: 11 }}>{rr.id}</code>

                              <span style={{ color: 'var(--fg-subtle)' }}>iterations</span>
                              <span>{rr.iterations} / {rr.max_iterations}</span>

                              <span style={{ color: 'var(--fg-subtle)' }}>exit reason</span>
                              <span>{rr.exit_reason ?? '—'}</span>

                              <span style={{ color: 'var(--fg-subtle)' }}>started</span>
                              <span>{new Date(rr.started_at).toLocaleString()}</span>

                              {rr.ended_at !== null && (
                                <>
                                  <span style={{ color: 'var(--fg-subtle)' }}>ended</span>
                                  <span>{new Date(rr.ended_at).toLocaleString()}</span>
                                </>
                              )}

                              <span style={{ color: 'var(--fg-subtle)' }}>linked task</span>
                              <span>
                                <Link href={`/tasks/${rr.task_id}`} style={{ fontSize: 12 }}>
                                  {tailId(rr.task_id, 12)}
                                </Link>
                              </span>
                            </div>
                          </>
                        ) : (
                          <span style={{ color: 'var(--fg-subtle)', fontStyle: 'italic' }}>
                            연결된 ralph run 없음 — 아직 라우팅되지 않았습니다.
                          </span>
                        )}
                      </div>
                    </details>
                  </td>

                  {/* QC 에이전트 */}
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span className={`avatar sm role-${qc.role}`} style={{ width: 20, height: 20, fontSize: 10 }}>
                        {qc.initial}
                      </span>
                      {qc.displayName}
                    </span>
                  </td>

                  {/* → agent 컬럼: followup 에이전트 + 상태 배지 */}
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {followupAgent ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span className={`avatar sm role-${followupAgent.role}`} style={{ width: 20, height: 20, fontSize: 10 }}>
                            {followupAgent.initial}
                          </span>
                          <span style={{ fontSize: 12 }}>→ {followupAgent.displayName}</span>
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>→ unassigned</span>
                      )}
                      {/* 상태 배지 */}
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 7px',
                        borderRadius: 999,
                        fontSize: 10.5,
                        fontWeight: 600,
                        letterSpacing: '0.01em',
                        color: badge.color,
                        background: badge.bg,
                        border: `1px solid ${badge.color}40`,
                        alignSelf: 'flex-start',
                      }}>
                        {badge.label}
                      </span>
                    </div>
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
