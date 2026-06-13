/* ============================================================
   APIクライアント: トークン管理(doc 06)
   - アクセストークン(JWT): メモリのみ
   - リフレッシュトークン: localStorage(ローテーション式)
   - 401時はrefreshを1回試行 → ダメならゲスト再発行
   ============================================================ */

const RT_KEY = 'yokaiShogi.rt.v1';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

/** ネットワーク不達(オフライン)を表す。フォールバック判定に使う */
export class NetworkError extends Error {}

interface TokenResponse { userId: string; accessToken: string; refreshToken: string; }

export class ApiClient {
  private accessToken: string | null = null;
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

  /* ゲスト発行 or リフレッシュでセッションを確立 */
  async ensureSession(turnstileToken?: string): Promise<void> {
    const rt = this.getRefreshToken();
    if (rt) {
      try {
        const t = await this.post<TokenResponse>('/v1/auth/refresh', { refreshToken: rt });
        this.applyTokens(t);
        return;
      } catch (e) {
        if (e instanceof NetworkError) throw e; // オフラインはフォールバックさせる
        this.setRefreshToken(null);             // 失効トークンは破棄してゲスト発行へ
      }
    }
    const t = await this.post<TokenResponse>('/v1/auth/guest', turnstileToken ? { turnstileToken } : {});
    this.applyTokens(t);
  }

  private applyTokens(t: TokenResponse): void {
    this.accessToken = t.accessToken;
    this.userId = t.userId;
    this.setRefreshToken(t.refreshToken);
  }

  /* 引き継ぎコードでログイン(別アカウントへ切り替え)。失敗時 ApiError */
  async loginWithCode(code: string): Promise<void> {
    const t = await this.post<TokenResponse>('/v1/auth/login/link-code', { code });
    this.applyTokens(t);
  }

  /* 認証付きリクエスト。401なら1回だけ再認証してリトライ */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const doFetch = async (): Promise<Response> => {
      try {
        return await fetch(`${this.baseUrl}${path}`, {
          method,
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
      await this.ensureSession();
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
