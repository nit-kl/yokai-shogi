import type { AIDifficulty } from './ai';

export interface SoloStage {
  id: string;
  name: string;
  bossId: string;
  desc: string;
  trait: string;
  enemyRows: (string | null)[][];
}

export const SOLO_STAGES: SoloStage[] = [
  {
    id: 'shuten',
    name: '鬼ヶ島の酒宴',
    bossId: 'shuten',
    desc: '攻守のバランスが取れた酒呑童子の軍勢。',
    trait: '基本',
    enemyRows: [
      ['rokuro', 'nurikabe', 'shuten', 'kappa', 'tengu'],
      ['nue', 'nekomata', null, 'kooni', 'ittan'],
    ],
  },
  {
    id: 'nurarihyon',
    name: '百鬼の堅陣',
    bossId: 'nurarihyon',
    desc: '守りと妨害を重ね、長期戦を狙う百鬼夜行。',
    trait: '守備',
    enemyRows: [
      ['suiko', 'oonyudo', 'nurarihyon', 'kappa', 'nurikabe'],
      ['zashiki', 'tsuchigumo', null, 'sunakake', 'yukionna'],
    ],
  },
  {
    id: 'kyubi',
    name: '妖狐の業火',
    bossId: 'kyubi',
    desc: '玉藻前を従え、高い攻撃力で一気に魂力を削る妖狐の軍勢。',
    trait: '猛攻',
    enemyRows: [
      ['ibaraki', 'kasha', 'kyubi', 'aooni', 'kamaitachi'],
      ['raiju', 'nekomata', 'tamamo', 'nue', 'ittan'],
    ],
  },
];

export const SOLO_DIFFICULTIES: { id: AIDifficulty; name: string; desc: string }[] = [
  { id: 'easy', name: '初級', desc: '読みが浅く、時々隙を見せる' },
  { id: 'normal', name: '中級', desc: '攻守のバランスを考えて指す' },
  { id: 'hard', name: '上級', desc: '反撃や次の脅威を厳しく読む' },
];

export function soloStage(id: string): SoloStage {
  return SOLO_STAGES.find(stage => stage.id === id) || SOLO_STAGES[0];
}
