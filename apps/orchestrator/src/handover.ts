import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { queries } from '@agent-forge/db';
import { findWorkspaceRoot } from '@agent-forge/shared';

const REPO_ROOT = findWorkspaceRoot();
const HANDOVER_DIR = resolve(REPO_ROOT, 'docs/handover');

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface WriteInput {
  task_id: string;
  request_title: string;
  agent_id: string;
  body_md: string;
  tags?: string[];
}

export function writeHandover(input: WriteInput): { id: string; path: string } {
  mkdirSync(HANDOVER_DIR, { recursive: true });
  const slug = slugify(`${input.agent_id}-${input.request_title}`);
  const filename = `${dateStamp()}-${slug || 'task'}-${input.task_id.slice(-6).toLowerCase()}.md`;
  const path = resolve(HANDOVER_DIR, filename);
  const relPath = `docs/handover/${filename}`;

  const findings = queries.findings.byTask(input.task_id);
  const ralph = queries.ralph.byTask(input.task_id);
  const diffstat = git(['diff', '--stat', 'HEAD~1', '--']);
  const lastSha = git(['rev-parse', '--short', 'HEAD']);

  const content = [
    `---`,
    `task_id: ${input.task_id}`,
    `agent_id: ${input.agent_id}`,
    `date: ${dateStamp()}`,
    `tags: [${(input.tags ?? []).join(', ')}]`,
    `---`,
    '',
    `# ${input.request_title}`,
    '',
    input.body_md.trim() || '(no summary)',
    '',
    `## Commit`,
    '',
    lastSha ? `\`${lastSha}\`` : '(no commit recorded)',
    '',
    '```diffstat',
    diffstat || '(no diff)',
    '```',
    '',
    `## QC findings (${findings.length})`,
    '',
    findings.length === 0
      ? '_None._'
      : findings
          .map(
            (f) =>
              `- **${f.severity}/${f.category}** ${f.title} (${f.qc_agent_id}, ${f.reward_points.toFixed(2)} pts${f.resolved_at ? ', resolved' : ''})`
          )
          .join('\n'),
    '',
    `## Ralph runs (${ralph.length})`,
    '',
    ralph.length === 0
      ? '_None._'
      : ralph
          .map((r) => `- ${r.id.slice(-6)} — ${r.iterations}/${r.max_iterations} iter, exit=${r.exit_reason ?? 'live'}`)
          .join('\n'),
    '',
  ].join('\n');

  writeFileSync(path, content, 'utf8');
  const id = queries.handover.upsert({
    task_id: input.task_id,
    title: input.request_title,
    content_md: content,
    tags: input.tags,
    file_path: relPath,
  });
  return { id, path };
}
