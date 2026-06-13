# 12. 開発ロードマップ

個人開発の可処分時間を前提に、**各フェーズ単体でも価値が出る**よう刻む(途中で止まっても遊べるものが残る)。
期間は目安(兼業ペース)。フルタイムなら半分程度を想定。

## フェーズ概要

```
Phase 0  基盤整備(2-4週)      : ESM化・エンジン共有準備・CI・git管理
Phase 1  サーバー権威メタ(4-6週): アカウント・ガチャ/ログボのサーバー化
Phase 2  オンライン対戦MVP(6-8週): フレンドマッチ→ランダムマッチ
Phase 3  ランクと継続性(4-6週)  : レーティング・シーズン・天井
Phase 4  運用拡張(継続)        : リプレイ・観戦・新妖怪配信
```

## Phase 0: 基盤整備

ゴール: 「WorkersとクライアントがTypeScriptの同じエンジンをimportできる」状態。**見た目・挙動は一切変えない**。

- [x] **gitリポジトリ化**(現状未管理)・GitHub・ブランチ運用(main + PR)
- [x] Vite導入、`prototype/js/` を **TypeScript ESM** に移植して `shared/`(data, game)と `client/` に分離
  - 全ファイルTS化で実施(UIの型付けは実利優先。e2e用フックは `window.yk` に集約)
