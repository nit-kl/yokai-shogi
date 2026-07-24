-- パスキー(WebAuthn)用: チャレンジ一時保存 + transports
CREATE TABLE webauthn_challenges (
  challenge  TEXT PRIMARY KEY,
  user_id    TEXT,                              -- 登録時は必須。認証時は NULL(discoverable)
  purpose    TEXT NOT NULL,                     -- 'register' | 'authenticate'
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_webauthn_challenges_expires ON webauthn_challenges(expires_at);

ALTER TABLE auth_identities ADD COLUMN transports TEXT; -- JSON配列(例: ["internal","hybrid"])
