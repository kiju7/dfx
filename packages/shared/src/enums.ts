export const REQUEST_TYPES = ['bug', 'feature', 'qc', 'fix'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_STATUSES = [
  'triage',
  'planning',
  'executing',
  'blocked',
  'done',
  'cancelled',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const TASK_STATUSES = [
  'pending',
  'in_progress',
  'qc',
  'blocked',
  'done',
  'failed',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const AGENT_ROLES = [
  'triage',
  'pm',
  'ux',
  'frontend',
  'backend',
  'daemon',
  'ai',
  'devops',
  'database',
  'qc',
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const AGENT_STATUSES = ['idle', 'busy', 'offline'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const SEVERITIES = ['nit', 'minor', 'major', 'critical', 'blocker'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  nit: 0,
  minor: 1,
  major: 3,
  critical: 8,
  blocker: 20,
};

export const QC_STRATEGIES = ['edgecase', 'security', 'perf', 'ux'] as const;
export type QcStrategy = (typeof QC_STRATEGIES)[number];

export const ARTIFACT_KINDS = [
  'diff',
  'design_doc',
  'screenshot',
  'qc_report',
  'log',
  'other',
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const SENDER_KINDS = ['user', 'agent', 'system'] as const;
export type SenderKind = (typeof SENDER_KINDS)[number];

export const RALPH_EXIT_REASONS = [
  'qc_passed',
  'max_iter',
  'aborted',
  'error',
] as const;
export type RalphExitReason = (typeof RALPH_EXIT_REASONS)[number];

export const FINDING_CATEGORIES = [
  'ui',
  'a11y',
  'layout',
  'api',
  'db',
  'schema',
  'migration',
  'query',
  'auth',
  'worker',
  'queue',
  'cron',
  'agent',
  'prompt',
  'tool',
  'perf',
  'security',
  'infra',
  'ci',
  'deploy',
  'docker',
  'other',
] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export const CATEGORY_TO_ROLE: Record<FindingCategory, AgentRole> = {
  ui: 'frontend',
  a11y: 'frontend',
  layout: 'frontend',
  api: 'backend',
  db: 'database',
  schema: 'database',
  migration: 'database',
  query: 'database',
  auth: 'backend',
  worker: 'daemon',
  queue: 'daemon',
  cron: 'daemon',
  agent: 'ai',
  prompt: 'ai',
  tool: 'ai',
  perf: 'backend',
  security: 'backend',
  infra: 'devops',
  ci: 'devops',
  deploy: 'devops',
  docker: 'devops',
  other: 'pm',
};
