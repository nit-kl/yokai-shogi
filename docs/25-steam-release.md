# 25. Steam リリース残作業

> 運営者作業用。方針は [23-steam.md](23-steam.md)、Partner 登録とキー投入は [24-steam-partner-setup.md](24-steam-partner-setup.md)。  
> スナップショット: 2026-08-21。Steamworks ランディング（App ID **5138130**）とリポジトリ現状。  
> 公式: [ストアプレゼンス](https://partner.steamgames.com/doc/store/releasing) · [Coming Soon](https://partner.steamgames.com/doc/store/coming_soon) · [Steam Direct Fee](https://partner.steamgames.com/doc/gettingstarted/appfee)

このドキュメントが **公開までの残チェックリストの正本**。完了したら `[x]` にする。キー本体はここにもチャットにも書かない。

| 値 | 現状 |
|---|---|
| ストア名 | 百鬼盤 |
| App ID | `5138130` |
| ランディング | https://partner.steamgames.com/apps/landing/5138130 |
| 本体価格 | 無料 |
| 初回オンライン | 載せる（Web と同一マッチプール）。[doc 23](23-steam.md) |
| 初回 DLC | **載せない**（全駒解放・異装とも公開後） |

---

## 最短経路

1. **ストア審査は投入済みの想定**（レビュー準備完了まで到達。Request Review 未クリックならすぐ押す）
2. **ゲームビルド審査は、オンライン梱包に差し替えてから出す**。`beforeBuildCommand` は `build:steam`。depot へ上げ直したあと申請する。現行のオフライン depot のまま出さない
3. Coming Soon 14日と手数料支払から30日は審査と並行して進む。**審査を先に回す**

リリースボタンは次が揃うまで押せない。ストア審査とビルド審査は順不同。

| ゲート | 現状 | 所要 | 次の操作 |
|---|---|---|---|
| ストア審査 | 表記・アセット投入済み。レビュー準備完了まで到達 | 3〜5営業日 | Request Review 未クリックなら押す。仮リリース日が残っていれば消す |
| ゲームビルド審査 | オフライン depot のまま **未提出** | 3〜5営業日 | `npm run tauri:build` のオンライン NSIS を depot に上げてから申請 |
| Coming Soon 14日 | 未公開 | ストア承認後に起算 | 承認当日に Coming Soon を出す |
| 手数料から30日 | 支払日を未確認 | 支払日依存 | Partner の支払日を見て不足日数を把握 |

---

## 初回リリースの範囲（確定）

**全駒解放 DLC は初回に載せない。** 異装 DLC も載せない。初回は無料本体 + オンライン（Web クロスプレイ）。

| 載せる | 載せない（公開後） |
|---|---|
| 無料本体、広告なし、ソロ、オンライン | 全駒解放パック、異装 / テーマ / BGM DLC |
| Steam ログイン、Web との同一マッチプール | 実績、Steam Cloud、macOS / Linux |

ストア・トレーラー・コミュニティ告知から有料 DLC の言及を外す。Steamworks に DLC 子 App が既にあれば、公開前に非公開 / 未提出にする。所有確認 API と `shared/steam-dlc.ts` の本番接続は DLC 公開時まで不要。

---

## 基本情報（Steamworks 記入値）

ストアページ編集の「基本情報」タブ用。空欄は意図的。英語名はストアの言語別タイトルで付ける。

### アプリ識別

| 項目 | 記入 |
|---|---|
| アプリのタイプ | ゲーム |
| ゲーム名 | `百鬼盤` |
| 英語名（言語別） | `Hyakkiban`（スキーマ上の alternateName。説明文で旧称 Yokai Shogi に触れてよいが、タイトルには使わない） |

### 開発者・パブリッシャー

| 項目 | 記入 | 注意 |
|---|---|---|
| 開発者 | `nit` | 規約上の運営者名。Partner の Legal Name が本名なら、ストア表示用に開発者ホームページ `nit` を作って紐付ける |
| パブリッシャー | `nit` | 自社配信なので開発者と同一 |
| シリーズ | （空） | フランチャイズではない |

### 外部リンク

| 項目 | URL | 備考 |
|---|---|---|
| 公式サイト | `https://yokai-shogi.nit-games.com/` | 必須に近い。Web 版と同じ |
| お問い合わせ | `https://nit-games.com/contact.html` | サポート情報と一致させる |
| ドキュメント / マニュアル | `https://nit-games.com/guide.html` | 遊び方ガイド |
| オンラインマニュアル | （空） | 上と重複させない |
| バグ / 開発報告 | `https://discord.gg/qhm6YSSUz` | 公式Discord。個人DM誘導はしない |
| プライバシーポリシー | `https://yokai-shogi.nit-games.com/legal/privacy.html` | **必須**。Steam ID / Session Ticket / Valve 送信を追記済み（2026-08-22 公開） |
| Metacritic | （空） | ない |

### ソーシャル

| 種別 | URL |
|---|---|
| X (Twitter) | `https://x.com/nit_zunda_dev` |
| Discord | `https://discord.gg/qhm6YSSUz` |

Facebook / YouTube / TikTok 等は公式が無いので足さない。

### プラットフォーム

| 項目 | 記入 |
|---|---|
| Windows | **オン**（初回の配布対象） |
| macOS | オフ |
| Linux + SteamOS | オフ |
| Android | オフ |

Steam Deck は Windows ビルドを Proton で動かす想定。プラットフォームに Linux を足す必要はない。Deck 互換は別途レポート（[doc 25](25-steam-release.md) 節 D）。Deck メモ欄は未検証なら短く:

```text
キーボードとマウスで操作します。互換性は未確認です。オンライン対戦にはインターネット接続が必要です。ソロはオフラインでも遊べます。
```

### システム要件（Windows）

Tauri 2 + WebView2 の軽量 2D。盛りすぎない。

| 項目 | 最低 | 推奨 |
|---|---|---|
| OS | Windows 10 バージョン 1809 以降（64-bit） | Windows 11（64-bit） |
| プロセッサ | デュアルコア 2 GHz | Intel Core i5 / AMD Ryzen 5 相当 |
| メモリ | 4 GB RAM | 8 GB RAM |
| グラフィック | DirectX 11 対応（内蔵 GPU 可） | DirectX 11 対応 |
| DirectX | バージョン 11 | バージョン 11 |
| ネットワーク | ブロードバンド接続（オンライン対戦時） | 同左 |
| ストレージ | 500 MB 以上の空き容量 | 1 GB 以上の空き容量 |
| サウンドカード | （空で可） | （空で可） |
| VR | （空） | 非対応 |
| 追記 | 下記を最低側に入れる | |

ネットワークの「ブロードバンド」チェックは **オン**（オンラインあり）。オフラインソロもあるので、追記で打ち消す。

```text
Microsoft Edge WebView2 Runtime が必要です（Windows 10 / 11 には通常プリインストールされています）。
オンライン対戦およびアカウント同期にはインターネット接続が必要です。ソロ（百鬼夜行）はオフラインでもプレイできます。
キーボードとマウスで操作します。ゲームパッドには対応していません。
```

### リリース日・成人向け

| 項目 | 記入 |
|---|---|
| リリース日 | **未設定のまま**。Coming Soon 公開後に決める。仮の日付を入れると変更が目立つ |
| アダルトコンテンツ | 該当しなければテンプレートは触らない。コンテンツ調査は既に完了済み想定 |

### 対応言語

音声・字幕付きの台詞はない。UI 翻訳だけ付ける。

| 言語 | インターフェース | フル音声 | 字幕 |
|---|---|---|---|
| 日本語 | オン（正本） | オフ | オフ |
| 英語 | オン（オーバーレイ） | オフ | オフ |
| それ以外 | オフ | オフ | オフ |

中国語・韓国語は未翻訳なので付けない。審査で「未翻訳なのに対応」と見なされる。

### このタブでやらないこと

- **特典設定**に全駒解放 DLC を足さない（初回対象外）
- 早期アクセスは使わない
- コントローラ「フルサポート」にしない

---

## A. 今週（Valve 待ちを最短化）

コードが終わっていなくてもストア審査は回せる。先に表記を実体へ合わせる。

- [x] 基本情報を [記入値](#基本情報steamworks-記入値) どおり確認する（名前・URL・Windows のみ・日英 UI・DLC なし）
- [x] ストアの **AI 生成コンテンツ開示**（駒 = GPT Images、BGM = Gemini）。未開示は差し戻しになりやすい。[asset-licenses.md](asset-licenses.md)
- [x] ストア文面を実体と照合する。オンライン／クロスプレイ、コントローラ、Cloud、実績を謳っているなら **実装か表記のどちらか**を直す。**全駒解放・有料 DLC の言及は外す**
- [x] コントローラ設定を実体に合わせる。クライアントに gamepad 実装は無いので、Full Support になっていたら直す
- [ ] Steam Cloud と実績が Steamworks で有効なら、未実装のうちは **オフ**にする
- [ ] トレーラーを上げる（必須ではない。コンバージョンと審査印象に効く）
- [ ] Steam Direct 手数料の **支払日**を確認する（初回リリースは支払日から30日）
- [ ] 本体無料パッケージの価格承認状態を確認する
- [x] Coming Soon 用の説明・カプセル・サポート URL を最終確認する
- [x] **ストアプレゼンスの審査を申請**する（レビュー準備完了まで到達。Request Review 未クリックならすぐ押す）

---

## B. 公開ビルド必須（コード）

オンラインを初回から載せる方針なので、ここがゲームビルド審査の前提。キー投入手順は [doc 24](24-steam-partner-setup.md)。

- [x] Publisher Web API キーを発行し、production Workers に投入済み。本番 `GET /v1/auth/config` は `steamAuth.configured: true` / `mockAllowed: false`（キー本体はログに残さない）
- [x] production の `ALLOWED_ORIGINS` に Tauri オリジンを `server/wrangler.jsonc` へ追記した（`http://tauri.localhost`、`https://tauri.localhost`、`tauri://localhost`）
- [x] 上記 CORS を本番 Worker へデプロイした（`npm run api:deploy`、2026-08-22）
- [x] Tauri に Steamworks を接続し、実 Session Ticket を返す（`src-tauri/src/steam.rs` → `get_steam_session_ticket`）。開発ビルドかつ Steam 未起動時のみ `mock:…` に落とす。本番ビルドは mock しない。`AuthenticateUserTicket` には identity `hyakkiban` を付ける
- [x] `src-tauri/tauri.conf.json` の `beforeBuildCommand` を `build:steam`（本番 API）に切り替えた。オフライン梱包は `npm run tauri:build:offline`。**depot へ上げ直すのは運営者**
- [x] インストール名・ウィンドウタイトルをストア名「百鬼盤」に揃える（`src-tauri/tauri.conf.json` の `productName` / `title`）。パッケージ ID `com.nitgames.yokai-shogi` はそのまま
- [ ] staging の `wrangler.jsonc` に残る `STEAM_AUTH_MOCK=1` を、実チケット接続後に外す（本番はすでに mock 不可）
- [ ] Steam クライアント実機で起動 → Steam ログイン → Web 版とのランダムマッチが成立することを確認する

ブロッカーと公開時の症状:

| 箇所 | 今どうなっているか | 公開時に起きること |
|---|---|---|
| Steamworks SDK | Tauri に接続済み。実機（Steam 起動）スモーク未確認 | 実チケットが取れないと本番ログインできない |
| production CORS | 本番 Worker へデプロイ済み（Tauri オリジン許可） | — |
| 梱包コマンド | `beforeBuildCommand = build:steam`。NSIS は `npm run tauri:build`。depot 再アップロードは未実施 | 旧オフライン depot のまま出すとオンライン審査と矛盾する |
| Workers secrets | 本番は投入済み（`configured: true` / `mockAllowed: false`）。staging vars に `STEAM_AUTH_MOCK=1` が残る | staging は当面 mock 可。本番は実チケット必須 |

---

## C. 法務・商品範囲

法的助言ではない。公開前に必要に応じて専門家確認を行う。[doc 11](11-legal-compliance.md)

- [x] 利用規約に Steam 版（無料・広告なし）を追記する。初回は有償販売なしなので「販売は行いません」は矛盾しない。DLC を出すときに改定する（`docs/legal/terms-of-service.md`）
- [x] プラポリに Steam ID、Session Ticket 検証、Valve への送信、Steam 版に広告が無いことを追記する（`docs/legal/privacy-policy.md`）
- [x] ゲーム内の規約・プラポリ HTML / 同意 UI を上記と同期する（同意キー `yokaiShogi.consent.2026-08-22`。Pages / apex へ 2026-08-22 デプロイ済み）

---

## D. 審査出し直し〜公開直前

- [ ] オンライン本番ビルドを depot に上げ、**ゲームビルド審査を申請**する（3〜5営業日）
- [ ] ストア審査通過後、**Coming Soon を公開**する（ここから14日カウント）
- [ ] Steam Deck 互換レポートを出す（または実機確認）。初期は Windows + Deck 検証が方針
- [ ] ローンチ告知・コミュニティハブ・サポート連絡先（X [@nit_zunda_dev](https://x.com/nit_zunda_dev)）がストアとゲーム内で一致していることを確認する
- [ ] 両審査通過 + Coming Soon 14日 + 手数料30日が揃ったらリリース日を確定する

---

## E. 初回リリース後でよい

- [ ] **全駒解放 DLC**（初回対象外）: 子 App 作成、価格（目安 ¥980）、規約改定、`shared/steam-dlc.ts` の ID 差し替え、本番所有確認。ストアとゲーム内で「DLC は時短。プレイでも揃う」を明示する
- [ ] Steam 実績を定義してビルドから解除する
- [ ] 異装 / テーマ / BGM の見た目 DLC 第1弾（[doc 23](23-steam.md) 順 9）
- [ ] 退会のアプリ内導線（現状は問い合わせ対応で公開可）
- [ ] macOS / Linux（未決定。初期は Windows + Deck）

Steam Cloud はサーバー権威（D1）があるので、未実装なら Steamworks 側をオフのままにする。有効なのに動かないと審査で叩かれやすい。

---

## 画面上ですでに済んでいること

再実施は不要。漏れ探し用。2026-08-21 の Steamworks 画面とリポジトリ。

| 領域 | 完了している項目 |
|---|---|
| ストア | 基本情報・説明・コンテンツ調査、言語、動作環境、スクリーンショット5枚以上、カプセル、ライブラリ、サポート、開発者/発売元、レビュー設定 |
| ビルド | プラットフォーム種別、ビルドアップロード、depot、public ブランチ、インストール先と実行ファイル、ストアパッケージ、イベント準備 |
| コード骨格 | `PLATFORM` 分岐、広告除去、Tauri シェル、Steamworks 実チケット、`POST /v1/auth/steam`、DLC mock、クロスプレイ用同一 Matchmaker |
| 権利 | 駒・BGM の商用可否（条件付き）、商標の主要検索 |

Partner オンボーディング（契約・銀行・税）と `$100` 支払い・App 作成は、App ID が付いている時点で完了済みとみなす。キー発行と Workers 投入は [doc 24](24-steam-partner-setup.md) の残り。

---

## 公式・関連

- [Steamworks ランディング](https://partner.steamgames.com/apps/landing/5138130)
- [Release Process](https://partner.steamgames.com/doc/store/releasing)
- [Coming Soon](https://partner.steamgames.com/doc/store/coming_soon)
- [Steam Direct Fee](https://partner.steamgames.com/doc/gettingstarted/appfee)
- [AI generated content](https://partner.steamgames.com/doc/store/ai)
- 方針: [23-steam.md](23-steam.md)
- キー: [24-steam-partner-setup.md](24-steam-partner-setup.md)
- 法務: [11-legal-compliance.md](11-legal-compliance.md)
- 権利: [asset-licenses.md](asset-licenses.md)
