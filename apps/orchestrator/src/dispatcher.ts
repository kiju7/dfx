import { runAgent, extractJsonObject } from '@agent-forge/agents';
import { queries } from '@agent-forge/db';
import { tally } from '@agent-forge/qc-rewards';
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

// Cap how many findings per task trigger a Ralph round to keep cost+latency bounded.
// Top-N by reward_points; the rest are recorded but left for the next run.
const RALPH_FINDING_CAP = Number(process.env.RALPH_FINDING_CAP ?? 3);

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

  const result = await runAgent({ spec: args.qc, cwd: qcCwd, prompt, complexity: args.target.complexity });

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

  const recorded = tally({
    task_id: args.target.task_id,
    qc_agent_id: args.qc.id,
    reward_weight: args.qc.reward_weight,
    findings: report.findings,
  });

  for (const r of recorded) {
    publish('qc.finding', {
      taskId: args.target.task_id,
      findingId: r.finding_id,
      qcAgentId: args.qc.id,
      severity: r.severity,
      category: r.category,
      title:
        report.findings.find((f) => f.category === r.category && f.severity === r.severity)?.title ??
        '(no title)',
      rewardPoints: r.reward_points,
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
  // Cap to the highest-value findings so a noisy QC pool doesn't burn the wall-clock budget.
  const findings = allActionable
    .slice()
    .sort((a, b) => b.reward_points - a.reward_points)
    .slice(0, RALPH_FINDING_CAP);
  if (allActionable.length > findings.length) {
    queries.messages.append({
      task_id: run.task_id,
      sender_kind: 'system',
      sender_id: 'orchestrator',
      body_md: `Ralph cap: ${allActionable.length} actionable findings — processing top ${findings.length} by reward_points. Remaining ${allActionable.length - findings.length} stay open and will surface in future runs.`,
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

  for (const f of findings) {
    await enterRalphLoop({
      requestId: input.requestId,
      task: run,
      finding: { id: f.id, category: f.category, severity: f.severity, title: f.title, detail: f.detail_md },
      followupRole: pickFollowupRole(f.category),
      complexity: run.complexity,
    });
  }
  // Single terminal transition after all Ralph rounds — Ralph itself no longer
  // flips the task status so multi-finding loops stay quiet.
  queries.tasks.setStatus(run.task_id, 'done');
  publish('task.status_changed', { taskId: run.task_id, from: 'qc', to: 'done' });
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
