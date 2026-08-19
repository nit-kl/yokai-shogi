# 06. アカウント・認証設計

## 設計方針

1. **登録なしで遊べる**(ゲスト即時発行)。カジュアルゲームで登録フォームは最大の離脱要因
2. ゲストは**引き継ぎコード**を発行すると別端末で復元できる
3. パスワードは持たない(漏洩リスクと運用コストを避ける)。パスキー(WebAuthn)で端末間復元できる。OAuthは将来候補

## アカウント状態遷移

```
[初回アクセス]
   │ POST /auth/guest(自動)
   ▼
[ゲスト] ── デバイスのlocalStorageにrefreshトークン保持
   │  ※端末・ブラウザデータ消去でロスト(画面上で明示警告)
   │ POST /auth/link-code または パスキー登録
   ▼
[復元可能] ── 引き継ぎコードまたはパスキーで任意の端末から復元可能
```

## トークン設計

| トークン | 形式 | 有効期限 | 保存場所 |
|---|---|---|---|
| アクセストークン | JWT(HS256→将来RS256) | 15分 | メモリのみ(JSのみで保持) |
| リフレッシュトークン | ランダム不透明文字列(DBにハッシュ保存) | 90日・ローテーション式 | localStorage |
| 再接続トークン(対局用) | 対局ID紐付きの短命トークン | 対局終了まで | メモリ |

- リフレッシュは**ローテーション+再利用検知**(使用済みトークンの再提示があれば全セッション失効=盗難対応)
- JWTクレーム: `sub`(userId), `exp`, `iat`, `guest`(bool)。署名はWorkersの**WebCrypto**(`crypto.subtle`)で実装し、鍵はwranglerシークレットで管理
- WS接続時はアクセストークンをクエリではなく**初回メッセージで送る**方式も検討(アクセスログへのトークン残留回避)。初期はクエリ+短命(15分)で許容し、ログのクエリ文字列マスクで対応

## 認証フロー詳細

### ゲスト発行
```
POST /auth/guest
→ users行作成(is_guest=true)、user_profiles初期化(チケット10・空編成・オンボーディング未完了)
→ { userId, accessToken, refreshToken }
```
- 乱用対策: 本番では Turnstile をゲスト発行時に検証する。`TURNSTILE_SECRET_KEY` 未設定のローカル/CIではスキップする。加えてIP単位レート制限(5/min)を行う。

### 引き継ぎコード(現行実装)
```
POST /auth/link-code        → ランダムなコードを発行し、SHA-256を auth_identities(provider='link_code') に保存
POST /auth/login/link-code  → コードを検証して新しいトークンを発行
```
コード発行済み、またはパスキー登録済みのユーザーは休眠ゲスト削除の対象外にする。

### パスキー(実装済み)

WebAuthn(discoverable credential)。`auth_identities.provider='passkey'` に credential ID・公開鍵・counter・transports を保存する。チャレンジは `webauthn_challenges` に短命保存し、Cronで期限切れを削除する。

| メソッド | パス | 内容 |
|---|---|---|
| POST | /auth/passkey/register/options | 登録オプション。要ログイン |
| POST | /auth/passkey/register | 登録完了 |
| POST | /auth/passkey/login/options | 認証オプション。未ログイン可 |
| POST | /auth/passkey/login | 認証完了 → トークン発行 |

OAuth(Google等)は未実装。追加する場合は同じ `auth_identities` に `provider='google'` を足し、既存のゲスト/パスキー/引き継ぎコードと併存させる。

### Steam(doc 23)

`POST /v1/auth/steam` で `provider='steam'` を紐付ける。

1. クライアントが Steam Session Ticket を取得し API へ送る(開発時は `mock:<steamId64>`)
2. サーバーが Steam Web API `AuthenticateUserTicket` で検証し、Steam ID に紐づくユーザーを発行または復元する
3. 環境変数: `STEAM_WEB_API_KEY` / `STEAM_APP_ID`。未設定または `STEAM_AUTH_MOCK=1` のときのみ mock チケットを許可
4. 既存の引き継ぎコードで Web 進行とマージできる(二重進行の防止)
5. DLC 所有は Steam entitlement 同期でサーバー権威の所持に反映する(計画・doc 08)

### auth_identities テーブル
```sql
CREATE TABLE auth_identities (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id),
  provider   TEXT NOT NULL,           -- 'link_code' / 'passkey' / 'google' / 'steam'
  subject    TEXT NOT NULL,           -- 引き継ぎコードSHA-256 / credential ID / OAuth sub / SteamID64
  public_key BLOB,
  counter    INTEGER,
  transports TEXT,                    -- パスキー: JSON配列
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, subject)
);

CREATE TABLE refresh_tokens (
  token_hash TEXT PRIMARY KEY,        -- SHA-256
  user_id    TEXT NOT NULL REFERENCES users(id),
  family_id  TEXT NOT NULL,           -- ローテーション系列(再利用検知用)
  expires_at TEXT NOT NULL,
  used_at    TEXT                     -- 使用済みマーク
);
```

## 多重ログイン・セッション方針

- 同時セッションは許容(複数端末)。ただし**対戦WSは1接続のみ**(新接続が旧接続を蹴る)
- 自分自身とのマッチング禁止はuserId比較で担保

## 表示名

- 初期値「プレイヤー」+ 変更可(1〜10文字)。NGワードリスト+記号制限のサーバー検証
- 一意性は要求しない(IDで識別)。なりすまし報告は運用対応

## アカウント削除・引き継ぎ

- 退会: アプリ内の専用導線は未実装。削除請求は問い合わせ窓口で受け、停止後90日で物理削除する(doc 11)
- 機種変更: パスキーまたは引き継ぎコードで新端末へ復元する。ゲストのまま消えるリスクはデータ引き継ぎ導線で案内する

## 想定脅威と対策(認証まわり)

| 脅威 | 対策 |
|---|---|
| リフレッシュトークン窃取 | ローテーション+再利用検知で系列ごと失効 |
| ゲスト大量生成によるリソース枯渇 | IPレート制限・休眠ゲスト(30日未アクセス・連携なし)の自動削除 |
| トークン総当たり | 128bit乱数・失敗レート制限 |
| 引き継ぎコード総当たり | 十分な桁数のランダムコード、ハッシュ保存、IPレート制限 |
