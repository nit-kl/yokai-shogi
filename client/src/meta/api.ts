/* ============================================================
   API版メタ進行(サーバー権威: doc 02 / 04)
   サーバーのレスポンスで読み取りモデル(data)を更新する。
   検証・抽選・残高はサーバーが正本。クライアントはキャッシュ表示のみ。
   ============================================================ */

import { validateDisplayName, validateFormation } from '../../../shared/validate';
import { ApiClient, ApiError } from './client';
import { ownedSet } from './types';
import type { GachaResult } from './types';
import type { AdsClaimResult, AdsStatus, HyakkiProgress, HyakkiRanking, LoginBonus, MetaProvider, MetaState } from './types';
import { getTurnstileToken } from '../turnstile';

interface MeResponse {
  userId: string; name: string; isGuest: boolean;
  tickets: number; yoryoku: number;
  onboardingDone: boolean;
  loginBonus?: LoginBonus;
  rating: number; wins: number; losses: number;
}

export class ApiMeta implements MetaProvider {
  readonly data: MetaState = {
    tickets: 0, yoryoku: 0, owned: {}, formation: [],
    name: 'プレイヤー', wins: 0, isGuest: true, online: true, onboardingDone: false,
  };

  constructor(private client: ApiClient) {}

  get userId(): string | null { return this.client.userId; }
  battleUrl(): string | null { return this.client.battleUrl(); }

  async init(): Promise<LoginBonus | null> {
    await this.client.ensureSession(getTurnstileToken);
    return this.reload();
  }

  /* /me・collection・formation を取得して読み取りモデルを更新(init・引き継ぎ後に共用) */
  async reload(): Promise<LoginBonus | null> {
    const [me, col, form] = await Promise.all([
      this.client.get<MeResponse>('/v1/me'),
      this.client.get<{ owned: string[] }>('/v1/me/collection'),
      this.client.get<{ rows: (string | null)[][] }>('/v1/me/formation'),
    ]);
    this.data.tickets = me.tickets;
    this.data.yoryoku = me.yoryoku;
    this.data.name = me.name;
    this.data.isGuest = me.isGuest;
    this.data.wins = me.wins;
    this.data.online = true;
    this.data.onboardingDone = me.onboardingDone;
    this.data.owned = Object.fromEntries(col.owned.map(id => [id, 1]));
    this.data.formation = form.rows;
    return me.loginBonus ?? null;
  }

  async pull(count: 1 | 10): Promise<GachaResult[] | null> {
    try {
      const res = await this.client.post2<{ results: GachaResult[]; tickets: number; yoryoku: number }>(
        '/v1/gacha/pull',
        { count, idempotencyKey: crypto.randomUUID() },
      );
      this.data.tickets = res.tickets;
      this.data.yoryoku = res.yoryoku;
      for (const r of res.results) if (r.isNew) this.data.owned[r.id] = 1;
      return res.results;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INSUFFICIENT_TICKETS') return null;
      throw e;
    }
  }

  async exchange(): Promise<boolean> {
    try {
      const res = await this.client.post2<{ tickets: number; yoryoku: number }>('/v1/exchange', {});
      this.data.tickets = res.tickets;
      this.data.yoryoku = res.yoryoku;
      return true;
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'INSUFFICIENT_YORYOKU' || e.code === 'CONFLICT')) return false;
      throw e;
    }
  }

  async setFormation(rows: (string | null)[][]): Promise<string | null> {
    /* クライアント側でも即時検証(無駄な往復を避ける)。最終権威はサーバー */
    const local = validateFormation(rows, ownedSet(this.data));
    if (local) return local;
    try {
      const res = await this.client.put<{ rows: (string | null)[][] }>('/v1/me/formation', { rows });
      this.data.formation = res.rows;
      return null;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INVALID_FORMATION') return e.message;
      throw e;
    }
  }

  async setName(name: string): Promise<string | null> {
    const local = validateDisplayName(name);
    if (local) return local;
    try {
      const res = await this.client.put<{ name: string }>('/v1/me/name', { name });
      this.data.name = res.name;
      return null;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VALIDATION') return e.message;
      throw e;
    }
  }

  /* ---------- 百鬼夜行 週間連勝ランキング(doc 21) ---------- */

  hyakkiStart(): Promise<HyakkiProgress | null> {
    return this.client.post2<HyakkiProgress>('/v1/solo/hyakki/start', {});
  }

  hyakkiResult(win: boolean): Promise<HyakkiProgress | null> {
    return this.client.post2<HyakkiProgress>('/v1/solo/hyakki/result', { win });
  }

  hyakkiRanking(): Promise<HyakkiRanking | null> {
    return this.client.get<HyakkiRanking>('/v1/rankings/hyakki');
  }

  async recordSoloWin(): Promise<number> {
    const res = await this.client.post2<{ granted: number; tickets: number; wins: number }>('/v1/solo/win', {});
    this.data.tickets = res.tickets;
    this.data.wins = res.wins;
    return res.granted;
  }

  async issueLinkCode(): Promise<string> {
    const res = await this.client.post2<{ code: string }>('/v1/auth/link-code', {});
    this.data.isGuest = false; // コード発行でゲスト卒業(サーバー側も is_guest=0)
    return res.code;
  }

  async redeemLinkCode(code: string): Promise<boolean> {
    await this.client.loginWithCode(code); // 失敗時 ApiError
    await this.reload();                   // 切り替え先アカウントのデータを取得
    return true;
  }

  async pickBoss(bossId: string): Promise<string | null> {
    try {
      const res = await this.client.post2<{ bossId: string; owned: string[]; rows: (string | null)[][] }>(
        '/v1/onboarding/boss',
        { bossId },
      );
      this.data.owned = Object.fromEntries(res.owned.map(id => [id, 1]));
      this.data.formation = res.rows;
      return null;
    } catch (e) {
      if (e instanceof ApiError) return e.message;
      throw e;
    }
  }

  async completeOnboarding(): Promise<LoginBonus | null> {
    await this.client.post2<{ onboardingDone: boolean }>('/v1/onboarding/complete', {});
    this.data.onboardingDone = true;
    return this.reload();
  }

  async adsStatus(): Promise<AdsStatus | null> {
    try {
      return await this.client.get<AdsStatus>('/v1/ads/status');
    } catch {
      return null;
    }
  }

  async claimAdReward(provider: AdsStatus['provider']): Promise<AdsClaimResult | null> {
    try {
      const res = await this.client.post2<AdsClaimResult>('/v1/ads/reward', { provider });
      this.data.tickets = res.tickets;
      return res;
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'FEATURE_DISABLED' || e.code === 'VALIDATION')) return null;
      throw e;
    }
  }
}
