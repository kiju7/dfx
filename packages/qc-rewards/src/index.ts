import { SEVERITY_WEIGHTS, type QcFinding, type Severity } from '@agent-forge/shared';
import { queries } from '@agent-forge/db';

const NOVELTY_REPEAT_FACTOR = 0.3;

export interface TallyInput {
  task_id: string;
  qc_agent_id: string;
  reward_weight: number;
  findings: QcFinding[];
}

export interface RecordedFinding {
  finding_id: string;
  category: string;
  severity: Severity;
  reward_points: number;
  novel: boolean;
}

export function scoreFor(opts: {
  severity: Severity;
  reward_weight: number;
  novel: boolean;
}): number {
  const sev = SEVERITY_WEIGHTS[opts.severity];
  const factor = opts.novel ? 1.0 : NOVELTY_REPEAT_FACTOR;
  return sev * opts.reward_weight * factor;
}

export function tally(input: TallyInput): RecordedFinding[] {
  const seen = new Set(queries.findings.categoriesForTask(input.task_id));
  const recorded: RecordedFinding[] = [];

  for (const f of input.findings) {
    const novel = !seen.has(f.category);
    const points = scoreFor({
      severity: f.severity,
      reward_weight: input.reward_weight,
      novel,
    });
    const id = queries.findings.insert({
      task_id: input.task_id,
      qc_agent_id: input.qc_agent_id,
      severity: f.severity,
      category: f.category,
      title: f.title,
      detail_md: f.detail_md,
      reward_points: points,
    });
    seen.add(f.category);
    recorded.push({
      finding_id: id,
      category: f.category,
      severity: f.severity,
      reward_points: points,
      novel,
    });
  }

  return recorded;
}
