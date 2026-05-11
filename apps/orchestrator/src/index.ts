import { runMigrations } from '@agent-forge/db';
import { loadRegistry } from './registry.js';
import { startIpcServer, inFlightTasks } from './ipc/server.js';
import { eventsPath } from './events/publisher.js';
import { recoverOrphans, checkpoint, installShutdownHandlers } from './lifecycle.js';

function main(): void {
  const migrations = runMigrations();
  console.log(
    `[orchestrator] db migrations applied=${migrations.applied.join(',') || '(none)'} skipped=${migrations.skipped.length}`
  );
  const recovered = recoverOrphans();
  if (recovered.tasks > 0 || recovered.agents > 0) {
    console.log(
      `[orchestrator] recovered ${recovered.tasks} orphan task(s) and reset ${recovered.agents} busy agent(s) from prior shutdown`
    );
  }
  checkpoint();
  const specs = loadRegistry();
  console.log(`[orchestrator] loaded ${specs.length} agents: ${specs.map((s) => s.id).join(', ')}`);
  const modelOverride = process.env.AGENT_FORGE_MODEL;
  const triageOverride = process.env.AGENT_FORGE_TRIAGE_MODEL;
  if (modelOverride || triageOverride) {
    console.log(
      `[orchestrator] model overrides: dev/QC=${modelOverride ?? '(spec default)'} triage=${triageOverride ?? '(spec default)'}`
    );
  }
  console.log(`[orchestrator] events.ndjson => ${eventsPath()}`);
  installShutdownHandlers({ inFlight: inFlightTasks });
  startIpcServer();
}

main();
