import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { ulid, findWorkspaceRoot } from '@agent-forge/shared';

const REPO_ROOT = findWorkspaceRoot();
const WORKTREES_ROOT = resolve(REPO_ROOT, 'data/worktrees');

export interface Worktree {
  path: string;
  branch: string;
  requestId: string;
  agentId: string;
}

function git(args: string[], cwd: string = REPO_ROOT): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string };
    const detail =
      typeof err.stderr === 'string'
        ? err.stderr
        : err.stderr instanceof Buffer
          ? err.stderr.toString('utf8')
          : err.message ?? '';
    throw new Error(`git ${args.join(' ')} failed: ${detail.trim()}`);
  }
}

export function ensureRepoReady(): void {
  if (!existsSync(resolve(REPO_ROOT, '.git'))) {
    throw new Error(`not a git repository: ${REPO_ROOT}`);
  }
  try {
    git(['rev-parse', '--verify', 'HEAD']);
  } catch {
    throw new Error('repository has no commits yet; create an initial commit first');
  }
  mkdirSync(WORKTREES_ROOT, { recursive: true });
}

export function create(opts: { requestId: string; agentId: string; base?: string }): Worktree {
  ensureRepoReady();
  const base = opts.base ?? 'main';
  const suffix = ulid().slice(-6).toLowerCase();
  const branch = `task/${opts.requestId.slice(-8).toLowerCase()}-${opts.agentId}-${suffix}`;
  const path = resolve(WORKTREES_ROOT, opts.requestId, `${opts.agentId}-${suffix}`);
  mkdirSync(resolve(WORKTREES_ROOT, opts.requestId), { recursive: true });
  git(['worktree', 'add', '-b', branch, path, base]);
  return { path, branch, requestId: opts.requestId, agentId: opts.agentId };
}

export interface MergeOptions {
  wt: Worktree;
  commitMessage: string;
  target?: string;
}

export function squashMerge(opts: MergeOptions): { sha: string } {
  const target = opts.target ?? 'main';
  // Ensure branch is committed first (squash any pending changes inside the worktree)
  const status = git(['status', '--porcelain'], opts.wt.path);
  if (status.length > 0) {
    git(['add', '-A'], opts.wt.path);
    git(['commit', '-m', `wip(${opts.wt.agentId}): worktree snapshot`], opts.wt.path);
  }
  git(['checkout', target]);
  git(['merge', '--squash', opts.wt.branch]);
  git(['commit', '-m', opts.commitMessage]);
  const sha = git(['rev-parse', 'HEAD']);
  return { sha };
}

export function park(wt: Worktree): void {
  git(['worktree', 'lock', '--reason', `parked-by-orchestrator`, wt.path]);
}

export function prune(wt: Worktree, opts: { deleteBranch?: boolean } = {}): void {
  try {
    git(['worktree', 'unlock', wt.path]);
  } catch {
    /* not locked is fine */
  }
  try {
    git(['worktree', 'remove', '--force', wt.path]);
  } catch {
    if (existsSync(wt.path)) rmSync(wt.path, { recursive: true, force: true });
  }
  git(['worktree', 'prune']);
  if (opts.deleteBranch) {
    try {
      git(['branch', '-D', wt.branch]);
    } catch {
      /* ignore */
    }
  }
}

export function listWorktrees(): Array<{ path: string; branch: string }> {
  const out = git(['worktree', 'list', '--porcelain']);
  const entries: Array<{ path: string; branch: string }> = [];
  let cur: { path?: string; branch?: string } = {};
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (cur.path) entries.push({ path: cur.path, branch: cur.branch ?? '' });
      cur = { path: line.slice('worktree '.length) };
    } else if (line.startsWith('branch ')) {
      cur.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    }
  }
  if (cur.path) entries.push({ path: cur.path, branch: cur.branch ?? '' });
  return entries;
}
