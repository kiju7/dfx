import { runAgent, extractJsonObject } from '@agent-forge/agents';
import {
  PmBreakdownSchema,
  findWorkspaceRoot,
  type PmBreakdown,
} from '@agent-forge/shared';
import * as registry from './registry.js';

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

  const result = await runAgent({ spec, prompt, cwd: REPO_ROOT });
  const raw = extractJsonObject(result.text);
  return PmBreakdownSchema.parse(raw);
}
