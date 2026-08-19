# 百鬼盤 〜妖怪を集めて、取って、HPを削る対戦ゲーム〜

駒取りで相手の魂力を削るバトルシステムを盤上に載せたWebゲーム。
**駒を取ると、取った駒の攻撃力ぶん相手の「魂力(HP)」にダメージ**が入る。

## リポジトリ構成

```
shared/      ルールエンジン+駒マスタ(TypeScript・依存ゼロ。クライアント/サーバー共用)
client/      ゲーム本体(Vite + TypeScript。UI・AI・メタ進行・演出)
server/      Cloudflare Workers API + Durable Objects + D1
src-tauri/   Steam向けデスクトップシェル(Tauri 2)
test/        vitest ユニットテスト + playwright e2e テスト
scripts/     画像最適化などの開発スクリプト
docs/        オンライン対戦版リリースに向けた設計・計画ドキュメント
```

## 遊び方(開発サーバー)

```
npm install
npm run dev          # http://localhost:5173
```

### デスクトップ(Tauri / Steam準備)

Rust(stable) が必要。初回は依存のコンパイルに時間がかかる。

```
npm run tauri:dev    # オフラインSteam相当でウィンドウ起動
npm run tauri:build  # Windowsインストーラ生成(NSIS)
```

詳細は `docs/23-steam.md`。

### ルール概要

- **盤面**: 5×6マス。自軍は下側、相手は上側。初回は大将(九尾の狐 / 酒呑童子 / ぬらりひょん)を選ぶ。
- **勝利条件**: 相手の魂力(3000)を0にする、または相手の大将駒を取る。
- **ダメージ**: 駒を取ると、取った駒のATKが相手の魂力に直撃。
- **コンボ**: 自分の手番で連続して駒を取るとダメージ倍率上昇(最大2倍)。
- **持ち駒**: 取った敵の妖怪は配下になり、空きマスに召喚(打ち)できる。
- **成り**: 敵陣(奥2段)に入ると自動で成り、ATK1.5倍+移動強化。
- **ソロ**: タイトルの「百鬼夜行」が連戦施設。連勝は週間ランキング対象。
- **能力**: 効果は駒ごとのスキルが正。ルール上特別なのは大将だけ（取られると敗北、編成に1体必須、成らない）。

### ガチャ・編成(課金なし)

- **ガチャチケット**は課金なしで入手できます。
  - **ログインボーナス**: 1日1枚。7日連続ログインごとに3枚。
  - **勝利報酬**: ソロ勝利・オンライン勝利で付与(日次上限あり)。
  - **ランダムマッチ参加報酬**: いつでもキュー可能。完走で1日1回付与。集まりやすい時間は毎日20:00〜22:00（逢魔が時）。土曜対戦会は報酬増加と限定妖怪の初回入手があります。
  - 初回起動時に10枚プレゼント。
- **妖怪ガチャ**: 1回1枚 / 10連10枚(SR以上1枠確定)。排出率 N 40% / R 40% / SR 16% / SSR 4%(うちSSR異装 0.5%)。
- **排出対象**: `shared/data.ts` の `GACHA_POOL` が正本(限定2体を除く全種)。土曜対戦会の「百鬼夜行・ぬらりひょん」、週間ランキング1位の「覇者・九尾」はガチャ対象外。
- **被り**は「妖力」に自動変換され、妖力300でチケット1枚と交換できる。
- **編成**: タイトルの「編成」から、所持妖怪で自軍2段(10マス)を自由に配置。大将1体が必須。
- 進行データの保存先は2系統:
  - **オンライン(サーバー権威)**: ゲスト自動発行 → サーバー(Cloudflare Workers + D1)で管理。パスキーまたは引き継ぎコードで別端末へ移行可能
  - **オフライン(ローカル)**: API未接続時は `localStorage` に保存して単体で動作(ソロのフォールバック)
- UIは日本語を正本とし、英語オーバーレイをタイトルの言語切替から選べる。

## コード構成

