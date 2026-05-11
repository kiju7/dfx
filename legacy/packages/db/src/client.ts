import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { workspacePath } from '@agent-forge/shared';

export type DbHandle = DatabaseSync;
export type { StatementSync };

export interface OpenOptions {
  readonly?: boolean;
}

export function getDbPath(): string {
  return process.env.AGENT_FORGE_DB ?? workspacePath('data/app.db');
}

export function open(opts: OpenOptions = {}): DbHandle {
  const path = getDbPath();
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { readOnly: opts.readonly ?? false });
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  if (!opts.readonly) db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

let writerSingleton: DbHandle | null = null;
let readerSingleton: DbHandle | null = null;

export function getWriter(): DbHandle {
  if (!writerSingleton) writerSingleton = open({ readonly: false });
  return writerSingleton;
}

export function getReader(): DbHandle {
  if (!readerSingleton) readerSingleton = open({ readonly: true });
  return readerSingleton;
}

export function closeAll(): void {
  writerSingleton?.close();
  readerSingleton?.close();
  writerSingleton = null;
  readerSingleton = null;
}

export type SqlParam = string | number | bigint | null | Uint8Array;
