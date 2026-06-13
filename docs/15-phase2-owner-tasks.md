# Phase 2 オーナー作業チェックリスト

Phase 2 のコード実装後、オンライン対戦をクローズドβ・オープンβとして公開するまでに必要な作業をまとめる。

## 進捗サマリー (2026-06-13 更新)

| 区分 | 状態 |
|---|---|
| A. クローズドβ前 | A-3/A-4/C-2〜C-4 は完了。A-1(コミット)・A-2(staging Pages)・A-5/A-6(手動スモーク)が残り |
| B. オープンβ前 | B-3完了。B-1(Turnstile本番)・B-5(Sentry DSN)・B-6(UptimeRobot)・B-9/B-10(手動)が残り |
| C. production反映 | C-2〜C-4完了。C-5(公開直後確認)が残り |
| D. β運用 | 限定公開開始後 |

`要オーナー操作` はCloudflare/GitHub/外部サービスの画面操作、秘密情報、公開判断など、コード作業だけでは完了しない項目。
`実装依頼が必要` は現時点でコードが未実装のため、設定だけでは完了しない項目。

## 現在の重要な前提

- CIのdeployジョブが配信するのは **Pagesクライアントのみ**。D1マイグレーションとAPI/DOデプロイは自動化されていない。
- **コード実装は完了済み**(BattleRoom/Matchmaker DO、オンラインUI、同意UI、Turnstileクライアント、Sentry組み込み、メンテナンス表示、法務HTML)。
- production APIは Phase 2 コードへデプロイする必要がある(旧Phase 1だと `/v1/auth/config` が404相当になる)。
- stagingの`ALLOWED_ORIGINS`に `https://yokai-shogi-staging.pages.dev` を追加済み。staging Pagesプロジェクトの作成は要オーナー操作。
- Sentryは `VITE_SENTRY_DSN` 未設定時は無効。DSN取得とGitHub Secrets登録は要オーナー操作。
- Cloudflare無料枠を保護するため、自動負荷試験は実施しない。

---

## A. クローズドβ前の必須作業

### A-1. コードのコミット・PR・mainマージ `要オーナー操作` ⬜ PR作成待ち

- ブランチ `feat/phase2-ops-prep` を push 済み。
- PR: https://github.com/nit-kl/yokai-shogi/pull/new/feat/phase2-ops-prep

### A-2. staging用の接続方法を決める `要オーナー操作` ✅ 完了

- Pagesプロジェクト `yokai-shogi-staging` 作成済み。
- URL: https://yokai-shogi-staging.pages.dev/
- デプロイ: `npm run pages:deploy:staging`

`server/wrangler.jsonc` のstaging `ALLOWED_ORIGINS` に `https://yokai-shogi-staging.pages.dev` を追加済み。

1. Cloudflare Pagesで staging 用プロジェクト(または固定ブランチ)を作成し、`https://yokai-shogi-staging.pages.dev` で配信する。
   - コマンド: `npm run pages:deploy:staging`（初回は `wrangler pages project create yokai-shogi-staging` が必要な場合あり）
2. ビルド時に `npm run build:staging` でstaging APIへ接続する版をデプロイする。
3. 一時対応としてローカルVite(`VITE_API_URL=... npm run dev`)からstaging APIへ接続して確認してもよい。

### A-3. staging D1バックアップ確認・マイグレーション `要オーナー操作` ✅ 完了

1. `npx wrangler d1 info yokai-shogi-db-staging --config server/wrangler.jsonc --env staging`
2. D1がTime Travel対応のproduction backendであることを確認する。
3. `npm run db:migrate:staging`
4. CloudflareダッシュボードまたはD1クエリで `matches` / `match_actions` / `online_win_reward_count` の追加を確認する。

### A-4. staging API/DOデプロイ `要オーナー操作` ✅ 完了

1. `npm run api:deploy:staging`
2. デプロイ出力で以下のbindingを確認する。
   - `BATTLE (BattleRoom)`
   - `MATCHMAKER (Matchmaker)`
   - `DB`
   - `METRICS`
3. `https://yokai-shogi-api-staging.<account>.workers.dev/healthz` が200を返すことを確認する。
4. Analytics Engineに `yokai_shogi_metrics_staging` が作成されていることを確認する。

### A-5. staging接続スモークテスト `要オーナー操作` ⬜ 一部完了

自動補助（結果）:
- 本番ソロ: `node test/e2e/smoke-live.mjs` ✅（Turnstile有効後はソロ経路）
- 本番ランダム2局: `node test/e2e/battle-staging-smoke.mjs https://yokai-shogi.nit-games.com/`（独自ドメイン切替後に再確認）
- staging Pages: Turnstile有効のためヘッドレス自動テスト不可 → **手動ブラウザ**で確認
- セキュリティREST/WS: `node test/manual/security-check.mjs` ✅

