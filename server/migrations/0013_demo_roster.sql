-- デモアカウント: 全妖怪を所持扱いにするフラグと、ルームで戻せる標準編成
ALTER TABLE user_profiles ADD COLUMN unlock_all INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN baseline_formation TEXT;
