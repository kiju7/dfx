import { resolve } from 'node:path';
import { createReadStream, watch, statSync, existsSync, mkdirSync, closeSync, openSync } from 'node:fs';
import { workspacePath } from '@agent-forge/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function eventsPath(): string {
  return process.env.AGENT_FORGE_EVENTS ?? workspacePath('data/events.ndjson');
}

export async function GET() {
  const path = eventsPath();
  if (!existsSync(path)) {
    mkdirSync(resolve(path, '..'), { recursive: true });
    closeSync(openSync(path, 'a'));
  }

  const encoder = new TextEncoder();
  let offset = statSync(path).size;
  let buffer = '';

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`: connected\n\n`));

      const readNew = () => {
        const size = statSync(path).size;
        if (size <= offset) return;
        const rs = createReadStream(path, { start: offset, end: size - 1, encoding: 'utf8' });
        rs.on('data', (chunk) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) controller.enqueue(encoder.encode(`data: ${trimmed}\n\n`));
          }
        });
        rs.on('end', () => {
          offset = size;
        });
      };

      const watcher = watch(path, { persistent: false }, () => readNew());
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(`: ping\n\n`)), 15000);

      const close = () => {
        clearInterval(heartbeat);
        watcher.close();
        try { controller.close(); } catch { /* ignore */ }
      };
      // @ts-expect-error AbortSignal is available in modern node
      this.signal?.addEventListener?.('abort', close);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
