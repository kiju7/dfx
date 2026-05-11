-- 0008_tasks_fts.sql — FTS5 full-text search over tasks(title, description_md)
--
-- Rationale: recentRelated() previously used `title LIKE '%…%'` which forces a
-- full table scan because the leading wildcard prevents B-tree index usage.
-- A content-based FTS5 virtual table lets the same query use the FTS index and
-- scales sub-linearly with table size.
--
-- Pattern mirrors 0002_handover_fts.sql (handover_docs_fts).

CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts
  USING fts5(title, description_md, content='tasks', content_rowid='rowid');

-- Backfill existing rows into the FTS index.
INSERT INTO tasks_fts(rowid, title, description_md)
  SELECT rowid, title, description_md FROM tasks;

-- Keep FTS index in sync with the tasks table.

CREATE TRIGGER IF NOT EXISTS trg_tasks_fts_ai
AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(rowid, title, description_md)
  VALUES (new.rowid, new.title, new.description_md);
END;

CREATE TRIGGER IF NOT EXISTS trg_tasks_fts_ad
AFTER DELETE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, description_md)
  VALUES ('delete', old.rowid, old.title, old.description_md);
END;

CREATE TRIGGER IF NOT EXISTS trg_tasks_fts_au
AFTER UPDATE OF title, description_md ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, description_md)
  VALUES ('delete', old.rowid, old.title, old.description_md);
  INSERT INTO tasks_fts(rowid, title, description_md)
  VALUES (new.rowid, new.title, new.description_md);
END;
