# 23. Steam 配信方針

> 方針確定: 2026-08。関連: doc 01 / 08 / 11 / 12 / 24。  
> Tauri シェル（オフライン起動）まで実装済み。

## 製品パッケージ(確定)

| 項目 | 内容 |
|---|---|
| 本体 | **無料** |
| 広告 | **出さない**(Web のリワード広告コードは Steam ビルドから除外) |
| 主DLC | **全駒解放パック**(収集・編成の時短)。価格目安 ¥800〜¥1,500 |
| 副DLC | 異装 / テーマ / BGM 等の見た目 |
| オンライン | **初回リリースから載せる**。Web と**同一マッチプール**でクロスプレイ |
| Web | 無料版を**並行運用**。進行は同一アカウント基盤へ連携 |
| やらない | 強駒バラ売り、有償ガチャチケット、必須課金要素 |

### 設計上の位置づけ

- 全駒所持は「強い」ではなく、編成を試せる自由度の前倒し
- 無料ルート(ログボ・対戦報酬・ガチャ)は Web / Steam 双方で維持する
- 勝敗の主因は盤上の読みと編成であり、Pay-to-Win に見える単体販売はしない

## Web との役割分担

| | Web | Steam |
|---|---|---|
| 配信 | Cloudflare Pages | デスクトップシェル(推奨: Tauri 2)+ Steamworks |
| 価格 | 無料 | 本体無料 + DLC |
| 広告 | 任意リワード可(doc 22) | なし |
| API / 対戦 | Cloudflare Workers + DO + D1 | **同一バックエンド** |
| ルール | `shared/` | 同一バージョンを同時デプロイ |

## 技術方針(推奨)

1. **クライアント再利用**: 既存 Vite + TypeScript クライアントを梱包。Unity / Godot への全面移植はしない
2. **シェル**: Tauri 2(Electron より配布サイズ小)。`PLATFORM=web|steam` でビルド分岐
3. **認証**: Steam Session Ticket を API で検証し、`auth_identities.provider='steam'` で既存ユーザーと紐付け。引き継ぎコードでの Web↔Steam マージを可能にする(doc 06)
4. **DLC entitlement**: 起動時または購入後に Steam 所有確認 → サーバーへ同期 → 対象駒を `user_yokai` に付与(冪等)
5. **オフライン**: ソロとローカルメタは API 不通時も動かす(買い切り DLC 利用者への信頼)

## 全駒解放DLCの運用ルール(仮)

1. 主対象はガチャ排出対象駒(`GACHA_POOL`)。イベント限定(`limited`)の扱いは個別判断
2. 新駒追加時はプレイ入手経路を Web / Steam 同時に用意する
3. パック購入者は対象新駒を即時所持できるよう、パック定義を更新する(または後継パックを出す)
4. ストアとゲーム内で「DLC は時短。プレイでも揃う」を明示する

## 実装順

| 順 | 作業 | 完了条件 |
|---|---|---|
| 1 | 本方針の docs 反映 | doc 01 / 06 / 08 / 11 / 12 / 23 / README — **完了** |
| 2 | アセット権利・商標クリア | 駒・BGM OK(条件付き)。J-PlatPat 主要検索0件でクリア。Steam AI 開示は提出時 |
| 3 | `PLATFORM` ビルドフラグと広告経路の完全分離 | `__PLATFORM__` + `npm run build:steam`。広告 UI/GPT/AdSense を Steam で無効化 — **完了** |
| 4 | Tauri シェル + オフライン起動 | `src-tauri/` + `npm run tauri:build`（steam-offline）— **完了** |
| 5 | Steam Auth + アカウント連携/マージ | `POST /v1/auth/steam` + クライアント Steam セッション — **骨格完了**(実チケットは Steamworks 接続後) |
| 6 | オンライン接続(同一 Matchmaker) | `tauri:dev:local` / staging で API 接続可能 — **開発経路完了**(クロスプレイ手動スモークは運営者確認) |
| 7 | 全駒解放 entitlement API | `POST /v1/steam/dlc/sync` + mock 付与 — **骨格完了**(本番所有確認は Steamworks 後) |
| 8 | Steamworks(実績・Cloud)とストア提出 | 審査提出可能 |
| 9 | 公開後: 異装 DLC 第1弾 | 見た目装備が可能 |

## 公開前チェック(抜粋)

