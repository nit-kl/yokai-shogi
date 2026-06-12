/* ============================================================
   妖怪将棋 - メタ進行(セーブ・ガチャ・ログインボーナス・編成)
   課金なし: チケットはログインボーナスと勝利報酬でのみ獲得。
   保存先は localStorage(サーバー不要)。
   Phase 1 で同一インターフェースのAPI版に差し替える(doc 02)。
   ============================================================ */

import { COLS, ROWS, SETUP, YOKAI, RARITY_INFO, GACHA_POOL, PLAYER_BOSS } from '../../shared/data';
import type { Rarity } from '../../shared/data';

export interface SaveData {
  tickets: number;
  yoryoku: number;
  owned: Record<string, number>;        // id -> 1(各妖怪は1体まで所持)
  formation: (string | null)[][];       // [前段, 最奥段]
  lastLogin: string | null;
  streak: number;
  wins: number;
}

export interface GachaResult { id: string; rarity: Rarity; isNew: boolean; yoryoku: number; }

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export const Meta = {
  KEY: 'yokaiShogi.save.v1',
  EXCHANGE_COST: 300,  // 妖力→チケット1枚の交換コスト
  FIRST_BONUS: 10,     // 初回起動時のチケット(10連1回分)
  WIN_REWARD: 1,       // 1勝ごとのチケット
  data: null as unknown as SaveData,
  _storage: null as StorageLike | null,

  /* localStorage が無い環境(nodeテスト)ではメモリに保存 */
  storage(): StorageLike {
    if (!this._storage) {
      let ls: StorageLike | null = null;
      try {
        if (typeof localStorage !== 'undefined') { localStorage.getItem(this.KEY); ls = localStorage; }
      } catch (e) { /* 利用不可ならメモリへ */ }
      if (ls) {
        this._storage = ls;
      } else {
        const m: Record<string, string> = {};
        this._storage = {
          getItem(k: string) { return k in m ? m[k] : null; },
          setItem(k: string, v: string) { m[k] = String(v); },
        };
      }
    }
    return this._storage;
  },

  defaults(): SaveData {
    const owned: Record<string, number> = {};
    for (const row of SETUP.slice(ROWS - 2)) for (const id of row) if (id) owned[id] = 1;
    return {
      tickets: this.FIRST_BONUS,
      yoryoku: 0,
      owned,
      formation: SETUP.slice(ROWS - 2).map(r => [...r]), // [前段, 最奥段]
      lastLogin: null,
      streak: 0,
      wins: 0,
    };
  },

  load(): SaveData {
    if (this.data) return this.data;
    let saved: Partial<SaveData> | null = null;
    try { saved = JSON.parse(this.storage().getItem(this.KEY) as string); } catch (e) { /* 壊れたデータは破棄 */ }
    this.data = Object.assign(this.defaults(), saved || {});
    if (this.validateFormation(this.data.formation)) {
      this.data.formation = this.defaults().formation; // 不正な編成は既定に戻す
    }
    return this.data;
  },

  save() {
    this.storage().setItem(this.KEY, JSON.stringify(this.data));
  },

  /* ---------- 日付(ローカル) ---------- */
  dateStr(d = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  /* ---------- ログインボーナス: 1日1回、7日連続ごとに3枚 ---------- */
  claimLoginBonus(now = new Date()): { day: number; tickets: number } | null {
    const today = this.dateStr(now);
    if (this.data.lastLogin === today) return null;
    const yesterday = this.dateStr(new Date(now.getTime() - 86400e3));
    this.data.streak = (this.data.lastLogin === yesterday) ? this.data.streak + 1 : 1;
    this.data.lastLogin = today;
    const tickets = (this.data.streak % 7 === 0) ? 3 : 1;
    this.data.tickets += tickets;
    this.save();
    return { day: this.data.streak, tickets };
  },

  /* ---------- 勝利報酬 ---------- */
  onWin(): number {
    this.data.wins++;
    this.data.tickets += this.WIN_REWARD;
    this.save();
    return this.WIN_REWARD;
  },

  /* ---------- ガチャ ---------- */
  rollRarity(rand: () => number = Math.random): Rarity {
    const total = Object.values(RARITY_INFO).reduce((a, r) => a + r.weight, 0);
    let v = rand() * total;
    for (const key in RARITY_INFO) {
      v -= RARITY_INFO[key as Rarity].weight;
      if (v < 0) return key as Rarity;
    }
    return 'N';
  },

  /* count連ガチャ。チケット不足なら null。10連はSR以上1枠確定 */
  pull(count: number, rand: () => number = Math.random): GachaResult[] | null {
    if (count < 1 || this.data.tickets < count) return null;
    this.data.tickets -= count;

    const rarities: Rarity[] = [];
    for (let i = 0; i < count; i++) rarities.push(this.rollRarity(rand));
    if (count >= 10 && !rarities.some(r => r === 'SR' || r === 'SSR')) {
      rarities[count - 1] = rand() < 0.8 ? 'SR' : 'SSR';
    }

    const results = rarities.map((rarity): GachaResult => {
      const ids = GACHA_POOL.filter(id => YOKAI[id].rarity === rarity);
      const id = ids[Math.floor(rand() * ids.length)];
      const isNew = !this.data.owned[id];
      let yoryoku = 0;
      if (isNew) {
        this.data.owned[id] = 1;
      } else {
        yoryoku = RARITY_INFO[rarity].yoryoku; // 被りは妖力に変換
        this.data.yoryoku += yoryoku;
      }
      return { id, rarity, isNew, yoryoku };
    });
    this.save();
    return results;
  },

  /* 妖力300 → チケット1枚 */
  exchange(): boolean {
    if (this.data.yoryoku < this.EXCHANGE_COST) return false;
    this.data.yoryoku -= this.EXCHANGE_COST;
    this.data.tickets += 1;
    this.save();
    return true;
  },

  /* ---------- 編成 ---------- */
  /* 正常なら null、問題があればエラーメッセージを返す */
  validateFormation(rows: unknown): string | null {
    if (!Array.isArray(rows) || rows.length !== 2 ||
        rows.some(r => !Array.isArray(r) || r.length !== COLS)) return '編成データが不正です';
    const ids = (rows as (string | null)[][]).flat().filter((id): id is string => !!id);
    let bosses = 0;
    const seen = new Set<string>();
    for (const id of ids) {
      const def = YOKAI[id];
      if (!def || !this.data.owned[id]) return '所持していない妖怪が含まれています';
      if (seen.has(id)) return '同じ妖怪は1体しか配置できません';
      seen.add(id);
      if (def.type === 'boss') bosses++;
    }
    if (bosses !== 1) return '大将を1体配置してください';
    return null;
  },

  setFormation(rows: (string | null)[][]): string | null {
    const err = this.validateFormation(rows);
    if (err) return err;
    this.data.formation = rows.map(r => [...r]);
    this.save();
    return null;
  },

  formationRows(): (string | null)[][] {
    return this.data.formation.map(r => [...r]);
  },

  /* 編成中の大将(タイトル・アバター表示用) */
  bossId(): string {
    for (const id of this.data.formation.flat()) {
      if (id && YOKAI[id].type === 'boss') return id;
    }
    return PLAYER_BOSS;
  },

  /* 所持妖怪一覧(レアリティ降順 → タイプ → ATK降順) */
  ownedList(): string[] {
    const rOrder: Record<string, number> = { SSR: 0, SR: 1, R: 2, N: 3 };
    const tOrder: Record<string, number> = { boss: 0, attack: 1, defense: 2, ambush: 3 };
    return Object.keys(this.data.owned)
      .filter(id => this.data.owned[id])
      .sort((a, b) => {
        const A = YOKAI[a], B = YOKAI[b];
        return (rOrder[A.rarity] - rOrder[B.rarity]) ||
               (tOrder[A.type] - tOrder[B.type]) ||
               (B.atk - A.atk) || a.localeCompare(b);
      });
  },
};
