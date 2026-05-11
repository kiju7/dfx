/**
 * Map agent id / sender_id strings to a stable visual identity:
 * role (CSS class suffix), display name, single-letter avatar, optional emoji.
 *
 * Falls back gracefully for unknown / future agents.
 */

export interface AgentMeta {
  id: string;
  role: string;          // CSS class suffix → role-frontend, role-backend ...
  displayName: string;   // human-friendly name in chat header
  initial: string;       // 1–2 letter avatar text
  emoji?: string;        // optional emoji shown next to name
}

const META: Record<string, AgentMeta> = {
  // routing / planning
  triage:    { id: 'triage',    role: 'triage',   displayName: 'Triage',         initial: 'T',  emoji: '🧭' },
  'pm-lead': { id: 'pm-lead',   role: 'pm',       displayName: 'Product Manager', initial: 'P',  emoji: '📋' },

  // specialist devs
  'frontend-lead': { id: 'frontend-lead', role: 'frontend', displayName: 'Frontend Lead', initial: 'F', emoji: '🎨' },
  'backend-lead':  { id: 'backend-lead',  role: 'backend',  displayName: 'Backend Lead',  initial: 'B', emoji: '🛠' },
  'database-lead': { id: 'database-lead', role: 'database', displayName: 'Database',      initial: 'D', emoji: '🗄' },
  'devops-lead':   { id: 'devops-lead',   role: 'devops',   displayName: 'DevOps / SRE',  initial: 'O', emoji: '🚀' },
  'daemon-lead':   { id: 'daemon-lead',   role: 'daemon',   displayName: 'Daemon / Worker', initial: 'W', emoji: '⚙️' },
  'ux-lead':       { id: 'ux-lead',       role: 'ux',       displayName: 'UX Designer',   initial: 'U', emoji: '✨' },
  'ai-lead':       { id: 'ai-lead',       role: 'ai',       displayName: 'AI / Agent Dev', initial: 'A', emoji: '🤖' },

  // QC pool
  'qc-edgecase':   { id: 'qc-edgecase', role: 'qc', displayName: 'QC Edgecase',    initial: 'Qe', emoji: '🔍' },
  'qc-security':   { id: 'qc-security', role: 'qc', displayName: 'QC Security',    initial: 'Qs', emoji: '🛡' },
  'qc-perf':       { id: 'qc-perf',     role: 'qc', displayName: 'QC Performance', initial: 'Qp', emoji: '⚡' },
  'qc-ux':         { id: 'qc-ux',       role: 'qc', displayName: 'QC UX / A11y',   initial: 'Qu', emoji: '👁' },

  // system actors
  orchestrator: { id: 'orchestrator', role: 'system', displayName: 'Orchestrator', initial: 'OR', emoji: '🔧' },
  ralph:        { id: 'ralph',        role: 'system', displayName: 'Ralph Loop',   initial: 'R',  emoji: '🔁' },
};

export function getAgentMeta(senderId: string | null | undefined): AgentMeta {
  if (!senderId) {
    return { id: '?', role: 'system', displayName: 'system', initial: '?', emoji: '·' };
  }
  if (META[senderId]) return META[senderId]!;

  // Email-like sender (user)
  if (senderId.includes('@')) {
    const name = senderId.split('@')[0] ?? senderId;
    return {
      id: senderId,
      role: 'user',
      displayName: name,
      initial: name.slice(0, 1).toUpperCase(),
      emoji: '👤',
    };
  }

  // Heuristic role detection from id stem
  const role =
    senderId.startsWith('qc-')       ? 'qc' :
    senderId.startsWith('frontend')  ? 'frontend' :
    senderId.startsWith('backend')   ? 'backend' :
    senderId.startsWith('database')  ? 'database' :
    senderId.startsWith('devops')    ? 'devops' :
    senderId.startsWith('daemon')    ? 'daemon' :
    senderId.startsWith('ux')        ? 'ux' :
    senderId.startsWith('ai')        ? 'ai' :
    senderId.startsWith('pm')        ? 'pm' :
    senderId === 'triage'            ? 'triage' :
    'system';

  return {
    id: senderId,
    role,
    displayName: senderId,
    initial: senderId.slice(0, 2).toUpperCase(),
  };
}

export function senderKindToRole(kind: string): string {
  if (kind === 'user')   return 'user';
  if (kind === 'system') return 'system';
  return 'system';
}
