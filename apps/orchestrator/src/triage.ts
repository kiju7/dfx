import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAgent, extractJsonObject } from '@agent-forge/agents';
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

  const result = await runAgent({ spec, prompt, cwd: REPO_ROOT });
  const raw = extractJsonObject(result.text);
  return TriageOutputSchema.parse(raw);
}
