-- 0006_more_roles.sql — expand agents.role CHECK to include devops + database.
-- SQLite cannot ALTER a CHECK constraint in place, so rebuild the table.
-- The migrate runner toggles foreign_keys=OFF around each migration so the
-- referencing tables (tasks/qc_findings/qc_scores) survive the rebuild;
-- agent IDs are preserved verbatim across the copy.

CREATE TABLE agents_new (
  id                   TEXT PRIMARY KEY,
  role                 TEXT NOT NULL CHECK (
    role IN ('triage', 'pm', 'ux', 'frontend', 'backend', 'daemon', 'ai', 'devops', 'database', 'qc')
  ),
  display_name         TEXT NOT NULL,
  definition_md_path   TEXT NOT NULL,
  current_task_id      TEXT,
  status               TEXT NOT NULL CHECK (status IN ('idle', 'busy', 'offline')),
  spawned_at           INTEGER NOT NULL,
  last_seen_at         INTEGER NOT NULL
);

INSERT INTO agents_new (id, role, display_name, definition_md_path, current_task_id, status, spawned_at, last_seen_at)
SELECT id, role, display_name, definition_md_path, current_task_id, status, spawned_at, last_seen_at
FROM agents;

DROP TABLE agents;
ALTER TABLE agents_new RENAME TO agents;

CREATE INDEX IF NOT EXISTS idx_agents_role_status ON agents(role, status);
