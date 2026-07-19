# 05. データモデル設計

Cloudflare **D1(SQLite)**。実際の正本は `server/migrations/` のSQL。
ID はアプリ側で `crypto.randomUUID()` を生成して TEXT 格納、日時は ISO8601 文字列、JSONは TEXT(JSON文字列)で持つ。

## D1の制約と設計パターン(最重要)

D1には**インタラクティブトランザクションがない**(`BEGIN`して途中でアプリ判断を挟む方式は不可)。代わりに以下で原子性・整合性を担保する:

1. **条件付きUPDATEで残高検証と更新を1文に畳む**
   ```sql
   UPDATE user_profiles SET tickets = tickets - 10
   WHERE user_id = ?1 AND tickets >= 10;
   ```
   `meta.changes === 0` なら残高不足として中断(更新は発生していない)
2. **`db.batch([...])` は原子的に実行される** → 「残高UPDATE → ログINSERT → 所持INSERT」を1バッチにまとめる。ただしバッチ内で前文の結果を参照できないため、**抽選などのアプリ判断はバッチの前に確定**させ、バッチは「書き込みの束」だけにする
3. ガチャの一意性は `gacha_logs(user_id, idempotency_key)` の **UNIQUE制約を正本**とし、衝突(=二重リクエスト)時は保存済み結果を返す
4. CHECK制約(`tickets >= 0` 等)を最後の防衛線として必ず付ける

## ER概観

```
users 1─1 user_profiles(通貨・編成・レート・オンボーディング・百鬼夜行進行)
users 1─n user_yokai(所持) / auth_identities(doc 06) / refresh_tokens
users 1─n gacha_logs / currency_logs / login_bonus_logs
matches n─2 users、matches 1─n match_actions(リプレイ)
users 1─n participation_logs / ad_reward_logs / hyakki_weekly
```

## テーブル定義(D1マイグレーション形式)

### users(認証主体)
```sql
CREATE TABLE users (
  id          TEXT PRIMARY KEY,                -- crypto.randomUUID()
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  is_guest    INTEGER NOT NULL DEFAULT 1,      -- 0/1
  status      TEXT NOT NULL DEFAULT 'active',  -- active / banned / deleted
  ban_reason  TEXT
);
```

### user_profiles(進行・通貨)
```sql
CREATE TABLE user_profiles (
  user_id       TEXT PRIMARY KEY REFERENCES users(id),
  name          TEXT NOT NULL DEFAULT 'プレイヤー',
  tickets       INTEGER NOT NULL DEFAULT 0 CHECK (tickets >= 0 AND tickets <= 999),
  yoryoku       INTEGER NOT NULL DEFAULT 0 CHECK (yoryoku >= 0 AND yoryoku <= 99999),
  formation     TEXT NOT NULL,                 -- JSON: [[5列],[5列]] 保存時にサーバー検証済み
  rating        INTEGER NOT NULL DEFAULT 1500,
  rating_dev    REAL NOT NULL DEFAULT 350,     -- Glicko-2用
  wins          INTEGER NOT NULL DEFAULT 0,
  losses        INTEGER NOT NULL DEFAULT 0,
  last_login_date TEXT,                        -- 'YYYY-MM-DD'(JST基準: doc 08)
  login_streak  INTEGER NOT NULL DEFAULT 0,
  daily_win_reward_count INTEGER NOT NULL DEFAULT 0,
  daily_reset_date TEXT,
  online_win_reward_count INTEGER NOT NULL DEFAULT 0,
  onboarding_done INTEGER NOT NULL DEFAULT 0,
  hyakki_streak INTEGER NOT NULL DEFAULT 0,
  hyakki_week TEXT,
  hyakki_pending_at TEXT
);
```
初回10枚は `POST /auth/guest` の作成処理で `FIRST_BONUS` として付与し、`currency_logs(reason='initial')` に記録する。大将と編成はオンボーディングで確定する。

### user_yokai(所持コレクション)
```sql
CREATE TABLE user_yokai (
  user_id     TEXT NOT NULL REFERENCES users(id),
  yokai_id    TEXT NOT NULL,                   -- 'kyubi' 等。マスタは shared/data.ts が正
  obtained_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, yokai_id)              -- 各種1体まで(現仕様)を一意制約で担保
);
```

### gacha_logs(監査・冪等性)
```sql
CREATE TABLE gacha_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL,
  count           INTEGER NOT NULL,
  new_count       INTEGER NOT NULL DEFAULT 0,
  results         TEXT NOT NULL,               -- JSON: [{id, rarity, isNew, yoryoku}]
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, idempotency_key)            -- 二重引き防止の正本
);
```

### currency_logs(通貨の全増減を記録)
```sql
CREATE TABLE currency_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id),
  currency   TEXT NOT NULL,                    -- 'tickets' / 'yoryoku'
  delta      INTEGER NOT NULL,
  balance    INTEGER NOT NULL,                 -- 増減後残高(整合性検証用)
  reason     TEXT NOT NULL,                    -- 'initial'/'login_bonus'/'win_reward'/'gacha'/'exchange'/'event_participation'/'ad_reward'/'admin'/'compensation'
  ref_id     TEXT,                             -- 対局ID・ガチャログID等への参照
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_currency_logs_user ON currency_logs(user_id, id);
```
> 通貨はこのログと残高の二重記録にする。不正調査・補償・集計の基盤。残高UPDATEとログINSERTは必ず同一 `batch()` で書く。

