export interface Env {
  DB: D1Database;
  BATTLE: DurableObjectNamespace;
  MATCHMAKER: DurableObjectNamespace;
  METRICS?: AnalyticsEngineDataset;
  /* wranglerシークレット(ローカルは .dev.vars) */
  JWT_SECRET: string;
  /* 未設定なら Turnstile 検証をスキップ(ローカル開発・テスト用) */
  TURNSTILE_SECRET_KEY?: string;
  /* 公開サイトキー。秘密鍵とセットで設定する */
  TURNSTILE_SITE_KEY?: string;
  /* CORS許可オリジン(カンマ区切り) */
  ALLOWED_ORIGINS?: string;
  MAINTENANCE?: string;
  /* '1' のときだけ逢魔が時以外のランダムマッチを拒否(緊急クローズ用。未設定/'0' は常時開放) */
  MATCH_HOUR_ENFORCE?: string;
  /* 参加報酬の最低アクション数の上書き(テスト用。未設定は shared/match-hour.ts の既定値) */
  PARTICIPATION_MIN_ACTIONS?: string;
  /* 対局時計の上書き(テスト用。未設定は 60000 / 30000) */
  CLOCK_TURN_MS?: string;
  CLOCK_BYOYOMI_MS?: string;
  /* '1' のとき /init の turnMs/byoyomiMs を受け付ける(テスト専用) */
  ALLOW_TEST_CLOCK?: string;
  /* ランダムマッチ未成立時に影CPUへ切り替えるまでの待ち(ミリ秒)。未設定は 15000 */
  SHADOW_WAIT_MS?: string;
  /* 待ちのゆらぎ上限。未設定は 5000 */
  SHADOW_WAIT_JITTER_MS?: string;
  /* リワード広告(doc 22)。'1' で有効。未設定/'0' は無効 */
  ADS_REWARD_ENABLED?: string;
  /* 'mock'(開発・検証) | 'gpt'(Google Publisher Tag Rewarded) */
  ADS_REWARD_PROVIDER?: string;
  /* 日次上限の上書き(1〜10)。未設定は AD_REWARD_DAILY_CAP */
  ADS_REWARD_DAILY_CAP?: string;
  /* GPT の広告ユニットパス(例: /network/unit)。provider=gpt 時にクライアントへ返す */
  ADS_GPT_AD_UNIT_PATH?: string;
  /* Steam Web API キー(Partner)。未設定時は mock チケットのみ(ローカル/CI) */
  STEAM_WEB_API_KEY?: string;
  /* Steam App ID。本番検証に必要 */
  STEAM_APP_ID?: string;
  /* '1' で mock:<steamId> を明示許可。未設定でもキー未設定時は mock 可 */
  STEAM_AUTH_MOCK?: string;
}

/* Honoのコンテキスト型 */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    userId: string;
    isGuest: boolean;
  };
};
