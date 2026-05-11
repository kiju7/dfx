import { runAgent, extractJsonObject } from '@agent-forge/agents';
import { queries } from '@agent-forge/db';
import {
  QcReportSchema,
  CATEGORY_TO_ROLE,
  findWorkspaceRoot,
  type AgentSpec,
  type AgentRole,
  type Complexity,
  type TriageOutput,
  type Severity,
  type PmSubtask,
} from '@agent-forge/shared';
import * as registry from './registry.js';
import * as worktree from './worktree/manager.js';
import { publish } from './events/publisher.js';
import { enterRalphLoop } from './ralph/loop.js';
import { runPmBreakdown } from './pm.js';
import { writeHandover } from './handover.js';

const REPO_ROOT = findWorkspaceRoot();

export interface DispatchInput {
  requestId: string;
  title: string;
  body: string;
  triage: TriageOutput;
}

interface TaskDescriptor {
  title: string;
  brief: string;
  targets: AgentRole[];
  depends_on: number[];
  complexity: Complexity;
}

interface DevRun {
  task_id: string;
  spec: AgentSpec;
  wt: worktree.Worktree | null;
  sessionId: string | null;
  ok: boolean;
  text: string;
  complexity: Complexity;
}

const SEVERITY_RANK: Record<Severity, number> = {
  nit: 0,
  minor: 1,
  major: 2,
  critical: 3,
  blocker: 4,
};

// 실무 워크플로에 맞게 모든 actionable finding 을 처리하는 것을 디폴트로
// 가져간다. 이전 캡(=3) 은 "일부만 고치고 나머지는 묻는" 형태가 돼서
// 사용자가 backlog 가 묻혀버리는 문제를 겪음. 안전망으로 cap 자체는 유지하되
// 디폴트를 50 으로 올려 사실상 모든 케이스를 처리하게 함. 비용이 우려되면
// 운영자가 env 로 다시 좁힐 수 있음.
const RALPH_FINDING_CAP = Number(process.env.RALPH_FINDING_CAP ?? 50);

async function spawnDev(input: {
  requestId: string;
  spec: AgentSpec;
  brief: string;
  title: string;
  complexity: Complexity;
}): Promise<DevRun> {
  const task_id = queries.tasks.insert({
    request_id: input.requestId,
    agent_id: input.spec.id,
    title: input.title,
    description_md: input.brief,
  });
  publish('task.created', { taskId: task_id, requestId: input.requestId, agentId: input.spec.id });

  let wt: worktree.Worktree | null = null;
  if (input.spec.worktree === 'required') {
    wt = worktree.create({ requestId: input.requestId, agentId: input.spec.id });
    queries.tasks.setWorktree(task_id, wt.path, wt.branch);
  }

  queries.tasks.setStatus(task_id, 'in_progress');
  publish('task.status_changed', { taskId: task_id, from: 'pending', to: 'in_progress' });
  queries.messages.append({
    task_id,
    sender_kind: 'system',
    sender_id: 'orchestrator',
    body_md: `Dispatched to ${input.spec.id}. Worktree: ${wt?.path ?? '(none)'}`,
  });

  const run = await runAgent({
    spec: input.spec,
    cwd: wt?.path ?? REPO_ROOT,
    prompt: input.brief,
    complexity: input.complexity,
    onActivity: (a) =>
      publish('agent.activity', {
        taskId: task_id,
        requestId: input.requestId,
        agentId: input.spec.id,
        action: a.action,
        target: a.target,
        tool: a.tool,
      }),
  });

  queries.costs.record({
    task_id,
    request_id: input.requestId,
    agent_id: input.spec.id,
    purpose: 'dev',
    cost_usd: run.usage.costUsd,
    input_tokens: run.usage.inputTokens,
    output_tokens: run.usage.outputTokens,
    cache_read_tokens: run.usage.cacheReadTokens,
    cache_creation_tokens: run.usage.cacheCreationTokens,
    turns: run.usage.turns,
    duration_ms: run.durationMs,
  });

  const ok = !run.text.includes('ESCALATE:') && run.stopReason !== 'error';
  queries.messages.append({
    task_id,
    sender_kind: 'agent',
    sender_id: input.spec.id,
    body_md: run.text.slice(0, 8000),
  });

  return { task_id, spec: input.spec, wt, sessionId: run.sessionId, ok, text: run.text, complexity: input.complexity };
}

