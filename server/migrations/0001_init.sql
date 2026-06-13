-- Migration number: 0001 	 init: ユーザー・通貨・ガチャ・認証(doc 05 / 06)
-- D1(SQLite)。CHECK制約は最後の防衛線(batch内で違反すると全体がロールバックされる)

CREATE TABLE users (
  id          TEXT PRIMARY KEY,                -- crypto.randomUUID()
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  is_guest    INTEGER NOT NULL DEFAULT 1,      -- 0/1
  status      TEXT NOT NULL DEFAULT 'active',  -- active / banned / deleted
  ban_reason  TEXT
);

CREATE TABLE user_profiles (
  user_id       TEXT PRIMARY KEY REFERENCES users(id),
  name          TEXT NOT NULL DEFAULT 'プレイヤー',
  tickets       INTEGER NOT NULL DEFAULT 0 CHECK (tickets >= 0 AND tickets <= 999),
  yoryoku       INTEGER NOT NULL DEFAULT 0 CHECK (yoryoku >= 0 AND yoryoku <= 99999),
  formation     TEXT NOT NULL,                 -- JSON: [[5列],[5列]] 保存時にサーバー検証済み
  rating        INTEGER NOT NULL DEFAULT 1500,
  rating_dev    REAL NOT NULL DEFAULT 350,     -- Glicko-2用(Phase 3)
  wins          INTEGER NOT NULL DEFAULT 0,
  losses        INTEGER NOT NULL DEFAULT 0,
  last_login_date TEXT,                        -- ゲーム内日付 'YYYY-MM-DD'(JST 04:00リセット: doc 08)
  login_streak  INTEGER NOT NULL DEFAULT 0,
  daily_win_reward_count INTEGER NOT NULL DEFAULT 0,
  daily_reset_date TEXT
);

CREATE TABLE user_yokai (
  user_id     TEXT NOT NULL REFERENCES users(id),
  yokai_id    TEXT NOT NULL,                   -- 'kyubi' 等。マスタは shared/data.ts が正
  obtained_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, yokai_id)              -- 各種1体まで(現仕様)を一意制約で担保
);

CREATE TABLE gacha_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL,
  count           INTEGER NOT NULL,
  new_count       INTEGER NOT NULL DEFAULT 0,  -- 新規入手数(所持数の整合検証用: doc 08)
  results         TEXT NOT NULL,               -- JSON: [{id, rarity, isNew, yoryoku}]
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, idempotency_key)            -- 二重引き防止の正本
);

CREATE TABLE currency_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id),
  currency   TEXT NOT NULL,                    -- 'tickets' / 'yoryoku'
  delta      INTEGER NOT NULL,
  balance    INTEGER NOT NULL,                 -- 増減後残高(整合性検証用)
  reason     TEXT NOT NULL,                    -- 'initial'/'login_bonus'/'win_reward'/'gacha'/'exchange'/'admin'/'compensation'
  ref_id     TEXT,                             -- 対局ID・ガチャ冪等キー等への参照
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_currency_logs_user ON currency_logs(user_id, id);

CREATE TABLE login_bonus_logs (
  user_id   TEXT NOT NULL REFERENCES users(id),
  date      TEXT NOT NULL,                     -- ゲーム内日付 'YYYY-MM-DD'
  day_count INTEGER NOT NULL,
  tickets   INTEGER NOT NULL,
  PRIMARY KEY (user_id, date)                  -- 1日1回をDB制約で担保
);

CREATE TABLE refresh_tokens (
  token_hash TEXT PRIMARY KEY,                 -- SHA-256(base64url)
  user_id    TEXT NOT NULL REFERENCES users(id),
  family_id  TEXT NOT NULL,                    -- ローテーション系列(再利用検知用)
  expires_at TEXT NOT NULL,
  used_at    TEXT,                             -- 使用済みマーク(再提示=盗難疑い)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);

CREATE TABLE auth_identities (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id),
  provider   TEXT NOT NULL,                    -- 'link_code'(Phase 1)/ 'passkey' / 'google'(Phase 3)
  subject    TEXT NOT NULL,                    -- 引き継ぎコードのSHA-256 / credential ID / OAuth sub
  public_key BLOB,                             -- パスキー用
  counter    INTEGER,                          -- パスキー署名カウンタ
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, subject)
);
CREATE INDEX idx_auth_identities_user ON auth_identities(user_id);
