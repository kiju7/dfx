-- 0001_init.sql — Phase 1 MVP schema.
-- Conventions: PKs are ULID (text), timestamps are unix ms (integer), enums are CHECK.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS requests (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('bug', 'feature', 'qc', 'fix')),
  title       TEXT NOT NULL,
  body_md     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL CHECK (
    status IN ('triage', 'planning', 'executing', 'blocked', 'done', 'cancelled')
  ),
  priority    INTEGER NOT NULL DEFAULT 3,
  submitter   TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  closed_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_requests_status_priority ON requests(status, priority);
CREATE INDEX IF NOT EXISTS idx_requests_type_created   ON requests(type, created_at DESC);

CREATE TABLE IF NOT EXISTS agents (
  id                   TEXT PRIMARY KEY,
  role                 TEXT NOT NULL CHECK (
    role IN ('triage', 'pm', 'ux', 'frontend', 'backend', 'daemon', 'ai', 'qc')
  ),
  display_name         TEXT NOT NULL,
  definition_md_path   TEXT NOT NULL,
  current_task_id      TEXT,
  status               TEXT NOT NULL CHECK (status IN ('idle', 'busy', 'offline')),
  spawned_at           INTEGER NOT NULL,
  last_seen_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agents_role_status ON agents(role, status);

CREATE TABLE IF NOT EXISTS tasks (
  id              TEXT PRIMARY KEY,
  request_id      TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  parent_task_id  TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description_md  TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL CHECK (
    status IN ('pending', 'in_progress', 'qc', 'blocked', 'done', 'failed')
  ),
  worktree_path   TEXT,
  branch_name     TEXT,
  depth           INTEGER NOT NULL DEFAULT 0,
  started_at      INTEGER,
  ended_at        INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_request          ON tasks(request_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent           ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_agent_status     ON tasks(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_status_started   ON tasks(status, started_at);

CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY,
  task_id       TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  sender_kind   TEXT NOT NULL CHECK (sender_kind IN ('user', 'agent', 'system')),
  sender_id     TEXT NOT NULL,
  recipient_id  TEXT,
  body_md       TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_task_time      ON messages(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_time ON messages(recipient_id, created_at);

CREATE TABLE IF NOT EXISTS artifacts (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (
    kind IN ('diff', 'design_doc', 'screenshot', 'qc_report', 'log', 'other')
  ),
  path        TEXT NOT NULL,
  mime        TEXT,
  size_bytes  INTEGER,
  meta_json   TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts(task_id);

CREATE TABLE IF NOT EXISTS qc_findings (
  id             TEXT PRIMARY KEY,
  task_id        TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  qc_agent_id    TEXT NOT NULL REFERENCES agents(id),
  severity       TEXT NOT NULL CHECK (
    severity IN ('nit', 'minor', 'major', 'critical', 'blocker')
  ),
  category       TEXT NOT NULL,
  title          TEXT NOT NULL,
  detail_md      TEXT NOT NULL DEFAULT '',
  reward_points  REAL NOT NULL,
  resolved_at    INTEGER,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_findings_task         ON qc_findings(task_id);
CREATE INDEX IF NOT EXISTS idx_findings_qc_time      ON qc_findings(qc_agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_findings_task_cat     ON qc_findings(task_id, category);

CREATE TABLE IF NOT EXISTS qc_scores (
  agent_id         TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  total_points     REAL NOT NULL DEFAULT 0,
  findings_count   INTEGER NOT NULL DEFAULT 0,
  last_updated_at  INTEGER NOT NULL
);

CREATE TRIGGER IF NOT EXISTS trg_qc_findings_after_insert
AFTER INSERT ON qc_findings
BEGIN
  INSERT INTO qc_scores (agent_id, total_points, findings_count, last_updated_at)
  VALUES (NEW.qc_agent_id, NEW.reward_points, 1, NEW.created_at)
  ON CONFLICT(agent_id) DO UPDATE SET
    total_points    = qc_scores.total_points + NEW.reward_points,
    findings_count  = qc_scores.findings_count + 1,
    last_updated_at = NEW.created_at;
END;

CREATE TABLE IF NOT EXISTS ralph_runs (
  id              TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  iterations      INTEGER NOT NULL DEFAULT 0,
  max_iterations  INTEGER NOT NULL DEFAULT 5,
  exit_reason     TEXT CHECK (
    exit_reason IN ('qc_passed', 'max_iter', 'aborted', 'error')
  ),
  finding_id      TEXT REFERENCES qc_findings(id) ON DELETE SET NULL,
  log_path        TEXT,
  started_at      INTEGER NOT NULL,
  ended_at        INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ralph_task_started ON ralph_runs(task_id, started_at DESC);

CREATE TABLE IF NOT EXISTS handover_docs (
  id          TEXT PRIMARY KEY,
  task_id     TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  content_md  TEXT NOT NULL,
  tags_json   TEXT NOT NULL DEFAULT '[]',
  file_path   TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_handover_task ON handover_docs(task_id);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