- [x] エンジン改修(doc 02): `applyAction` の乱数注入化(`opts.rand`)・`_uid` → `GameState.nextUid` へ移動・Web標準APIのみ縛りの明文化
- [x] 既存テストを vitest へ移植(vm読み込み → import。アサーション内容は維持)
- [x] CI(GitHub Actions): `tsc --noEmit` + vitest + playwright(`.github/workflows/ci.yml`)
- [x] wrangler プロジェクト雛形(staging/production 環境定義。`npm run api:dev` で共有エンジンのWorkers動作確認済み)
- [x] Pagesデプロイ(https://yokai-shogi.pages.dev/ で稼働確認済み。再デプロイは `npm run pages:deploy`)
- [x] 画像最適化(WebP・サイズ別: 512px + 小160px。約10MB → 1.8MB)
- 完了条件: 全既存テストgreen ✅+ブラウザでの動作が現状と同一(ui-shotスクリーンショット比較 ✅)+ Pages上で現行ゲームが動く ✅ → **Phase 0 / M0 完了(2026-06-13)**

## Phase 1: サーバー権威メタ

ゴール: ガチャ・チケット・編成がサーバー管理になり、複数端末で同じデータが使える。対戦はまだソロのみ。

- [x] サーバー骨格(Workers + Hono + D1マイグレーション)
  - `server/src/index.ts`(Hono)・`server/migrations/0001_init.sql`・D1作成済み(本番 `yokai-shogi-db` / staging `yokai-shogi-db-staging`、ともにAPACリージョン)
- [x] ゲスト認証 → トークン管理(doc 06)
  - `/auth/guest`・`/auth/refresh`(ローテーション+再利用検知)。JWTはWebCrypto(HS256)。**Turnstileは秘密鍵未設定ならスキップ**=ローカル/CI動作、本番で `TURNSTILE_SECRET_KEY` 設定により有効化(雛形実装済み)
- [x] GET /me(ログボ付与込み)・ガチャ・交換・編成API(doc 04)
  - 加えて `/me/name`(表示名)・`/solo/win`(ソロ勝利報酬・日次上限2枚)・`/gacha/rates`(排出率公開)も実装
- [x] currency_logs / gacha_logs / 冪等性 / 条件付きUPDATE+batchパターン確立(doc 05, 07)
- [x] クライアント: meta を API版に差し替え(オフライン時はローカル版へフォールバック)
  - `client/src/meta/` に `MetaProvider` インターフェース + ローカル版/API版の2実装 + ファサード。`VITE_API_URL` 未設定/オフラインは自動でローカル版にフォールバック
- [x] アカウント連携: **引き継ぎコードで先行実装**。サーバー(`/auth/link-code` 発行・`/auth/login/link-code` 復元)+ クライアントUI(タイトルの「データ引き継ぎ」モーダル、オンライン時のみ表示)。パスキー本体はPhase 3へ後送(下記リスク回避策を採用)
- [x] Cron Triggers(経済整合チェック・休眠ゲスト削除)
  - JST04:00。不変条件(残高=ログ合計・所持数整合)違反をログ出力、休眠ゲスト(30日・連携なし)削除、期限切れトークン掃除
- [x] 利用規約/プライバシーポリシー初版(doc 11): [docs/legal/](legal/) に作成。**同意UIの組み込みはオープンβ(Phase 2)**、連絡先窓口はプレースホルダ
- 完了条件: 改ざん検証(doc 10)合格 ✅(Workers統合テストで未所持編成・チケット改ざん・二重引き等の拒否を確認) / **2台のブラウザで同一アカウント同期 ✅**(staging相手に2ブラウザコンテキストで引き継ぎコード→チケット・所持が同期することを実証: `test/e2e/sync-online.mjs`)
- リスク対応: 認証はリスク回避策どおり「ゲスト+引き継ぎコード」で先行(パスキーはPhase 3)

### Phase 1 検証状況(2026-06-13) — **マイルストーン M1 達成**

- `npm run typecheck`(client+server)/ `npm test`(node 40件)/ `npm run test:workers`(実Workersランタイム+ローカルD1 19件)/ `npm run build` / e2e 4本(オフライン経路)= すべてgreen
- **デプロイ済み**: API を staging(`yokai-shogi-api-staging`) / production(`yokai-shogi-api-production`) にデプロイ、D1(本番/staging)へリモートマイグレーション適用、`JWT_SECRET` 設定済み。`Turnstile` は秘密鍵未設定のためスキップ中(公開時に有効化)
- **2台同期を staging で実証済み**(`test/e2e/sync-online.mjs`)
- ビルド切替: `npm run build`=オフライン版(ローカルメタ・e2e用) / `npm run build:online`=本番API接続版(Pages配信用、CIのdeployジョブが使用)
- **残タスク(本番公開の最後の一歩)**: 本番Pagesをオンライン版で再デプロイ(`npm run pages:deploy`、またはPRマージでCIの `deploy` ジョブが実行)すると、本番(`yokai-shogi.pages.dev`)がサーバー権威=2台同期対応に切り替わる。**既存localStorageデータはフレッシュスタート(doc 05方針)** となるため、切替タイミングはリリース判断に委ねる

## Phase 2: オンライン対戦MVP

ゴール: 友人と1局打てる。これが**最初の公開リリース(オープンβ)**。

- [x] BattleRoom DO(着手検証・サーバー乱数・DOストレージ永続化・アラームによるタイマー)(doc 02, 03)
- [x] Matchmaker DO(キュー・ルームコード)
- [x] 終局時のD1一括書き込み(matches / match_actions / 報酬)— リプレイ用データだけ先に貯める
- [x] フレンドマッチ(ルームコード)→ 動いたらランダムマッチ(レートなし)
- [x] 切断・再接続(猶予60秒)・時間切れ処理・DO再起動からの復元
- [x] 勝利報酬のサーバー付与+日次上限(doc 08)
- [x] クライアント: オンライン対戦UI(マッチング画面・相手情報・持ち時間表示・通信状態表示)
- [x] プロトコル統合テスト(vitest-pool-workers)・少人数接続スモークテスト手順・メンテモード(doc 09)
- [x] staging/productionへD1マイグレーション・API/DO・Pagesを順番に反映し、接続スモークテストを完了(doc 15) ※本番APIデプロイ・D1マイグレーション実施(2026-06-13)
- [x] Turnstileクライアント組み込み・本番有効化(doc 15) ※クライアント実装済み。秘密鍵設定はオーナー操作
- [x] 利用規約/プライバシーポリシー公開・初回同意UI・問い合わせ導線(doc 11, 15)
- [x] Sentryクライアント組み込み・メンテナンス表示(doc 09, 15) ※DSN未設定時は無効
- 完了条件: doc 01 のGo/No-Go基準。βとして限定公開し、対局完走率・クラッシュを2週間観測
- リスク: 再接続まわりはエッジケースの沼 → β中は「切断=負け(猶予なし)」の簡易版から始める選択肢を持つ(DOストレージ復元だけは最初から入れる。デプロイで対局が壊れるとβ運用が回らないため)

### Phase 2 検証状況(2026-06-13) — **マイルストーン M2/M3 コード完了・本番反映済み**

- `npm run typecheck` / `npm test`(43件) / `npm run test:workers`(24件) / `npm run build` / e2e 4本 = すべてgreen
- **本番反映済み**: production D1マイグレーション(`0002_phase2_battles`)・API/DOデプロイ(Phase 2)・Pagesオンライン版デプロイ
- staging API/DOも最新コードへデプロイ済み。staging CORSに `yokai-shogi-staging.pages.dev` を追加
- Sentry・メンテナンス表示・旧API互換(`/auth/config` 未実装時のフォールバック)をクライアントに追加
- **残タスク(オープンβ Go/No-Go)**: Turnstile秘密鍵の本番設定・UptimeRobot・Sentry DSN・手動チート検証・2週間の完走率観測(doc 15)

## Phase 3: ランクと継続性

ゴール: 毎日遊ぶ理由と、長期目標を作る。正式リリース。

- [ ] Google OAuth連携追加・PWA対応
- 完了条件: 正式リリース告知。KPI計測開始(doc 01)

## Phase 4: 運用拡張(継続)

優先度はβ/正式リリースのユーザー反応で決める。候補:

- 新妖怪のシーズン配信(2〜3ヶ月ごと)・限定スキン(妖力の出口)・マスタのKV配信化(デプロイなし調整)
- バランス調整サイクルの確立(採用率・勝率の週次集計 → doc 08)
- ソロモードの拡張(段位制CPU・チャレンジステージ)

## マイルストーン早見表

| マイルストーン | 内容 | 公開範囲 |
|---|---|---|
| M0 | エンジン共有基盤完成 | - |
| M1 | アカウント+サーバーガチャ | 内輪テスト |
| M2 | フレンドマッチ成立 | クローズドβ(知人) |
| M3 | ランダムマッチ+報酬 | **オープンβ** |
| M4 | レート・シーズン | **正式リリース** |

## 撤退・縮小基準(先に決めておく)

- βで対局完走率が80%を下回り改善できない → ランダムマッチを一旦閉じてフレンドマッチ特化に縮小
- 月間アクティブが運用コストに見合わない状態が6ヶ月続く → 新規開発を止め、サーバー維持のみ(or ソロ静的版へ移行: doc 11)
- いずれの場合もソロモードは静的サイトとして存続させる(プロトタイプの資産は失われない)
