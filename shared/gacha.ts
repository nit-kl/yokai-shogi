/* ============================================================
   妖怪将棋 - ガチャ抽選ロジック(クライアント/サーバー共用)
   排出率・10連確定枠・被り妖力変換の仕様の正本(doc 08)。
   乱数は注入式: ローカル版は Math.random、サーバーは CSPRNG。
   ============================================================ */

import { GACHA_POOL, RARITY_INFO, YOKAI } from './data';
import type { Rarity } from './data';

export interface GachaResult {
  id: string;
  rarity: Rarity;
  isNew: boolean;
  yoryoku: number; // 被り時の妖力変換量(新規なら0)
}

export interface GachaDraw {
  results: GachaResult[];
  newIds: string[];      // この抽選で新規入手した妖怪
  yoryokuGained: number; // 被り変換の合計
}

/* レアリティ抽選(重み: N40 / R40 / SR16 / SSR4) */
export function rollRarity(rand: () => number = Math.random): Rarity {
  const total = Object.values(RARITY_INFO).reduce((a, r) => a + r.weight, 0);
  let v = rand() * total;
  for (const key in RARITY_INFO) {
    v -= RARITY_INFO[key as Rarity].weight;
    if (v < 0) return key as Rarity;
  }
  return 'N';
}

/* count連の抽選。owned は呼び出し側の所持(変更しない)。
   10連はSR以上1枠確定(全枠N/Rなら最終枠を SR80% / SSR20% で引き直し) */
export function drawGacha(count: number, owned: ReadonlySet<string>, rand: () => number = Math.random): GachaDraw {
  const rarities: Rarity[] = [];
  for (let i = 0; i < count; i++) rarities.push(rollRarity(rand));
  if (count >= 10 && !rarities.some(r => r === 'SR' || r === 'SSR')) {
    rarities[count - 1] = rand() < 0.8 ? 'SR' : 'SSR';
  }

  const have = new Set(owned);
  const newIds: string[] = [];
  let yoryokuGained = 0;
  const results = rarities.map((rarity): GachaResult => {
    const ids = GACHA_POOL.filter(id => YOKAI[id].rarity === rarity);
    const id = ids[Math.floor(rand() * ids.length)];
    const isNew = !have.has(id);
    let yoryoku = 0;
    if (isNew) {
      have.add(id);
      newIds.push(id);
    } else {
      yoryoku = RARITY_INFO[rarity].yoryoku; // 被りは妖力に変換
      yoryokuGained += yoryoku;
    }
    return { id, rarity, isNew, yoryoku };
  });
  return { results, newIds, yoryokuGained };
}

/* 排出率の公開情報(GET /gacha/rates)。個別妖怪単位の確率も表示(doc 11) */
export function gachaRates() {
  const byRarity = (Object.keys(RARITY_INFO) as Rarity[]).map(r => ({
    rarity: r,
    weight: RARITY_INFO[r].weight,
    yokai: GACHA_POOL.filter(id => YOKAI[id].rarity === r).map(id => ({
      id,
      name: YOKAI[id].name,
      // レアリティ内は均等抽選
      rate: RARITY_INFO[r].weight / 100 / GACHA_POOL.filter(x => YOKAI[x].rarity === r).length,
    })),
  }));
  return {
    rates: byRarity,
    pity: null, // 天井はPhase 3で導入予定(doc 08)
    guarantee: '10連はSR以上1枠確定(全枠N/Rの場合、最終枠をSR 80% / SSR 20%で引き直し)',
    duplicate: '被りは妖力に自動変換(N20 / R50 / SR150 / SSR400)',
  };
}
