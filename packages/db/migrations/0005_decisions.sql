-- 0005_decisions.sql — ADR-lite decision log

CREATE TABLE IF NOT EXISTS decisions (
  id           TEXT PRIMARY KEY,
  request_id   TEXT REFERENCES requests(id) ON DELETE CASCADE,
  task_id      TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('triage', 'pm-breakdown', 'ralph-route', 'escalation', 'merge', 'other')),
  scope        TEXT NOT NULL DEFAULT '',
  title        TEXT NOT NULL,
  rationale_md TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decisions_request ON decisions(request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_kind    ON decisions(kind, created_at);
