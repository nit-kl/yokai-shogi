-- 逢魔が時/土曜対戦会の参加報酬(doc 18)
-- 1日1回は PRIMARY KEY (user_id, date) で担保(battle-room が INSERT 失敗で付与済みと判定)
-- currency_logs の reason には 'event_participation' を追加使用
CREATE TABLE participation_logs (
  user_id    TEXT NOT NULL REFERENCES users(id),
  date       TEXT NOT NULL,               -- JST暦日 'YYYY-MM-DD'
  tickets    INTEGER NOT NULL,            -- 付与チケット(上限クランプ後)
  yokai_id   TEXT,                        -- 対戦会限定妖怪(付与対象だった場合)
  yokai_new  INTEGER NOT NULL DEFAULT 0,  -- 1=この付与で新規入手(所持数整合検証用: cron)
  match_id   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, date)
);
