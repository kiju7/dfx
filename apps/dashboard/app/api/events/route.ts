import { resolve } from 'node:path';
import { createReadStream, watch, statSync, existsSync, mkdirSync, closeSync, openSync } from 'node:fs';
import { workspacePath } from '@agent-forge/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function eventsPath(): string {
  return process.env.AGENT_FORGE_EVENTS ?? workspacePath('data/events.ndjson');
}

export async function GET(req: Request) {
  const path = eventsPath();
  if (!existsSync(path)) {
    mkdirSync(resolve(path, '..'), { recursive: true });
    closeSync(openSync(path, 'a'));
  }

  const encoder = new TextEncoder();
  let offset = statSync(path).size;
  let buffer = '';
  let closed = false;
  let watcher: ReturnType<typeof watch> | null = null;
  let heartbeat: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const safeEnqueue = (chunk: Uint8Array): boolean => {
        if (closed) return false;
        try {
          controller.enqueue(chunk);
          return true;
        } catch {
          closed = true;
          return false;
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
        if (watcher)   { try { watcher.close(); } catch { /* ignore */ } watcher = null; }
        try { controller.close(); } catch { /* already closed */ }
      };

      safeEnqueue(encoder.encode(`: connected\n\n`));

      const readNew = () => {
        if (closed) return;
        let size: number;
        try {
          size = statSync(path).size;
        } catch {
          return;
        }
        if (size <= offset) return;
        const rs = createReadStream(path, { start: offset, end: size - 1, encoding: 'utf8' });
        rs.on('data', (chunk) => {
          if (closed) { rs.destroy(); return; }
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !safeEnqueue(encoder.encode(`data: ${trimmed}\n\n`))) {
              rs.destroy();
              return;
            }
          }
        });
        rs.on('end', () => {
          offset = size;
        });
        rs.on('error', () => { /* file might rotate; ignore */ });
      };

      watcher = watch(path, { persistent: false }, () => readNew());
      heartbeat = setInterval(() => {
        if (!safeEnqueue(encoder.encode(`: ping\n\n`))) close();
      }, 15000);

      // Browser navigation / tab close → fetch aborts → cancel() below.
      // Also listen on the request's AbortSignal as a belt-and-suspenders.
      req.signal.addEventListener('abort', close);
    },
    cancel() {
      closed = true;
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
      if (watcher)   { try { watcher.close(); } catch { /* ignore */ } watcher = null; }
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
