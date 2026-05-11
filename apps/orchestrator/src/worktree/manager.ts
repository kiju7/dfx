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

function safeStashMain(): { stashed: boolean; ref: string | null } {
  const status = git(['status', '--porcelain']);
  if (status.length === 0) return { stashed: false, ref: null };
  const msg = `agent-forge:auto-stash:${Date.now()}`;
  git(['stash', 'push', '--include-untracked', '-m', msg]);
  const ref = git(['stash', 'list', '--format=%gd %s'])
    .split('\n')
    .find((l) => l.includes(msg));
  return { stashed: true, ref: ref ? ref.split(' ')[0]! : null };
}

function safeStashPop(ref: string | null): { ok: boolean; conflict: boolean } {
  if (!ref) return { ok: true, conflict: false };
  try {
    git(['stash', 'pop', ref]);
    return { ok: true, conflict: false };
  } catch (e) {
    const msg = (e as Error).message;
    const conflict = /conflict/i.test(msg);
    return { ok: false, conflict };
  }
}

export function squashMerge(opts: MergeOptions): { sha: string; stashWarning?: string } {
  const target = opts.target ?? 'main';
  // 1) commit any pending edits inside the worktree itself
  const wtStatus = git(['status', '--porcelain'], opts.wt.path);
  if (wtStatus.length > 0) {
    git(['add', '-A'], opts.wt.path);
    git(['commit', '-m', `wip(${opts.wt.agentId}): worktree snapshot`], opts.wt.path);
  }

  // 2) stash anything dirty on the main checkout to allow the merge
  const stash = safeStashMain();

  let sha: string;
  try {
    git(['checkout', target]);
    git(['merge', '--squash', opts.wt.branch]);
    git(['commit', '-m', opts.commitMessage]);
    sha = git(['rev-parse', 'HEAD']);
  } catch (e) {
    if (stash.stashed) safeStashPop(stash.ref); // best-effort restore
    throw e;
  }

  // 3) restore the user's pending changes
  let stashWarning: string | undefined;
  if (stash.stashed) {
    const pop = safeStashPop(stash.ref);
    if (!pop.ok) {
      stashWarning = `auto-stash kept at ${stash.ref ?? '<unknown>'}${pop.conflict ? ' due to conflict' : ''}; run \`git stash list\` to recover.`;
    }
  }

  return { sha, stashWarning };
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
