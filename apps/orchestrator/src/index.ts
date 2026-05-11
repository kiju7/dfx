import { runMigrations } from '@agent-forge/db';
import { loadRegistry } from './registry.js';
import { startIpcServer } from './ipc/server.js';
import { eventsPath } from './events/publisher.js';

function main(): void {
  const migrations = runMigrations();
  console.log(
    `[orchestrator] db migrations applied=${migrations.applied.join(',') || '(none)'} skipped=${migrations.skipped.length}`
  );
  const specs = loadRegistry();
  console.log(`[orchestrator] loaded ${specs.length} agents: ${specs.map((s) => s.id).join(', ')}`);
  console.log(`[orchestrator] events.ndjson => ${eventsPath()}`);
  startIpcServer();
}

main();
