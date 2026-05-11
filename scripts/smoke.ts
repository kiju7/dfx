import { createReadStream, existsSync, statSync, watch } from 'node:fs';
import { resolve } from 'node:path';

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:4317';
const EVENTS = resolve(process.cwd(), 'data/events.ndjson');
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 12 * 60_000);

interface AnyEvt {
  kind: string;
  payload: Record<string, unknown>;
  ts: number;
}

interface Scenario {
  type: 'bug' | 'feature' | 'qc' | 'fix';
  title: string;
  body_md: string;
}

const SCENARIOS: Record<string, Scenario> = {
  direct: {
    type: 'fix',
    title: 'Frontend: rename Board heading to "Task Board"',
    body_md:
      'Single-file frontend rename in apps/dashboard/app/page.tsx — change the `<h1>Board</h1>` to `<h1>Task Board</h1>`. No layout, no API changes. Trivial, single-domain.',
  },
  breakdown: {
    type: 'feature',
    title: 'Add /version: orchestrator endpoint + dashboard footer label',
    body_md: [
      'Cross-domain feature.',
      '',
      'Backend (orchestrator):',
      '- Add GET /version to apps/orchestrator/src/ipc/server.ts',
      '- Response: {"version":"0.1.0","startedAt":<unix-ms>}',
      '',
      'Frontend (dashboard):',
      '- Add a small footer in apps/dashboard/app/layout.tsx that says "agent-forge v0.1.0" (statically; do not fetch).',
      '- Style with class="footer" similar to .topbar — color #8b949e, font-size 11px, padding 12px.',
      '',
      'Touches two distinct domains, so route via PM.',
    ].join('\n'),
  },
};

function pickScenario(): Scenario {
  const name = (process.env.SMOKE_SCENARIO ?? 'direct').toLowerCase();
  const s = SCENARIOS[name];
  if (!s) throw new Error(`unknown scenario: ${name}. options: ${Object.keys(SCENARIOS).join(', ')}`);
  console.log(`[smoke] scenario=${name}`);
  return s;
}

async function submit(s: Scenario): Promise<string> {
  const res = await fetch(`${ORCHESTRATOR}/requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(s),
  });
  if (!res.ok) throw new Error(`submit failed: ${res.status} ${await res.text()}`);
  const out = (await res.json()) as { id: string };
  console.log('[smoke] submitted request', out.id);
  return out.id;
}

async function tailEvents(requestId: string, deadline: number): Promise<void> {
  if (!existsSync(EVENTS)) throw new Error(`no events file: ${EVENTS}`);
  let offset = 0;
  let buffer = '';
  const trackedTasks = new Set<string>();
  const seen: AnyEvt[] = [];

  return new Promise((resolveP, rejectP) => {
    const consume = (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const e = JSON.parse(trimmed) as AnyEvt;
          const payload = e.payload as Record<string, unknown>;
          const payloadReq = payload['requestId'];
          const payloadTask = payload['taskId'];
          const matches =
            payloadReq === requestId ||
            (typeof payloadTask === 'string' && trackedTasks.has(payloadTask));
          if (matches) {
            seen.push(e);
            if (e.kind === 'task.created' && typeof payloadTask === 'string') {
              trackedTasks.add(payloadTask);
            }
            console.log(`[smoke] evt ${e.kind} ${JSON.stringify(payload)}`);
            if (
              e.kind === 'request.status_changed' &&
              (payload['to'] === 'done' || payload['to'] === 'blocked')
            ) {
              resolveP();
            }
          }
        } catch {
          /* ignore */
        }
      }
    };

    const readNew = () => {
      const size = statSync(EVENTS).size;
      if (size <= offset) return;
      const rs = createReadStream(EVENTS, { start: offset, end: size - 1, encoding: 'utf8' });
      rs.on('data', (c) => consume(typeof c === 'string' ? c : c.toString('utf8')));
      rs.on('end', () => (offset = size));
    };
    offset = statSync(EVENTS).size;
    readNew();
    const watcher = watch(EVENTS, () => readNew());
    const poll = setInterval(readNew, 1000);

    setTimeout(() => {
      clearInterval(poll);
      watcher.close();
      rejectP(new Error(`timeout after ${TIMEOUT_MS}ms; seen kinds: ${seen.map((e) => e.kind).join(',')}`));
    }, deadline - Date.now());
  });
}

async function main() {
  const scenario = pickScenario();
  const id = await submit(scenario);
  await tailEvents(id, Date.now() + TIMEOUT_MS);
  console.log('[smoke] OK — request reached terminal state');
}

main().catch((e) => {
  console.error('[smoke] FAIL:', e.message);
  process.exit(1);
});
