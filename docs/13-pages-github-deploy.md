# 13. GitHub連携デプロイ手順書(Cloudflare Pages)

mainへのpushで本番(https://yokai-shogi.pages.dev/)へ、PRごとにプレビューURLへ自動デプロイする設定手順。

## 仕組み(採用方式: GitHub Actions経由)

```
git push / PR
   │
   ▼
GitHub Actions(.github/workflows/ci.yml)
   ├ test ジョブ: tsc + vitest + build + e2e   ← これが通らないとデプロイされない
   └ deploy ジョブ: wrangler pages deploy
        ├ main への push → 本番 (yokai-shogi.pages.dev)
        └ PR            → プレビュー (<ブランチ名>.yokai-shogi.pages.dev)
```

ワークフローは設定済み。**やることはGitHubにSecretsを2つ登録するだけ**(下記)。
未登録の間、deployジョブは「スキップ」になる(CIは失敗しない)。

> 代替案として Cloudflare ダッシュボードのGit連携(ビルドもCloudflare側で実行)もあるが、
> 既存プロジェクトが「Direct Upload」型のため**作り直しが必要**になること、
> テスト通過後のみデプロイという制御がしやすいことから、GitHub Actions方式を採用する。
> 切り替えたくなった場合の手順は本書末尾に記載。

## 手順(所要 約5分)

### 1. Cloudflare APIトークンを作成

1. https://dash.cloudflare.com/profile/api-tokens を開く
2. **Create Token** → 一番下の **Create Custom Token** → **Get started**
3. 以下を設定して **Continue to summary** → **Create Token**
   - Token name: `yokai-shogi-pages-deploy`(任意)
   - Permissions: **Account** / **Cloudflare Pages** / **Edit** の1行だけ
   - Account Resources: **Include** / 自分のアカウント(`nit`)
4. 表示されたトークン文字列をコピー(**この画面でしか見られない**)

> 権限を Pages Edit のみに絞ることで、トークンが漏れても被害範囲を限定できる(doc 07 の最小権限方針)。

### 2. アカウントIDを確認

`npx wrangler whoami` で表示される Account ID(このアカウントは `d9b67085ab39fb54974b83669e90d52f`)。
ダッシュボードの Workers & Pages 画面右側でも確認できる。

### 3. GitHubリポジトリにSecretsを登録

1. https://github.com/nit-kl/yokai-shogi/settings/secrets/actions を開く
2. **New repository secret** で以下の2つを登録

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 手順1でコピーしたトークン |
| `CLOUDFLARE_ACCOUNT_ID` | `d9b67085ab39fb54974b83669e90d52f` |

### 4. 動作確認

1. 適当なPRを作る(または既存PRに push する)→ Actions の `deploy` ジョブが走り、ログ末尾にプレビューURLが出る
2. mainへマージ → `deploy` ジョブが本番(yokai-shogi.pages.dev)へ反映する
3. 確認コマンド(ローカル): `node test/e2e/smoke-live.mjs https://yokai-shogi.pages.dev/`

## 運用メモ

- **デプロイの単位**: testジョブ(typecheck + vitest + e2e)が成功したコミットだけがデプロイされる
- **手動デプロイ**: 緊急時はローカルから `npm run pages:deploy`(要 `npx wrangler login`)
- **ロールバック**: ダッシュボード → Workers & Pages → yokai-shogi → Deployments → 過去のデプロイの「…」→ **Rollback to this deployment**
- **トークンを漏らした場合**: API Tokens画面で該当トークンを **Roll** または **Delete** → Secrets を更新

## 料金(2026-06時点・現構成)

| サービス | 使用状況 | 料金 |
|---|---|---|
| Cloudflare Pages | 静的配信のみ(Free プラン) | **0円**(リクエスト・帯域無制限。直アップロードのデプロイ回数も無料枠内) |
| Cloudflare Workers | staging / production APIをデプロイ済み | Freeプラン枠内を監視 |
| D1 / Durable Objects / Analytics Engine | Phase 2で使用。DOはPhase 2 APIデプロイ後に有効化 | Freeプラン枠内を監視 |
| GitHub Actions | publicリポジトリ | **0円**(標準ランナーは無制限) |
| GitHub Artifacts(e2eスクショ) | 保持14日・数MB | 0円(無料枠500MBの範囲内) |

クレジットカード登録なしでFreeプラン運用可能。無料枠を超えると対象操作が失敗するため、β期間は使用量を毎日確認する(doc 15)。

## (参考)代替案: CloudflareダッシュボードのGit連携に切り替える場合

PRプレビューやロールバックをCloudflare側に寄せたい場合。**現プロジェクトはDirect Upload型のためGit連携に変更できず、作り直しになる**点に注意。

1. ダッシュボード → Workers & Pages → `yokai-shogi` → Settings → **Delete project**
2. Workers & Pages → **Create** → **Pages** → **Connect to Git** → `nit-kl/yokai-shogi` を選択
3. ビルド設定
   - Project name: `yokai-shogi`(同名にすれば yokai-shogi.pages.dev を引き継げる)
   - Production branch: `main`
   - Build command: `npm run build`
   - Build output directory: `client/dist`
4. `.github/workflows/ci.yml` の `deploy` ジョブを削除(二重デプロイ防止)
