# 14. Phase 1 オーナー作業チェックリスト

Phase 1(サーバー権威メタ)を「本番に反映」し「内輪テスト配布」できる状態にするために、**あなた(運営者)の手で行う必要がある作業**をまとめる。コードの実装・テスト・staging検証・APIデプロイは完了済み(doc 12 の Phase 1 検証状況)。

各項目に「Claudeに任せられるか」を記載した。`要オーナー操作` はGitHub/Cloudflareダッシュボードや公開判断などClaudeが代行できないもの。

---

## A. 必須 — Phase 1を本番へ反映する

### A-1. コードのコミット・PR・mainマージ `要オーナー操作`
- 現在 `feat/phase1-server-meta` ブランチに未コミットの変更がある。
- コミット → PR作成 → レビュー → mainマージまでを実施する。
- 補足: `server/.dev.vars`(JWT秘密のローカル値)は `.gitignore` 済みでコミットされない。
- Claude: コミット文・PR本文の作成は依頼可。最終的な push/マージ操作はあなたの方針で実施。

### A-2. 本番Pagesを「オンライン版」で再デプロイ `Claude代行可(ただし公開判断はオーナー)`
- 現在 `yokai-shogi.pages.dev` は**オフライン版(ローカルセーブ)**のまま。サーバー権威に切り替えるには本番APIに接続する版を配信する。
- 方法は2つ:
  - 手動: `npm run pages:deploy`(= `build:online` してデプロイ)
  - 自動: A-3 のSecretsを設定して main にマージ → CIの `deploy` ジョブが実行
- ⚠️ **重要(フレッシュスタート)**: 切り替えると、既存プレイヤーの `localStorage` のデータ(所持・チケット)は引き継がれず、サーバー上の新規ゲストとして開始される(doc 05 の方針)。内輪テスト段階なら影響は小さいが、**切替タイミングは告知とあわせて判断する**。
- Claude: 「本番Pagesをオンライン版でデプロイして」と指示すれば実行可。ただし上記フレッシュスタートを承知のうえで。

### A-3. (CIで自動デプロイする場合)GitHub Secrets を設定 `要オーナー操作`
- 手動デプロイ(A-2の手動)だけで運用するなら不要。CIに任せるなら設定する。
- [GitHub → Settings → Secrets and variables → Actions](https://github.com/nit-kl/yokai-shogi/settings/secrets/actions) に2つ登録:
  - `CLOUDFLARE_API_TOKEN`(権限: Account / Cloudflare Pages / Edit)
  - `CLOUDFLARE_ACCOUNT_ID` = `d9b67085ab39fb54974b83669e90d52f`
- 手順の詳細は [docs/13-pages-github-deploy.md](13-pages-github-deploy.md)。
- Claude: トークンの発行・GitHubへの登録はWeb UI操作のため代行不可。

### A-4. 本番切替後の動作確認 `要オーナー操作(実機確認)`
- スマホ/PCの2つのブラウザで `yokai-shogi.pages.dev` を開く。
- 1台目: タイトル「データ引き継ぎ」→ コード発行 → ガチャ等でデータを変化させる。
- 2台目: 「データ引き継ぎ」→ コード入力 → 1台目と同じチケット・所持になることを確認。
- Claude: staging相手の自動実証(`test/e2e/sync-online.mjs`)は済み。本番URLでの目視確認はあなたが実施。

---

## B. 内輪テスト配布の前に対応する

### B-1. ⚠️ Turnstile は「クライアント実装とセットで」有効化する `Claudeにクライアント実装を依頼可 / 鍵設定は要オーナー操作`
- 現状: サーバーは `TURNSTILE_SECRET_KEY` が**未設定なので検証をスキップ**している(誰でもゲスト作成可能)。
- **落とし穴**: 先に秘密鍵だけ設定すると、クライアントが検証トークンを送らないため**ゲスト作成が全部失敗する**(`VALIDATION` 400)。
- 正しい順序:
  1. Cloudflareダッシュボードで Turnstile ウィジェットを作成 → サイトキー/シークレットキーを取得 `要オーナー操作`
  2. クライアントのゲスト作成前にウィジェットを表示しトークンを送る実装を入れる(Claudeに依頼可)
  3. `npx wrangler secret put TURNSTILE_SECRET_KEY --config server/wrangler.jsonc --env production`(staging も同様)`要オーナー操作`
- bot対策が要らない内輪テスト(知人配布)の段階では、無効のままでも可。広く配布する前に対応する。

### B-2. 利用規約・プライバシーポリシーの仕上げ `要オーナー操作(内容判断)`
- 初版は [docs/legal/](legal/) にある。以下を埋める/確認する:
  - 連絡先窓口(現状 `(公開前に設定)` のプレースホルダ)
  - 運営者表記(ハンドル名等)
  - 必要に応じて専門家の確認(doc 11)
- 同意UI(初回起動時の同意フロー)の組み込みは Phase 2(オープンβ)で実装予定。Claudeに依頼可。

### B-3. 問い合わせ窓口の開設 `要オーナー操作`
- メールアドレスまたはフォームを用意し、B-2の文書に記載する。

---

## C. 推奨(運用・セキュリティ)

### C-1. 監視 `要オーナー操作(アカウント作成)`
- [UptimeRobot](https://uptimerobot.com/) で `https://yokai-shogi-api-production.kojileo0178.workers.dev/healthz` を死活監視(2回連続失敗で通知)。
- 公開を広げる段階で Sentry(クライアントエラー)も検討(doc 09)。

### C-2. workers.dev / Preview URL の扱い `Claude代行可`
- 現在 API は `*.workers.dev` で公開され、Preview URL も有効(デプロイ時に警告が出た状態)。
- API は CORS(本番は `yokai-shogi.pages.dev` のみ許可)で保護しているが、より絞るなら `server/wrangler.jsonc` に `"workers_dev": false` / `"preview_urls": false` を設定し、独自ドメイン+ルートに寄せる。
- Claude: wrangler.jsonc の設定変更は依頼可。独自ドメインのDNS設定は要オーナー操作。

### C-3. コスト確認 `要オーナー操作`
- 現構成は Cloudflare 無料枠内で動作(Pages配信・Workers REST・D1・Cron)。ダッシュボードのBilling/使用量を時々確認。
- 月額目安と内訳は doc 09。

### C-4. D1バックアップ `おおむね自動 / エクスポートはClaude代行可`
- D1 Time Travel(過去30日復元)は標準で有効。追加の保険として `wrangler d1 export` を R2 等へ退避する運用は任意(doc 09)。

---

## 「今すぐ最低限」だけやるなら

内輪の知人に触ってもらうだけなら、次の3つで足りる:

1. **A-1**(コミット・mainマージ)
2. **A-2**(本番Pagesをオンライン版でデプロイ ← Claudeに頼めば即実行)
3. **A-4**(2端末で同期を目視確認)

Turnstile(B-1)・規約の窓口(B-2)・監視(C-1)は、配布範囲を広げる前に対応すればよい。
