-- Phase 2: オンライン対戦・リプレイ

CREATE TABLE matches (
  id           TEXT PRIMARY KEY,
  mode         TEXT NOT NULL CHECK (mode IN ('random', 'friend')),
  p_user_id    TEXT NOT NULL REFERENCES users(id),
  e_user_id    TEXT NOT NULL REFERENCES users(id),
  p_formation  TEXT NOT NULL,
  e_formation  TEXT NOT NULL,
  winner       TEXT CHECK (winner IN ('p', 'e', 'draw')),
  reason       TEXT,
  rng_seed     TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  ended_at     TEXT
);
CREATE INDEX idx_matches_p ON matches(p_user_id, started_at);
CREATE INDEX idx_matches_e ON matches(e_user_id, started_at);

CREATE TABLE match_actions (
  match_id TEXT NOT NULL REFERENCES matches(id),
  seq      INTEGER NOT NULL,
  side     TEXT NOT NULL CHECK (side IN ('p', 'e')),
  action   TEXT NOT NULL,
  events   TEXT NOT NULL,
  PRIMARY KEY (match_id, seq)
);

ALTER TABLE user_profiles ADD COLUMN online_win_reward_count INTEGER NOT NULL DEFAULT 0;

