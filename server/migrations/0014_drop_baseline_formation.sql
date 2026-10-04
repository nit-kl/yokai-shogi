-- 対局は保存済みの formation を使う。標準編成の控えは持たない
ALTER TABLE user_profiles DROP COLUMN baseline_formation;