### matches / match_actions(対局・リプレイ)
```sql
CREATE TABLE matches (
  id          TEXT PRIMARY KEY,                -- BattleRoom DOのID由来
  mode        TEXT NOT NULL,                   -- 'random' / 'friend'
  p_user_id   TEXT NOT NULL REFERENCES users(id),
  e_user_id   TEXT NOT NULL REFERENCES users(id),
  p_formation TEXT NOT NULL,                   -- JSON
  e_formation TEXT NOT NULL,                   -- JSON
  winner      TEXT,                            -- 'p' / 'e' / 'draw'
  reason      TEXT,                            -- boss/hp/explode/nomoves/resign/timeout/disconnect/draw
  rng_seed    TEXT NOT NULL,                   -- 対局乱数シード(リプレイ再現・監査用)
  rule_version TEXT NOT NULL,                  -- デプロイ版(リプレイ互換判定)
  started_at  TEXT NOT NULL,
  ended_at    TEXT
);
CREATE INDEX idx_matches_p ON matches(p_user_id, started_at);
CREATE INDEX idx_matches_e ON matches(e_user_id, started_at);

CREATE TABLE match_actions (
  match_id   TEXT NOT NULL REFERENCES matches(id),
  seq        INTEGER NOT NULL,
  side       TEXT NOT NULL,                    -- 'p' / 'e'
  action     TEXT NOT NULL,                    -- JSON: {kind, from, to, id}
  events     TEXT NOT NULL,                    -- JSON: applyActionの結果イベント列(乱数結果込み)
  PRIMARY KEY (match_id, seq)
);
```
- 対局中の正本は**BattleRoom DOのストレージ**(doc 02)。D1へは**終局時に matches + match_actions + 報酬付与をまとめて書く**(進行中はD1に書かない)
- `events` を保存するのでリプレイは順再生するだけ。`rng_seed` + `action` 列からの完全再計算も可能(2系統で検証できる)

### login_bonus_logs
```sql
CREATE TABLE login_bonus_logs (
  user_id   TEXT NOT NULL REFERENCES users(id),
  date      TEXT NOT NULL,                     -- JST日付 'YYYY-MM-DD'
  day_count INTEGER NOT NULL,
  tickets   INTEGER NOT NULL,
  PRIMARY KEY (user_id, date)                  -- 1日1回をDB制約で担保
);
```

### participation_logs
ランダムマッチ・土曜対戦会の完走参加報酬を1日1回に制限する。

```sql
CREATE TABLE participation_logs (
  user_id    TEXT NOT NULL REFERENCES users(id),
  date       TEXT NOT NULL,
  tickets    INTEGER NOT NULL,
  yokai_id   TEXT,
  yokai_new  INTEGER NOT NULL DEFAULT 0,
  match_id   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, date)
);
```

### ad_reward_logs
リワード広告の日次付与(最大2回/日)。`claim_index` で何回目かを一意にする。

```sql
CREATE TABLE ad_reward_logs (
  user_id     TEXT NOT NULL REFERENCES users(id),
  date        TEXT NOT NULL,
  claim_index INTEGER NOT NULL,
  tickets     INTEGER NOT NULL,
  provider    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, date, claim_index)
);
```

### hyakki_weekly
百鬼夜行(ソロ連戦・上級)の週間ベスト連勝数。

```sql
CREATE TABLE hyakki_weekly (
  user_id     TEXT NOT NULL REFERENCES users(id),
  week        TEXT NOT NULL,
  best_streak INTEGER NOT NULL CHECK (best_streak > 0),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, week)
);
```

### hyakki_week_rewards
百鬼夜行週間ランキング1位への限定異装付与(週キー単位で冪等)。

```sql
CREATE TABLE hyakki_week_rewards (
  week       TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  yokai_id   TEXT NOT NULL,
  yokai_new  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## BattleRoom DOストレージのキー設計(対局中の正本)

```
meta        : { matchId, mode, users:{p,e}, formations, rngSeed, startedAt, ruleVersion }
runtime     : { game, timers, seq, rngState, actions[] } -- 1手ごとに1行上書き。終局時にactionsをD1へ転記
flushed     : D1反映済みフラグ(立つまでDO側を保持・再試行)
```

## マスタデータの方針

- 妖怪定義(`YOKAI`・排出率・レート)は**コード(shared/data.ts)を正**とし、DBには持たない
  - エンジンと不可分(moves/skill)であり、コードと同時にデプロイされるべきもの
  - 新妖怪追加=デプロイ。「デプロイなし配信」が必要になったら設定ストア配信化を検討
- バランス調整の互換性: `matches.rule_version` で対局時点の版を記録。リプレイは同版の挙動で再生(互換が壊れた旧対局のリプレイは非対応と割り切る)

## 既存localStorageデータの扱い(移行方針)

**引き継がない(フレッシュスタート)+ リリース記念配布で補償**を推奨する。

- 理由: localStorageは自由に改ざんできるため、申告ベースの引き継ぎは「全所持・チケット大量」の偽装を防げない
- 代替: 必要であれば全ユーザーへチケット配布などで補償する。告知はゲーム内お知らせに掲示する
- ローカル版メタ進行はソロ・オフライン用として残るが、オンライン機能はサーバーデータのみを参照する

## バックアップ・保持期間

| データ | バックアップ | 保持 |
|---|---|---|
| D1全体 | **Time Travel(Freeは7日 / Paidは30日の任意時点復元)** が標準で効く + 必要に応じて `wrangler d1 export` を退避 | - |
| users/profiles/yokai/currency | 同上 | 退会後90日で物理削除(doc 11) |
| match_actions | 同上 | 90日(以降は matches の集計結果のみ)。容量と相談 |
| アプリログ | -(Workers Logs) | 30日 |
