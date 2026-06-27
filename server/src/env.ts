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
}

/* Honoのコンテキスト型 */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    userId: string;
    isGuest: boolean;
  };
};
