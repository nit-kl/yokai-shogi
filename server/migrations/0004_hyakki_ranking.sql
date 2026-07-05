-- 百鬼夜行 週間連勝ランキング(doc 21)

-- 進行中の連勝状態の正本。週替わり判定用に週キーを持つ
ALTER TABLE user_profiles ADD COLUMN hyakki_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN hyakki_week TEXT;          -- 連勝が属する週 'YYYY-MM-DD'(月曜)
ALTER TABLE user_profiles ADD COLUMN hyakki_pending_at TEXT;    -- start申告時刻(ISO)。未報告ならNULL以外

-- 週ごとのベスト記録(ランキングの読み出し元・先週掲載の履歴)
CREATE TABLE hyakki_weekly (
  user_id     TEXT NOT NULL REFERENCES users(id),
  week        TEXT NOT NULL,                     -- 週開始のゲーム内日付(月曜)
  best_streak INTEGER NOT NULL CHECK (best_streak > 0),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, week)
);
CREATE INDEX idx_hyakki_weekly_rank ON hyakki_weekly(week, best_streak DESC);