- [x] アセット商用権利クリア（駒・BGM 主要。フォント等は任意残り）([asset-licenses.md](asset-licenses.md))
- [x] 商標調査（主要パターン0件・[trademark-research.md](trademark-research.md)）
- [ ] 利用規約・プラポリの Steam / DLC / Steam ID 追記
- [ ] Steam Direct・年齢レーティング・税務情報
- [x] 広告コードが Steam ビルドに含まれないことの確認（`build:steam` で AdSense 除去・`adsAllowed()` ガード）
- [ ] Web クロスプレイの接続スモーク
- [ ] DLC 未購入でも全コンテンツがプレイ入手可能なことの確認

## Tauri 開発コマンド

前提: Node 20+、Rust stable（`cargo` が PATH にあること）、Windows では WebView2（通常プリインストール）。

| コマンド | 内容 |
|---|---|
| `npm run tauri:dev` | オフライン(APIなし)。ソロ検証用 |
| `npm run tauri:dev:local` | ローカル API(`8787`)へ接続。**別ターミナルで `npm run api:dev` 必須** |
| `npm run tauri:dev:staging` | staging Workers へ接続 |
| `npm run tauri:build` | オフライン NSIS |
| `npm run tauri:build:staging` | staging API 梱包ビルド |
| `npm run build:steam` | Web 資産のみ（本番 API・広告なし） |
| `npm run dev:steam:local` | ブラウザだけで Steam+local API(Tauri なし) |
| `npm run dev:steam:staging` | ブラウザだけで Steam+staging |

### オンライン / クロスプレイ スモーク(開発)

1. ターミナルA: `npm run api:dev`
2. ターミナルB: `npm run tauri:dev:local`(または `npm run dev:steam:local`)
3. ターミナルC(Web側): `$env:VITE_API_URL='http://127.0.0.1:8787'; npm run dev`
4. 双方で大将選択・オンボ完了後、「オンライン対戦」→ランダムマッチ
5. Steam 同士で試す場合は `?steamMockId=` を変えて別アカウントにする(同一 mock ID は自己マッチ不可)

### DLC mock 検証

- URL に `?steamDlc=full_collection` を付けて起動 → ガチャプールが一括所持される
- 外す: `?steamDlc=none`(localStorage クリア)

### Steam Auth の検証手順(開発)

1. `npm run api:dev`(ローカルは `STEAM_AUTH_MOCK=1`)
2. `npm run tauri:dev:local` または `dev:steam:local`
3. 起動時に `POST /v1/auth/steam`（チケットは `mock:<steamId>`）でメタが載る
4. 本番では Partner の Web API キーと App ID を Workers secrets に入れ、mock を無効化する

`cargo: program not found` になるとき: Rust は `%USERPROFILE%\.cargo\bin` に入っている。**ターミナルを開き直す**か、PowerShell で次を実行してから再試行する。

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
npm run tauri:dev:local
```

`src-tauri/tauri.conf.json` の `beforeBuildCommand` は当面 `build:steam:offline`。オンライン本番梱包は `build:steam` に切り替える。

## 運営者側で必要な対応(コード外)

**App ID と Publisher Web API キーの取得手順は [24-steam-partner-setup.md](24-steam-partner-setup.md) が正本。**

| 優先 | 内容 | 備考 |
|---|---|---|
| 任意・今 | 上記スモークを1回試す | 詰まったらログを共有 |
| 次 | Steam Partner 登録 → App ID + Publisher キー | [doc 24](24-steam-partner-setup.md)。Workers secrets へ投入後に連絡 |
| 後 | 利用規約・プラポリに Steam ID / DLC 追記 | doc 11 |
| 後 | 年齢レーティング・ストア文面 | 審査提出時（税・銀行は doc 24 のオンボで実施） |
| 後 | 全駒解放の最終価格決定 | ¥980 前後を仮置き可 |

コード側が次にやるのは **Steamworks 実チケット接続**と **本番 CORS / 所有確認 API**。doc 24 のチェックリスト完了後に着手するのが効率的。

## 未決定の細部

- 全駒解放パックの最終価格(¥980 前後を仮置き可)
- 新駒追加時のパック更新方式(都度更新 vs 別DLC)
- 購入特典(異装1点など)の有無
- macOS / Linux 対応の要否(初期は Windows + Deck 検証推奨)
