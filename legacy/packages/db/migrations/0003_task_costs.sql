-- 0003_task_costs.sql — per-invocation cost & token accounting

CREATE TABLE IF NOT EXISTS task_costs (
  id                   TEXT PRIMARY KEY,
  task_id              TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id             TEXT NOT NULL,
  cost_usd             REAL NOT NULL DEFAULT 0,
  input_tokens         INTEGER NOT NULL DEFAULT 0,
  output_tokens        INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens    INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  turns                INTEGER NOT NULL DEFAULT 0,
  duration_ms          INTEGER NOT NULL DEFAULT 0,
  purpose              TEXT NOT NULL,           -- triage | pm | dev | qc | ralph
  created_at           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_costs_task    ON task_costs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_costs_agent   ON task_costs(agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_task_costs_purpose ON task_costs(purpose);
