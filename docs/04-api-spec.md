# 04. API・プロトコル仕様

REST(メタ系: 認証・ガチャ・編成 — Workers/Hono)+ WebSocket(対戦 — Durable Objects)の2系統。

**型の正本は `shared/` のTypeScript定義**(`Action` / `GameEvent` / `GameState` および各メッセージ型)。本ドキュメントはその仕様書であり、実装時は型定義からのずれをコンパイルで検出する。

## 共通事項

- ベースURL: `https://api.<domain>/v1`
- 認証: `Authorization: Bearer <アクセストークン>`(取得は doc 06)
- エラー形式(共通):

```json
{ "error": { "code": "INSUFFICIENT_TICKETS", "message": "チケットが不足しています" } }
```

- 主要エラーコード: `UNAUTHORIZED` / `VALIDATION` / `INSUFFICIENT_TICKETS` / `INSUFFICIENT_YORYOKU` / `INVALID_FORMATION` / `RATE_LIMITED` / `CONFLICT` / `MAINTENANCE` / `FEATURE_DISABLED`
- レート制限: 認証系 5req/min、ガチャ系 30req/min、その他 120req/min(Cloudflare Rate Limiting ルール(IP単位)+Workers内のユーザー単位制限の二段)

## REST API

### 認証(詳細は doc 06)

| メソッド | パス | 内容 |
|---|---|---|
| GET | /auth/config | Turnstile要否とサイトキー取得。`steamAuth: { mockAllowed, configured }` も含む |
| POST | /auth/guest | ゲストアカウント作成。`{ userId, accessToken, refreshToken, expiresIn }` |
| POST | /auth/refresh | トークン更新 |
| POST | /auth/steam | Steam Session Ticket でログイン/作成。`{ ticket }` → `{ userId, steamId, accessToken, refreshToken, created }` |
| POST | /auth/link-code | 引き継ぎコード発行。発行時にゲスト扱いから外れる |
| POST | /auth/login/link-code | 引き継ぎコードでログイン |
| GET | /steam/dlc | 付与済み Steam DLC 一覧 |
| POST | /steam/dlc/sync | DLC 所有を同期。`{ dlcIds? }` → 冪等に `user_yokai` 付与(mock 時のみ申告を信頼) |

### プロフィール・進行

#### GET /me
ログインボーナス判定も兼ねる(初回アクセス日替わり時にサーバーが付与し、結果を含めて返す)。

```json
{
  "userId": "u_xxx", "name": "プレイヤー名",
  "tickets": 12, "yoryoku": 350,
  "onboardingDone": true,
  "loginBonus": { "day": 3, "tickets": 1 },   // 付与があった時のみ
  "rating": 1500, "wins": 10, "losses": 4
}
```

ログインボーナスはオンボーディング完了後のみ付与する。

#### GET /me/collection
```json
{ "owned": ["kyubi", "kooni", "...", "tamamo"] }
```

#### GET /me/formation / PUT /me/formation
```json
{ "rows": [["raiju", null, "...", "ibaraki"], ["daitengu", "...", "hitouban"]] }
```
PUT時のサーバー検証(現 `Meta.validateFormation` と同一ロジックを共有コードで実行): 2×5構造 / 全駒所持済み / 種別重複なし / 大将ちょうど1体。違反は `INVALID_FORMATION`。

#### PUT /me/name
表示名を更新する。検証は `shared/validate.ts` が正本。

### オンボーディング

| メソッド | パス | 内容 |
|---|---|---|
| POST | /onboarding/boss | 初回大将を `kyubi` / `shuten` / `nurarihyon` から選び、初期編成へ反映 |
| POST | /onboarding/complete | 初回オンボーディング完了フラグを立てる |

### ガチャ

#### POST /gacha/pull
```json
// リクエスト
{ "count": 10, "idempotencyKey": "c3f7..." }
// レスポンス
{
  "results": [ { "id": "yukionna", "rarity": "SR", "isNew": true, "yoryoku": 0 }, ... ],
  "tickets": 2, "yoryoku": 450
}
```
- `count` は 1 または 10 のみ
- **idempotencyKey 必須**: 通信断での二重引きを防ぐ(同一キーは保存済み結果を再返却)
- 抽選・確定枠(10連SR以上保証)・被り妖力変換のロジックは現 `Meta.pull` をサーバーへ移植(乱数はサーバー)
- 排出率はレスポンスとは別に `GET /gacha/rates`(静的)で公開

#### POST /exchange
妖力300→チケット1枚。`{ "tickets": 3, "yoryoku": 150 }` を返す。

