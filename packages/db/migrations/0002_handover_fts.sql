-- 0002_handover_fts.sql — FTS5 over handover_docs

CREATE VIRTUAL TABLE IF NOT EXISTS handover_docs_fts
  USING fts5(title, content_md, tags_json, content='handover_docs', content_rowid='rowid');

CREATE TRIGGER IF NOT EXISTS trg_handover_docs_ai
AFTER INSERT ON handover_docs BEGIN
  INSERT INTO handover_docs_fts(rowid, title, content_md, tags_json)
  VALUES (new.rowid, new.title, new.content_md, new.tags_json);
END;

CREATE TRIGGER IF NOT EXISTS trg_handover_docs_ad
AFTER DELETE ON handover_docs BEGIN
  INSERT INTO handover_docs_fts(handover_docs_fts, rowid, title, content_md, tags_json)
  VALUES ('delete', old.rowid, old.title, old.content_md, old.tags_json);
END;

CREATE TRIGGER IF NOT EXISTS trg_handover_docs_au
AFTER UPDATE ON handover_docs BEGIN
  INSERT INTO handover_docs_fts(handover_docs_fts, rowid, title, content_md, tags_json)
  VALUES ('delete', old.rowid, old.title, old.content_md, old.tags_json);
  INSERT INTO handover_docs_fts(rowid, title, content_md, tags_json)
  VALUES (new.rowid, new.title, new.content_md, new.tags_json);
END;
