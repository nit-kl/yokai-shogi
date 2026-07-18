-- キャンペーン配布(リリース記念など)の1ユーザー1回付与を担保する
CREATE TABLE campaign_grants (
  user_id     TEXT NOT NULL REFERENCES users(id),
  campaign_id TEXT NOT NULL,
  tickets     INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, campaign_id)
);
