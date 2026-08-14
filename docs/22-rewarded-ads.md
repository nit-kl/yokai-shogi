# 22. リワード広告 — 設計と運営作業手順

視聴任意のリワード広告でガチャチケットを付与する機能の設計と、**運営者(あなた)が手元で行う作業**の手順書。

> 法的助言ではない。公開前に必要に応じて専門家確認を行う(doc 11)。

## 方針

| 項目 | 内容 |
|---|---|
| ユーザー課金 | **なし**(チケット直売・有償ガチャはしない) |
| 収益源 | 広告ネットワークからの配信報酬 |
| 報酬 | チケット **1枚/回**、日次上限 **2回**(JST 04:00 リセット = `gameDate()`) |
| 任意性 | 見なくてもプレイ可能。対局中には出さない |
| 強さ | 買えない(既存の無課金コレクション方針を維持) |

## 実装済みのコード側

- API: `GET /v1/ads/status` / `POST /v1/ads/reward`
- DB: `ad_reward_logs` + `currency_logs(reason='ad_reward')`
- UI: ガチャ画面の「広告を見てチケット+1」(オンラインかつ機能有効時のみ)
- プロバイダ: `mock`(開発・staging) / `gpt`(Google Publisher Tag Rewarded)
- 初回視聴時に第三者送信の同意ダイアログ
- 本番の既定: **無効**(`ADS_REWARD_ENABLED=0`)

ローカル・staging は `mock` で有効済み。本番の実広告は、下の **B → C → D → E** が終わるまでオフのまま。

---

## 全体の順序(重要)

Google 側の制約により、**AdSense 承認が Ad Manager の前提**です。

```text
1. 法務・サイト準備
2. Google AdSense に申し込み → 承認待ち
3. (承認後) Google Ad Manager に申し込み
4. GAM で Rewarded 広告ユニット作成 + ads.txt
5. Cloudflare 本番でフラグ有効化
6. 動作確認・支払い設定
```

途中で GAM だけ先に申し込むと、次のエラーになります。

> Google アド マネージャーをご利用になるには AdSense アカウントが必要です。  
> まず AdSense にお申し込みいただき、承認後にこちらからアド マネージャーにお申し込みください。

**AdSense 単体では Web のリワード広告が弱い／使えないことが多い**ため、最終的な本線は **AdSense(前提) → Ad Manager + GPT Rewarded** です。  
AdSense 承認待ちの間は、本番はオフのまま / staging は `mock` で UX 検証でよい。

---

## 運営者がやること(チェックリスト)

### A. 法務・サイト準備(AdSense 審査の土台)

AdSense は「中身のある公開サイト」を見る。申し込み前に揃える。

- [x] 利用規約・プライバシーのリポジトリ正本を更新(`docs/legal/` と `client/public/legal/` と `ops/apex-site/legal/`)
- [x] `nit-games.com` 案内ポータル(`ops/apex-site/`) — ホーム / 遊び方 / 駒とシステム / 運営者 / 問い合わせ
- [ ] 本番デプロイ後、以下が最新であること
  - https://nit-games.com/ および /guide.html /about.html /contact.html /legal/*
  - https://yokai-shogi.nit-games.com/legal/terms.html
  - https://yokai-shogi.nit-games.com/legal/privacy.html
- [x] ゲーム内お知らせでリワード広告の準備を告知済み(告知期間は終了)
  - 本番フラグオン時に「開始しました」のお知らせを新たに出す
- [x] フッター等から規約・プライバシー・ガイド・問い合わせへ常時リンクできること
- [ ] サイトが `https://yokai-shogi.nit-games.com` で安定して開けること
- [x] 問い合わせ手段が明示されていること(X: `@nit_zunda_dev` / apex `/contact.html`)
- [ ] 不安があれば、外部送信の記載について短時間の弁護士相談

---

### B. Google AdSense の申し込み(必須・最初の関門)

