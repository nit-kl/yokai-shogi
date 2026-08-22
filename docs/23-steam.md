# 23. Steam 配信方針

> 方針確定: 2026-08。関連: doc 01 / 08 / 11 / 12 / 24 / 25。  
> Tauri シェル（オフライン起動）まで実装済み。

## 製品パッケージ(確定)

| 項目 | 内容 |
|---|---|
| 本体 | **無料** |
| 広告 | **出さない**(Web のリワード広告コードは Steam ビルドから除外) |
| 初回リリース | **無料本体のみ**。有料 DLC は載せない |
| 主DLC | **全駒解放パック**(収集・編成の時短)。価格目安 ¥800〜¥1,500。**公開後** |
| 副DLC | 異装 / テーマ / BGM 等の見た目。**公開後** |
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
| 価格 | 無料 | 本体無料。DLC は公開後 |
| 広告 | 任意リワード可(doc 22) | なし |
| API / 対戦 | Cloudflare Workers + DO + D1 | **同一バックエンド** |
| ルール | `shared/` | 同一バージョンを同時デプロイ |

## 技術方針(推奨)

1. **クライアント再利用**: 既存 Vite + TypeScript クライアントを梱包。Unity / Godot への全面移植はしない
2. **シェル**: Tauri 2(Electron より配布サイズ小)。`PLATFORM=web|steam` でビルド分岐
3. **認証**: Steam Session Ticket を API で検証し、`auth_identities.provider='steam'` で既存ユーザーと紐付け。引き継ぎコードでの Web↔Steam マージを可能にする(doc 06)
4. **DLC entitlement**(公開後): 起動時または購入後に Steam 所有確認 → サーバーへ同期 → 対象駒を `user_yokai` に付与(冪等)
5. **オフライン**: ソロとローカルメタは API 不通時も動かす(買い切り DLC 利用者への信頼)

## 全駒解放DLCの運用ルール(仮)

> 初回リリースでは売らない。この節は **DLC 公開時**の正本。

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
| 5 | Steam Auth + アカウント連携/マージ | `POST /v1/auth/steam` + Tauri Steamworks 実チケット — **コード完了**（Steam クライアント実機スモークは運営者確認） |
| 6 | オンライン接続(同一 Matchmaker) | `tauri:dev:local` / staging で API 接続可能 — **開発経路完了**(クロスプレイ手動スモークは運営者確認) |
| 7 | 全駒解放 entitlement API | `POST /v1/steam/dlc/sync` + mock 付与 — **骨格完了**。本番所有確認は **DLC 公開時**(初回リリース対象外) |
| 8 | Steamworks 接続とストア提出 | 実チケット接続はコード完了。審査・Coming Soon の正本は [doc 25](25-steam-release.md) |
| 9 | 公開後: 全駒解放DLC → 異装 DLC | 有料パックと見た目装備 |

## 公開前チェック(抜粋)

公開までの残作業の正本は [25-steam-release.md](25-steam-release.md)。

- [x] アセット商用権利クリア（駒・BGM 主要。フォント等は任意残り）([asset-licenses.md](asset-licenses.md))
- [x] 商標調査（主要パターン0件・[trademark-research.md](trademark-research.md)）
- [x] 利用規約・プラポリの Steam / Steam ID 追記（DLC 条項は DLC 公開時）
- [ ] Steam Direct・年齢レーティング・税務情報
- [x] 広告コードが Steam ビルドに含まれないことの確認（`build:steam` で AdSense 除去・`adsAllowed()` ガード）
- [ ] Web クロスプレイの接続スモーク
- [ ] ストアから有料 DLC の言及を外す（初回は無料本体のみ）

## Tauri 開発コマンド

前提: Node 20+、Rust stable（`cargo` が PATH にあること）、Windows では WebView2（通常プリインストール）。

| コマンド | 内容 |
|---|---|
| `npm run tauri:dev` | オフライン(APIなし)。ソロ検証用 |
| `npm run tauri:dev:local` | ローカル API(`8787`)へ接続。**別ターミナルで `npm run api:dev` 必須** |
| `npm run tauri:dev:staging` | staging Workers へ接続 |
| `npm run tauri:build` | 本番 API の NSIS（ストア候補） |
| `npm run tauri:build:offline` | オフライン NSIS |
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

### Steam Auth の検証手順

**開発（mock、Steam クライアント不要）**

1. `npm run api:dev`（ローカルは `STEAM_AUTH_MOCK=1`）
2. `npm run tauri:dev:local` または `dev:steam:local`
3. Steam が起動していなければチケットは `mock:<steamId>`。`POST /v1/auth/steam` でメタが載る

**実チケット（Steam クライアント必須）**

1. Steam にログインする。未公開 App `5138130` を Partner アカウントで所有していること
2. `src-tauri/steam_appid.txt` は開発用。**出荷ビルドには同梱しない**（`bundle.resources` にも入れない）
3. `npm run tauri:dev:staging`（またはキーを入れた `api:dev` + `tauri:dev:local`）
4. 起動後の `POST /v1/auth/steam` の `ticket` が `mock:` で始まらないこと
5. `steam_api64.dll` は **exe と同じフォルダ**に置く（`bundle.resources` でファイル名だけ指定）。`steam/` 配下に入れると Windows が読めない

`cargo: program not found` になるとき: Rust は `%USERPROFILE%\.cargo\bin` に入っている。**ターミナルを開き直す**か、PowerShell で次を実行してから再試行する。

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
npm run tauri:dev:local
```

`src-tauri/tauri.conf.json` の `beforeBuildCommand` は **`build:steam`**（本番 API）。オフライン梱包は `npm run tauri:build:offline`。

## 運営者側で必要な対応(コード外)

**App ID と Publisher Web API キーの取得手順は [24-steam-partner-setup.md](24-steam-partner-setup.md) が正本。**  
**審査提出・Coming Soon・公開までの残作業は [25-steam-release.md](25-steam-release.md) が正本。**

| 優先 | 内容 | 備考 |
|---|---|---|
| 任意・今 | 上記スモークを1回試す | 詰まったらログを共有 |
| 次 | Steam Partner 登録 → App ID + Publisher キー | [doc 24](24-steam-partner-setup.md)。Workers secrets へ投入後に連絡 |
| 次 | ストア審査・オンライン本番ビルド・Coming Soon | [doc 25](25-steam-release.md) |
| 後 | 利用規約・プラポリに Steam / Steam ID 追記 | doc 11 / 25。DLC 条項は DLC 公開時 |
| 後 | 全駒解放DLC（初回対象外） | 価格は ¥980 前後を仮置き可。[doc 25](25-steam-release.md) 節 E |

コード側の次は Steam 実機スモークと、オンライン NSIS を depot へ上げ直すこと。詳細は doc 25。

## 未決定の細部

- 全駒解放パックの最終価格(¥980 前後を仮置き可)
- 新駒追加時のパック更新方式(都度更新 vs 別DLC)
- 購入特典(異装1点など)の有無
- macOS / Linux 対応の要否(初期は Windows + Deck 検証推奨)
