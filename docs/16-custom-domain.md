# 16. 独自ドメイン取得・移行手順

Amazon Route 53で `nit-games.com` を取得し、ゲーム共通ドメインとして利用する。
DNSはCloudflareへ委譲し、百鬼盤を専用サブドメインから利用できるようにするための作業手順。

現在の本番配信先は `https://yokai-shogi.pages.dev`、本番APIは `https://yokai-shogi-api-production.kojileo0178.workers.dev`。

## 推奨構成

| 用途 | URL | 配信元 |
|---|---|---|
| ゲーム一覧ポータル | `https://nit-games.com` | 将来作成するポータルサイト |
| 本番ゲーム | `https://yokai-shogi.nit-games.com` | Cloudflare Pages `yokai-shogi` |
| 本番API・WebSocket | `https://api.yokai-shogi.nit-games.com` / `wss://api.yokai-shogi.nit-games.com` | Workers `yokai-shogi-api-production` |
| ステージングゲーム（任意） | `https://staging.yokai-shogi.nit-games.com` | Pages `yokai-shogi-staging` |
| ステージングAPI（任意） | `https://api-staging.yokai-shogi.nit-games.com` | Workers `yokai-shogi-api-staging` |
| `www` | `https://www.nit-games.com` → `https://nit-games.com` へリダイレクト | Cloudflare Redirect Rules |

`nit-games.com` は複数ゲームを案内するポータル用に確保し、各ゲームを `<game>.nit-games.com` 形式で追加する。
百鬼盤のゲームとAPIを同じサブドメイン階層に置くことで、利用者から見た信頼性と運用時の識別性を高める。
APIは既存コードと同様に別オリジンになるため、CORS設定は引き続き必要。

## DNS管理方針

| 項目 | 利用サービス |
|---|---|
| ドメイン登録・更新・登録者情報管理 | Amazon Route 53 Domains |
| 権威DNS・DNSSEC | Cloudflare DNS |
| ゲーム配信 | Cloudflare Pages |
| API・WebSocket | Cloudflare Workers |

Route 53はドメインのレジストラとしてのみ利用する。DNSレコードはRoute 53 Hosted Zoneでは管理せず、Route 53のRegistered domainsでネームサーバーをCloudflare指定値へ変更する。

Route 53でドメインを登録するとHosted Zoneが自動作成され、ドメイン登録料とは別に月額料金が発生する。Cloudflareへの委譲が完了し、Route 53 Hosted Zoneを使用していないことを確認した後は、不要なHosted Zoneを削除する。

## Route 53でのドメイン取得

1. AWS Management Console → **Route 53** → **Domains** → **Registered domains** を開く。
2. **Register domains** を選び、`nit-games.com` を検索して登録する。
3. 登録年数と自動更新を設定する。
4. 登録者・管理・技術・請求連絡先を入力し、対応TLDではプライバシー保護を有効にする。
5. 登録者メールアドレスに届く確認メールを確認する。未確認のままにするとドメインが停止される場合がある。
6. AWSアカウントのMFAとRoute 53のドメイン移管ロックを有効にする。
7. Route 53の **Requests** 画面で登録完了を確認する。

登録時にRoute 53 Hosted Zoneが自動作成されるが、Cloudflareへ委譲するまでは削除しない。

## 実施順序

旧URLを残したまま独自ドメインを追加し、動作確認後に独自ドメインを正式URLへ切り替える。

### 1. CloudflareへZoneを追加し、Route 53からDNSを委譲

1. Cloudflare Dashboardで **Add a domain** を選び、`nit-games.com` を追加する。
2. Cloudflareが指定する2つのネームサーバー名を控える。
3. Route 53 → **Domains** → **Registered domains** → `nit-games.com` を開く。
4. **Actions** → **Edit name servers** を選ぶ。
5. Route 53のネームサーバーを削除し、Cloudflare指定の2つへ置き換えて更新する。
6. Cloudflare上でZoneが **Active** になるまで待つ。ネームサーバーのキャッシュにより、反映に最大2日程度かかる場合がある。
7. Cloudflare側でDNSSECを有効化し、必要なDSレコードをRoute 53 Domainsへ登録する。