```
shared/data.ts             妖怪(駒)データ・初期配置・型定義
shared/game.ts             ルールエンジン(合法手・ダメージ計算・成り・持ち駒)※Web標準APIのみ・I/Oなし
shared/gacha.ts            ガチャ抽選・10連確定枠・被り変換・排出率(クライアント/サーバー共用)
shared/validate.ts         編成・表示名の検証(クライアント/サーバー共用)
shared/battle.ts           オンライン対戦の共有メッセージ型
shared/hyakki.ts           百鬼夜行ランキングの定数・週次計算
client/src/main.ts         UIコントローラ
client/src/menu.ts         ガチャ・編成・ログボ・データ引き継ぎのUI
client/src/locale.ts       日英UI(日本語DOMが正本、英語はオーバーレイ)
client/src/meta/           メタ進行: MetaProvider 抽象 + ローカル版/API版の2実装 + パスキー
client/src/ai.ts           敵AI(期待値評価+脅威差し引きの貪欲法)
client/src/audio.ts        WebAudio合成のSE/BGM / effects.ts 演出
client/public/assets/      最適化済み駒画像(WebP 512px + 小160px)。pieces/stock は今後のラインナップ候補置き場
server/src/index.ts        Workers API エントリ(Hono)。/v1 配下に認証・ガチャ・編成・対戦・ランキング等
server/src/routes/         auth(ゲスト/パスキー/引き継ぎ)・me・gacha・solo・matches・rankings・ads など
server/src/cron.ts         日次バッチ(経済整合チェック・休眠ゲスト削除)
server/migrations/         D1スキーマ
server/wrangler.jsonc      wrangler 設定(staging / production・D1バインディング・Cron)
```

## 開発ドキュメント

設計・運用の正本は [docs/](docs/README.md) を参照。
利用規約・プライバシーポリシーは [docs/legal/](docs/legal/)。

## 開発コマンド

```
# クライアント
npm run dev            # 開発サーバー(Vite)。API未接続=ローカルメタで動作
npm run build          # オフライン版ビルド(ローカルメタ。e2e用)→ client/dist
npm run build:online   # 本番API接続版ビルド(Pages配信用)
npm run build:staging  # staging API接続版ビルド(Pages staging配信用)
npm run preview        # ビルド成果物の確認サーバー(port 4173)
npm run images         # 入力素材から駒画像WebPを再生成(入力元は scripts/optimize-images.mjs を参照)

# サーバー(Cloudflare Workers + D1)
npm run api:dev            # Workers API をローカル起動(wrangler dev)。要 server/.dev.vars(JWT_SECRET)
npm run db:migrate:local   # ローカルD1にマイグレーション適用
npm run db:migrate:staging # staging のリモートD1に適用
npm run db:migrate:prod    # production のリモートD1に適用
npm run api:deploy:staging # staging へデプロイ
npm run api:deploy         # production へデプロイ
npm run pages:deploy       # クライアント(本番API接続版)を Cloudflare Pages へデプロイ
npm run pages:deploy:staging # クライアント(staging API接続版)を Cloudflare Pages staging へデプロイ

# テスト・検査
npm run typecheck      # tsc(client) + tsc(server) + tsc(test/workers)
npm test               # vitest(エンジン・スキル・メタ・APIクライアント配線)
npm run test:workers   # vitest-pool-workers(実Workersランタイム+ローカルD1でAPI統合テスト)
npm run test:e2e       # playwright 煙突e2e(ui-shot/ui-gacha。要: 事前に npm run build)
```

API接続先は `vite.config.ts` の define で注入する(`build:online`=本番 / `VITE_API_URL=... build`=任意 / 既定=オフライン)。
Sentryは `VITE_SENTRY_DSN` が設定されているときだけ有効(`client/src/sentry.ts`)。
ローカルでサーバーを使う初回は `cp server/.dev.vars.example server/.dev.vars`(JWT_SECRET設定)→ `npm run db:migrate:local` → `npm run api:dev`。

CI(GitHub Actions)は push / PR ごとに typecheck + vitest + test:workers + build + e2e を実行し、PRではPagesプレビュー、mainではD1マイグレーション→API→Pagesの順で本番へデプロイする(docs/13)。
