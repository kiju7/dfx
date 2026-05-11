import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { queries } from '@agent-forge/db';
import { REQUEST_TYPES } from '@agent-forge/shared';
import { publish } from '../events/publisher.js';
import { runTriage } from '../triage.js';
import { handleRequest } from '../dispatcher.js';

const PORT = Number(process.env.ORCHESTRATOR_PORT ?? 4317);

const CreateRequest = z.object({
  type: z.enum(REQUEST_TYPES),
  title: z.string().min(1).max(200),
  body_md: z.string().default(''),
  priority: z.number().int().min(1).max(5).default(3),
  submitter: z.string().nullish(),
});

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function send(res: ServerResponse, code: number, body: unknown): void {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function processRequest(requestId: string, title: string, body: string, type: string) {
  try {
    const triage = await runTriage({ requestId, type, title, body });
    queries.messages.append({
      task_id: null,
      sender_kind: 'system',
      sender_id: 'triage',
      body_md: '```json\n' + JSON.stringify(triage, null, 2) + '\n```',
    });
    await handleRequest({ requestId, title, body, triage });
  } catch (e) {
    queries.requests.setStatus(requestId, 'blocked');
    publish('request.status_changed', { requestId, from: 'executing', to: 'blocked' });
    queries.messages.append({
      task_id: null,
      sender_kind: 'system',
      sender_id: 'orchestrator',
      body_md: `Error: ${(e as Error).message}`,
    });
  }
}

export function startIpcServer(): void {
  const server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && req.url === '/requests') {
      try {
        const body = await readBody(req);
        const parsed = CreateRequest.parse(JSON.parse(body));
        const id = queries.requests.insert({
          type: parsed.type,
          title: parsed.title,
          body_md: parsed.body_md,
          priority: parsed.priority,
          submitter: parsed.submitter ?? null,
        });
        publish('request.received', {
          requestId: id,
          type: parsed.type,
          title: parsed.title,
        });
        // fire-and-forget pipeline; SSE drives UI
        void processRequest(id, parsed.title, parsed.body_md, parsed.type);
        send(res, 202, { id });
      } catch (e) {
        send(res, 400, { error: (e as Error).message });
      }
      return;
    }

    send(res, 404, { error: 'not found' });
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[orchestrator] ipc listening on http://127.0.0.1:${PORT}`);
  });
}
