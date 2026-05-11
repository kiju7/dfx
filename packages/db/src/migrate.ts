import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(here, '../migrations');

export function runMigrations(): { applied: string[]; skipped: string[] } {
  const db = open({ readonly: false });
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  const skipped: string[] = [];

  const isApplied = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?');
  const recordApplied = db.prepare(
    'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)'
  );

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (isApplied.get(version)) {
      skipped.push(version);
      continue;
    }
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      recordApplied.run(version, Date.now());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    applied.push(version);
  }

  db.close();
  return { applied, skipped };
}

const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  process.argv[1].endsWith('migrate.ts');

if (isDirectRun) {
  const result = runMigrations();
  console.log(JSON.stringify(result, null, 2));
}
