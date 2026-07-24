import { BOSS_CHOICES, YOKAI } from '../../shared/data';

export interface SoloStage {
  id: string;
  name: string;
  bossId: string;
  desc: string;
  trait: string;
  enemyRows: (string | null)[][];
  randomized?: boolean;
}

/** ソロ対戦は百鬼夜行(連戦)のみ */
export const HYAKKI_STAGE: SoloStage = {
  id: 'hyakki',
  name: '百鬼夜行',
  bossId: 'nurarihyon',
  desc: '挑戦するたびに対戦相手が変化する百鬼夜行',
  trait: 'ランダム',
  randomized: true,
  enemyRows: [
    ['ibaraki', 'daitengu', 'nurarihyon', 'suiko', 'raiju'],
    ['onibi', 'yukionna', 'tamamo', 'tsuchigumo', 'zashiki'],
  ],
};

/** 百鬼夜行のランダム敵編成を生成する */
export function soloBattleStage(rand: () => number = Math.random): SoloStage {
  const bosses = [...BOSS_CHOICES];
  const bossId = bosses[Math.floor(rand() * bosses.length)];
  const pieces = Object.values(YOKAI).filter(piece => piece.type !== 'boss').map(piece => piece.id);
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  return {
    ...HYAKKI_STAGE,
    bossId,
    enemyRows: [
      [pieces[0], pieces[1], bossId, pieces[2], pieces[3]],
      [pieces[4], pieces[5], pieces[6], pieces[7], pieces[8]],
    ],
  };
}