ネームサーバー変更前にRoute 53側のDNSSECが有効になっている場合は、先にDSレコードを解除してDNSSECを無効化する。DNSSECを有効にしたままネームサーバーを変更すると、ドメインが名前解決できなくなる可能性がある。

Windowsでの確認例:

```powershell
nslookup -type=ns nit-games.com 1.1.1.1
```

Cloudflare指定のネームサーバーが返ることを確認後、Route 53の不要なHosted Zoneを削除する。Registered domain自体は削除しない。

```text
削除する: Route 53 → Hosted zones → nit-games.com
残す:     Route 53 → Registered domains → nit-games.com
```

Cloudflareが `nit-games.com` のDNSを管理していれば、PagesとWorkersのサブドメイン用DNSレコードおよびTLS証明書は各Custom Domain設定から作成できる。

### 2. Pagesへ本番ゲームのドメインを追加

1. Cloudflare Dashboard → **Workers & Pages** → `yokai-shogi` を開く。
2. **Custom domains** → **Set up a domain** を選ぶ。
3. `yokai-shogi.nit-games.com` を登録する。
4. TLS証明書が発行され、ステータスがActiveになるまで待つ。

DNSレコードだけを手動追加せず、必ずPagesのCustom domains画面から関連付ける。
`nit-games.com` 自体は百鬼盤Pagesへ割り当てず、ゲーム一覧ポータル用として残す。

一時的に AdSense 審査用へルートをゲームへ向ける場合は、Pages に apex を載せず、Cloudflare の **Redirect Rule** で
`nit-games.com` / `www` → `https://yokai-shogi.nit-games.com` とする(手順の正本は doc 22 の B-0)。
ポータル公開時は Redirect を外す。

### 3. Workers APIへカスタムドメインを追加

`server/wrangler.jsonc` の `env.production` に以下を追加する。

```jsonc
"routes": [
  {
    "pattern": "api.yokai-shogi.nit-games.com",
    "custom_domain": true
  }
]
```

その後、Workerを再デプロイする。

```powershell
npm run api:deploy
```

CloudflareがAPI用DNSレコードとTLS証明書を自動作成する。`api.yokai-shogi.nit-games.com` の全パスが対象Workerへ送られるため、REST APIとWebSocketの両方で利用できる。

確認:

```powershell
Invoke-WebRequest https://api.yokai-shogi.nit-games.com/healthz
```

### 4. コード内の本番URLを変更

以下を変更する。

| ファイル | 変更内容 |
|---|---|
| `vite.config.ts` | `PROD_API` を `https://api.yokai-shogi.nit-games.com` に変更 |
| `server/wrangler.jsonc` | productionの `ALLOWED_ORIGINS` に `https://yokai-shogi.nit-games.com` を追加 |
| `test/manual/security-check.mjs` | 本番許可Originの期待値を独自ドメインへ変更 |
| `test/e2e/smoke-live.mjs` | 既定の本番URLを独自ドメインへ変更 |
| 運用ドキュメント | `pages.dev` / `workers.dev` の本番URL表記を更新 |

移行期間中のCORSは、新旧のクライアントURLを両方許可する。

```jsonc
"ALLOWED_ORIGINS": "https://yokai-shogi.nit-games.com,https://yokai-shogi.pages.dev"
```

独自ドメインからの動作確認が完了した後、`https://yokai-shogi.pages.dev` を許可対象から削除する。

クライアントはAPI URLをビルド時に埋め込むため、`vite.config.ts` の変更後にPagesを再デプロイする必要がある。

```powershell
npm run pages:deploy
```

### 5. 外部サービスの許可ドメインを更新

