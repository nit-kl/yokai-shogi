# 26. セキュリティ監査スキル

ソース上の信頼境界を、[Cloudflare security-audit](https://github.com/cloudflare/security-audit-skill) で繰り返し確認する手順。設計上の対策は [07](07-security.md)、決定的な回帰は [10](10-test-strategy.md)。この文書は、そのあいだを埋める監査の回し方を定める。

スキル本体は `.agents/skills/security-audit`。導入バージョンはリポジトリ直下の `skills-lock.json` が正本。

## 何を担保するか

百鬼盤の安全は、層を分けて確認する。1つの手段で全体を覆ったことにはしない。

| 層 | 手段 | 担保するもの |
|---|---|---|
| 設計 | doc 07 | 勝敗・通貨・ガチャ・編成の正本はサーバー。クライアントは表示と入力 |
| 回帰 | `npm test` / `npm run test:workers` / `npm run test:e2e` / `test/manual/security-check.mjs` | すでに仕様化した不変条件（合法手、冪等性、トークンなしは 401、許可外 Origin は拒否） |
| 依存 | lockfile と Dependabot | 既知のパッケージ脆弱性 |
| ソース監査 | このスキル | リポジトリ内で、低い権限の入力が信頼境界を越えて具体的な結果になる経路 |
| 実行環境 | ステージングでのスモークと、リリース前のチート手動確認（doc 10） | ソースに無い配信設定。CSP、Turnstile、レート制限、WAF |

スキルはソースとローカルのダミーだけを見る。本番・ステージングの URL、実ユーザー、共有 DB、有料 API は叩かない。WebSocket のチート耐性やガチャの残高競合は、Workers 統合テストと doc 07 の手順で見る。

判定は3つだけ。

| 判定 | 意味 |
|---|---|
| `confirmed` | ソース上の経路と、境界を越えた結果が揃っている。重大度が付くのはこれだけ |
| `needs_validation` | ソース上の仮説があるが、リポジトリに無い事実（配信設定やプロバイダの挙動）が未確認。重大度は付けない |
| `rejected` | 検証で否定された候補 |

1回の実行は全体の証明にならない。同じリポジトリへの再実行は、前回の台帳と突き合わせて未カバーを埋める。

重大度の目安（`confirmed` のみ）:

| 重大度 | このプロダクトでの例 |
|---|---|
| critical | 未認証で任意アカウントの乗っ取り、D1 の全件読み書き、コード実行 |
| high | 認証回避、他ユーザーの通貨・編成の改ざん、保存型 XSS、管理 API の突破 |
| medium | 条件が狭い、または影響が限られた境界越え |
| low | 秘密ではない内部情報の露出 |
| informational | 実害は小さいが、大きい発見の前提になる観察 |

## 使い方

Cursor でこのリポジトリを開いたエージェントに頼む。スキルは次の2モードで動く。

### 相談（guidance）

質問、一点の調査、直し方の相談。成果物ファイルは作らない。

```
server/src/routes/gacha.ts の冪等性は、二重リクエストでチケットが二重に減るか見て
```

```
/v1/admin/demo-unlock はシークレットなしで通るか、ソースだけで確認して
```

### 監査（full audit）

「監査」「ペネトレーションテスト」「包括的なセキュリティレビュー」と明示したとき、またはレポートの出力を頼んだときだけ、6段階を最後まで走らせる。

1. 偵察。構成、信頼境界、入力面を `architecture.md` と `coverage-ledger.json` に書く
2. 台帳の単位ごとに、孤立した調査エージェントが候補を探す
3. 候補を、見つけた本人とは別のエージェントが否定しにいく
4. `findings.json` を書き、スキーマ検証を通す
5. 別のエージェントが、採用した記録のソース根拠をもう一度確認する
6. `REPORT.md`、`FINDINGS-DETAIL.md`、`NEEDS-VALIDATION.md` を記録から生成する

曖昧な依頼（「セキュリティを見て」だけ）のときは、エージェントがどちらのモードかを確認してからファイルを作る。

### プロファイル

| プロファイル | いつ使うか |
|---|---|
| `quick` | 差分の当たり、または再実行の最初の一目。カバレッジは部分的だとレポートに書く |
| `standard` | 通常。四半期の見直しはこれ |
| `deep` | 認証・通貨・ガチャ・管理 API をまとめて見直すとき |
| scoped | パスかサブシステムを名指ししたとき。範囲外は「問題なし」ではなく対象外 |

依頼例:

```
このリポジトリを standard でセキュリティ監査して。
出力先はリポジトリの外にする。
```

```
server/src/routes/auth.ts と server/src/lib/jwt.ts だけを scoped でセキュリティ監査して。
```

```
origin/main...HEAD の差分を quick でセキュリティ監査して。
```

監査は対象ソースを変更しない。修正案はレポートに書き、採用するかどうかは別の作業にする。

### 出力先

未指定なら `~/security-audit-skill/yokai-shogi/run-<N>`（`<N>` は未使用の連番）。レポートにはダミー以外の秘密を載せない。このディレクトリはコミットしない。

リポジトリ内に置きたいときは `.security-audit/` を明示する。このパスは `.gitignore` 済みなので、監査ランの作業ディレクトリとして使える。それ以外のリポジトリ内パスは、無視設定を確認できるまで使わない。

主な成果物:

| ファイル | 内容 |
|---|---|
| `REPORT.md` | 判定の要約と、今回カバーした範囲 |
| `FINDINGS-DETAIL.md` | `confirmed` の根拠、再現に必要なローカル手順、最小の修正 |
| `NEEDS-VALIDATION.md` | ソースだけでは閉じない論点と、オーナーが確認する事実 |
| `findings.json` | 上記の機械可読な正本 |
| `coverage-ledger.json` | どこを見て、どこが未了か |

### このリポジトリで優先する面

偵察が選ぶが、依頼時に名指しすると漏れが減る。

| 面 | 主なパス | 見ること |
|---|---|---|
| 認証と HTTP | `server/src/routes/auth.ts`、`server/src/lib/jwt.ts`、`server/src/middleware.ts` | ゲスト、パスキー、引き継ぎコード、Bearer、CORS |
| 通貨とガチャ | `server/src/routes/gacha.ts`、`solo.ts`、`ads.ts`、`dojo.ts` | 冪等性、条件付き残高更新、日次上限、広告報酬 |
| 対戦 | `server/src/do/`、`shared/battle.ts` | 着手の権威、報酬、他対局への混線 |
| 管理 | `server/src/routes/admin.ts` | シークレットなしで到達できないこと |
| クライアント | `client/src/` | 表示名などのユーザー文字列を `textContent` 以外で出していないか |
| 配信と CI | `server/wrangler.jsonc`、`.github/workflows/ci.yml` | 本番変数、シークレットの混入、デプロイ権限 |
| Steam / Tauri | `src-tauri/`、`server/src/routes/steam.ts` | WebView、ディープリンク、認証モックが本番に残っていないか |

## いつ走らせるか

- 四半期に1回、`standard` でリポジトリ全体。doc 07 の脅威モデル見直しとセットにする
- 信頼境界をまたぐ変更の前。認証、通貨、ガチャ、管理 API、広告報酬、Steam 認証、CORS。変更パスだけの `scoped`、または `deep`
- 前回 `needs_validation` が残っているとき。不足事実（ステージングのレスポンスヘッダ、Turnstile の有無、管理シークレットの保管場所）をオーナーが確認し、結果を次の依頼に書く
- 前回の `confirmed` を直したあと。同じプロファイルで再実行し、その記録が消えるか、ソース差分で再検証されるかを見る。回帰は `test/workers` か `test/manual/security-check.mjs` に残す

`main` のたびにフル監査は走らせない。CI の決定的テストが毎プッシュを担う。

## 見つけたあとの流れ

doc 07 の対応プロセスに乗せる。

1. `confirmed` だけを直す対象にする。`needs_validation` は、レポートが指定した不足事実を確認してから判定する
2. 修正は、最後に信頼する判定点の不変条件を1つ足す。周辺のハードニングを増やして終わらせない
3. 同じ条件の回帰テストを追加する
4. 影響ユーザーは `currency_logs` / `gacha_logs` / `match_actions` から特定する
5. 重大度に応じて告知・補償を判断する

## スキルの更新

```
npx skills update security-audit
```

`skills-lock.json` の `computedHash` が変わる。更新差分を見てからコミットする。
