# 06. アカウント・認証設計

## 設計方針

1. **登録なしで遊べる**(ゲスト即時発行)。カジュアルゲームで登録フォームは最大の離脱要因
2. ゲストはいつでも**正式アカウントに昇格**できる(データそのまま)
3. パスワードは持たない(漏洩リスクと運用コストを避ける)。**パスキー(WebAuthn)を第一候補**、補助としてOAuth(Google)

## アカウント状態遷移

```
[初回アクセス]
   │ POST /auth/guest(自動)
   ▼
[ゲスト] ── デバイスのlocalStorageにrefreshトークン保持
   │  ※端末・ブラウザデータ消去でロスト(画面上で明示警告)
   │ POST /auth/link(パスキー登録 or Google連携)
   ▼
[連携済み] ── 任意の端末から POST /auth/login で復元可能
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
→ users行作成(is_guest=true)、user_profiles初期化(チケット10・既定編成・基本8種+九尾付与)
→ { userId, accessToken, refreshToken }
```
- 乱用対策: **Turnstile必須**(ゲスト発行時にトークン検証。Cloudflare採用の利点が最も出る箇所)+ IP単位レート制限(5/min)+ 1日上限。大量ゲスト生成によるログボ・初回チケット稼ぎは doc 08 の獲得上限と合わせて実害を抑える

### パスキー連携(推奨経路)
```
POST /auth/link/passkey/options   → チャレンジ発行(WebAuthn registration options)
POST /auth/link/passkey/verify    → 公開鍵を auth_identities に保存、is_guest=false
ログイン: POST /auth/login/passkey/options → assertion検証 → トークン発行
```

### Google OAuth(補助経路)
- Authorization Code + PKCE。`auth_identities(provider='google', subject=sub)` に紐付け
- 取得スコープは `openid` のみ(メールも保持しない。個人情報を最小化 → doc 11)

### auth_identities テーブル
```sql
CREATE TABLE auth_identities (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id),
  provider   TEXT NOT NULL,           -- 'passkey' / 'google'
  subject    TEXT NOT NULL,           -- credential ID / OAuth sub
  public_key BYTEA,                   -- パスキー用
  counter    BIGINT,                  -- パスキー署名カウンタ(クローン検知)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, subject)
);

CREATE TABLE refresh_tokens (
  token_hash TEXT PRIMARY KEY,        -- SHA-256
  user_id    UUID NOT NULL REFERENCES users(id),
  family_id  UUID NOT NULL,           -- ローテーション系列(再利用検知用)
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ              -- 使用済みマーク
);
```

## 多重ログイン・セッション方針

- 同時セッションは許容(複数端末)。ただし**対戦WSは1接続のみ**(新接続が旧接続を蹴る)
- 自分自身とのマッチング禁止はuserId比較で担保

## 表示名

- 初期値「プレイヤー」+ 変更可(1〜10文字)。NGワードリスト+記号制限のサーバー検証
- 一意性は要求しない(IDで識別)。なりすまし報告は運用対応

## アカウント削除・引き継ぎ

- 退会: アプリ内から申請 → 即時ログイン不可 → 90日後に物理削除(誤操作の復元猶予)
- 機種変更: 連携済みなら新端末でログインするだけ。ゲストのまま消えるリスクは設定画面とガチャ画面に常時警告を出す

## 想定脅威と対策(認証まわり)

| 脅威 | 対策 |
|---|---|
| リフレッシュトークン窃取 | ローテーション+再利用検知で系列ごと失効 |
| ゲスト大量生成によるリソース枯渇 | IPレート制限・休眠ゲスト(30日未アクセス・連携なし)の自動削除 |
| トークン総当たり | 128bit乱数・失敗レート制限 |
| WebAuthnチャレンジ再利用 | チャレンジは一回限り・5分失効 |
