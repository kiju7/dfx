import type { TaskStatus, AgentStatus, Severity, RalphExitReason } from './enums.js';

export type EventEnvelope<K extends string, P> = {
  v: 1;
  id: string;
  ts: number;
  kind: K;
  payload: P;
};

export type Evt =
  | EventEnvelope<'request.received', { requestId: string; type: string; title: string }>
  | EventEnvelope<'request.status_changed', { requestId: string; from: string; to: string }>
  | EventEnvelope<'task.created', { taskId: string; requestId: string; agentId: string }>
  | EventEnvelope<
      'task.status_changed',
      { taskId: string; from: TaskStatus; to: TaskStatus }
    >
  | EventEnvelope<'task.assigned', { taskId: string; agentId: string }>
  | EventEnvelope<
      'message.new',
      { taskId: string | null; messageId: string; senderId: string }
    >
  | EventEnvelope<
      'qc.finding',
      {
        taskId: string;
        findingId: string;
        qcAgentId: string;
        severity: Severity;
        category: string;
        title: string;
      }
    >
  | EventEnvelope<
      'ralph.iteration',
      { runId: string; taskId: string; iteration: number }
    >
  | EventEnvelope<
      'ralph.exit',
      { runId: string; taskId: string; reason: RalphExitReason }
    >
  | EventEnvelope<
      'agent.status_changed',
      { agentId: string; from: AgentStatus; to: AgentStatus }
    >
  | EventEnvelope<
      'artifact.added',
      { artifactId: string; taskId: string; kind: string; path: string }
    >
  | EventEnvelope<
      'agent.activity',
      {
        taskId: string | null;
        requestId: string | null;
        agentId: string;
        /** coarse action category used by UIs for icon selection */
        action: ActivityAction;
        /** human-readable target (file path, pattern, command head, etc.) */
        target: string;
        /** raw tool name from the SDK if available */
        tool?: string;
      }
    >;

export type EvtKind = Evt['kind'];

export const ACTIVITY_ACTIONS = [
  'reading',
  'writing',
  'editing',
  'searching',
  'running',
  'thinking',
  'fetching',
  'other',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

const TOOL_TO_ACTION: Record<string, ActivityAction> = {
  Read: 'reading',
  NotebookRead: 'reading',
  Glob: 'searching',
  Grep: 'searching',
  Edit: 'editing',
  MultiEdit: 'editing',
  Write: 'writing',
  NotebookEdit: 'editing',
  Bash: 'running',
  WebFetch: 'fetching',
  WebSearch: 'fetching',
};

const FILE_PATH_KEYS = ['file_path', 'notebook_path', 'path'] as const;

export function describeToolUse(
  toolName: string,
  input: unknown
): { action: ActivityAction; target: string; tool: string } | null {
  if (!toolName) return null;
  const action: ActivityAction = TOOL_TO_ACTION[toolName] ?? 'other';
  let target = '';
  const obj = (input && typeof input === 'object' ? (input as Record<string, unknown>) : {});

  // File-touching tools — surface the path (+ offset/limit hint so consecutive
  // Reads on the same file don't look identical when they're really reading
  // different ranges).
  for (const key of FILE_PATH_KEYS) {
    const v = obj[key];
    if (typeof v === 'string' && v.length > 0) {
      target = v;
      const offset = typeof obj['offset'] === 'number' ? obj['offset'] : undefined;
      const limit  = typeof obj['limit']  === 'number' ? obj['limit']  : undefined;
      if (offset !== undefined || limit !== undefined) {
        target += ` [@${offset ?? 0}${limit !== undefined ? `:${limit}` : ''}]`;
      }
      break;
    }
  }

  // Search tools — surface the pattern (+ optional path scope).
  if (!target && (toolName === 'Glob' || toolName === 'Grep')) {
    const pat  = obj['pattern'];
    const path = obj['path'];
    if (typeof pat === 'string') {
      target = pat;
      if (typeof path === 'string' && path.length > 0) target += ` in ${path}`;
    }
  }

  // Bash — surface a command head.
  if (!target && toolName === 'Bash') {
    const cmd = obj['command'];
    if (typeof cmd === 'string') target = cmd.slice(0, 80);
  }

  // WebFetch / WebSearch — surface the URL / query.
  if (!target && (toolName === 'WebFetch' || toolName === 'WebSearch')) {
    const u = obj['url'] ?? obj['query'];
    if (typeof u === 'string') target = u.slice(0, 80);
  }

  if (!target) target = toolName;
  return { action, target, tool: toolName };
}