- Cloudflare Turnstileの許可ホスト名へ `yokai-shogi.nit-games.com` を追加する。
- UptimeRobot等の監視先を `https://api.yokai-shogi.nit-games.com/healthz` に変更する。
- Sentry等で許可Originや対象URLを制限している場合は独自ドメインを追加する。
- SNS、ブックマーク、利用規約、プライバシーポリシー等に絶対URLを記載している場合は更新する。

Turnstileは旧URLを使う移行期間中、`yokai-shogi.nit-games.com` と `yokai-shogi.pages.dev` の両方を許可する。

### 6. 本番確認

以下を独自ドメインに対して実施する。

```powershell
npm run typecheck
npm test
npm run test:workers
npm run build
npm run build:online
npm run test:e2e
node test/e2e/smoke-live.mjs https://yokai-shogi.nit-games.com/
node test/manual/security-check.mjs https://api.yokai-shogi.nit-games.com
```

手動確認:

- PCとスマートフォンから `https://yokai-shogi.nit-games.com` を開ける。
- HTTPS証明書エラーがない。
- ゲスト作成、ガチャ、編成、ソロ、オンライン対戦が動作する。
- ブラウザの開発者ツールでCORSエラーがない。
- WebSocketが `wss://api.yokai-shogi.nit-games.com` へ接続できる。
- `nit-games.com` と `www.nit-games.com` が百鬼盤とは独立したポータルURLとして維持されている。
- `api.yokai-shogi.nit-games.com/healthz` を監視できる。

### 7. 正式URLへの切替

検証完了後に以下を行う。

1. `yokai-shogi.pages.dev` から `https://yokai-shogi.nit-games.com` へのBulk Redirectを設定する。
2. productionの `ALLOWED_ORIGINS` から `https://yokai-shogi.pages.dev` を削除し、APIを再デプロイする。
3. 必要に応じて `server/wrangler.jsonc` のproductionで `workers_dev: false` と `preview_urls: false` を設定し、APIの公開経路を `api.yokai-shogi.nit-games.com` に限定する。
4. 検索エンジン、SNS、監視、告知に使う正式URLを独自ドメインへ統一する。

`workers_dev` を無効化するのは、独自APIドメインでREST・WebSocket・監視が正常に動作することを確認した後にする。

## ロールバック

独自ドメインで問題が起きた場合も、PagesとWorkersの旧URLをすぐには無効化しない。

1. PagesのBulk Redirectを停止し、`https://yokai-shogi.pages.dev` を案内する。
2. `vite.config.ts` の `PROD_API` を旧Workers URLへ戻してPagesを再デプロイする。
3. productionの `ALLOWED_ORIGINS` に旧Pages URLを戻してAPIを再デプロイする。
4. 原因を解消後、独自ドメインで再度本番確認する。

## オーナー作業とコード作業

| 作業 | 担当 |
|---|---|
| Route 53での `nit-games.com` 購入・自動更新・セキュリティ設定 | オーナー |
| CloudflareへのZone追加・Route 53 Registered domainsのネームサーバー変更 | オーナー |
| Cloudflare委譲確認後の不要なRoute 53 Hosted Zone削除 | オーナー |
| Pages Custom domain追加・Turnstileホスト名追加 | オーナー |
| `wrangler.jsonc`・`vite.config.ts`・テスト・ドキュメント更新 | コード作業 |
| API・Pagesの再デプロイ | オーナーまたはCI |
| PC・スマートフォン・オンライン対戦の本番確認 | オーナー |

## 公式資料

- [Amazon Route 53: Registering a new domain](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/domain-register.html)
- [Amazon Route 53: Adding or changing name servers](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/domain-name-servers-glue-records.html)
- [Amazon Route 53: Disabling DNSSEC signing](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-configuring-dnssec-disable.html)
- [Cloudflare Pages: Custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)
- [Cloudflare Workers: Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Cloudflare DNS: Change your nameservers](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)
- [Cloudflare Turnstile: Hostname management](https://developers.cloudflare.com/turnstile/get-started/hostname-management/)
