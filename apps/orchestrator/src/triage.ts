import { runAgent, extractJsonObject } from '@agent-forge/agents';
import { TriageOutputSchema, type TriageOutput, findWorkspaceRoot } from '@agent-forge/shared';
import { queries } from '@agent-forge/db';
import * as registry from './registry.js';

const REPO_ROOT = findWorkspaceRoot();

export interface TriageInput {
  requestId: string;
  type: string;
  title: string;
  body: string;
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
    `## Recent related tasks`,
    relatedSummary,
    '',
    'Respond with the JSON object as specified.',
  ].join('\n');

  const result = await runAgent({ spec, prompt, cwd: REPO_ROOT });
  const raw = extractJsonObject(result.text);
  const parsed = TriageOutputSchema.parse(raw);
  return parsed;
}
