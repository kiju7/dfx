import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ulid, nowMs, workspacePath, type Evt } from '@agent-forge/shared';

export function eventsPath(): string {
  return process.env.AGENT_FORGE_EVENTS ?? workspacePath('data/events.ndjson');
}

let ensured = false;
function ensure(): string {
  const p = eventsPath();
  if (!ensured) {
    mkdirSync(dirname(p), { recursive: true });
    ensured = true;
  }
  return p;
}

type EvtPayload<K extends Evt['kind']> = Extract<Evt, { kind: K }>['payload'];

export function publish<K extends Evt['kind']>(kind: K, payload: EvtPayload<K>): void {
  const envelope: Evt = { v: 1, id: ulid(), ts: nowMs(), kind, payload } as Evt;
  appendFileSync(ensure(), JSON.stringify(envelope) + '\n', 'utf8');
}
