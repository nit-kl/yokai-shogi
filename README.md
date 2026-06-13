# 妖怪将棋 〜百鬼夜行の盤上決戦〜

逆転オセロニア風のバトルシステムを将棋に融合させたWebゲーム。
**駒を取ると、取った駒の攻撃力ぶん相手の「魂力(HP)」にダメージ**が入る。

## リポジトリ構成(Phase 0 完了後)

```
shared/      ルールエンジン+駒マスタ(TypeScript・依存ゼロ。クライアント/サーバー共用)
client/      ゲーム本体(Vite + TypeScript。UI・AI・メタ進行・演出)
server/      Cloudflare Workers API の雛形(実装は Phase 1 から)
test/        vitest ユニットテスト + playwright e2e テスト
scripts/     画像最適化などの開発スクリプト
prototype/   旧ローカル1人用プロトタイプ(移植元。挙動比較のため保存)
docs/        オンライン対戦版リリースに向けた設計・計画ドキュメント
```

## 遊び方(開発サーバー)

```
npm install
npm run dev          # http://localhost:5173
```

旧プロトタイプは従来どおり `prototype/index.html` をブラウザで開くだけでも遊べます。

### ルール概要

- **盤面**: 5×6マス。あなた(九尾の狐軍)は下側、敵AI(酒呑童子軍)は上側。
- **勝利条件**: 相手の魂力(3000)を0にする、または相手の大将駒を取る。
- **ダメージ**: 駒を取ると、取った駒のATKが相手の魂力に直撃。
- **コンボ**: 自分の手番で連続して駒を取るとダメージ倍率上昇(最大2倍)。
- **持ち駒**: 取った敵の妖怪は配下になり、空きマスに召喚(打ち)できる。
- **成り**: 敵陣(奥2段)に入ると自動で成り、ATK1.5倍+移動強化。

### 妖怪タイプ

| タイプ | 効果 |
|---|---|
| 攻 | 駒を取った時に会心・追加ダメージ系スキルが発動 |
| 守 | 盤上にいる間、自軍の受けるダメージを軽減(オーラ) |
| 罠 | **取られた時**、取った相手に反撃ダメージ |
| 妨 | 盤上にいる間、敵軍を弱体化(コンボ無効・会心封じ・与ダメ減) |
| 援 | 駒を取った時、自軍の魂力を回復 |
| 化 | **取られた時**に化かす。ダメージ半減&相手の持ち駒にならない |
| 爆 | **取られた時**、取った駒を道連れに消滅。大将で取ると即敗北 |
| 大将 | 王将。取られたら即敗北 |

### ガチャ・編成(課金なし)

- **ガチャチケット**の入手手段は2つだけ(課金なし)。
  - **ログインボーナス**: 1日1枚。7日連続ログインごとに3枚。
  - **勝利報酬**: 1勝につき1枚。初回起動時に10枚プレゼント。
- **妖怪ガチャ**: 1回1枚 / 10連10枚(SR以上1枠確定)。排出率 N 40% / R 40% / SR 16% / SSR 4%。
- **ガチャ限定妖怪**: 青鬼・火車・鎌鼬・飛頭蛮・水虎・大入道・大天狗・雷獣に加え、新タイプの雪女・土蜘蛛・砂かけ婆(妨)、座敷童子(援)、化け狸(化)、鬼火(爆)。SSRは茨木童子と、大将として使える **玉藻前**・**ぬらりひょん**。
- **被り**は「妖力」に自動変換され、妖力300でチケット1枚と交換できる。
- **編成**: タイトルの「編成」から、所持妖怪で自軍2段(10マス)を自由に配置。大将1体が必須。
- 進行データは `localStorage` に保存(サーバー不要)。

## コード構成

```
shared/data.ts             妖怪(駒)データ・初期配置・型定義
shared/game.ts             ルールエンジン(合法手・ダメージ計算・成り・持ち駒)
                           ※ Web標準APIのみ・I/Oなし(Workers/ブラウザ/vitestで同一動作)
client/index.html          エントリポイント
client/css/style.css       スタイル・アニメーション定義
client/src/main.ts         UIコントローラ
client/src/menu.ts         ガチャ・編成・ログインボーナスのUI
client/src/meta.ts         メタ進行(セーブ・ガチャ抽選・ログインボーナス・編成)
client/src/ai.ts           敵AI(期待値評価+脅威差し引きの貪欲法)
client/src/audio.ts        WebAudio合成のSE/BGM(音源ファイル不要)
client/src/effects.ts      パーティクル・カットイン・ダメージ数字等の演出
client/public/assets/      最適化済み駒画像(WebP 512px + 小160px)
server/src/index.ts        Workers API 雛形(Phase 1 で Hono + D1 実装)
server/wrangler.jsonc      wrangler 設定(staging / production 環境定義)
```

## 開発ドキュメント

オンライン対戦対応の本格リリースに向けた設計・計画は [docs/](docs/README.md) を参照。
(アーキテクチャ / オンライン対戦設計 / API仕様 / DB設計 / 認証 / セキュリティ / 経済設計 / 運用 / テスト戦略 / 法務 / ロードマップ)

## 開発コマンド

```
npm run dev            # 開発サーバー(Vite)
npm run build          # 本番ビルド → client/dist
npm run preview        # ビルド成果物の確認サーバー(port 4173)
npm run typecheck      # tsc --noEmit
npm test               # vitest(エンジン・スキル・メタのユニットテスト)
npm run test:e2e       # playwright e2e(要: 事前に npm run build)
npm run images         # prototype の駒画像から WebP を再生成
npm run api:dev        # Workers API をローカル起動(wrangler dev)
npm run pages:deploy   # Cloudflare Pages へデプロイ(要: wrangler login)
```

CI(GitHub Actions)は push / PR ごとに typecheck + vitest + build + e2e を実行する。

旧プロトタイプの画像生成スクリプト(`prototype/test/process-images.js` など)はそのまま残してある。
