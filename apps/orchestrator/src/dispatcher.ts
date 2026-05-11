import { runAgent, extractJsonObject } from '@agent-forge/agents';
import { queries } from '@agent-forge/db';
import { tally } from '@agent-forge/qc-rewards';
import {
  QcReportSchema,
  CATEGORY_TO_ROLE,
  findWorkspaceRoot,
  type AgentSpec,
  type TriageOutput,
  type Severity,
} from '@agent-forge/shared';
import * as registry from './registry.js';
import * as worktree from './worktree/manager.js';
import { publish } from './events/publisher.js';
import { enterRalphLoop } from './ralph/loop.js';

const REPO_ROOT = findWorkspaceRoot();

export interface DispatchInput {
  requestId: string;
  title: string;
  body: string;
  triage: TriageOutput;
}

interface DevRun {
  task_id: string;
  spec: AgentSpec;
  wt: worktree.Worktree | null;
  sessionId: string | null;
  ok: boolean;
  text: string;
}

const SEVERITY_RANK: Record<Severity, number> = {
  nit: 0,
  minor: 1,
  major: 2,
  critical: 3,
  blocker: 4,
};

async function spawnDev(input: {
  requestId: string;
  spec: AgentSpec;
  brief: string;
  title: string;
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
  });

  const ok = !run.text.includes('ESCALATE:') && run.stopReason !== 'error';
  queries.messages.append({
    task_id,
    sender_kind: 'agent',
    sender_id: input.spec.id,
    body_md: run.text.slice(0, 8000),
  });

  return { task_id, spec: input.spec, wt, sessionId: run.sessionId, ok, text: run.text };
}

async function runQc(args: {
  qc: AgentSpec;
  target: DevRun;
  requestId: string;
}): Promise<{ recorded: ReturnType<typeof tally> }> {
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

  const result = await runAgent({ spec: args.qc, cwd: qcCwd, prompt });

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
  return { recorded };
}

function pickFollowupRole(category: string): string {
  return CATEGORY_TO_ROLE[category as keyof typeof CATEGORY_TO_ROLE] ?? 'pm';
}

export async function handleRequest(input: DispatchInput): Promise<void> {
  // Resolve targets
  const targets: AgentSpec[] = input.triage.targets
    .map((role) => registry.firstByRole(role))
    .filter((s): s is AgentSpec => Boolean(s));

  if (targets.length === 0) {
    queries.requests.setStatus(input.requestId, 'blocked');
    publish('request.status_changed', {
      requestId: input.requestId,
      from: 'triage',
      to: 'blocked',
    });
    return;
  }

  queries.requests.setStatus(input.requestId, 'executing');
  publish('request.status_changed', {
    requestId: input.requestId,
    from: 'triage',
    to: 'executing',
  });

  const devRuns = await Promise.all(
    targets.map((spec) =>
      spawnDev({
        requestId: input.requestId,
        spec,
        brief: input.body || input.title,
        title: input.title,
      })
    )
  );

  for (const run of devRuns) {
    queries.tasks.setStatus(run.task_id, 'qc');
    publish('task.status_changed', { taskId: run.task_id, from: 'in_progress', to: 'qc' });
  }

  const qcs = registry.qcAgents();
  const qcResults = await Promise.all(
    devRuns.flatMap((run) =>
      qcs.map(async (qc) => ({ run, ...(await runQc({ qc, target: run, requestId: input.requestId })) }))
    )
  );

  // Ralph Loop for each dev run when severity >= minor
  for (const run of devRuns) {
    const findings = queries.findings
      .byTask(run.task_id)
      .filter((f) => f.resolved_at === null && SEVERITY_RANK[f.severity] >= SEVERITY_RANK.minor);

    if (findings.length === 0) {
      // No actionable findings — try to merge if worktree
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
      continue;
    }

    // Ralph Loop entry
    for (const f of findings) {
      await enterRalphLoop({
        requestId: input.requestId,
        task: run,
        finding: { id: f.id, category: f.category, severity: f.severity, title: f.title, detail: f.detail_md },
        followupRole: pickFollowupRole(f.category),
      });
    }
  }

  void qcResults; // referenced; results already persisted
  queries.requests.setStatus(input.requestId, 'done');
  publish('request.status_changed', {
    requestId: input.requestId,
    from: 'executing',
    to: 'done',
  });
}

export type { DevRun };
