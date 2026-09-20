-- 番兵アカウントの表示名から「影」を外す
UPDATE user_profiles SET name = 'AIの対戦相手' WHERE user_id = 'u_shadow';
