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

  // Decide whether the fix continues in the original worktree (same role)
  // or branches into a fresh worktree from main (different role / cross-domain).
  let devSpec = ctx.task.spec;
  let wt: worktree.Worktree | null = ctx.task.wt;
  let sessionId: string | undefined = ctx.task.sessionId ?? undefined;
  let isolated = false;

  const followupSpec = registry.firstByRole(ctx.followupRole as AgentRole);
  if (followupSpec && followupSpec.id !== devSpec.id) {
    devSpec = followupSpec;
    sessionId = undefined; // fresh session, no resume
    try {
      wt = worktree.create({ requestId: ctx.requestId, agentId: devSpec.id });
      isolated = true;
      queries.messages.append({
        task_id: ctx.task.task_id,
        sender_kind: 'system',
        sender_id: 'ralph',
        body_md: `Cross-domain Ralph follow-up → ${devSpec.id} in fresh worktree ${wt.path} (category: ${ctx.finding.category}).`,
      });
      queries.decisions.record({
        request_id: ctx.requestId,
        task_id: ctx.task.task_id,
        kind: 'ralph-route',
        scope: devSpec.role,
        title: `Ralph → ${devSpec.id} (isolated)`,
        rationale_md: `Finding category \`${ctx.finding.category}\` mapped to role \`${devSpec.role}\`. Parent task was ${ctx.task.spec.id}; running in fresh worktree to avoid cross-domain merge conflicts.`,
      });
    } catch (e) {
      queries.messages.append({
        task_id: ctx.task.task_id,
        sender_kind: 'system',
        sender_id: 'ralph',
        body_md: `Failed to spawn isolated worktree: ${(e as Error).message}. Falling back to original worktree.`,
      });
      wt = ctx.task.wt;
    }
  } else {
    queries.decisions.record({
      request_id: ctx.requestId,
      task_id: ctx.task.task_id,
      kind: 'ralph-route',
      scope: devSpec.role,
      title: `Ralph → ${devSpec.id} (same worktree)`,
      rationale_md: `Finding category \`${ctx.finding.category}\` is in the same domain as the original developer agent. Reusing ${ctx.task.wt?.path ?? 'main repo'}.`,
    });
  }

  let iteration = 0;

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
      queries.decisions.record({
        request_id: ctx.requestId,
        task_id: ctx.task.task_id,
        kind: 'escalation',
        scope: ctx.finding.category,
        title: `Escalation: ${ctx.finding.category}/${ctx.finding.severity}`,
        rationale_md: `After ${iteration} iteration(s), finding "${ctx.finding.title}" was not resolved within Ralph thresholds.`,
      });
      queries.ralph.finish(runId, 'aborted');
      publish('ralph.exit', { runId, taskId: ctx.task.task_id, reason: 'aborted' });
      queries.tasks.setStatus(ctx.task.task_id, 'blocked');
      publish('task.status_changed', { taskId: ctx.task.task_id, from: 'qc', to: 'blocked' });
      if (isolated && wt) worktree.prune(wt, { deleteBranch: true });
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
      isolated
        ? 'You are operating in a FRESH worktree branched from main. Resolve this finding minimally — touch only files relevant to the finding category. When done, output the literal token TASK_DONE on its own line. If you cannot, output ESCALATE: <reason>.'
        : 'Resolve this finding inside the same worktree. When done, output the literal token TASK_DONE on its own line. If you cannot, output ESCALATE: <reason>.',
    ].join('\n');

    const cwd = wt?.path ?? REPO_ROOT;
    const result = await runAgent({ spec: devSpec, cwd, prompt, resume: sessionId });
    sessionId = result.sessionId ?? sessionId;

    queries.costs.record({
      task_id: ctx.task.task_id,
      agent_id: devSpec.id,
      purpose: 'ralph',
      cost_usd: result.usage.costUsd,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      cache_read_tokens: result.usage.cacheReadTokens,
      cache_creation_tokens: result.usage.cacheCreationTokens,
      turns: result.usage.turns,
      duration_ms: result.durationMs,
    });

    queries.messages.append({
      task_id: ctx.task.task_id,
      sender_kind: 'agent',
      sender_id: devSpec.id,
      body_md: result.text.slice(0, 8000),
    });

    if (result.text.includes('TASK_DONE') && !result.text.includes('ESCALATE:')) {
      queries.findings.resolve(ctx.finding.id);
      if (wt) {
        try {
          const merged = worktree.squashMerge({
            wt,
            commitMessage: `fix: ${ctx.finding.title} (${devSpec.id} via ralph${isolated ? ', isolated' : ''})`,
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
        if (isolated) worktree.prune(wt, { deleteBranch: true });
        // Note: non-isolated worktree is owned by the parent task and will be cleaned
        // up by processDevRun when the parent merges.
      }
      queries.ralph.finish(runId, 'qc_passed');
      publish('ralph.exit', { runId, taskId: ctx.task.task_id, reason: 'qc_passed' });
      if (!isolated) {
        queries.tasks.setStatus(ctx.task.task_id, 'done');
        publish('task.status_changed', { taskId: ctx.task.task_id, from: 'qc', to: 'done' });
      }
      appendLesson(
        `Ralph fix${isolated ? ' (isolated)' : ''}: ${ctx.finding.category}/${ctx.finding.severity} resolved by ${devSpec.id} in ${iteration} iter.`
      );
      return;
    }

    if (result.text.includes('ESCALATE:')) {
      queries.ralph.finish(runId, 'aborted');
      publish('ralph.exit', { runId, taskId: ctx.task.task_id, reason: 'aborted' });
      if (!isolated) {
        queries.tasks.setStatus(ctx.task.task_id, 'blocked');
        publish('task.status_changed', { taskId: ctx.task.task_id, from: 'qc', to: 'blocked' });
      }
      if (isolated && wt) worktree.prune(wt, { deleteBranch: true });
      return;
    }
  }

  queries.ralph.finish(runId, 'max_iter');
  publish('ralph.exit', { runId, taskId: ctx.task.task_id, reason: 'max_iter' });
  if (!isolated) {
    queries.tasks.setStatus(ctx.task.task_id, 'failed');
    publish('task.status_changed', { taskId: ctx.task.task_id, from: 'qc', to: 'failed' });
    if (wt) worktree.park(wt);
  } else if (wt) {
    worktree.park(wt);
  }
  appendLesson(
    `Ralph exhausted iter for ${ctx.finding.category}/${ctx.finding.severity}: "${ctx.finding.title}"`
  );
}
