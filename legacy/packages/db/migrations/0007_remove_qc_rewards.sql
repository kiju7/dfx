-- 0007_remove_qc_rewards.sql — Intentional drop of QC reward bookkeeping.
--
-- Rationale: The reward-points / leaderboard mechanic introduced in 0001_init.sql
-- is being removed from the product. QC findings remain first-class artifacts,
-- but their value is now expressed solely by `severity`, `category`, and the
-- (existing) novelty signal derived at query time. No per-agent point totals,
-- no aggregate scoring table, no insert trigger.
--
-- This migration is destructive on purpose:
--   * DROP TRIGGER trg_qc_findings_after_insert  — fed qc_scores from inserts.
--   * DROP TABLE   qc_scores                     — agent cumulative point store.
--   * REBUILD      qc_findings WITHOUT reward_points column.
--     (SQLite supports DROP COLUMN since 3.35, but we rebuild for clarity and
--      to keep the migration deterministic across older sqlite builds bundled
--      with node:sqlite.) FKs from ralph_runs.finding_id -> qc_findings.id are
--      preserved because the migrate runner toggles foreign_keys=OFF around
--      each migration (see packages/db/src/migrate.ts).
--
-- Preserved columns on qc_findings: id, task_id, qc_agent_id, severity,
--   category, title, detail_md, resolved_at, created_at.
-- Preserved indexes: idx_findings_task, idx_findings_qc_time, idx_findings_task_cat.
--
-- API impact: FindingRow no longer carries reward_points. Downstream code in
--   apps/orchestrator and apps/dashboard has been updated in the same change.

DROP TRIGGER IF EXISTS trg_qc_findings_after_insert;

DROP TABLE IF EXISTS qc_scores;

CREATE TABLE qc_findings_new (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  qc_agent_id  TEXT NOT NULL REFERENCES agents(id),
  severity     TEXT NOT NULL CHECK (
    severity IN ('nit', 'minor', 'major', 'critical', 'blocker')
  ),
  category     TEXT NOT NULL,
  title        TEXT NOT NULL,
  detail_md    TEXT NOT NULL DEFAULT '',
  resolved_at  INTEGER,
  created_at   INTEGER NOT NULL
);

INSERT INTO qc_findings_new (id, task_id, qc_agent_id, severity, category, title, detail_md, resolved_at, created_at)
SELECT id, task_id, qc_agent_id, severity, category, title, detail_md, resolved_at, created_at
FROM qc_findings;

DROP TABLE qc_findings;
ALTER TABLE qc_findings_new RENAME TO qc_findings;

CREATE INDEX IF NOT EXISTS idx_findings_task     ON qc_findings(task_id);
CREATE INDEX IF NOT EXISTS idx_findings_qc_time  ON qc_findings(qc_agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_findings_task_cat ON qc_findings(task_id, category);
