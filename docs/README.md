# 妖怪将棋 開発ドキュメント

オンライン対戦対応のWebゲームとして運用するための設計・計画ドキュメント一式。

## 前提

- 個人〜少人数での開発・運用を想定し、低コストで始めて段階的にスケールできる構成を選ぶ
- **有償ガチャ・有償チケット・強駒のバラ売りはしない**。コレクションはプレイ報酬でも完走できる設計を維持する
- **Web**: 無料配信。運営収入として**任意のリワード広告**を許可する(チケットはログインボーナス、勝利報酬、参加報酬、広告視聴、運営配布)。doc 22
- **Steam**(計画): 本体無料・**広告なし**。収益は **全駒解放DLC**(収集時短)と **異装等の見た目DLC**。オンラインは Web と同一マッチプールでクロスプレイ。doc 23
- 現行の主配信は Web。Steam は Web と並行運用する追加チャネル(実装は Phase Steam)
- **インフラはCloudflareに統一**: Pages(配信)/ Workers(API)/ Durable Objects(対戦)/ D1(DB)/ Cron・Turnstile・Analytics Engine(補助)
- **言語はTypeScriptに統一**(client / server / shared)
- ルールエンジンは `shared/game.ts`、駒マスタは `shared/data.ts` を正本とし、クライアントとサーバーで同一コードを共有する

## ドキュメント一覧

| # | ドキュメント | 内容 |
|---|---|---|
| 01 | [プロダクト要件定義](01-vision-requirements.md) | ビジョン・ターゲット・機能スコープ・KPI・非機能要件 |
| 02 | [システムアーキテクチャ](02-architecture.md) | 全体構成・技術選定・エンジン共有戦略・スケール方針 |
| 03 | [オンライン対戦設計](03-online-battle.md) | 対戦フロー・状態同期・マッチメイキング・切断/再接続 |
| 04 | [API・プロトコル仕様](04-api-spec.md) | REST API と WebSocket メッセージの定義 |
| 05 | [データモデル設計](05-data-model.md) | DBスキーマ・既存localStorageデータの扱い |
| 06 | [アカウント・認証設計](06-account-auth.md) | ゲスト認証・アカウント連携・セッション管理 |
| 07 | [セキュリティ・チート対策](07-security.md) | サーバー権威化・不正対策・脆弱性対策 |
| 08 | [ゲーム内経済・ガチャ設計](08-game-economy.md) | 通貨設計・排出率・不正獲得対策・シーズン運用 |
| 09 | [運用・インフラ設計](09-operations.md) | 環境構成・CI/CD・監視・バックアップ・コスト試算 |
| 10 | [テスト戦略](10-test-strategy.md) | テストピラミッド・既存テスト資産・接続スモークテスト |
| 11 | [法務・コンプライアンス](11-legal-compliance.md) | 利用規約・プライバシー・ガチャ表記・未成年配慮 |
| 12 | [開発ロードマップ](12-roadmap.md) | フェーズ分割・マイルストーン・リリース判定基準 |
| 13 | [GitHub連携デプロイ手順書](13-pages-github-deploy.md) | Pages自動デプロイの設定手順・料金・ロールバック |
| 16 | [独自ドメイン取得・移行手順](16-custom-domain.md) | Route 53で取得する`nit-games.com`のCloudflare委譲・サブドメイン運用・切替 |
| 17 | [X広告 作成手順・運用ガイド](17-x-ads-guide.md) | 集客用X Adsの入稿設定・UTM・審査回避・運用・トラブルシュート |
| 18 | [ランダムマッチ流動性戦略](18-matchmaking-liquidity-strategy.md) | 対戦時間帯への集約・対戦会・告知・KPI・段階的な実行計画 |
| 19 | [Discordサーバー作成・運用手順](19-discord-server-setup.md) | サーバー新規作成から権限・チャンネル・安全設定・公開・定例運用までの実作業手順 |
| 20 | [検索インデックス対応手順](20-search-indexing.md) | Google Search Console登録・sitemap送信・外部リンク整備など検索流入向けの運営作業 |
| 21 | [百鬼夜行 週間連勝ランキング](21-hyakki-weekly-ranking.md) | ソロ連戦ランキングの仕様・DB・API・UI方針 |
| 22 | [リワード広告](22-rewarded-ads.md) | 任意視聴リワード・日次上限・API・運営者の開設/有効化手順 |
| 23 | [Steam配信方針](23-steam.md) | 無料本体・DLC・Web並行・技術方針・実装順 |
| - | [Analytics Engine 確認クエリ](analytics-queries.md) | 登録・オンボーディング・対戦・ランキングの確認用SQL |

## 読み方

- 全体像を掴む: 01 → 02 → 12
- API/DB/対戦仕様を確認する: 03 → 04 → 05 → 07
- 運用・リリース手順を確認する: 09 → 10 → 11 → 13

## 現状コードベースの概要(2026-07時点)

```
shared/data.ts          妖怪36種(8タイプ・4レアリティ)・初期配置・ガチャプール・型定義
shared/game.ts          ルールエンジン(合法手・ダメージ・スキル8種・成り・持ち駒)
                        ※依存ゼロ・乱数注入対応(opts.rand)・uid採番は GameState.nextUid
shared/gacha.ts         ガチャ抽選・10連確定枠・被り変換・排出率 ※クライアント/サーバー共用
shared/validate.ts      編成・表示名の検証 ※クライアント/サーバー共用(権威検証もこれを使う)
client/src/ai.ts        ソロ用AI(期待値評価+脅威差し引き)
client/src/meta/        メタ進行: MetaProvider 抽象 + ローカル版/API版2実装 + ファサード
client/src/menu.ts      ガチャ・編成・ログボ・データ引き継ぎUI
client/src/main.ts      対戦UIコントローラ(e2e用フック: window.yk)
client/public/assets/   WebP最適化済み駒画像(512px + 小160px)。pieces/stock は今後のラインナップ候補置き場
server/src/             Workers API(Hono): routes(auth/me/gacha/solo)・cron・lib(jwt/crypto/time)
server/migrations/      D1スキーマ / server/wrangler.jsonc  staging・production 環境定義
test/*.test.ts          vitest(エンジン・スキル・メタ・APIクライアント配線)
test/workers/*.spec.ts  vitest-pool-workers(実Workersランタイム+ローカルD1のAPI統合テスト)
test/e2e/*.mjs          playwright e2e(オフライン経路 + オンライン同期/スモーク)
```

- API稼働中: staging `yokai-shogi-api-staging` (`*.workers.dev`) / production `https://api.yokai-shogi.nit-games.com`
- main push のCIは本番D1マイグレーション、Worker API、Pagesを順に更新する。手動デプロイは doc 13 を参照
