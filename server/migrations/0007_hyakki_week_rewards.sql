-- 百鬼夜行週間ランキング1位への限定異装付与(週キー単位で冪等)
CREATE TABLE hyakki_week_rewards (
  week       TEXT PRIMARY KEY,                 -- 報酬対象の週キー(先週分)
  user_id    TEXT NOT NULL REFERENCES users(id),
  yokai_id   TEXT NOT NULL,
  yokai_new  INTEGER NOT NULL DEFAULT 0,       -- 1=この付与で新規入手(所持数整合: cron)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_hyakki_week_rewards_user ON hyakki_week_rewards(user_id);