async function runQc(args: {
  qc: AgentSpec;
  target: DevRun;
}): Promise<void> {
  const qcCwd = args.target.wt?.path ?? REPO_ROOT;
  const prompt = [
    `# QC review for task ${args.target.task_id.slice(-6)}`,
    '',
    `Strategy: ${args.qc.qc_strategy ?? 'general'}`,
    `Developer agent: ${args.target.spec.id}`,
    `Worktree: ${args.target.wt?.path ?? '(main repo)'}`,
    '',
    'Inspect the changes (git diff main..HEAD inside the cwd) and respond per your output spec.',
  ].join('\n');

  const result = await runAgent({
    spec: args.qc,
    cwd: qcCwd,
    prompt,
    complexity: args.target.complexity,
    onActivity: (a) =>
      publish('agent.activity', {
        taskId: args.target.task_id,
        requestId: null,
        agentId: args.qc.id,
        action: a.action,
        target: a.target,
        tool: a.tool,
      }),
  });

  queries.costs.record({
    task_id: args.target.task_id,
    agent_id: args.qc.id,
    purpose: 'qc',
    cost_usd: result.usage.costUsd,
    input_tokens: result.usage.inputTokens,
    output_tokens: result.usage.outputTokens,
    cache_read_tokens: result.usage.cacheReadTokens,
    cache_creation_tokens: result.usage.cacheCreationTokens,
    turns: result.usage.turns,
    duration_ms: result.durationMs,
  });

  let report: ReturnType<typeof QcReportSchema.parse>;
  try {
    const obj = extractJsonObject(result.text) as Record<string, unknown>;
    report = QcReportSchema.parse({ qc_agent_id: args.qc.id, findings: obj['findings'] ?? [] });
  } catch (e) {
    queries.messages.append({
      task_id: args.target.task_id,
      sender_kind: 'system',
      sender_id: 'orchestrator',
      body_md: `QC ${args.qc.id} produced unparseable output: ${(e as Error).message}`,
    });
    report = { qc_agent_id: args.qc.id, findings: [] };
  }

  // Reward scoring was retired — just record each finding once and emit the
  // corresponding qc.finding event for live dashboards.
  for (const f of report.findings) {
    const findingId = queries.findings.insert({
      task_id: args.target.task_id,
      qc_agent_id: args.qc.id,
      severity: f.severity,
      category: f.category,
      title: f.title,
      detail_md: f.detail_md,
    });
    publish('qc.finding', {
      taskId: args.target.task_id,
      findingId,
      qcAgentId: args.qc.id,
      severity: f.severity,
      category: f.category,
      title: f.title,
    });
  }
}

function pickFollowupRole(category: string): string {
  return CATEGORY_TO_ROLE[category as keyof typeof CATEGORY_TO_ROLE] ?? 'pm';
}

