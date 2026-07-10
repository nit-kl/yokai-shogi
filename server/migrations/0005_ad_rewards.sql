-- リワード広告の日次付与ログ(doc 08 / 22)
-- claim_index で1日あたり複数回を一意に記録し、日次上限は COUNT で担保する
CREATE TABLE ad_reward_logs (
  user_id     TEXT NOT NULL,
  date        TEXT NOT NULL,                 -- gameDate() 'YYYY-MM-DD' (JST 04:00 基準)
  claim_index INTEGER NOT NULL,              -- その日の何回目か(1始まり)
  tickets     INTEGER NOT NULL,
  provider    TEXT,                          -- 'mock' / 'gpt' 等
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, date, claim_index),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_ad_reward_logs_date ON ad_reward_logs(date);
