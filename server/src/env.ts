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
  /* リワード広告(doc 22)。'1' で有効。未設定/'0' は無効 */
  ADS_REWARD_ENABLED?: string;
  /* 'mock'(開発・検証) | 'gpt'(Google Publisher Tag Rewarded) */
  ADS_REWARD_PROVIDER?: string;
  /* 日次上限の上書き(1〜10)。未設定は AD_REWARD_DAILY_CAP */
  ADS_REWARD_DAILY_CAP?: string;
  /* GPT の広告ユニットパス(例: /network/unit)。provider=gpt 時にクライアントへ返す */
  ADS_GPT_AD_UNIT_PATH?: string;
}

/* Honoのコンテキスト型 */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    userId: string;
    isGuest: boolean;
  };
};
