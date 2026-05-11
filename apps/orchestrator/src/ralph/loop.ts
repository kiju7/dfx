import { resolve } from 'node:path';
import { appendFileSync } from 'node:fs';
import { runAgent } from '@agent-forge/agents';
import { queries } from '@agent-forge/db';
import { findWorkspaceRoot, type AgentRole, type Severity } from '@agent-forge/shared';
import * as registry from '../registry.js';
import * as worktree from '../worktree/manager.js';
import { publish } from '../events/publisher.js';
import type { DevRun } from '../dispatcher.js';

const REPO_ROOT = findWorkspaceRoot();
const AGENTS_MD = resolve(REPO_ROOT, 'AGENTS.md');

const ESCALATION_TOKENS = ['requires_spec_change', 'ambiguous_requirement', 'cross-domain'];

export interface RalphContext {
  requestId: string;
  task: DevRun;
  finding: {
    id: string;
    category: string;
    severity: Severity;
    title: string;
    detail: string;
  };
  followupRole: string;
  maxIterations?: number;
}

function shouldEscalate(args: { iterations: number; finding: RalphContext['finding'] }): boolean {
  const text = `${args.finding.title}\n${args.finding.detail}`.toLowerCase();
  if (ESCALATION_TOKENS.some((tok) => text.includes(tok))) return true;
  if (args.iterations >= 2 && args.finding.severity === 'blocker') return true;
  return false;
}

function appendLesson(text: string): void {
  appendFileSync(AGENTS_MD, `\n- ${new Date().toISOString()} — ${text}\n`, 'utf8');
}

export async function enterRalphLoop(ctx: RalphContext): Promise<void> {
  const max = ctx.maxIterations ?? 5;
  const runId = queries.ralph.start({
    task_id: ctx.task.task_id,
    finding_id: ctx.finding.id,
    max_iterations: max,
  });

  let devSpec = ctx.task.spec;
  // Re-route to the role suggested by the finding category if different
  const followupSpec = registry.firstByRole(ctx.followupRole as AgentRole);
  if (followupSpec && followupSpec.id !== devSpec.id) {
    devSpec = followupSpec;
    queries.messages.append({
      task_id: ctx.task.task_id,
      sender_kind: 'system',
      sender_id: 'ralph',
      body_md: `Re-routed Ralph follow-up to ${devSpec.id} (category: ${ctx.finding.category}).`,
    });
  }

  let iteration = 0;
  let sessionId = ctx.task.sessionId ?? undefined;

  while (iteration < max) {
    iteration = queries.ralph.bumpIteration(runId);
    publish('ralph.iteration', { runId, taskId: ctx.task.task_id, iteration });

    if (shouldEscalate({ iterations: iteration, finding: ctx.finding })) {
      queries.messages.append({
        task_id: ctx.task.task_id,
        sender_kind: 'system',
        sender_id: 'ralph',
        body_md: `Escalation triggered after ${iteration} iteration(s); finding ${ctx.finding.id.slice(-6)} requires triage re-run / PM (not implemented in Phase 1).`,
      });
      queries.ralph.finish(runId, 'aborted');
      publish('ralph.exit', { runId, taskId: ctx.task.task_id, reason: 'aborted' });
      queries.tasks.setStatus(ctx.task.task_id, 'blocked');
      publish('task.status_changed', {
        taskId: ctx.task.task_id,
        from: 'qc',
        to: 'blocked',
      });
      appendLesson(
        `Escalation: ${ctx.finding.category}/${ctx.finding.severity} — "${ctx.finding.title}" required PM (task ${ctx.task.task_id.slice(-6)}).`
      );
      return;
    }

    const prompt = [
      `# Ralph iteration ${iteration} — fix this finding`,
      '',
      `Category: ${ctx.finding.category}`,
      `Severity: ${ctx.finding.severity}`,
      `Title: ${ctx.finding.title}`,
      '',
      'Details:',
      ctx.finding.detail || '(no extra detail)',
      '',
      'Resolve this finding inside the same worktree. When done, output the literal token TASK_DONE on its own line. If you cannot, output ESCALATE: <reason>.',
    ].join('\n');

    const cwd = ctx.task.wt?.path ?? REPO_ROOT;
    const result = await runAgent({ spec: devSpec, cwd, prompt, resume: sessionId });
    sessionId = result.sessionId ?? sessionId;

    queries.messages.append({
      task_id: ctx.task.task_id,
      sender_kind: 'agent',
      sender_id: devSpec.id,
      body_md: result.text.slice(0, 8000),
    });

    if (result.text.includes('TASK_DONE') && !result.text.includes('ESCALATE:')) {
      queries.findings.resolve(ctx.finding.id);
      if (ctx.task.wt) {
        try {
          const merged = worktree.squashMerge({
            wt: ctx.task.wt,
            commitMessage: `fix: ${ctx.finding.title} (${devSpec.id} via ralph)`,
          });
          queries.messages.append({
            task_id: ctx.task.task_id,
            sender_kind: 'system',
            sender_id: 'orchestrator',
            body_md: `Ralph merged to main: ${merged.sha.slice(0, 12)}`,
          });
        } catch (e) {
          queries.messages.append({
            task_id: ctx.task.task_id,
            sender_kind: 'system',
            sender_id: 'orchestrator',
            body_md: `Ralph merge failed: ${(e as Error).message}`,
          });
        }
        worktree.prune(ctx.task.wt, { deleteBranch: true });
      }
      queries.ralph.finish(runId, 'qc_passed');
      publish('ralph.exit', { runId, taskId: ctx.task.task_id, reason: 'qc_passed' });
      queries.tasks.setStatus(ctx.task.task_id, 'done');
      publish('task.status_changed', { taskId: ctx.task.task_id, from: 'qc', to: 'done' });
      appendLesson(
        `Ralph fix: ${ctx.finding.category}/${ctx.finding.severity} resolved by ${devSpec.id} in ${iteration} iter.`
      );
      return;
    }

    if (result.text.includes('ESCALATE:')) {
      queries.ralph.finish(runId, 'aborted');
      publish('ralph.exit', { runId, taskId: ctx.task.task_id, reason: 'aborted' });
      queries.tasks.setStatus(ctx.task.task_id, 'blocked');
      publish('task.status_changed', { taskId: ctx.task.task_id, from: 'qc', to: 'blocked' });
      return;
    }
  }

  queries.ralph.finish(runId, 'max_iter');
  publish('ralph.exit', { runId, taskId: ctx.task.task_id, reason: 'max_iter' });
  queries.tasks.setStatus(ctx.task.task_id, 'failed');
  publish('task.status_changed', { taskId: ctx.task.task_id, from: 'qc', to: 'failed' });
  if (ctx.task.wt) worktree.park(ctx.task.wt);
  appendLesson(
    `Ralph exhausted iter for ${ctx.finding.category}/${ctx.finding.severity}: "${ctx.finding.title}"`
  );
}
