import { createReadStream, existsSync, statSync, watch } from 'node:fs';
import { resolve } from 'node:path';

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:4317';
const EVENTS = resolve(process.cwd(), 'data/events.ndjson');
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 5 * 60_000);

interface AnyEvt {
  kind: string;
  payload: Record<string, unknown>;
  ts: number;
}

async function submit(): Promise<string> {
  const body = {
    type: 'feature',
    title: 'Smoke test: add hello banner',
    body_md: 'Add a simple <p>hello</p> banner under the kanban header on the dashboard home page.',
  };
  const res = await fetch(`${ORCHESTRATOR}/requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
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
          if (
            e.payload?.requestId === requestId ||
            (e.payload?.taskId && seen.some((s) => s.payload?.taskId === e.payload.taskId))
          ) {
            seen.push(e);
            console.log(`[smoke] evt ${e.kind} ${JSON.stringify(e.payload)}`);
            if (e.kind === 'request.status_changed' && (e.payload as { to?: string }).to === 'done') {
              resolveP();
            }
            if (e.kind === 'request.status_changed' && (e.payload as { to?: string }).to === 'blocked') {
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
    offset = statSync(EVENTS).size; // start from current EOF (live tail)
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
  const id = await submit();
  await tailEvents(id, Date.now() + TIMEOUT_MS);
  console.log('[smoke] OK — request reached terminal state');
}

main().catch((e) => {
  console.error('[smoke] FAIL:', e.message);
  process.exit(1);
});
