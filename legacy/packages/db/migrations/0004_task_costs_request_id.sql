-- 0004_task_costs_request_id.sql — allow recording triage/PM cost before any task exists.
-- SQLite doesn't let us drop NOT NULL in place, so rebuild the table.
-- (The migrate runner already wraps each file in a transaction.)

CREATE TABLE task_costs_new (
  id                    TEXT PRIMARY KEY,
  task_id               TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  request_id            TEXT,
  agent_id              TEXT NOT NULL,
  cost_usd              REAL NOT NULL DEFAULT 0,
  input_tokens          INTEGER NOT NULL DEFAULT 0,
  output_tokens         INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens     INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  turns                 INTEGER NOT NULL DEFAULT 0,
  duration_ms           INTEGER NOT NULL DEFAULT 0,
  purpose               TEXT NOT NULL,
  created_at            INTEGER NOT NULL
);

INSERT INTO task_costs_new (id, task_id, request_id, agent_id, cost_usd, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, turns, duration_ms, purpose, created_at)
SELECT id, task_id, NULL, agent_id, cost_usd, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, turns, duration_ms, purpose, created_at
FROM task_costs;

DROP TABLE task_costs;
ALTER TABLE task_costs_new RENAME TO task_costs;

CREATE INDEX IF NOT EXISTS idx_task_costs_task    ON task_costs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_costs_request ON task_costs(request_id);
CREATE INDEX IF NOT EXISTS idx_task_costs_agent   ON task_costs(agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_task_costs_purpose ON task_costs(purpose);
