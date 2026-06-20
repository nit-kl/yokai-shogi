# 妖怪将棋 開発ドキュメント

プロトタイプ(ローカル1人用)からオンライン対戦対応の本格的なゲームとしてリリースするための設計・計画ドキュメント一式。

## 前提

- 個人〜少人数での開発・運用を想定し、低コストで始めて段階的にスケールできる構成を選ぶ
- **課金機能は実装しない**方針を継続する(チケットはログインボーナス・勝利報酬のみ)
- Webブラウザ向けを先行し、ネイティブアプリは当面スコープ外(PWA対応で代替)
- **インフラはCloudflareに統一**: Pages(配信)/ Workers(API)/ Durable Objects(対戦)/ D1(DB)/ KV・Cron・Turnstile(補助)
- **言語はTypeScriptに統一**(client / server / shared)。Phase 0の構造改修と同時に移行する
- 既存資産の最大活用: `prototype/js/game.js` のルールエンジンは依存ゼロのピュアJSであり、**クライアントとサーバーで同一コードを共有**できる。これが全設計の土台になる

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
| 14 | [Phase 1 オーナー作業チェックリスト](14-phase1-owner-tasks.md) | 運営者が手で行う必要がある作業(コミット/本番切替/Turnstile/規約 等) |
| 15 | [Phase 2 オーナー作業チェックリスト](15-phase2-owner-tasks.md) | staging/production反映・公開ブロッカー・監視・β完了条件 |
| 16 | [独自ドメイン取得・移行手順](16-custom-domain.md) | Route 53で取得する`nit-games.com`のCloudflare委譲・サブドメイン運用・切替 |
| 17 | [X広告 作成手順・運用ガイド](17-x-ads-guide.md) | 集客用X Adsの入稿設定・UTM・審査回避・運用・トラブルシュート |
| 18 | [ランダムマッチ流動性戦略](18-matchmaking-liquidity-strategy.md) | 対戦時間帯への集約・対戦会・告知・KPI・段階的な実行計画 |

## 読み方

- 全体像を掴む: 01 → 02 → 12
- サーバー実装に着手する前に: 03 → 04 → 05 → 07
- リリース準備: 09 → 10 → 11

## 現状コードベースの概要(2026-06時点・Phase 2 実装完了 / β検証待ち)

```
shared/data.ts          妖怪27種(8タイプ・4レアリティ)・初期配置・ガチャプール・型定義
shared/game.ts          ルールエンジン(合法手・ダメージ・スキル8種・成り・持ち駒)
                        ※依存ゼロ・乱数注入対応(opts.rand)・uid採番は GameState.nextUid
shared/gacha.ts         ガチャ抽選・10連確定枠・被り変換・排出率 ※クライアント/サーバー共用
shared/validate.ts      編成・表示名の検証 ※クライアント/サーバー共用(権威検証もこれを使う)
client/src/ai.ts        ソロ用AI(期待値評価+脅威差し引き)
client/src/meta/        メタ進行: MetaProvider 抽象 + ローカル版/API版2実装 + ファサード
client/src/menu.ts      ガチャ・編成・ログボ・データ引き継ぎUI
client/src/main.ts      対戦UIコントローラ(e2e用フック: window.yk)
client/public/assets/   WebP最適化済み駒画像(512px + 小160px)
server/src/             Workers API(Hono): routes(auth/me/gacha/solo)・cron・lib(jwt/crypto/time)
server/migrations/      D1スキーマ / server/wrangler.jsonc  staging・production 環境定義
test/*.test.ts          vitest(エンジン・スキル・メタ・APIクライアント配線)
test/workers/*.spec.ts  vitest-pool-workers(実Workersランタイム+ローカルD1のAPI統合テスト)
test/e2e/*.mjs          playwright e2e(オフライン4本 + オンライン2台同期 sync-online)
prototype/              移植元プロトタイプ(挙動比較リファレンスとして保存)
```

- API稼働中: staging `yokai-shogi-api-staging` (`*.workers.dev`) / production `https://api.yokai-shogi.nit-games.com`
- 本番クライアントをサーバー権威に切り替えるには `npm run pages:deploy`(オンライン版)。詳細は doc 12 の Phase 1 検証状況
