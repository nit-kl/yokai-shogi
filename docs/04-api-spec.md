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

- 主要エラーコード: `UNAUTHORIZED` / `VALIDATION` / `INSUFFICIENT_TICKETS` / `INSUFFICIENT_YORYOKU` / `INVALID_FORMATION` / `RATE_LIMITED` / `CONFLICT` / `MAINTENANCE`
- レート制限: 認証系 5req/min、ガチャ系 30req/min、その他 120req/min(Cloudflare Rate Limiting ルール(IP単位)+Workers内のユーザー単位制限の二段)

## REST API

### 認証(詳細は doc 06)

| メソッド | パス | 内容 |
|---|---|---|
| POST | /auth/guest | ゲストアカウント作成。`{ userId, accessToken, refreshToken }` |
| POST | /auth/refresh | トークン更新 |
| POST | /auth/link | ゲスト→正式アカウント連携(パスキー/OAuth) |
| POST | /auth/login | 連携済みアカウントでのログイン |

### プロフィール・進行

#### GET /me
ログインボーナス判定も兼ねる(初回アクセス日替わり時にサーバーが付与し、結果を含めて返す)。

```json
{
  "userId": "u_xxx", "name": "プレイヤー名",
  "tickets": 12, "yoryoku": 350,
  "loginBonus": { "day": 3, "tickets": 1 },   // 付与があった時のみ
  "rating": 1500, "wins": 10, "losses": 4
}
```

#### GET /me/collection
```json
{ "owned": ["kyubi", "kooni", "...", "tamamo"] }
```

#### GET /me/formation / PUT /me/formation
```json
{ "rows": [["raiju", null, "...", "ibaraki"], ["daitengu", "...", "hitouban"]] }
```
PUT時のサーバー検証(現 `Meta.validateFormation` と同一ロジックを共有コードで実行): 2×5構造 / 全駒所持済み / 種別重複なし / 大将ちょうど1体。違反は `INVALID_FORMATION`。

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
| GET | /ranking | レートランキング上位(シーズン導入後) |

## WebSocket プロトコル

- エンドポイント: `wss://api.<domain>/v1/battle?token=<アクセストークン>`
  - Workerが認証・ルーティングし、Matchmaker DO(待機中)または BattleRoom DO(対局中)へWSをフォワードする
- メッセージはJSON: `{ "t": "<type>", ...payload }`
- ハートビート: WebSocket Hibernation API の自動 ping/pong 応答を利用(DO休止中もプラットフォームが応答。アプリ実装は欠落検知のみ)

### クライアント → サーバー

| t | payload | 説明 |
|---|---|---|
| join_queue | `{}` | ランダムマッチ待機 |
| leave_queue | `{ reason?: "cancel" | "timeout" }` | 待機解除。timeoutは20秒後のAI戦切替 |
| create_room | `{}` | フレンドマッチ用ルーム作成 → `room_created {code}` |
| join_room | `{ code }` | コードで参加 |
| action | `{ kind:'move', from:{x,y}, to:{x,y} }` または `{ kind:'drop', id, to:{x,y} }` | 現エンジンのaction形式そのまま |
| resign | `{}` | 投了 |
| rematch | `{}` | 再戦希望 |
| reconnect | `{ matchId, token }` | 再接続 |

### サーバー → クライアント

| t | payload | 説明 |
|---|---|---|
| queued | `{ position }` | キュー受付 |
| room_created | `{ code }` | ルームコード発行 |
| match_found | `{ matchId, reconnectToken, side:'p'｜'e', opponent:{name,rating,bossId}, formations:{p,e} }` | 対局成立 |
| game_start | `{ state }` | 初期局面スナップショット |
| events | `{ seq, events:[...] }` | **現エンジン `applyAction` の戻り値と同形式**(move/drop/capture/promote/gameover)。seqは欠落検知用の連番 |
| your_turn | `{ remainMs }` | 手番通知+残り時間 |
| opponent_disconnected | `{ graceMs }` | 相手切断(猶予中) |
| snapshot | `{ state, remainMs, seq }` | 再接続時の現局面 |
| game_end | `{ winner, reason, reward:{tickets}, rating:{before,after} }` | 終局。reason: boss/hp/explode/nomoves/resign/timeout/disconnect/draw |
| error | `{ code, message }` | 不正な操作など |

### state スナップショット形式

現エンジンの状態オブジェクトのシリアライズ(`board`(uid/id/owner/promoted)、`hp`、`hands`、`turn`、`combo`)。`Game.clone` 互換の構造とし、クライアントはこれをそのまま描画(`renderAll`/`updateHUD`)に流せる。

## バージョニング

- REST: パスの `/v1`
- WS: 接続時クエリ `?v=1`。サーバーは非互換時に `error {code:'VERSION'}` を返し、クライアントはリロード(=最新クライアント取得)を促す
- クライアントは静的配信のため、**デプロイでクライアントとサーバーの版ずれが起き得る**。WSハンドシェイクでビルドハッシュを照合し、不一致なら更新を促す設計とする
