/* ============================================================
   メタ進行ファサード(doc 02)
   - VITE_API_URL があればAPI版を優先(サーバー権威)
   - オフライン(ネットワーク不達)時はローカル版へ自動フォールバック
   - UIはこの Meta だけを参照する(provider の差し替えを意識しない)
   ============================================================ */

import { ApiClient, ApiError, NetworkError } from './client';
import { ApiMeta } from './api';
import { LocalMeta } from './local';
import {
  EXCHANGE_COST, bossIdOf, ownedListOf, validateFormationOf,
} from './types';
import type { GachaResult, LoginBonus, MetaProvider, MetaState } from './types';

export type { GachaResult, LoginBonus, MetaState } from './types';

/* vite.config.ts の define で注入(空文字=オフライン) */
const API_URL = __API_URL__ || undefined;

class MetaFacade {
  readonly EXCHANGE_COST = EXCHANGE_COST;
  private provider: MetaProvider = new LocalMeta();
  /** init() で受け取ったログインボーナス(タイトル表示で消費) */
  pendingLoginBonus: LoginBonus | null = null;
  private forceLocal = false;
  /** APIがメンテナンス中のとき true */
  maintenance = false;

  get data(): MetaState { return this.provider.data; }
  get online(): boolean { return this.provider.data.online; }
  useLocal(): void { this.forceLocal = true; this.provider = new LocalMeta(); }

  /* 起動: API優先・オフラインはローカルへフォールバック */
  async init(): Promise<LoginBonus | null> {
    this.maintenance = false;
    if (API_URL && !this.forceLocal) {
      const api = new ApiMeta(new ApiClient(API_URL));
      try {
        const bonus = await api.init();
        this.provider = api;
        this.pendingLoginBonus = bonus;
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
  recordSoloWin(): Promise<number> { return this.provider.recordSoloWin(); }
  issueLinkCode(): Promise<string> { return this.provider.issueLinkCode(); }
  redeemLinkCode(code: string): Promise<boolean> { return this.provider.redeemLinkCode(code); }
  battleUrl(): string | null { return this.provider.battleUrl(); }
  addTickets(n: number): void { if (n > 0) this.provider.data.tickets += n; }

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
