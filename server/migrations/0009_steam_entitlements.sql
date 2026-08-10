-- Steam DLC entitlement 付与履歴(冪等: doc 08 / 23)
-- yokai_new: この付与で新規に user_yokai へ入った件数(cron 不変条件用)
CREATE TABLE steam_entitlement_grants (
  user_id TEXT NOT NULL REFERENCES users(id),
  dlc_id TEXT NOT NULL,
  yokai_new INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, dlc_id)
);

CREATE INDEX idx_steam_entitlement_user ON steam_entitlement_grants(user_id);
