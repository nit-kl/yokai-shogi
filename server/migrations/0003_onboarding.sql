-- Phase 2: 初回オンボーディング完了フラグ
ALTER TABLE user_profiles ADD COLUMN onboarding_done INTEGER NOT NULL DEFAULT 0;
-- 既存ユーザーはスキップ
UPDATE user_profiles SET onboarding_done = 1;
