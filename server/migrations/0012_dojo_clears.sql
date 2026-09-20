-- 妖怪道場のクリア記録(1問1回のチケット付与)

CREATE TABLE dojo_clears (
  user_id    TEXT NOT NULL REFERENCES users(id),
  puzzle_id  TEXT NOT NULL,
  tickets    INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, puzzle_id)
);
CREATE INDEX idx_dojo_clears_user ON dojo_clears(user_id);
