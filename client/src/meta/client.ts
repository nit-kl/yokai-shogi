/* ============================================================
   APIクライアント: トークン管理(doc 06)
   - アクセストークン(JWT): メモリのみ
   - リフレッシュトークン: localStorage(ローテーション式)
   - 401時はrefreshを1回試行。失効時は新規ゲストを自動発行せず SessionExpiredError
   ============================================================ */

const RT_KEY = 'yokaiShogi.rt.v1';
/** RT失効後、ユーザーが復元/新規開始を選ぶまで立てるフラグ */
const NEEDS_RECOVERY_KEY = 'yokaiShogi.needsRecovery.v1';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

/** ネットワーク不達(オフライン)を表す。フォールバック判定に使う */
export class NetworkError extends Error {}

/** リフレッシュ失効など。UIでコード復元か新規開始を選ばせる */
export class SessionExpiredError extends Error {
  constructor(message = 'セッションの有効期限が切れました') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

interface TokenResponse { userId: string; accessToken: string; refreshToken: string; }
interface AuthConfig { turnstileRequired: boolean; turnstileSiteKey?: string; }

export class ApiClient {
  private accessToken: string | null = null;
  private turnstileProvider: ((siteKey: string) => Promise<string>) | undefined;
  userId: string | null = null;

  constructor(private baseUrl: string) {}

  battleUrl(): string | null {
    if (!this.accessToken) return null;
    const url = new URL('/v1/battle', this.baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', this.accessToken);
    url.searchParams.set('v', '1');
    return url.toString();
  }

  private getRefreshToken(): string | null {
    try { return localStorage.getItem(RT_KEY); } catch { return null; }
  }
  private setRefreshToken(t: string | null): void {
    try { t ? localStorage.setItem(RT_KEY, t) : localStorage.removeItem(RT_KEY); } catch { /* 無視 */ }
  }

  private getNeedsRecovery(): boolean {
    try { return localStorage.getItem(NEEDS_RECOVERY_KEY) === '1'; } catch { return false; }
  }
  private setNeedsRecovery(v: boolean): void {
    try {
      if (v) localStorage.setItem(NEEDS_RECOVERY_KEY, '1');
      else localStorage.removeItem(NEEDS_RECOVERY_KEY);
    } catch { /* 無視 */ }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new NetworkError(`POST ${path} failed`);
    }
    const data = await res.json().catch(() => null) as any;
    if (!res.ok) throw new ApiError(data?.error?.code ?? 'INTERNAL', data?.error?.message ?? 'error', res.status);
    return data as T;
  }

  /* リフレッシュのみ。成功でトークン適用、失敗で SessionExpiredError(または再送出) */
  private async refreshOrExpire(): Promise<void> {
    const rt = this.getRefreshToken();
    if (!rt) {
      this.markSessionExpired();
      throw new SessionExpiredError();
    }
    try {
      const t = await this.post<TokenResponse>('/v1/auth/refresh', { refreshToken: rt });
      this.applyTokens(t);
    } catch (e) {
      if (e instanceof NetworkError) throw e;
      if (e instanceof ApiError && e.code === 'MAINTENANCE') throw e;
      this.markSessionExpired();
      throw new SessionExpiredError();
    }
  }

  private markSessionExpired(): void {
    this.accessToken = null;
    this.userId = null;
    this.setRefreshToken(null);
    this.setNeedsRecovery(true);
  }

  /* ゲスト発行 or リフレッシュでセッションを確立。失効時は自動ゲスト発行しない */
  async ensureSession(getTurnstileToken?: (siteKey: string) => Promise<string>): Promise<void> {
    if (getTurnstileToken) this.turnstileProvider = getTurnstileToken;
    const rt = this.getRefreshToken();
    if (rt) {
      await this.refreshOrExpire();
      return;
    }
    if (this.getNeedsRecovery()) throw new SessionExpiredError();
    await this.createGuestSession(getTurnstileToken);
  }

  /* ユーザーが明示的に「新規開始」を選んだときだけ呼ぶ */
  async createGuestSession(getTurnstileToken?: (siteKey: string) => Promise<string>): Promise<void> {
    if (getTurnstileToken) this.turnstileProvider = getTurnstileToken;
    let config: AuthConfig = { turnstileRequired: false };
    try {
      config = await this.getPublic<AuthConfig>('/v1/auth/config');
    } catch (e) {
      /* 旧デプロイ互換: /auth/config が VALIDATION を返す場合は Turnstile なしで続行 */
      if (!(e instanceof ApiError && e.code === 'VALIDATION')) throw e;
    }
    let turnstileToken: string | undefined;
    if (config.turnstileRequired) {
      if (!config.turnstileSiteKey || !this.turnstileProvider) throw new Error('bot検証の設定が不足しています');
      turnstileToken = await this.turnstileProvider(config.turnstileSiteKey);
    }
    const t = await this.post<TokenResponse>('/v1/auth/guest', turnstileToken ? { turnstileToken } : {});
    this.applyTokens(t);
  }

  private async getPublic<T>(path: string): Promise<T> {
    let res: Response;
    try { res = await fetch(`${this.baseUrl}${path}`); }
    catch { throw new NetworkError(`GET ${path} failed`); }
    const data = await res.json().catch(() => null) as any;
    if (!res.ok) throw new ApiError(data?.error?.code ?? 'INTERNAL', data?.error?.message ?? 'error', res.status);
    return data as T;
  }

  private applyTokens(t: TokenResponse): void {
    this.accessToken = t.accessToken;
    this.userId = t.userId;
    this.setRefreshToken(t.refreshToken);
    this.setNeedsRecovery(false);
  }

  /* 引き継ぎコードでログイン(別アカウントへ切り替え)。失敗時 ApiError */
  async loginWithCode(code: string): Promise<void> {
    const t = await this.post<TokenResponse>('/v1/auth/login/link-code', { code });
    this.applyTokens(t);
  }

  /* パスキー検証結果でログイン。失敗時 ApiError */
  async loginWithPasskey(assertion: unknown): Promise<void> {
    const t = await this.post<TokenResponse>('/v1/auth/passkey/login', assertion);
    this.applyTokens(t);
  }

  async getPasskeyLoginOptions<T = unknown>(): Promise<T> {
    return this.post<T>('/v1/auth/passkey/login/options', {});
  }

  /* 認証付きリクエスト。401ならrefreshのみ1回試行してリトライ(新規ゲストは作らない) */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const doFetch = async (): Promise<Response> => {
      try {
        return await fetch(`${this.baseUrl}${path}`, {
          method,
          /* APIレスポンスは全て動的。HTTPキャッシュに乗せない(取得間隔はUI側で調整する) */
          cache: 'no-store',
          headers: {
            'content-type': 'application/json',
            ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
      } catch {
        throw new NetworkError(`${method} ${path} failed`);
      }
    };

    let res = await doFetch();
    if (res.status === 401) {
      await this.refreshOrExpire();
      res = await doFetch();
    }
    const data = await res.json().catch(() => null) as any;
    if (!res.ok) throw new ApiError(data?.error?.code ?? 'INTERNAL', data?.error?.message ?? 'error', res.status);
    return data as T;
  }

  get<T>(path: string): Promise<T> { return this.request<T>('GET', path); }
  post2<T>(path: string, body?: unknown): Promise<T> { return this.request<T>('POST', path, body); }
  put<T>(path: string, body?: unknown): Promise<T> { return this.request<T>('PUT', path, body); }
}