公式: [https://www.google.com/adsense/](https://www.google.com/adsense/)

> **重要:** AdSense 初回登録のサイト URL は **サブドメイン不可**。  
> `yokai-shogi.nit-games.com` は弾かれ、`nit-games.com`(ルート)が必要。  
> 収益の本線は承認後にゲーム本体(リワード)へ載せる。ルートは審査用の案内サイトとして維持する。

#### B-0. `nit-games.com` 案内ポータル(Worker + 静的HTML)

目的: AdSense が評価できる **独自の静的コンテンツ** をルートに置き、ゲームへ誘導する。  
薄い1枚ゲートや、Googleクローラーへ全パス同一HTMLを返す実装は審査落ちの原因になるため使わない。

ソース:

- 静的ページ: `ops/apex-site/`(ホーム / 遊び方 / 駒とシステム / 運営者 / 問い合わせ / 規約 / PP)
- Worker: `ops/nit-games-apex-worker.js`
- デプロイ: `npm run apex:deploy`

ページ要件(再審査前チェック):

1. [x] ホーム・ガイド・システム解説・運営者・問い合わせ・規約・PP がそれぞれ独立URL
2. [x] 共通ナビで相互リンク
3. [x] ルートでは `adsbygoogle.js` を読まない(所有権確認済み。meta + `ads.txt` のみ)
4. [x] Googleクローラーにも実ページ本文を返す
5. [ ] Cloudflare の旧 Redirect Rule(`apex-to-yokai-shogi` 等)が残っていれば **無効化**

```bash
npm run apex:deploy
```

確認:

```powershell
# いずれも 200 で本文があること(薄い誘導文だけになっていないこと)
Invoke-WebRequest https://nit-games.com/ -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest https://nit-games.com/guide.html -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest https://nit-games.com/legal/terms.html -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest https://nit-games.com/ads.txt -UseBasicParsing | Select-Object StatusCode, Content
# www は apex へ 301
Invoke-WebRequest https://www.nit-games.com/ -MaximumRedirection 0 -ErrorAction SilentlyContinue | Select-Object StatusCode, Headers
```

#### B-1. 申し込み

1. [ ] AdSense 用に使う **Google アカウント**を決める(運営の nit 用。後から GAM も同じアカウント推奨)
2. [ ] [AdSense](https://www.google.com/adsense/) で「使ってみる / 始めましょう」から申し込み
3. [ ] サイトの URL にルートを入れる: **`https://nit-games.com`**(サブドメインは不可)
4. [ ] 国/地域: **日本**
5. [ ] 支払い情報・税務情報は案内に従い入力(後回し可能な項目もあるが、入金には必須)
6. [ ] 利用規約に同意して送信
7. [ ] 承認後、AdSense 管理画面からサイト追加で `https://yokai-shogi.nit-games.com` も登録する(任意だが推奨)

#### B-2. サイトへの接続確認(審査でよく求められる)

> **よくある失敗:** `nit-games.com` が **301 リダイレクトのみ**、または **本文の薄いゲートだけ**だと、  
> 所有権は通っても「有用性の低いコンテンツ」「パブリッシャーコンテンツのない画面」で拒否される。

接続・維持の正:

1. [x] `npm run apex:deploy` でポータルを配信
2. [x] `https://nit-games.com/` → **200** で十分な本文 + `google-adsense-account`
3. [x] `https://nit-games.com/ads.txt` →  
   `google.com, pub-3213960617040193, DIRECT, f08c47fec0942fa0`
4. [x] ゲーム側 `client/index.html` にも meta / スニペット + `client/public/ads.txt`(承認後のサブドメイン用)
5. [ ] 所有権が既に緑なら、ルートでは **adsbygoogle.js を増やさない**(薄いページでの広告扱いを避ける)

#### B-3. 審査待ち・不合格時・再申請

1. [ ] AdSense 管理画面が「準備完了 / サイトが承認されました」等になるまで待つ(数日〜数週間かかることがある)
2. [ ] 不合格の場合は理由を読み、コンテンツ・規約・ナビゲーション・ポリシー違反を直して再申請
3. [ ] **自分のサイトの広告を自分で連打クリックしない**(アカウント停止の典型原因)

「有用性の低いコンテンツ」で落ちたときの再申請前チェック:

1. [ ] ルートにガイド等の静的ページが揃い、各ページに十分な独自本文がある
2. [ ] 運営者情報・問い合わせ・規約・PP が独立URLで辿れる
3. [ ] ポータルを数日公開した状態を維持してから「問題を修正しました」→審査リクエスト
4. [ ] 承認後に `yokai-shogi.nit-games.com` をサイト追加し、収益はゲーム側リワードへ(本線)

審査を通しやすくする実務メモ:

- 規約・プライバシーが古い／404 だと不利
- SPAのゲームUIだけでは不十分。ルートに読める解説を置く
- 極端に新規・トラフィックゼロでも通ることはあるが、時間がかかることがある
- サイトの主言語・ターゲットは日本向けで一貫させる

#### B-4. AdSense だけの段階でやること / やらないこと

| やること | やらないこと |
|---|---|
| 承認を待つ / ads.txt を維持する | 本番で `ADS_REWARD_PROVIDER=gpt` をまだオンにしない |
| staging で `mock` の UX を確認する | AdSense のバナーを対局画面に雑に貼る(体験破壊・方針外) |
| 支払い先の準備を進める | 不合格中に GAM へ進もうとして同じエラーを繰り返す |

---

### C. Google Ad Manager の申し込み(AdSense 承認後)

公式: [https://admanager.google.com/](https://admanager.google.com/)

**前提:** AdSense が承認済みであること。未承認だと「AdSense アカウントが必要です」で止まる。

#### C-1. スタートガイドの回答例(妖怪将棋向け)

1. [ ] [Ad Manager](https://admanager.google.com/) に **AdSense と同じ Google アカウント**でログイン
2. [ ] 「使ってみる」→ ビジネス種別: **ウェブサイトまたは動画のパブリッシャー**
3. [ ] 詳細の目安:

| 項目 | 推奨 |
|---|---|
| 月間ページビュー | `0〜100万回` |
| 必要な機能 | 「さまざまなチャネルやデバイス(…**ゲーム**)の収益化を1カ所で管理…」にチェック |
| AdSense アカウント | **はい**(必須。いいえだと再び AdSense へ誘導される) |
| 業種 | **その他**(ゲームに合う項目がなければこれ) |
| 拠点 | **日本** / アジア |

4. [ ] 「アド マネージャーへのお申し込み」まで進み、ネットワーク初期設定を保存
5. [ ] 国/地域・通知設定・利用規約に同意

#### C-2. 費用

- 通常の Ad Manager は **小規模なら利用料無料**(月間インプレッションの無料枠内)
- 妖怪将棋の規模では有料の Ad Manager 360 は不要
- 詳細は [Ad Manager の課金説明](https://support.google.com/admanager/answer/6214526)

---

### D. Rewarded 広告ユニットとサイト接続

#### D-1. インベントリ / 広告ユニット

1. [ ] Ad Manager → **在庫** → サイトに `yokai-shogi.nit-games.com` を追加(未追加なら)
2. [ ] **広告ユニット**で **Rewarded**(リワード)形式のユニットを新規作成
3. [ ] 名前例: `yokai-shogi-rewarded`
4. [ ] 作成後の **広告ユニットパス**を控える  
   形式: `/ネットワークコード/ユニット名`  
   例: `/123456789/yokai-shogi-rewarded`
5. [ ] 需要として AdSense / Ad Exchange が使える設定になっているか、管理画面の案内に従い確認

#### D-2. ads.txt の更新(GAM 用)

1. [ ] Ad Manager の **ads.txt 管理**またはヘルプが示す行を確認
2. [ ] `client/public/ads.txt` を **AdSense 用 + GAM/AdX 用**が揃う内容に更新
3. [ ] デプロイ後 `https://yokai-shogi.nit-games.com/ads.txt` を開き、行が正しいことを確認
4. [ ] 反映まで数時間〜1日かかることがある

#### D-3. テスト配信

1. [ ] Google のテスト広告 / テスト端末の手順に従い、Rewarded が `rewardedSlotReady` → 表示 → `rewardedSlotGranted` まで通ることを確認
2. [ ] 在庫が空のときは「ただいま広告を配信できません」になりうる(新規はよくある)。時間をおいて再試行
3. [ ] 自分の本番広告を不正に大量視聴して報酬だけ取る行為はしない(ポリシー違反)

---

### E. Cloudflare 本番設定(ゲーム側の有効化)

**ここまで終わってから**本番フラグをオンにする。リポジトリの `server/` で実行。

```bash
# 本番 Worker に広告ユニットパスを設定(値は D-1 で控えたパス)
npx wrangler secret put ADS_GPT_AD_UNIT_PATH --env production
# 入力例: /123456789/yokai-shogi-rewarded
```

`server/wrangler.jsonc` の `env.production.vars` を変更してデプロイ:

```jsonc
"ADS_REWARD_ENABLED": "1",
"ADS_REWARD_PROVIDER": "gpt"
```

```bash
npx wrangler deploy --env production
```

クライアント(Pages)も最新の規約・お知らせ・UI が入った状態でデプロイ済みであること。

| 変数 | 意味 | 本番の目安 |
|---|---|---|
| `ADS_REWARD_ENABLED` | `1` で機能オン | **D 完了後**に `1` |
| `ADS_REWARD_PROVIDER` | `mock` / `gpt` | 実広告なら `gpt` |
| `ADS_GPT_AD_UNIT_PATH` | GPT ユニットパス | secret 推奨 |
| `ADS_REWARD_DAILY_CAP` | 日次上限(1〜10) | 未設定なら 2 |

staging で GPT を試す場合も同様に `--env staging`。

---

### F. 動作確認

1. [ ] 本番でガチャ画面を開き、ボタンが出ること
2. [ ] 初回に同意ダイアログが出ること
3. [ ] 実広告(またはテスト広告)視聴完了後にチケット+1
4. [ ] `currency_logs` に `reason='ad_reward'` が付くこと
5. [ ] 3回目以降は「本日の広告報酬は上限です」になること
6. [ ] オフライン(API未接続)ではボタンが出ないこと
7. [ ] 対局画面に広告が出ないこと
8. [ ] 規約・プライバシーの本番 URL がリワード記載の最新版であること

---

### G. 税務・収益管理(個人)

AdSense / Ad Manager どちら経由でも、入金は運営者の収入になる。

1. [ ] AdSense(および必要なら GAM 連携)で **支払い先(銀行口座等)** を登録
2. [ ] 税務情報・本人確認を完了
3. [ ] 最低支払額・支払いスケジュールを確認
4. [ ] 入金は雑所得等として記録(確定申告の要否は年間所得による)

---

### H. まだ実広告を出さない / 途中で止める場合

| 状態 | 推奨 |
|---|---|
| AdSense 審査中 | 本番 `ADS_REWARD_ENABLED=0`。staging は `mock` |
| AdSense 不合格 | 理由を直して再申請。GAM には進まない |
| GAM 未作成 | コードはそのまま。フラグはオフ |
| 問題発生 | 下記「ロールバック」で即オフ |

コードはマージ済みでも、本番は準備完了までオフでよい。

---

## よくある詰まりどころ

| 症状 | 対処 |
|---|---|
| GAM が「AdSense が必要」と言う | **AdSense 承認待ち/未申請**。先に B を完了する |
| AdSense 審査が長い・不合格 | 規約・プライバシー・サイト内容・ads.txt を見直し再申請 |
| 広告ユニットはあるが在庫なし | 新規あるある。時間をおく / テスト広告で SDK 経路だけ確認 |
| ボタンが本番で出ない | `ADS_REWARD_ENABLED` が `0` のまま。E を実施 |
| 視聴後チケットが増えない | API エラー・provider 不一致・日次上限。Network タブと `currency_logs` を確認 |
| ads.txt が 404 | `client/public/ads.txt` 未配置 or 未デプロイ |

---

## API 要約

### GET /v1/ads/status(認証必須)

```json
{
  "enabled": true,
  "provider": "mock",
  "dailyCap": 2,
  "claimed": 0,
  "remaining": 2,
  "ticketsPerReward": 1,
  "clientConfig": { "adUnitPath": "/network/unit" }
}
```

### POST /v1/ads/reward(認証必須)

```json
{ "provider": "mock" }
```

成功時: `{ granted, tickets, dailyCount, dailyCap, remaining }`  
無効時: `403 FEATURE_DISABLED`  
provider 不一致: `400 VALIDATION`

---

## 不正対策の考え方

- 日次上限 2 枚で旨味を抑える(ソロ勝利と同水準)
- 認証必須・サーバー権威で残高更新
- `ad_reward_logs` の PK `(user_id, date, claim_index)` で並行二重付与を防ぐ
- 将来: 広告ネットワークの SSV(サーバーサイド検証)を足せるよう `provider` を分離済み

---

## ロールバック

問題が出たら本番 vars だけ戻す(再デプロイ):

```jsonc
"ADS_REWARD_ENABLED": "0"
```

クライアントのボタンは status の `enabled:false` で消える。DB やマイグレーションの巻き戻しは不要。  
AdSense / GAM アカウント自体は残してよい(サイトから広告を出さなくなるだけ)。