async function processDevRun(input: { requestId: string; title: string; run: DevRun }): Promise<void> {
  const run = input.run;
  queries.tasks.setStatus(run.task_id, 'qc');
  publish('task.status_changed', { taskId: run.task_id, from: 'in_progress', to: 'qc' });

  await Promise.all(registry.qcAgents().map((qc) => runQc({ qc, target: run })));

  const allActionable = queries.findings
    .byTask(run.task_id)
    .filter((f) => f.resolved_at === null && SEVERITY_RANK[f.severity] >= SEVERITY_RANK.minor);
  // Cap to the highest-severity findings so a noisy QC pool doesn't burn the
  // wall-clock budget. Severity rank breaks ties by created_at (earlier first).
  const findings = allActionable
    .slice()
    .sort((a, b) => {
      const r = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      return r !== 0 ? r : a.created_at - b.created_at;
    })
    .slice(0, RALPH_FINDING_CAP);
  if (allActionable.length > findings.length) {
    queries.messages.append({
      task_id: run.task_id,
      sender_kind: 'system',
      sender_id: 'orchestrator',
      body_md: `Ralph cap: ${allActionable.length} actionable findings — processing top ${findings.length} by severity. Remaining ${allActionable.length - findings.length} stay open and will surface in future runs.`,
    });
  }

  if (findings.length === 0) {
    if (run.wt && run.ok) {
      try {
        const merged = worktree.squashMerge({
          wt: run.wt,
          commitMessage: `task: ${input.title} (${run.spec.id})`,
        });
        queries.messages.append({
          task_id: run.task_id,
          sender_kind: 'system',
          sender_id: 'orchestrator',
          body_md: `Squash-merged to main: ${merged.sha.slice(0, 12)}`,
        });
      } catch (e) {
        queries.messages.append({
          task_id: run.task_id,
          sender_kind: 'system',
          sender_id: 'orchestrator',
          body_md: `Merge failed: ${(e as Error).message}`,
        });
      }
      worktree.prune(run.wt, { deleteBranch: true });
    }
    queries.tasks.setStatus(run.task_id, 'done');
    publish('task.status_changed', { taskId: run.task_id, from: 'qc', to: 'done' });
    try {
      writeHandover({
        task_id: run.task_id,
        request_title: input.title,
        agent_id: run.spec.id,
        body_md: run.text.slice(0, 2000),
        tags: [run.spec.role],
      });
    } catch (e) {
      queries.messages.append({
        task_id: run.task_id,
        sender_kind: 'system',
        sender_id: 'orchestrator',
        body_md: `Handover write failed: ${(e as Error).message}`,
      });
    }
    return;
  }

  // QC caught actionable findings → flip the task back from 'qc' to
  // 'in_progress' for the duration of Ralph rounds. Visually this moves the
  // card from the QC column to the In-progress column on the kanban, which is
  // what users expect — Ralph is actively writing code again.
  queries.tasks.setStatus(run.task_id, 'in_progress');
  publish('task.status_changed', { taskId: run.task_id, from: 'qc', to: 'in_progress' });

  // 병렬 처리 전략:
  //  - Finding 들을 매핑된 follow-up role 별로 그룹핑한다.
  //  - 같은 role 안에서는 순차 처리 — 그 role 이 isolated worktree 를
  //    공유하기 때문에 동시에 만지면 머지 충돌이 발생함.
  //  - 다른 role 끼리는 병렬 — 각자 독립 worktree 라 안전.
  //
  // 예: frontend 4건 + backend 3건 + database 1건 → 3개 워크트리가 동시에
  // 돌아가고, 각 워크트리 안에서는 한 건씩 차례로 fix.
  const byRole = new Map<string, typeof findings>();
  for (const f of findings) {
    const role = pickFollowupRole(f.category);
    const bucket = byRole.get(role) ?? [];
    bucket.push(f);
    byRole.set(role, bucket);
  }

  if (byRole.size > 1) {
    queries.messages.append({
      task_id: run.task_id,
      sender_kind: 'system',
      sender_id: 'orchestrator',
      body_md: `Parallel Ralph: dispatching ${findings.length} finding(s) across ${byRole.size} role(s) — ${
        Array.from(byRole.entries())
          .map(([r, fs]) => `${r}:${fs.length}`)
          .join(', ')
      } in parallel.`,
    });
  }

  await Promise.all(
    Array.from(byRole.entries()).map(async ([_role, bucket]) => {
      for (const f of bucket) {
        await enterRalphLoop({
          requestId: input.requestId,
          task: run,
          finding: { id: f.id, category: f.category, severity: f.severity, title: f.title, detail: f.detail_md },
          followupRole: pickFollowupRole(f.category),
          complexity: run.complexity,
        });
      }
    })
  );

  // Terminal transition after all Ralph rounds. Ralph itself no longer flips
  // the task status so multi-finding loops stay quiet.
  queries.tasks.setStatus(run.task_id, 'done');
  publish('task.status_changed', { taskId: run.task_id, from: 'in_progress', to: 'done' });
}

function resolveTargetSpecs(roles: AgentRole[]): AgentSpec[] {
  const out: AgentSpec[] = [];
  for (const role of roles) {
    const spec = registry.firstByRole(role);
    if (spec) out.push(spec);
  }
  return out;
}

