import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

let cached: string | null = null;

export function findWorkspaceRoot(start: string = process.cwd()): string {
  if (cached) return cached;
  let dir = resolve(start);
  while (true) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) {
      cached = dir;
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  cached = process.cwd();
  return cached;
}

export function workspacePath(...segments: string[]): string {
  return resolve(findWorkspaceRoot(), ...segments);
}