手動確認:
- 4ブラウザでランダムマッチを2局同時に成立させる。
- 非手番側の着手が拒否されることをDevToolsから確認する。
- 対局中に片方を再読み込みし、60秒以内に復帰できることを確認する。
- 片方を60秒以上切断し、切断負けになることを確認する。
- 1手60秒の時間切れが成立することを確認する。
- 対局終了後、D1の `matches` / `match_actions` / 戦績へ保存されていることを確認する。
- ランダムマッチ勝利報酬と、フレンドマッチ報酬なしを確認する。
- Analytics Engineに `match_found` / `match_end` が記録されることを確認する。

### A-6. stagingでデプロイ中の対局復元を確認 `要オーナー操作` ⬜ 未完了

1. フレンド対局を開始し、数手進める。
2. 対局中に `npm run api:deploy:staging` を再実行する。
3. クライアントが再接続し、局面・手番・持ち時間が復元されることを確認する。

---

## B. オープンβ前の公開ブロッカー

### B-1. Turnstileを有効化する `要オーナー操作` ⬜ production秘密鍵設定済み・ドメイン登録要確認

- staging / production ともに `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` 設定済み。
- **残り**: Cloudflare Turnstileダッシュボードで `yokai-shogi.nit-games.com` と移行期間用の `yokai-shogi.pages.dev` をホスト名に追加し、実ブラウザでゲスト作成を確認。

公開状態で未設定のままにすると、botによるゲスト大量作成でD1無料枠を消費される。

1. CloudflareダッシュボードでTurnstileウィジェットを作成する。
2. クライアントからゲスト作成時にTurnstileトークンを送る実装を追加する。
3. stagingで検証後、サイトキーと秘密鍵を設定する。
   - `npx wrangler secret put TURNSTILE_SITE_KEY --config server/wrangler.jsonc --env staging`
   - `npx wrangler secret put TURNSTILE_SECRET_KEY --config server/wrangler.jsonc --env staging`
   - `npx wrangler secret put TURNSTILE_SITE_KEY --config server/wrangler.jsonc --env production`
   - `npx wrangler secret put TURNSTILE_SECRET_KEY --config server/wrangler.jsonc --env production`
4. 正常なゲスト作成と、不正・欠落トークン拒否を確認する。

**重要**: Turnstileウィジェットの「ホスト名管理」に以下を追加すること。
- `yokai-shogi.pages.dev`
- `yokai-shogi.nit-games.com`
- `yokai-shogi-staging.pages.dev`
- `localhost`（ローカル開発用）

未追加だとエラー `110200` となり、ブラウザでもゲスト作成が失敗する。

秘密鍵だけ先に設定するとゲスト作成に失敗する。サイトキーと秘密鍵は同じ環境へセットで設定する。

### B-2. 利用規約・プライバシーポリシーを完成・公開する `要オーナー操作` ⬜ 内容最終確認が残り

### B-3. 初回同意UIを実装する `完了` ✅

`client/src/main.ts` の同意モーダル(`CONSENT_KEY`)で実装済み。文書改定時はキーを更新して再同意させる。

### B-4. 問い合わせ・障害告知経路を開設する `要オーナー操作` ⬜ 未完了

- 問い合わせ用メールアドレスまたはフォームを用意する。
- 障害告知用の外部経路を1つ用意する。
- 利用規約・プライバシーポリシー・ゲーム画面から到達できるようにする。

### B-5. Sentryクライアント監視を組み込む `要オーナー操作` ⬜ DSN未設定

SDK組み込み済み(`client/src/sentry.ts`)。`VITE_SENTRY_DSN` をビルド時に渡すか、GitHub ActionsのdeployジョブへSecret追加する。

### B-6. UptimeRobotを設定する `要オーナー操作` ⬜ 未完了

- production `/healthz` を5分間隔で監視する。
- 2回連続失敗でメール等へ通知する。
- テスト停止または一時的なURL変更で通知経路を確認する。

### B-7. Analytics Engineの確認クエリを用意する `要オーナー操作` ✅

[docs/analytics-queries.md](analytics-queries.md) にSQLを保存済み。ダッシュボードで実行して保存すること。

### B-8. メンテナンス・ロールバック手順を確認する `要オーナー操作` ⬜ 未完了

- 現在のメンテナンスモードは `MAINTENANCE=1` へ設定変更して再デプロイする方式。クライアントは `/healthz` の `maintenance` フラグでバナー表示する。
- CloudflareダッシュボードからAPI Workerを直前バージョンへロールバックできることを確認する。
- Pagesを直前デプロイへロールバックできることを確認する。
- D1 Time Travelは無料プランでは過去7日まで。復元コマンドは破壊的なので、stagingでのみ訓練する。

