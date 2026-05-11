import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAgentForJson } from '@agent-forge/agents';
import { TriageOutputSchema, type TriageOutput, findWorkspaceRoot } from '@agent-forge/shared';
import { queries } from '@agent-forge/db';
import * as registry from './registry.js';

const REPO_ROOT = findWorkspaceRoot();
const AGENTS_MD = resolve(REPO_ROOT, 'AGENTS.md');
const LESSONS_TAIL = 8;

export interface TriageInput {
  requestId: string;
  type: string;
  title: string;
  body: string;
}

function recentLessons(): string {
  if (!existsSync(AGENTS_MD)) return '(none)';
  const text = readFileSync(AGENTS_MD, 'utf8');
  const lessonLines = text
    .split('\n')
    .filter((line) => line.startsWith('- ') && /\d{4}-\d{2}-\d{2}T/.test(line));
  if (lessonLines.length === 0) return '(none)';
  return lessonLines.slice(-LESSONS_TAIL).join('\n');
}

export async function runTriage(input: TriageInput): Promise<TriageOutput> {
  const spec = registry.byId('triage');
  const related = queries.tasks.recentRelated(input.title);
  const relatedSummary =
    related.length === 0
      ? '(none)'
      : related
          .slice(0, 5)
          .map((t) => `- ${t.id.slice(-6)} [${t.status}] ${t.title}`)
          .join('\n');

  const prompt = [
    `# Triage request ${input.requestId.slice(-6)}`,
    '',
    `type: ${input.type}`,
    `title: ${input.title}`,
    '',
    'body:',
    input.body || '(empty)',
    '',
    '## Recent related tasks',
    relatedSummary,
    '',
    '## Lessons accumulated by prior Ralph Loop runs (recent first to last)',
    recentLessons(),
    '',
    'Respond with the JSON object as specified.',
  ].join('\n');

  const out = await runAgentForJson({
    opts: { spec, prompt, cwd: REPO_ROOT },
    parse: (raw) => TriageOutputSchema.parse(raw),
  });
  queries.costs.record({
    request_id: input.requestId,
    agent_id: spec.id,
    purpose: 'triage',
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
    kind: 'triage',
    scope: out.value.route === 'pm' ? 'pm' : out.value.targets.join(','),
    title: `Triage: ${out.value.route} → [${out.value.targets.join(', ')}] · complexity=${out.value.complexity} · conf ${out.value.confidence.toFixed(2)}`,
    rationale_md: out.value.reasoning,
  });
  return out.value;
}
