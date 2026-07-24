/* ============================================================
   メタ進行ファサード(doc 02)
   - VITE_API_URL があればAPI版を優先(サーバー権威)
   - オフライン(ネットワーク不達)時はローカル版へ自動フォールバック
   - UIはこの Meta だけを参照する(provider の差し替えを意識しない)
   ============================================================ */

import { ApiClient, ApiError, NetworkError, SessionExpiredError } from './client';
import { ApiMeta } from './api';
import { LocalMeta } from './local';
import {
  EXCHANGE_COST, bossIdOf, ownedListOf, validateFormationOf,
} from './types';
import type { AdsClaimResult, AdsStatus, GachaResult, HyakkiProgress, HyakkiRanking, LoginBonus, MetaProvider, MetaState, ReleaseGift } from './types';

export type { AdsClaimResult, AdsStatus, GachaResult, HyakkiProgress, HyakkiRanking, LoginBonus, MetaState, ReleaseGift } from './types';
export { ApiError, NetworkError, SessionExpiredError } from './client';

/* vite.config.ts の define で注入(空文字=オフライン) */
const API_URL = __API_URL__ || undefined;

class MetaFacade {
  readonly EXCHANGE_COST = EXCHANGE_COST;
  private provider: MetaProvider = new LocalMeta();
  /** init() で受け取ったログインボーナス(タイトル表示で消費) */
  pendingLoginBonus: LoginBonus | null = null;
  /** リリース記念チケット(タイトル表示で消費) */
  pendingReleaseGift: ReleaseGift | null = null;
  private forceLocal = false;
  /** APIがメンテナンス中のとき true */
  maintenance = false;

  get data(): MetaState { return this.provider.data; }
  get online(): boolean { return this.provider.data.online; }
  get onlineAvailable(): boolean { return !!API_URL && !this.forceLocal; }
  isOnboardingDone(): boolean { return this.provider.data.onboardingDone; }
  useLocal(): void { this.forceLocal = true; this.provider = new LocalMeta(); }

  /* 起動: API優先・オフラインはローカルへフォールバック */
  async init(): Promise<LoginBonus | null> {
    this.maintenance = false;
    this.pendingReleaseGift = null;
    if (API_URL && !this.forceLocal) {
      const api = new ApiMeta(new ApiClient(API_URL));
      try {
        const bonus = await api.init();
        this.provider = api;
        this.pendingLoginBonus = bonus;
        this.pendingReleaseGift = api.pendingReleaseGift;
        return bonus;
      } catch (e) {
        if (e instanceof ApiError && e.code === 'MAINTENANCE') {
          this.maintenance = true;
          throw e;
        }
        if (!(e instanceof NetworkError)) throw e; // サーバー側エラーは握りつぶさない
        console.warn('[meta] オフラインのためローカルデータで起動します');
      }
    }
    const local = new LocalMeta();
    this.provider = local;
    const bonus = await local.init();
    this.pendingLoginBonus = bonus;
    return bonus;
  }

  /* ---------- 非同期の変更操作(provider委譲) ---------- */
  pull(count: 1 | 10): Promise<GachaResult[] | null> { return this.provider.pull(count); }
  exchange(): Promise<boolean> { return this.provider.exchange(); }
  setFormation(rows: (string | null)[][]): Promise<string | null> { return this.provider.setFormation(rows); }
  setName(name: string): Promise<string | null> { return this.provider.setName(name); }
  recordSoloWin(): Promise<number> { return this.provider.recordSoloWin(); }
  issueLinkCode(): Promise<string> { return this.provider.issueLinkCode(); }
  redeemLinkCode(code: string): Promise<boolean> { return this.provider.redeemLinkCode(code); }

  /** セッション失効画面から引き継ぎコードで復元(ApiMeta 未確立時も可) */
  async recoverWithLinkCode(code: string): Promise<boolean> {
    if (!API_URL) throw new Error('オンライン接続時のみ利用できます');
    const api = new ApiMeta(new ApiClient(API_URL));
    await api.redeemLinkCode(code);
    this.provider = api;
    this.forceLocal = false;
    this.pendingLoginBonus = null;
    this.pendingReleaseGift = api.pendingReleaseGift;
    return true;
  }

  /** セッション失効画面から新規ゲスト開始 */
  async startFreshGuest(): Promise<LoginBonus | null> {
    if (!API_URL) throw new Error('オンライン接続時のみ利用できます');
    const api = new ApiMeta(new ApiClient(API_URL));
    const bonus = await api.startAsNewGuest();
    this.provider = api;
    this.forceLocal = false;
    this.pendingLoginBonus = bonus;
    this.pendingReleaseGift = api.pendingReleaseGift;
    return bonus;
  }

  battleUrl(): string | null { return this.provider.battleUrl(); }
  pickBoss(bossId: string): Promise<string | null> { return this.provider.pickBoss(bossId); }
  async completeOnboarding(): Promise<LoginBonus | null> {
    const bonus = await this.provider.completeOnboarding();
    if (this.provider instanceof ApiMeta) {
      this.pendingReleaseGift = this.provider.pendingReleaseGift;
    }
    return bonus;
  }
  hyakkiStart(): Promise<HyakkiProgress | null> { return this.provider.hyakkiStart(); }
  hyakkiStatus(): Promise<HyakkiProgress | null> { return this.provider.hyakkiStatus(); }
  hyakkiResult(win: boolean): Promise<HyakkiProgress | null> { return this.provider.hyakkiResult(win); }
  hyakkiRanking(): Promise<HyakkiRanking | null> { return this.provider.hyakkiRanking(); }
  adsStatus(): Promise<AdsStatus | null> { return this.provider.adsStatus(); }
  claimAdReward(provider: AdsStatus['provider']): Promise<AdsClaimResult | null> {
    return this.provider.claimAdReward(provider);
  }
  addTickets(n: number): void { if (n > 0) this.provider.data.tickets += n; }
  /** サーバーが付与済みの妖怪をローカル表示へ反映(対戦会限定妖怪など) */
  addYokai(id: string): void { this.provider.data.owned[id] = 1; }

  /* ---------- 同期の読み取りヘルパ(data から導出) ---------- */
  bossId(): string { return bossIdOf(this.provider.data); }
  ownedList(): string[] { return ownedListOf(this.provider.data); }
  formationRows(): (string | null)[][] { return this.provider.data.formation.map(r => [...r]); }
  validateFormation(rows: (string | null)[][]): string | null { return validateFormationOf(this.provider.data, rows); }

  /* ローカルモードの永続化(オフライン/ソロ。e2e・テスト用) */
  save(): void {
    if (this.provider instanceof LocalMeta) this.provider.save();
  }
}

export const Meta = new MetaFacade();
