# 09. 運用・インフラ設計

Cloudflareプラットフォームに統一し、個人運用で回り続けることを最優先にする。「サーバーの面倒を見る」作業をゼロに近づけ、「壊れた時に気づける仕組み」へ投資する。

## 環境構成

| 環境 | 用途 | 実体 |
|---|---|---|
| local | 開発 | `wrangler dev`(D1/DOをローカル再現)+ `vite dev` |
| staging | リリース前検証・接続スモークテスト | wrangler environment `staging`(別Worker・別D1・別DOネームスペース)+ Pagesプレビュー |
| production | 本番 | wrangler environment `production` |

```toml
# server/wrangler.jsonc が正本
npm run api:dev
npm run api:deploy:staging
npm run api:deploy
```

### 本番構成と費用(月額目安: 5〜10ドル)

| サービス | 用途 | 費用 |
|---|---|---|
| Workers Paid プラン | API + Durable Objects + Cron | $5/月(DO・D1の十分な無料枠込み) |
| Pages | クライアント静的配信(グローバルCDN) | 無料 |
| D1 | DB(Time Travel 30日込み) | 無料枠内(超過しても従量で微小) |
| Turnstile | bot対策 | 無料枠内 |
| Sentry(クライアント) | エラートラッキング | 無料枠 |
| UptimeRobot | 外形監視 | 無料 |

- 駒画像は WebP 512px と小サイズ160pxを `client/public/assets/pieces/` に配置する。再生成は `npm run images`(`scripts/optimize-images.mjs`)で行う。

## CI/CD(GitHub Actions)

```
PR時:
  - npm run typecheck
  - npm run test
  - vitest(@cloudflare/vitest-pool-workers): API・DOのWorkersランタイムテスト
  - npm run build
  - npm run test:e2e
  - Cloudflare Secrets がある場合のみ Pagesプレビューデプロイ
main マージ時:
  - 上記テスト全部
  - 本番D1マイグレーション → API/DOデプロイ → healthz確認 → Pagesデプロイを自動実行
本番リリース:
  - mainへのpushで自動実行。stagingは必要なタイミングで手動実行(doc 13)
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
- 必要に応じて `wrangler d1 export` でSQLダンプを取得し、Cloudflare外の保管先へ退避する。
- 障害対応の最低限:
  1. API異常 → `wrangler rollback`(直前バージョンへ即戻し)
  2. データ破損 → Time Travelで時点復元(直近データ損失をユーザーに告知+一律補償)
  3. 不正アクセス疑い → 全リフレッシュトークン失効 → 調査(currency_logs / gacha_logs)
- 目標: RPO 1時間以内(Time Travelにより実質分単位)、RTO 1時間

## 告知・コミュニケーション手段

- ゲーム内お知らせ: `shared/announcements.ts` を更新してデプロイする。
- メンテモード: 現状はAPI環境変数 `MAINTENANCE=1` + 再デプロイ。将来は即時切替できる設定ストアを検討する。
- 外部: X(Twitter)アカウント等を1つ用意(ゲーム外の告知経路)。有料集客の手順は [doc 17](17-x-ads-guide.md)

## 定常運用タスク

| 頻度 | タスク |
|---|---|
| 毎日(Cron自動) | 経済不変条件チェック、休眠ゲスト削除、日次集計 |
| 毎週 | 妖怪採用率・勝率集計の確認、Sentry/Workers Logsレビュー、Dependabot PR確認、必要に応じたD1エクスポート |
| 毎月 | 費用確認(Workersダッシュボード)、容量・負荷トレンド確認 |
| シーズンごと | バランス調整・新コンテンツ・レートリセット(doc 08) |