### 戦績

| メソッド | パス | 内容 |
|---|---|---|
| GET | /matches?limit=20 | 自分の対局履歴(相手・勝敗・理由・日時) |
| GET | /matches/:id/replay | actionログ(リプレイ用イベント列) |
| POST | /solo/win | ソロ勝利報酬申告。日次上限あり |
| GET | /stats/players | 登録/オンボーディング人数の公開統計 |
| GET | /announcements | ゲーム内お知らせ |

### 百鬼夜行 週間連勝ランキング(doc 21)

| メソッド | パス | 認証 | 内容 |
|---|---|---|---|
| POST | /solo/hyakki/start | 必須 | 連戦(上級)の対局開始申告。`{ currentStreak, bestStreak, rank }` |
| POST | /solo/hyakki/result | 必須 | `{ "win": true }`。連勝を更新し `{ currentStreak, bestStreak, rank }` |
| GET | /rankings/hyakki | 不要 | `{ week, top, lastWeek, me }`。Authorizationがあれば `me` に自分の順位。60秒キャッシュ |

型・定数は `shared/hyakki.ts` が正。

### リワード広告(doc 22)

| メソッド | パス | 認証 | 内容 |
|---|---|---|---|
| GET | /ads/status | 必須 | 有効フラグ・provider・日次残回数・clientConfig |
| POST | /ads/reward | 必須 | `{ "provider": "mock"|"gpt" }`。視聴完了後のチケット請求 |

エラーコードに `FEATURE_DISABLED`(403) を追加(機能オフ時の POST)。

## WebSocket プロトコル

- エンドポイント: `wss://api.<domain>/v1/battle?v=1&token=<アクセストークン>`
  - Workerが認証・ルーティングし、Matchmaker DO(待機中)または BattleRoom DO(対局中)へWSをフォワードする
- メッセージはJSON: `{ "t": "<type>", ...payload }`
- ハートビート: WebSocket Hibernation API の自動 ping/pong 応答を利用(DO休止中もプラットフォームが応答。アプリ実装は欠落検知のみ)

### クライアント → サーバー

| t | payload | 説明 |
|---|---|---|
| join_queue | `{}` | ランダムマッチ待機 |
| leave_queue | `{ reason?: "cancel" | "timeout" }` | 待機解除 |
| create_room | `{}` | フレンドマッチ用ルーム作成 → `room_created {code}` |
| join_room | `{ code }` | コードで参加 |
| action | `{ kind:'move', from:{x,y}, to:{x,y} }` / `{ kind:'drop', id, to:{x,y} }` / `{ kind:'awaken', to:{x,y} }` | 現エンジンのaction形式そのまま |
| resign | `{}` | 投了 |
| reconnect | `{ matchId, token }` | 再接続 |

### サーバー → クライアント

| t | payload | 説明 |
|---|---|---|
| queued | `{ position }` | キュー受付 |
| room_created | `{ code }` | ルームコード発行 |
| match_found | `{ matchId, reconnectToken, side:'p'｜'e', opponent:{name,rating,bossId}, formations:{p,e} }` | 対局成立 |
| game_start | `{ state }` | 初期局面スナップショット |
| events | `{ seq, events:[...] }` | **現エンジン `applyAction` の戻り値と同形式**(move/drop/capture/promote/gameover)。seqは欠落検知用の連番 |
| your_turn | `{ remainMs, phase:'main'｜'byoyomi' }` | 手番通知+残り時間 |
| clock | `{ remainMs, phase:'main'｜'byoyomi' }` | 本時間→秒読みなど時計位相の更新 |
| opponent_disconnected | `{ graceMs }` | 相手切断(猶予中) |
| snapshot | `{ state, remainMs, phase:'main'｜'byoyomi', seq }` | 再接続時の現局面 |
| game_end | `{ winner, reason, reward:{tickets}, rating:{before,after} }` | 終局。reason: boss/hp/explode/nomoves/resign/timeout/disconnect/draw |
| error | `{ code, message }` | 不正な操作など |

### state スナップショット形式

現エンジンの状態オブジェクトのシリアライズ(`board`(uid/id/owner/promoted)、`hp`、`hands`、`turn`、`combo`)。`Game.clone` 互換の構造とし、クライアントはこれをそのまま描画(`renderAll`/`updateHUD`)に流せる。

## バージョニング

- REST: パスの `/v1`
- WS: 接続時クエリ `?v=1`。未対応バージョンはハンドシェイク時に拒否する
