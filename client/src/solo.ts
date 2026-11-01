import { BOSS_CHOICES, RARITY_INFO, YOKAI } from '../../shared/data';

export interface SoloStage {
  id: string;
  name: string;
  bossId: string;
  desc: string;
  trait: string;
  enemyRows: (string | null)[][];
  randomized?: boolean;
}

/** 百鬼夜行(連戦)。固定のCPU対戦は trials.ts */
export const HYAKKI_STAGE: SoloStage = {
  id: 'hyakki',
  name: '百鬼夜行',
  bossId: 'nurarihyon',
  desc: '挑戦するたびに対戦相手が変化する百鬼夜行',
  trait: 'ランダム',
  randomized: true,
  enemyRows: [
    ['tengu', null, 'nurarihyon', null, 'raiju'],
    ['kooni', 'nekomata', null, 'kappa', 'ittan'],
  ],
};

/** 目標コスト。上限20だけでなく、空きを残す並びも出す */
const SOLO_BUDGETS = [14, 16, 18, 20] as const;

/** 百鬼夜行のランダム敵編成を生成する。異装は出さない。コストは目標で打ち切る */
export function soloBattleStage(rand: () => number = Math.random): SoloStage {
  const bosses = [...BOSS_CHOICES];
  const bossId = bosses[Math.floor(rand() * bosses.length)];
  const budget = SOLO_BUDGETS[Math.floor(rand() * SOLO_BUDGETS.length)];
  const pieces = Object.values(YOKAI)
    .filter(piece => !piece.boss && !piece.variantOf)
    .map(piece => piece.id);
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  const picked: string[] = [];
  let spent = RARITY_INFO[YOKAI[bossId].rarity].cost;
  for (const id of pieces) {
    if (picked.length >= 9) break;
    const cost = RARITY_INFO[YOKAI[id].rarity].cost;
    if (spent + cost > budget) continue;
    picked.push(id);
    spent += cost;
    if (spent >= budget) break;
  }
  const grid: (string | null)[] = [null, null, null, null, null, null, null, null, null, null];
  grid[2] = bossId;
  const slots = [0, 1, 3, 4, 5, 6, 7, 8, 9];
  for (let i = 0; i < picked.length; i++) grid[slots[i]] = picked[i];
  return {
    ...HYAKKI_STAGE,
    bossId,
    enemyRows: [grid.slice(0, 5), grid.slice(5, 10)],
  };
}
