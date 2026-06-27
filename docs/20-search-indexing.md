# 妖怪将棋 検索インデックス対応手順

妖怪将棋を「妖怪将棋」などの検索語で見つけてもらうための、公開後に運営者が行う作業手順。

## 目的

- Googleに `https://yokai-shogi.nit-games.com/` を正式URLとして認識させる。
- 検索結果のタイトルと説明文に「妖怪将棋」「無料ブラウザ将棋ゲーム」が出やすい状態にする。
- X、Discord、GitHubなど外部導線からトップページへのリンクを作り、クロールされやすくする。

## 実装済みの技術対応

- `client/index.html`
  - `title`
  - `meta description`
  - `robots`
  - `canonical`
  - OGP / Twitter Card
  - `VideoGame` structured data
- `client/public/robots.txt`
  - 全URLのクロール許可
  - sitemap URLの明記
- `client/public/sitemap.xml`
  - トップページ
  - 利用規約
  - プライバシーポリシー

## 公開後に運営者が行うこと

1. 本番へデプロイする。
   - `npm run pages:deploy`
   - 公開後、以下が200で開けることを確認する。
     - `https://yokai-shogi.nit-games.com/`
     - `https://yokai-shogi.nit-games.com/robots.txt`
     - `https://yokai-shogi.nit-games.com/sitemap.xml`

2. Google Search Consoleに登録する。
   - `https://search.google.com/search-console/` を開く。
   - ドメインプロパティ `yokai-shogi.nit-games.com`、またはURLプレフィックス `https://yokai-shogi.nit-games.com/` を追加する。
   - 所有権確認を完了する。

3. sitemapを送信する。
   - Search Consoleの「サイトマップ」から `https://yokai-shogi.nit-games.com/sitemap.xml` を送信する。

4. URL検査でインデックス登録をリクエストする。
   - `https://yokai-shogi.nit-games.com/` をURL検査する。
   - 「インデックス登録をリクエスト」を実行する。

5. 外部リンクを作る。
   - Xプロフィール、固定ポスト、ゲーム紹介ポストにURLを掲載する。
   - Discord公式コミュニティの案内文にURLを掲載する。
   - GitHubリポジトリのREADMEに本番URLを掲載する。
   - `nit-games.com` 側にゲーム一覧ページがある場合、妖怪将棋へのリンクを追加する。

6. 検索状況を確認する。
   - 数日から数週間後に `site:yokai-shogi.nit-games.com` でGoogle検索する。
   - Search Consoleの「検索パフォーマンス」で、クエリ `妖怪将棋` の表示回数とクリック数を見る。

## 注意点

- 検索順位は即時には変わらない。反映には数日から数週間、場合によっては数か月かかる。
- 「妖怪将棋」で上位表示したい場合、外部から自然な文脈で `妖怪将棋` とリンクされることが重要。
- トップページ以外にも、将来的に `遊び方`、`駒一覧`、`オンライン対戦` の静的ページを作ると検索対象を増やせる。
- OGP画像は現在 `assets/pieces/kyubi.webp` を使用している。SNSでの見栄えを強めるなら、1200x630の専用画像を追加して `og:image` を差し替える。
