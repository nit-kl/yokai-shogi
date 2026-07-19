# 21. 百鬼夜行 週間連勝ランキング

## 目的

初回の集客・利用実績(doc 17/18: 登録87・オンライン対戦0局・初日離脱84%)より、実際に遊ばれている
ソロ側に継続目標がないことが最大のボトルネック。ソロの終盤コンテンツである
百鬼夜行(連戦モード)に「週間ベスト連勝数」のオンラインランキングを設け、
再訪理由(今週の順位)と腕前の到達目標を作る。

## 決定事項

- **対象**: 連戦モード(ステージ `hyakki`)の**難易度上級のみ**。初級/中級の連戦は
  従来どおり遊べるがランキング対象外(初級で稼ぐのが最適解になるのを防ぐ)。
- **指標**: その週のベスト連勝数。負けたら0に戻る。
- **週境界**: ゲーム内日付(JST 4:00リセット: doc 08)ベースの**月曜開始**。
  週が替わると進行中の連勝もリセット(前週王者が持ち越しで新週を即制圧するのを防ぐ)。
- **報酬**: 通貨・ガチャ関連は付与しない。ランキング画面に**先週のTOP3を掲載**し、
  **表示上の先週1位**へ限定異装 `kyubi_hasha`(覇者・九尾)を日次cronで自動付与する。
  性能同一の見た目専用で、既所持ならスキップ。ソロ結果は申告制で信用できない
  (doc 07 / `server/src/routes/solo.ts` 冒頭コメント)ため、不正の旨味は掲示と見た目に限定する。
- **連勝カウンタの正本はサーバー**に昇格する。現在の `soloStreak`(`client/src/main.ts`)は
  メモリ上のみでリロードで消えるが、サーバー化によりリロード・端末替えでも継続する。

## 不正対策(申告制の範囲で)

棋譜検証(サーバーリプレイ)は導入しない。ただしAPI形状は開始/結果のペア申告に
しておき、将来検証を足す場合も互換を保てるようにする。

1. **開始/結果のペア申告**: 対局開始時に start、終了時に result を申告する。
   start が未解決のまま次の start が来たら**前局を負け扱い**にする
   (劣勢になったらリロードして連勝を守る、への対策)。
2. **最短対局時間**: start から `HYAKKI_MIN_DURATION_MS`(30秒)未満の勝利報告は
   負け扱いにする(スクリプトによる連打申告の抑止。上級のAI戦が30秒未満で
   正当に終わることは実質ない)。
3. 残存リスク(curl で正直に30秒待って勝利申告し続ける)は許容する。壊れるのは
   掲示の見栄えだけで、通貨経済(doc 08)には影響しない。目に余る場合は
   `users.status='banned'` で掲載から除外できる。

## データモデル(migration 0004)

```sql
-- 進行中の連勝状態(正本)。週替わり判定用に週キーを持つ
ALTER TABLE user_profiles ADD COLUMN hyakki_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN hyakki_week TEXT;          -- 連勝が属する週 'YYYY-MM-DD'(月曜)
ALTER TABLE user_profiles ADD COLUMN hyakki_pending_at TEXT;    -- start申告時刻(未報告ならNULL以外)

-- 週ごとのベスト記録(ランキングの読み出し元・先週掲載の履歴)
CREATE TABLE hyakki_weekly (
  user_id     TEXT NOT NULL REFERENCES users(id),
  week        TEXT NOT NULL,                     -- 週開始のゲーム内日付(月曜)
  best_streak INTEGER NOT NULL CHECK (best_streak > 0),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, week)
);
CREATE INDEX idx_hyakki_weekly_rank ON hyakki_weekly(week, best_streak DESC);
```

- 週キーは `gameWeek()`(`server/src/lib/time.ts` に追加): `gameDate()` と同じ
  UTC+5シフトの暦で直近の月曜を返す。
- start/result 処理時に `hyakki_week != gameWeek()` なら `hyakki_streak=0` に
  リセットしてから処理する(週替わり)。
- `best_streak > 0` のみ INSERT するので、遊んだが1勝もできなかった週は行を作らない。

## API(doc 04 に追記)

| メソッド | パス | 認証 | 内容 |
| --- | --- | --- | --- |
| POST | `/v1/solo/hyakki/start` | 必須 | 連戦(上級)の対局開始申告。pending未解決なら前局を負け処理。`{ currentStreak }` |
| POST | `/v1/solo/hyakki/result` | 必須 | `{ win: boolean }`。pendingを解決し連勝を更新。`{ currentStreak, bestStreak, rank }` |
| GET | `/v1/rankings/hyakki` | 不要 | `{ week, top, me?, lastWeek }`。`Cache-Control: public, max-age=60` |

- `top`: 今週のTOP20 `[{ name, bestStreak }]`(`user_profiles.name` をJOIN、
  `users.status='active'` のみ)。`me` は Authorization がある場合のみ
  `{ rank, bestStreak }` を返す。`lastWeek`: 先週のTOP3。
- 順位は `COUNT(*)+1 WHERE week=? AND best_streak>?`(同率同順位)。表示順は
  `best_streak DESC, updated_at ASC`(先に達成した側が上)。
- result はチケット付与(`/v1/solo/win`)とは独立。勝利時は従来どおり両方叩く。

## クライアント

- `startBattle()`(`client/src/main.ts`): 連戦モードかつ上級かつオンラインメタ有効時に
  start を fire-and-forget で申告。失敗してもローカル連勝表示は従来どおり動かす。
- `showResult()`: 同条件で result を申告し、レスポンスで
  「百鬼夜行 N連勝(今週n位)」表示を確定する。オフライン時はローカル値のみ。
- ソロ画面の連戦タブにランキングパネル: 今週TOP20+自分の順位+「先週の百鬼夜行」TOP3。
  難易度が上級以外のときは「ランキング対象は上級のみ」と注記する。
- 表示名がデフォルト(「プレイヤー」)のままのユーザーには、ランキングパネルに
  名前設定への導線ボタンを出す(必須にはしない。掲載自体はデフォルト名でも行う)。
- 計測: `trackLandingEvent('hyakki_rank_view')` を追加。KPIは連戦開始数
  (`solo_battle_start` の `mode:'streak'`)、週間記録者数(`hyakki_weekly` 行数)、
  週跨ぎ再訪率。
- リリース時に `shared/announcements.ts` で告知を出す。

## 先週1位報酬(限定異装)

- 定数: `HYAKKI_REWARD_YOKAI_ID = 'kyubi_hasha'`(`shared/hyakki.ts`)
- 付与: `runDailyJobs` 内で `lastWeek = gameWeek(now-7d)` の表示上1位
  (`best_streak DESC, updated_at ASC`・`users.status='active'`)へ冪等INSERT
- 監査: `hyakki_week_rewards(week PK, user_id, yokai_id, yokai_new)` — 週1回
- 既所持: `yokai_new=0` で監査行のみ。`user_yokai` は増やさない
- 不変条件: `COUNT(user_yokai) = SUM(gacha_logs.new_count) + SUM(participation_logs.yokai_new) + SUM(hyakki_week_rewards.yokai_new)`

## 今回やらないこと

- 称号システム(名前バッジ)・通貨報酬 — 申告制の間は付けない
- 難易度別ランキング — 参加者が増えて板が賑わってから再検討
- 棋譜検証によるサーバー権威化 — doc 07 の再検討事項のまま
