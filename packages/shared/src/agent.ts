import { z } from 'zod';
import { AGENT_ROLES, QC_STRATEGIES } from './enums.js';

export const AgentSpecSchema = z.object({
  id: z.string().min(1),
  role: z.enum(AGENT_ROLES),
  display_name: z.string().optional(),
  model: z.string().default('claude-sonnet-4-6'),
  domain: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  allowed_paths: z.array(z.string()).default([]),
  denied_paths: z.array(z.string()).default([]),
  max_turns: z.number().int().positive().default(30),
  worktree: z.enum(['required', 'optional', 'forbidden']).default('required'),
  success_criteria: z.array(z.string()).default([]),
  escalation: z
    .object({
      to: z.enum(AGENT_ROLES),
      when: z.string(),
    })
    .nullable()
    .default(null),
  qc_strategy: z.enum(QC_STRATEGIES).nullable().default(null),
  reward_weight: z.number().positive().default(1.0),
});

export type AgentSpec = z.infer<typeof AgentSpecSchema> & {
  definition_md_path: string;
  body_md: string;
};

export const TriageOutputSchema = z.object({
  kind: z.enum(['bug', 'feature', 'qc', 'fix']),
  route: z.enum(['pm', 'direct']),
  targets: z.array(z.enum(AGENT_ROLES)).min(1),
  parallelism: z.number().int().min(1).max(5).default(1),
  confidence: z.number().min(0).max(1).default(0.5),
  reasoning: z.string().default(''),
});
export type TriageOutput = z.infer<typeof TriageOutputSchema>;

export const QcFindingSchema = z.object({
  category: z.string(),
  severity: z.enum(['nit', 'minor', 'major', 'critical', 'blocker']),
  title: z.string().min(1),
  detail_md: z.string().default(''),
  repro: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type QcFinding = z.infer<typeof QcFindingSchema>;

export const QcReportSchema = z.object({
  qc_agent_id: z.string(),
  findings: z.array(QcFindingSchema).default([]),
});
export type QcReport = z.infer<typeof QcReportSchema>;