async function executeTaskDescriptor(args: {
  requestId: string;
  desc: TaskDescriptor;
}): Promise<DevRun[]> {
  let targets = resolveTargetSpecs(args.desc.targets);
  if (targets.length === 0) {
    const fallback = registry.firstByRole('frontend');
    if (fallback) {
      queries.messages.append({
        task_id: null,
        sender_kind: 'system',
        sender_id: 'orchestrator',
        body_md: `No agent registered for targets [${args.desc.targets.join(',')}]. Falling back to ${fallback.id}.`,
      });
      targets = [fallback];
    } else {
      return [];
    }
  }

  const devRuns = await Promise.all(
    targets.map((spec) =>
      spawnDev({
        requestId: args.requestId,
        spec,
        brief: args.desc.brief,
        title: args.desc.title,
        complexity: args.desc.complexity,
      })
    )
  );

  await Promise.all(
    devRuns.map((run) => processDevRun({ requestId: args.requestId, title: args.desc.title, run }))
  );

  return devRuns;
}

async function executeWaves(args: {
  requestId: string;
  descriptors: TaskDescriptor[];
}): Promise<void> {
  const completed = new Set<number>();
  let safety = args.descriptors.length + 1;

  while (completed.size < args.descriptors.length && safety-- > 0) {
    const wave = args.descriptors
      .map((d, i) => ({ d, i }))
      .filter(({ d, i }) => !completed.has(i) && d.depends_on.every((j) => completed.has(j)));

    if (wave.length === 0) {
      queries.messages.append({
        task_id: null,
        sender_kind: 'system',
        sender_id: 'orchestrator',
        body_md: `Breakdown stalled: cyclic depends_on detected. Pending: ${args.descriptors
          .map((_, i) => i)
          .filter((i) => !completed.has(i))
          .join(',')}`,
      });
      return;
    }

    await Promise.all(
      wave.map(({ d }) =>
        executeTaskDescriptor({ requestId: args.requestId, desc: d })
      )
    );

    for (const { i } of wave) completed.add(i);
  }
}

function toDescriptors(input: { triage: TriageOutput; title: string; body: string }): TaskDescriptor[] {
  return [
    {
      title: input.title,
      brief: input.body || input.title,
      targets: input.triage.targets,
      depends_on: [],
      complexity: input.triage.complexity,
    },
  ];
}

function pmSubtasksToDescriptors(
  subs: PmSubtask[],
  requestTitle: string,
  fallback: Complexity
): TaskDescriptor[] {
  return subs.map((s) => ({
    title: `${requestTitle} :: ${s.title}`,
    brief: s.brief,
    targets: s.targets,
    depends_on: s.depends_on,
    complexity: s.complexity ?? fallback,
  }));
}

export async function handleRequest(input: DispatchInput): Promise<void> {
  let descriptors: TaskDescriptor[];

  if (input.triage.route === 'pm' && registry.firstByRole('pm')) {
    try {
      const breakdown = await runPmBreakdown({
        requestId: input.requestId,
        title: input.title,
        body: input.body,
      });
      queries.messages.append({
        task_id: null,
        sender_kind: 'system',
        sender_id: 'pm-lead',
        body_md:
          '```json\n' + JSON.stringify(breakdown, null, 2) + '\n```',
      });
      descriptors = pmSubtasksToDescriptors(breakdown.subtasks, input.title, input.triage.complexity);
    } catch (e) {
      queries.messages.append({
        task_id: null,
        sender_kind: 'system',
        sender_id: 'orchestrator',
        body_md: `PM breakdown failed: ${(e as Error).message}. Falling back to direct route.`,
      });
      descriptors = toDescriptors(input);
    }
  } else {
    descriptors = toDescriptors(input);
  }

  if (descriptors.length === 0) {
    queries.requests.setStatus(input.requestId, 'blocked');
    publish('request.status_changed', { requestId: input.requestId, from: 'triage', to: 'blocked' });
    return;
  }

  queries.requests.setStatus(input.requestId, 'executing');
  publish('request.status_changed', { requestId: input.requestId, from: 'triage', to: 'executing' });

  await executeWaves({ requestId: input.requestId, descriptors });

  queries.requests.setStatus(input.requestId, 'done');
  publish('request.status_changed', { requestId: input.requestId, from: 'executing', to: 'done' });
}

export type { DevRun };
