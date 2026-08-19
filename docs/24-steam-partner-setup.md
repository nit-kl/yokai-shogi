# 24. Steam Partner: App ID と Web API キー取得手順

> 運営者作業用。コード実装ではなく Valve 側の登録・設定。  
> 関連: [23-steam.md](23-steam.md) / [06-account-auth.md](06-account-auth.md)  
> 公式: [Onboarding](https://partner.steamgames.com/doc/gettingstarted/onboarding) · [Web API Keys](https://partner.steamgames.com/doc/webapi_overview/auth) · [AuthenticateUserTicket](https://partner.steamgames.com/doc/webapi/ISteamUserAuth)

この手順が終わると、本リポジトリに渡すべき値は次の2つだけです。

| 値 | Workers への入れ方 | 用途 |
|---|---|---|
| **App ID**（数字） | secret / var `STEAM_APP_ID` | Session Ticket 検証・DLC 所有確認 |
| **Publisher Web API Key** | secret `STEAM_WEB_API_KEY` | 同上（サーバー専用。クライアントに載せない） |

揃ったらチャットで「App ID とキーを Workers に入れた」と連絡すれば、実チケット接続の実装に進めます（キー本体をチャットに貼らないこと）。

---

## 全体の流れ（所要の目安）

```
① Steam アカウント用意
 → ② Steamworks / Steam Direct オンボーディング（本人確認・税・銀行）
 → ③ $100 アプリ手数料を支払い App を作成 → App ID 取得
 → ④ Publisher グループで Web API キー発行
 → ⑤ Cloudflare Workers に設定
 → ⑥（任意）キー疎通確認
```

| 段階 | 目安時間 | 待ちが発生しうる点 |
|---|---|---|
| ①〜② | 半日〜数営業日 | 税情報の第三者検証（公式: 2〜7営業日の場合あり） |
| ③ | 手数料支払い後すぐ〜 | App ID は App 作成時点で付与。**初回リリースまで30日待機**は公開用 |
| ④〜⑤ | 30分程度 | Admin 権限が必要 |
| ⑥ | 10分 | なし |

開発中の mock 認証（`STEAM_AUTH_MOCK=1`）は、⑤が終わるまでそのまま使えます。

---

## 事前に用意するもの

- 販売主体の決定: **個人（Sole Proprietorship）** か **法人**
- 本人確認に使える公的情報（氏名は本名。ニックネーム不可）
- **銀行口座**（口座名義が Legal Company Name / 個人名と一致すること）
- 税務情報（日本居住なら W-8BEN 系の設問になることが多い）
- Steam で支払える手段（**Steam ウォレット不可**。公式 Steam Direct 案内）
- 手数料 **USD $100 / アプリ1本**（下記「料金の考え方」参照。詳細は公式 [Steam App Fee](https://partner.steamgames.com/doc/gettingstarted/appfee)）

本作の製品メモ（登録時の参考）:

| 項目 | 値 |
|---|---|
| 仮タイトル | 妖怪将棋 |
| 種別 | Game |
| 価格 | 本体無料 + DLC |
| 広告 | **Steam 版は広告なし**（Web 無料版の広告とは別配信） |
| パッケージ ID（コード側） | `com.nitgames.yokai-shogi`（Tauri）。Steam App ID とは別物 |

> Steam は「広告ビジネスモデルのアプリ」を制限している。Steam 版は広告なし方針のため、ストア説明でも広告収益モデルに見えないよう書く。

---

## ① Steam アカウント

1. まだなら [Steam](https://store.steampowered.com/) でアカウント作成
2. メール確認・Steam Guard を有効化（推奨）
3. **開発・販売用に使うアカウントを決める**（個人プレイ用と分けると運用しやすい）

---

## ② Steamworks オンボーディング

1. [Steamworks Partner](https://partner.steamgames.com/) を開く  
2. 上記アカウントで **Sign In**  
3. Steam Direct / 配信プログラム登録へ進む（案内: [Steam Direct](https://partner.steamgames.com/steamdirect)）  
4. デジタル契約（NDA・Steam Distribution Agreement 等）に電子署名  
5. 会社識別情報を入力  
   - 個人: Company Form = `Sole Proprietorship`、Company Name = **本名**  
   - 法人: 登記上の正式名称（DBA / 屋号のみは不可）  
6. 銀行情報・税務アンケートを完了  
7. 追加書類のメールが来たら対応（検証完了まで待つ）

完了の目安: Partner ホームでアプリ作成や Users & Permissions に入れる状態。

公式詳細: [Onboarding](https://partner.steamgames.com/doc/gettingstarted/onboarding)

---

## ③ App 作成 → App ID を取る

1. Partner ホームで **新しいアプリケーションを作成**（Create new application 等）  
2. 表示名に `妖怪将棋`（または確定英語名）を入力  
3. **Steam Direct Fee ($100)** を支払い  
4. 作成直後に **App ID**（例: `480` のような数字。実際は本作用の固有値）が表示される  

### App ID の確認場所（作成後）

- アプリのランディング / App Admin の URL やヘッダ  
- 例: `https://partner.steamgames.com/apps/landing/<AppID>`  
- Tech Specs / Steamworks Settings 付近にも記載されることが多い  

### この時点でやること / まだやらなくてよいこと

| やること | まだ不要 |
|---|---|
| App ID を控える | ストアページの完成 |
| （推奨）Coming Soon 用の仮文言を考え始める | ビルドアップロード |
| DLC 用の子 App を後で追加予定と把握 | 年齢レーティング最終提出 |

**30日待機**と **Coming Soon 2週間**は「初回リリース」の制約。App ID と API キー取得・開発検証は手数料支払い・App 作成後すぐ進められる。

### DLC（全駒解放）について

- 全駒解放は **本体 App に紐づく DLC App** として後から追加する（別途 DLC 用 App ID が付く）  
- **今回そろえる本体の App ID / Publisher キー**があれば、まず Session Ticket 認証まで実装できる  
- DLC 用 App ID が取れたら `shared/steam-dlc.ts` と所有確認 API に追記する  

---

## ④ Publisher Web API キーを発行する

> 必要なのは **Publisher Key**（Partner 用）。  
> steamcommunity.com の一般ユーザー向け Web API キーだけでは、本番のチケット検証・所有確認に足りない。

公式: [Authentication using Web API Keys](https://partner.steamgames.com/doc/webapi_overview/auth)

1. Partner に **Administrator** でログイン  
2. **Users & Permissions** → **Manage Groups**  
3. 既存グループを選ぶか、**Web API 専用グループを新規作成**（推奨）  
4. グループに **妖怪将棋の App ID を関連付け**（Applications を確認）  
5. **Create WebAPI Key**  
6. 権限（Permissions）で少なくとも次を有効化:  
   - **General** … ユーザー認証・DLC 所有確認など（本作用）  
   - Microtransactions / Sales / Economy は今は不要ならオフでよい  
7. **Save Changes**  
8. ページ右サイド等に表示される **キー文字列を安全な場所に保存**（再表示できない場合あり）

### セキュリティ

- キーは **サーバー（Cloudflare Workers secrets）だけ**に置く  
- Git・クライアント・Discord・チャットに貼らない  
- 漏えいしたら Partner で破棄・再発行  
- IP ホワイトリストは、Workers の出口 IP が固定でないため **最初は空けたまま**でよい（後で必要なら検討）

---

## ⑤ このリポジトリ / Cloudflare への設定

取得した値:

```text
STEAM_APP_ID=<数字の App ID>
STEAM_WEB_API_KEY=<Publisher Web API Key>
```

### staging

```powershell
cd c:\Users\kojil\Documents\Dev\yokai-shogi
npx wrangler secret put STEAM_WEB_API_KEY --config server/wrangler.jsonc --env staging
npx wrangler secret put STEAM_APP_ID --config server/wrangler.jsonc --env staging
```

### production

```powershell
npx wrangler secret put STEAM_WEB_API_KEY --config server/wrangler.jsonc --env production
npx wrangler secret put STEAM_APP_ID --config server/wrangler.jsonc --env production
```

### ローカル（`npm run api:dev`）

`server/.dev.vars` に追記（**コミットしない**。`.gitignore` 済み想定）:

```ini
STEAM_WEB_API_KEY=ここにキー
STEAM_APP_ID=ここにAppID
STEAM_AUTH_MOCK=1
```

実チケット検証をローカルで試すときだけ `STEAM_AUTH_MOCK=0`（または行削除）。キー未設定時は従来どおり mock 可。

### staging / production の mock 無効化

キーを入れた環境では `STEAM_AUTH_MOCK` を **付けない / `"0"`** にする。  
現状 `server/wrangler.jsonc` の staging vars に `STEAM_AUTH_MOCK: "1"` がある場合は、本番キー投入時に削除して再デプロイする。

```powershell
npm run api:deploy:staging
# 問題なければ
npm run api:deploy
```

設定後の `/v1/auth/config` 期待値:

```json
{
  "steamAuth": {
    "mockAllowed": false,
    "configured": true
  }
}
```

（staging でまだ mock を残している場合は `mockAllowed: true` のまま）

---

## ⑥ 疎通確認（キーが入ったか）

Workers 上から公式 API を叩く前に、手元で確認してもよい（キーをシェル履歴に残さないよう注意）。

```powershell
# 値は都度入力。履歴に残したくなければワンライナーを避ける
$appId = "YOUR_APP_ID"
$key = "YOUR_PUBLISHER_KEY"
# 不正チケットでも「キー無効」ではなく「チケット無効」系が返ればキー自体は通っていることが多い
Invoke-RestMethod "https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/?key=$key&appid=$appId&ticket=00"
```

- キー誤り: 認可エラー  
- キー正しいが ticket 不正: チケット検証失敗（想定どおり）  
- 本リポジトリの検証実装は `server/src/lib/steam.ts`（Publisher 向けに `partner.steam-api.com` を使用）

実クライアントの Session Ticket は、Steamworks SDK / Tauri プラグイン接続後にエンドツーエンドで確認する。

---

## チェックリスト（コピー用）

- [ ] Steam アカウント作成・Steam Guard
- [ ] Steamworks オンボーディング完了（契約・銀行・税）
- [ ] $100 支払い・App 作成
- [ ] **App ID** を控えた
- [ ] Users & Permissions で Publisher グループ作成 / App 関連付け
- [ ] **General** 権限付き Publisher Web API Key を発行・保管
- [ ] `wrangler secret put` で staging（必要なら production）へ投入
- [ ] staging で `STEAM_AUTH_MOCK` を方針どおり無効化 / デプロイ
- [ ] `/v1/auth/config` で `steamAuth.configured: true` を確認
- [ ] （任意）DLC 用 App を作成し DLC App ID を控える
- [ ] チャットで「設定完了」を共有（**キーは貼らない**。App ID 数字だけなら可）

---

## 料金の考え方（FAQ）

| 質問 | 答え |
|---|---|
| 初回だけの支払い？ | **いいえ。** Partner 登録の年会費ではなく、**新しいアプリを出すたびに $100**（App Credit） |
| アプリごとにかかる？ | **はい。** 公式: *fee for each new app you wish to distribute* |
| 妖怪将棋だけ出す場合 | 本体1本分の **$100 のみ**（現時点の想定） |
| 全駒解放DLCも $100？ | DLC は本体の「Add New DLC」で子 App ID が付く。**通常は追加の Steam Direct Fee なし**（本体手数料で足りる運用が一般的）。最終は Partner 画面の表示に従う |
| 返金される？ | **不可。** ただしその製品の Adjusted Gross Revenue が **$1,000 以上**になったあとの支払いから **$100 分を回収（recoup）**できる |
| Steam ウォレットで払える？ | **不可**（公式案内） |
| 国によっては税が上乗せ？ | VAT/GST 等がかかる場合あり（公式 App Fee ドキュメント） |

---

## よくある詰まり

| 症状 | 確認 |
|---|---|
| Web API Key メニューが出ない | Admin か。オンボーディング未完了でないか |
| 一般ユーザーキーしか作れない | Partner の **Publisher** キー手順を見ているか（Users & Permissions → Manage Groups） |
| App ID がグループに無い | キー作成前にグループへ App を追加 |
| 税・銀行で止まる | 名義一致。追加書類メールを確認 |
| Workers で mock のまま | secret 未設定、または `STEAM_AUTH_MOCK=1` が残っている |
| キーをチャットに貼ってしまった | Partner で破棄・再発行し、Workers secret を更新 |

---

## 公式リンク集

- [Steamworks ホーム](https://partner.steamgames.com/)
- [Steam Direct](https://partner.steamgames.com/steamdirect)
- [Getting Started](https://partner.steamgames.com/doc/gettingstarted)
- [Onboarding](https://partner.steamgames.com/doc/gettingstarted/onboarding)
- [Web API Key 認証](https://partner.steamgames.com/doc/webapi_overview/auth)
- [ISteamUserAuth / AuthenticateUserTicket](https://partner.steamgames.com/doc/webapi/ISteamUserAuth)
- [User Authentication and Ownership](https://partner.steamgames.com/doc/features/auth)
- [Steam Direct Fee](https://partner.steamgames.com/doc/gettingstarted/appfee)
