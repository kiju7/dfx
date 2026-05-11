import { runAgentForJson } from '@agent-forge/agents';
import { queries } from '@agent-forge/db';
import {
  PmBreakdownSchema,
  findWorkspaceRoot,
  type PmBreakdown,
} from '@agent-forge/shared';
import * as registry from './registry.js';
import { publish } from './events/publisher.js';

const REPO_ROOT = findWorkspaceRoot();

export async function runPmBreakdown(input: {
  requestId: string;
  title: string;
  body: string;
}): Promise<PmBreakdown> {
  const spec = registry.firstByRole('pm');
  if (!spec) throw new Error('no PM agent registered');

  const prompt = [
    `# PM breakdown for request ${input.requestId.slice(-6)}`,
    '',
    `title: ${input.title}`,
    '',
    'body:',
    input.body || '(empty)',
    '',
    'Available specialist roles: frontend, backend, daemon, ai, ux.',
    'Respond with the JSON object per your output spec.',
  ].join('\n');

  const out = await runAgentForJson({
    opts: {
      spec,
      prompt,
      cwd: REPO_ROOT,
      onActivity: (a) =>
        publish('agent.activity', {
          taskId: null,
          requestId: input.requestId,
          agentId: spec.id,
          action: a.action,
          target: a.target,
          tool: a.tool,
        }),
    },
    parse: (raw) => PmBreakdownSchema.parse(raw),
  });
  queries.costs.record({
    request_id: input.requestId,
    agent_id: spec.id,
    purpose: 'pm',
    cost_usd: out.usage.costUsd,
    input_tokens: out.usage.inputTokens,
    output_tokens: out.usage.outputTokens,
    cache_read_tokens: out.usage.cacheReadTokens,
    cache_creation_tokens: out.usage.cacheCreationTokens,
    turns: out.usage.turns,
    duration_ms: out.durationMs,
  });
  queries.decisions.record({
    request_id: input.requestId,
    kind: 'pm-breakdown',
    scope: out.value.subtasks.map((s) => s.targets.join('+')).join(' | '),
    title: `PM split into ${out.value.subtasks.length} subtask(s)`,
    rationale_md: [
      out.value.summary,
      '',
      ...out.value.subtasks.map(
        (s, i) =>
          `${i}. **[${s.targets.join(', ')}]** ${s.title}${s.depends_on.length ? ` (depends on ${s.depends_on.join(', ')})` : ''}`
      ),
    ].join('\n'),
  });
  return out.value;
}
