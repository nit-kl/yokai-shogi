# 13. GitHub ActionsによるCloudflareデプロイ

`.github/workflows/ci.yml` がテストとCloudflareへのデプロイを管理する。

## デプロイ構成

### Pull Request

1. 型チェック・単体テスト・Workers統合テスト・E2Eテストを実行する。
2. 成功後、オンラインAPI接続版クライアントをCloudflare Pagesのプレビューへデプロイする。
3. Worker API、D1、ステージング環境は変更しない。

### mainへのpush

テスト成功後、以下を直列実行する。

1. 本番D1へ未適用マイグレーションを適用
2. 本番Worker APIをデプロイ
3. `https://api.yokai-shogi.nit-games.com/healthz` を確認
4. オンラインAPI接続版クライアントをビルド
5. 本番Cloudflare Pagesへデプロイ

クライアントより先にDBとAPIを更新し、新しいAPIを必要とするクライアントが先行公開されることを防ぐ。

同時に複数のmainデプロイが開始された場合は、`concurrency: production` により直列実行される。

## ステージング

ステージングは自動デプロイしない。必要なタイミングで以下を順番に手動実行する。

```powershell
npm run db:migrate:staging
npm run api:deploy:staging
npm run pages:deploy:staging
```

## 必要なGitHub Secrets

リポジトリの `Settings > Secrets and variables > Actions` に登録する。

| Name | 内容 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflareデプロイ用APIトークン |
| `CLOUDFLARE_ACCOUNT_ID` | 対象CloudflareアカウントID |

APIトークンには、以下の権限とリソース範囲が必要。

| 種別 | 権限 | リソース |
|---|---|---|
| Account | Cloudflare Pages: Edit | 対象アカウント `nit` |
| Account | Workers Scripts: Edit | 対象アカウント `nit` |
| Account | D1: Edit | 対象アカウント `nit` |
| Zone | Workers Routes: Edit | 対象Zone `nit-games.com` |

`server/wrangler.jsonc` のproduction環境は `api.yokai-shogi.nit-games.com` をCustom Domainとして管理するため、Worker本体のアップロード権限とは別に、Zoneの `Workers Routes: Edit` が必要になる。

`wrangler whoami` のメールアドレス表示に関する警告を消す場合は `User > User Details > Read` を追加できるが、デプロイには不要。

Secretsが未設定の場合、本番デプロイは失敗する。意図せず本番更新がスキップされる状態を避けるためである。

### Workers Routesの認証エラー

Workerアップロード後に次のエラーが出た場合、トークンのZone権限が不足している。

```text
A request to the Cloudflare API (/zones/.../workers/routes) failed.
Authentication error [code: 10000]
```

Cloudflare DashboardのAPI Tokens画面でトークンを更新または再作成し、`Zone > Workers Routes > Edit` と対象Zone `nit-games.com` を追加する。その後、GitHub Secret `CLOUDFLARE_API_TOKEN` を新しいトークンへ差し替え、失敗したGitHub Actionsジョブを再実行する。

## マイグレーション方針

mainへマージされるD1マイグレーションは、デプロイ中に旧Workerと新Workerの両方から利用できる前方互換な変更に限定する。

- 推奨: テーブル追加、NULL許容カラム追加、既定値付きカラム追加
- 非推奨: 同一デプロイでのカラム削除・名前変更・意味変更
- 破壊的変更: 複数回のリリースに分割し、先にコードを移行してから後日削除する

Wranglerは未適用マイグレーションだけを適用し、適用前にD1バックアップを作成する。失敗したマイグレーションはロールバックされ、本番WorkerとPagesのデプロイは実行されない。

## 手動デプロイ

緊急時はローカルから同じ順序で実行する。

```powershell
npm run db:migrate:prod
npm run api:deploy
npm run pages:deploy
```

実行には `npx wrangler login` またはCloudflare APIトークンが必要。

## ロールバック

- Pages: Cloudflare DashboardのPagesデプロイ履歴から以前のデプロイへ戻す
- Worker API: Cloudflare DashboardのWorkerデプロイ履歴から以前のバージョンへ戻す
- D1: Time Travelを利用する。スキーマ変更を戻す場合は、原則として逆方向の新しいマイグレーションを追加する
