-- ランダムマッチ待機からの影CPU対戦(mode=shadow)と番兵アカウント

PRAGMA foreign_keys = OFF;
CREATE TABLE matches_new (
  id           TEXT PRIMARY KEY,
  mode         TEXT NOT NULL CHECK (mode IN ('random', 'friend', 'shadow')),
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
INSERT INTO matches_new SELECT * FROM matches;
DROP TABLE matches;
ALTER TABLE matches_new RENAME TO matches;
CREATE INDEX idx_matches_p ON matches(p_user_id, started_at);
CREATE INDEX idx_matches_e ON matches(e_user_id, started_at);

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO users (id, is_guest, status) VALUES ('u_shadow', 0, 'active');
INSERT OR IGNORE INTO user_profiles (user_id, name, formation) VALUES (
  'u_shadow',
  'AIの対戦相手',
  '[["ittan","kooni",null,"nekomata","nue"],["tengu","kappa","kyubi","nurikabe","rokuro"]]'
);
