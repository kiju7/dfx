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
    >;

export type EvtKind = Evt['kind'];
