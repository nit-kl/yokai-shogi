import type { AIDifficulty } from './ai';
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
  {
    id: 'hyakki',
    name: '百鬼夜行',
    bossId: 'nurarihyon',
    desc: '挑戦するたびに大将と軍勢が変わる、終わりなき妖怪たちの行軍。',
    trait: 'ランダム',
    randomized: true,
    enemyRows: [
      ['ibaraki', 'daitengu', 'nurarihyon', 'suiko', 'raiju'],
      ['onibi', 'yukionna', 'tamamo', 'tsuchigumo', 'zashiki'],
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

export function soloBattleStage(id: string, rand: () => number = Math.random): SoloStage {
  const stage = soloStage(id);
  if (!stage.randomized) return { ...stage, enemyRows: stage.enemyRows.map(row => [...row]) };

  const bosses = [...BOSS_CHOICES];
  const bossId = bosses[Math.floor(rand() * bosses.length)];
  const pieces = Object.values(YOKAI).filter(piece => piece.type !== 'boss').map(piece => piece.id);
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  return {
    ...stage,
    bossId,
    enemyRows: [
      [pieces[0], pieces[1], bossId, pieces[2], pieces[3]],
      [pieces[4], pieces[5], pieces[6], pieces[7], pieces[8]],
    ],
  };
}

const SOLO_PROGRESS_KEY = 'yokaiShogi.soloProgress.v1';
type SoloProgress = Record<string, number>;

function progressKey(stageId: string, difficulty: AIDifficulty): string {
  return `${stageId}:${difficulty}`;
}

function readProgress(): SoloProgress {
  try {
    const raw = localStorage.getItem(SOLO_PROGRESS_KEY);
    return raw ? JSON.parse(raw) as SoloProgress : {};
  } catch {
    return {};
  }
}

export function soloClearCount(stageId: string, difficulty: AIDifficulty): number {
  return readProgress()[progressKey(stageId, difficulty)] || 0;
}

export function recordSoloClear(stageId: string, difficulty: AIDifficulty): number {
  const progress = readProgress();
  const key = progressKey(stageId, difficulty);
  progress[key] = (progress[key] || 0) + 1;
  try { localStorage.setItem(SOLO_PROGRESS_KEY, JSON.stringify(progress)); } catch { /* memory-only environments */ }
  return progress[key];
}
