/* ============================================================
   ローカル版メタ進行(ソロ・オフライン用フォールバック)
   保存先は localStorage。ガチャ・編成ロジックは shared を共用し、
   サーバー版と挙動を一致させる(doc 02)。
   ============================================================ */

import { BOSS_CHOICES, EMPTY_FORMATION, formationWithBoss, type BossChoice } from '../../../shared/data';
import { drawGacha } from '../../../shared/gacha';
import type { GachaResult } from '../../../shared/gacha';
import { validateDisplayName, validateFormation } from '../../../shared/validate';
import { EXCHANGE_COST, ownedSet } from './types';
import type { AdsClaimResult, AdsStatus, HyakkiProgress, HyakkiRanking, LoginBonus, MetaProvider, MetaState } from './types';

const FIRST_BONUS = 10;            // 初回起動時のチケット(10連ガチャ用)
const TICKETS_CAP = 999;
const YORYOKU_CAP = 99999;
const SOLO_WIN_DAILY_CAP = 2;      // ソロ勝利報酬の日次上限(doc 08)

/* localStorageに保存する内部ブロブ(MetaState + ローカル専用フィールド) */
interface SaveBlob extends MetaState {
  lastLogin: string | null;
  streak: number;
  soloWinDate: string | null;
  soloWinCount: number;
}

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export class LocalMeta implements MetaProvider {
  static KEY = 'yokaiShogi.save.v1';
  blob: SaveBlob;
  private _storage: StorageLike | null = null;

  constructor() {
    this.blob = this.load();
  }

  get data(): MetaState { return this.blob; }

  /* localStorage が無い/使えない環境(テスト)ではメモリに保存 */
  private storage(): StorageLike {
    if (!this._storage) {
      let ls: StorageLike | null = null;
      try {
        if (typeof localStorage !== 'undefined') { localStorage.getItem(LocalMeta.KEY); ls = localStorage; }
      } catch { /* 利用不可ならメモリへ */ }
      if (ls) {
        this._storage = ls;
      } else {
        const m: Record<string, string> = {};
        this._storage = {
          getItem: k => (k in m ? m[k] : null),
          setItem: (k, v) => { m[k] = String(v); },
        };
      }
    }
    return this._storage;
  }

  private defaults(): SaveBlob {
    return {
      tickets: FIRST_BONUS,
      yoryoku: 0,
      owned: {},
      formation: EMPTY_FORMATION.map(r => [...r]),
      name: 'プレイヤー',
      wins: 0,
      isGuest: true,
      online: false,
      onboardingDone: false,
      lastLogin: null,
      streak: 0,
      soloWinDate: null,
      soloWinCount: 0,
    };
  }

  private load(): SaveBlob {
    let saved: Partial<SaveBlob> | null = null;
    try { saved = JSON.parse(this.storage().getItem(LocalMeta.KEY) as string); } catch { /* 壊れたデータは破棄 */ }
    const blob = Object.assign(this.defaults(), saved || {});
    blob.online = false;
    /* 旧セーブ(オンボーディング導入前)は複数所持があれば完了扱い */
    if (saved && saved.onboardingDone === undefined) {
      blob.onboardingDone = Object.keys(saved.owned || {}).length > 1;
    }
    if (validateFormation(blob.formation, ownedSet(blob))) {
      blob.formation = EMPTY_FORMATION.map(r => [...r]);
    }
    return blob;
  }

  save() {
    this.storage().setItem(LocalMeta.KEY, JSON.stringify(this.blob));
  }

  /* ---------- 日付(ローカルタイムゾーン) ---------- */
  dateStr(d = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /* ---------- ログインボーナス: 1日1回、7日連続ごとに3枚 ---------- */
  claimLoginBonus(now = new Date()): LoginBonus | null {
    const today = this.dateStr(now);
    if (this.blob.lastLogin === today) return null;
    const yesterday = this.dateStr(new Date(now.getTime() - 86400e3));
    this.blob.streak = (this.blob.lastLogin === yesterday) ? this.blob.streak + 1 : 1;
    this.blob.lastLogin = today;
    const tickets = Math.min((this.blob.streak % 7 === 0) ? 3 : 1, TICKETS_CAP - this.blob.tickets);
    this.blob.tickets += tickets;
    this.save();
    return { day: this.blob.streak, tickets };
  }

  async init(): Promise<LoginBonus | null> {
    if (!this.blob.onboardingDone) return null;
    return this.claimLoginBonus();
  }

  async pickBoss(bossId: string): Promise<string | null> {
    if (!BOSS_CHOICES.includes(bossId as BossChoice)) return '大将として選べない妖怪です';
    if (this.blob.onboardingDone) return 'オンボーディングは完了済みです';
    this.blob.owned = { [bossId]: 1 };
    this.blob.formation = formationWithBoss(bossId);
    this.save();
    return null;
  }

  async completeOnboarding(): Promise<LoginBonus | null> {
    if (this.blob.onboardingDone) return this.claimLoginBonus();
    this.blob.onboardingDone = true;
    this.save();
    return this.claimLoginBonus();
  }

  async pull(count: 1 | 10): Promise<GachaResult[] | null> {
    return this.pullSync(count);
  }

  /* 決定的テスト用に rand を注入できる同期版 */
  pullSync(count: number, rand: () => number = Math.random): GachaResult[] | null {
    if ((count !== 1 && count !== 10) || this.blob.tickets < count) return null;
    this.blob.tickets -= count;
    const draw = drawGacha(count, ownedSet(this.blob), rand);
    for (const id of draw.newIds) this.blob.owned[id] = 1;
    this.blob.yoryoku = Math.min(this.blob.yoryoku + draw.yoryokuGained, YORYOKU_CAP);
    this.save();
    return draw.results;
  }

  async exchange(): Promise<boolean> {
    if (this.blob.yoryoku < EXCHANGE_COST || this.blob.tickets >= TICKETS_CAP) return false;
    this.blob.yoryoku -= EXCHANGE_COST;
    this.blob.tickets += 1;
    this.save();
    return true;
  }

  async setFormation(rows: (string | null)[][]): Promise<string | null> {
    const err = validateFormation(rows, ownedSet(this.blob));
    if (err) return err;
    this.blob.formation = rows.map(r => [...r]);
    this.save();
    return null;
  }

  async setName(name: string): Promise<string | null> {
    const err = validateDisplayName(name);
    if (err) return err;
    this.blob.name = name.trim();
    this.save();
    return null;
  }

  async issueLinkCode(): Promise<string> {
    throw new Error('引き継ぎコードはオンライン接続時のみ発行できます');
  }

  async redeemLinkCode(_code: string): Promise<boolean> {
    throw new Error('引き継ぎはオンライン接続時のみ利用できます');
  }

  battleUrl(): string | null { return null; }

  /* 百鬼夜行ランキングはサーバー専用機能。オフラインでは参加も閲覧もしない */
  async hyakkiStart(): Promise<HyakkiProgress | null> { return null; }
  async hyakkiStatus(): Promise<HyakkiProgress | null> { return null; }
  async hyakkiResult(_win: boolean): Promise<HyakkiProgress | null> { return null; }
  async hyakkiRanking(): Promise<HyakkiRanking | null> { return null; }
  async adsStatus(): Promise<AdsStatus | null> { return null; }
  async claimAdReward(_provider: AdsStatus['provider']): Promise<AdsClaimResult | null> { return null; }

  async recordSoloWin(): Promise<number> {
    this.blob.wins++;
    const today = this.dateStr();
    const countToday = this.blob.soloWinDate === today ? this.blob.soloWinCount : 0;
    const grant = countToday < SOLO_WIN_DAILY_CAP ? Math.min(1, TICKETS_CAP - this.blob.tickets) : 0;
    this.blob.tickets += grant;
    this.blob.soloWinDate = today;
    this.blob.soloWinCount = countToday + (grant > 0 ? 1 : 0);
    this.save();
    return grant;
  }
}
