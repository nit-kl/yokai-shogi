# 09. 運用・インフラ設計

Cloudflareプラットフォームに統一し、個人運用で回り続けることを最優先にする。「サーバーの面倒を見る」作業をゼロに近づけ、「壊れた時に気づける仕組み」へ投資する。

## 環境構成

| 環境 | 用途 | 実体 |
|---|---|---|
| local | 開発 | `wrangler dev`(miniflareがD1/DO/KVをローカル再現)+ `vite dev` |
| staging | リリース前検証・接続スモークテスト | wrangler environment `staging`(別Worker・別D1・別DOネームスペース)+ Pagesプレビュー |
| production | 本番 | wrangler environment `production` |

```toml
# wrangler.toml(イメージ)
[env.staging]
d1_databases = [{ binding = "DB", database_name = "yokai-staging" }]
durable_objects.bindings = [{ name = "BATTLE", class_name = "BattleRoom" }, ...]
[env.production]
...
```

### 本番構成と費用(月額目安: 5〜10ドル)

| サービス | 用途 | 費用 |
|---|---|---|
| Workers Paid プラン | API + Durable Objects + Cron | $5/月(DO・D1の十分な無料枠込み) |
| Pages | クライアント静的配信(グローバルCDN) | 無料 |
| D1 | DB(Time Travel 30日込み) | 無料枠内(超過しても従量で微小) |
| KV / R2 / Turnstile | フラグ・バックアップ退避・bot対策 | 無料枠内 |
| Sentry(クライアント) | エラートラッキング | 無料枠 |
| UptimeRobot | 外形監視 | 無料 |

- 駒画像は計5MB超(512px PNG ×30枚)。**WebP変換+複数サイズ生成**をアセットパイプライン(`prototype/test/process-images.js` 系列)に追加し、Pagesの長期キャッシュで配信(初回ロード改善はリリース必須タスク)

## CI/CD(GitHub Actions)

```
PR時:
  - tsc --noEmit(型チェック)+ eslint
  - vitest: shared/エンジン・抽選・レーティングのユニットテスト
  - vitest(@cloudflare/vitest-pool-workers): API・DOのWorkersランタイムテスト
  - playwright UIテスト(ui-shot / ui-gacha / ui-skills / ui-fx)
  - Pagesプレビューデプロイ(PRごとのURLでUI確認)
main マージ時:
  - 現行CIは上記全部 → Pagesのみデプロイ
  - D1マイグレーションとAPI/DOのstagingデプロイは手動実行(doc 15)
本番リリース:
  - D1マイグレーション → API/DOデプロイ → Pagesデプロイの順で手動実行(doc 15)
```

### デプロイと対局の継続性

- デプロイでDOは再起動し**WebSocketは切断される**。ただし:
  1. 局面はDOストレージに毎手永続化済み(doc 05)
  2. クライアントは自動再接続(reconnectトークン)→ DOがストレージから復元した局面を `snapshot` で再送
  - → **メンテウィンドウなしでデプロイ可能**(ユーザー体感は数秒の「再接続中…」表示)
- 現在のメンテナンスモードは `MAINTENANCE=1` へ設定変更してAPIを再デプロイする方式。クライアントは `/healthz` の `maintenance` フラグで起動時にバナー表示する
- D1マイグレーション: 前方互換(カラム追加→コード切替→旧カラム削除の3段階)を原則。`wrangler d1 migrations` で管理し、適用前にstagingで必ずリハーサル

## 監視・アラート

| 監視対象 | ツール | アラート条件(例) |
|---|---|---|
| 死活(/healthz) | UptimeRobot | 2回連続失敗 → メール/Discord webhook |
| クライアントエラー | Sentry | 新種エラー・5分で10件超 |
| サーバーエラー・例外 | Workers Logs(+ Logpush検討) | error率の急増 |
| 対局数・マッチング成立時間・WS接続 | Workers Analytics Engine にカスタムメトリクス記録 → ダッシュボード | 成立時間中央値が5分超(過疎 or 障害) |
| D1容量・クエリ性能 | Cloudflareダッシュボード | 容量80% |
| 経済の不変条件(doc 08) | **Cron Triggers(日次)** | 違反検知 → Discord webhook |

ログは構造化JSON。検索キー: userId / matchId / イベント種別。トークン・IPはマスク(doc 07)。

## バックアップ・障害復旧

- **D1 Time Travel**: Freeプランは過去7日、Paidプランは過去30日の任意時点へ復元可能(標準機能)
- 加えて週次 `wrangler d1 export` でSQLダンプをR2へ退避(Time Travel外の保険・ローカル検証用)
- Runbook(docs/runbooks/ に配置)最低限:
  1. API異常 → `wrangler rollback`(直前バージョンへ即戻し)
  2. データ破損 → Time Travelで時点復元(直近データ損失をユーザーに告知+一律補償)
  3. 不正アクセス疑い → 全リフレッシュトークン失効 → 調査(currency_logs / gacha_logs)
- 目標: RPO 1時間以内(Time Travelにより実質分単位)、RTO 1時間

## 告知・コミュニケーション手段

- ゲーム内お知らせ: KVに置いたJSONをクライアントが起動時取得(メンテ予告・障害報告・アップデート情報)
- メンテモード: 現状はAPI環境変数+再デプロイ。将来はKV即時切替+タイトルバナーを検討
- 外部: X(Twitter)アカウント等を1つ用意(ゲーム外の告知経路)

## 定常運用タスク

| 頻度 | タスク |
|---|---|
| 毎日(Cron自動) | 経済不変条件チェック、休眠ゲスト削除、日次集計 |
| 毎週 | 妖怪採用率・勝率集計の確認、Sentry/Workers Logsレビュー、Dependabot PR確認、R2へのD1エクスポート確認 |
| 毎月 | 費用確認(Workersダッシュボード)、容量・負荷トレンド確認 |
| シーズンごと | バランス調整・新コンテンツ・レートリセット(doc 08) |