### B-9. セキュリティ手動検証 `要オーナー操作` ⬜ 一部自動化済み

`node test/manual/security-check.mjs` でREST/WS/CORSの自動検証。対局中の着手拒否は手動。

- トークンなし・改ざんトークンでWebSocket接続できない。
- 非手番着手・不正座標・不正な持ち駒・高速連打が拒否される。
- 同一アカウント同士でマッチしない。
- フレンドマッチで報酬が付与されない。
- 切断勝ち・時間切れ勝ちで報酬が付与されない。
- CORSで許可外OriginからREST APIを利用できない。

### B-10. 実機・ブラウザ確認 `要オーナー操作` ⬜ 未完了

- PC: Chrome / Edge / Firefox / Safari(macOSがある場合)
- モバイル: iOS Safari / Android Chrome
- 各環境でタイトル表示、オンラインマッチ成立、1局完走、スリープ復帰を確認する。

---

## C. production反映手順

### C-1. 本番反映前チェック `要オーナー操作`

- stagingのA項目とB項目が完了している。
- 公開日時・対象ユーザー・障害時の中止判断を決めている。
- Cloudflareダッシュボードで当日のWorkers / DO / D1使用量に余裕がある。
- `JWT_SECRET` と `TURNSTILE_SECRET_KEY` がproductionに設定済みである。

### C-2. production D1マイグレーション `要オーナー操作` ✅ 完了

1. 現在時刻とD1 Time Travel bookmarkを記録する。
2. `npm run db:migrate:prod`
3. `matches` / `match_actions` / `online_win_reward_count` の追加を確認する。

### C-3. production API/DOデプロイ `要オーナー操作` ✅ 完了

1. `npm run api:deploy`
2. DO・D1・Analytics Engine bindingを確認する。
3. `/healthz` と既存REST APIが正常であることを確認する。

### C-4. production Pagesデプロイ `要オーナー操作` ✅ 完了（feat/phase2-ops-prep 版を main に反映済み）

- `npm run pages:deploy`、またはmainマージ後のGitHub Actions deployジョブでオンライン版を配信する。
- API/DOより先にPagesを公開しない。

### C-5. production公開直後の確認 `要オーナー操作` ⬜ 未完了

- 2ブラウザでフレンドマッチを1局完走する。
- ランダムマッチ成立・再接続・投了を確認する。
- D1保存、Analytics Engine、Workers Logs、Sentry、UptimeRobotを確認する。
- 異常があればPages/APIをロールバックし、必要なら `MAINTENANCE=1` でAPIを停止する。

---

## D. β期間中の運用

### 毎日

- CloudflareのWorkers / Durable Objects / D1 / Analytics Engine使用量を確認する。
- Workers LogsとSentryの新規エラーを確認する。
- `match_found` と `match_end` の件数差を確認し、完走率を算出する。
- 問い合わせと切断報告を確認する。

無料枠の主な注意点:

- Durable Objects: 100,000リクエスト/日、100,000行書き込み/日
- D1: 100,000行書き込み/日、500万行読み取り/日
- Workers: 100,000リクエスト/日
- Analytics Engine: 100,000データポイント/日

BattleRoomは通常着手ごとに `runtime` 1行とアラーム1行を更新する。平均100手なら約2万行/100局がDO書き込みの目安になる。

### 毎週

- D1 Time Travelが利用可能な状態であることを確認する。無料プランの復元可能期間は7日。
- 戦績・通貨ログの整合性エラーがないことを確認する。
- 完走率、切断理由、時間切れ理由、クライアントクラッシュを集計する。
- 公開範囲を広げるか、フレンドマッチ限定へ縮小するか判断する。

---

## Phase 2完了判定

以下をすべて満たした時点でPhase 2完了とする。

- 全自動テストがgreen。
- stagingとproductionでフレンド・ランダム・再接続・時間切れ・切断負けを確認済み。
- Turnstile、規約同意UI、問い合わせ窓口、Sentry、UptimeRobotが稼働済み。
- チート手動検証とロールバック訓練が完了。
- 限定公開後2週間、対局完走率90%以上を維持し、重大クラッシュがない。
- 無料枠の使用量が継続運用可能な範囲に収まっている。

負荷試験はCloudflare無料枠保護のためPhase 2完了条件から除外する。

## 「今すぐクローズドβ」だけなら

知人2〜4人に限定して確認する最小作業は以下。

1. A-1〜A-6を完了する。
2. 問い合わせ可能な連絡手段を知人へ共有する。
3. 毎日Cloudflare使用量とWorkers Logsを確認する。

Turnstile・規約同意UI・Sentry・正式な監視は、知人限定のクローズドβでは延期可能。ただし、URLを広く公開する前にB項目を完了する。
