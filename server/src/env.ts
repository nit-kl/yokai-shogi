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
  /* 未設定または '1' なら逢魔が時以外のランダムマッチを拒否(テストは '0') */
  MATCH_HOUR_ENFORCE?: string;
  /* 参加報酬の最低アクション数の上書き(テスト用。未設定は shared/match-hour.ts の既定値) */
  PARTICIPATION_MIN_ACTIONS?: string;
}

/* Honoのコンテキスト型 */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    userId: string;
    isGuest: boolean;
  };
};
