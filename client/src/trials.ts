/* 試陣: 固定編成のCPU対戦。百鬼夜行と同じルールで、報酬・連勝・ランキングには入らない。
   enemyRows は [奥, 前]、playerRows は [前, 奥]。いずれも5マス、大将は1体。 */

import { YOKAI } from '../../shared/data';

export type TrialKind = 'archetype' | 'verify';

export interface Trial {
  id: string;
  kind: TrialKind;
  name: string;
  nameEn: string;
  watch: string;
  watchEn: string;
  bossId: string;
  /** 敵軍 [奥, 前] */
  enemyRows: (string | null)[][];
  /** 検証陣だけ。自軍 [前, 奥] */
  playerRows?: (string | null)[][];
  /** 検証陣のスキル乱数。同じ手なら会心の出方が揃う */
  seed?: number;
}

/** 検証陣で使う自軍。会心持ちと九尾を含む */
const ALLY: (string | null)[][] = [
  ['ittan', 'kooni', 'nekomata', 'aooni', 'nue'],
  ['tengu', 'kappa', 'kyubi', 'nurikabe', 'rokuro'],
];

const VEIL_ALLY: (string | null)[][] = [
  ['ittan', 'ingyo', 'nekomata', 'aooni', 'nue'],
  ['tengu', 'kappa', 'kyubi', 'nurikabe', 'rokuro'],
];

export const TRIALS: Trial[] = [
  {
    id: 'trial.opening',
    kind: 'archetype',
    name: '序の陣',
    nameEn: 'Opening Line',
    watch: '初期駒に近い並び。集めた直後の手触りの基準',
    watchEn: 'A line close to the starter army. The baseline feel right after you begin collecting',
    bossId: 'shuten',
    enemyRows: [
      ['rokuro', 'nurikabe', 'shuten', 'kappa', 'tengu'],
      ['nue', 'nekomata', 'aooni', 'kooni', 'ittan'],
    ],
  },
  {
    id: 'trial.oni-feast',
    kind: 'archetype',
    name: '鬼の宴',
    nameEn: 'Oni Feast',
    watch: '酒呑童子と茨木童子の共鳴、斬られても戻る腕',
    watchEn: 'Shuten-doji and Ibaraki-doji resonate. The severed arm still returns',
    bossId: 'shuten',
    enemyRows: [
      ['tengu', 'ibaraki', 'shuten', 'aooni', 'raiju'],
      ['kooni', 'kasha', 'daitengu', 'wanyudo', 'nue'],
    ],
  },
  {
    id: 'trial.fox-bond',
    kind: 'archetype',
    name: '妖狐相伝',
    nameEn: 'Fox Bond',
    watch: '九尾と玉藻前。片方が落ちたあとの確定会心と、誘いのテンポ',
    watchEn: 'Nine-Tails and Tamamo-no-Mae. A guaranteed critical after one falls, and the tempo of Charm',
    bossId: 'kyubi',
    enemyRows: [
      ['nekomata', 'tamamo', 'kyubi', 'inugami', 'kamaitachi'],
      ['ittan', 'nue', 'aooni', 'onibi', 'daitengu'],
    ],
  },
  {
    id: 'trial.bulwark',
    kind: 'archetype',
    name: '鉄壁',
    nameEn: 'Iron Wall',
    watch: '軽減と回復が重なる持久戦が、楽しいのか膠着なのか',
    watchEn: 'Damage reduction and healing stacked together. Does the long fight stay interesting?',
    bossId: 'shuten',
    enemyRows: [
      ['kappa', 'nurikabe', 'shuten', 'oonyudo', 'karakasa'],
      ['zashiki', 'suiko', 'chochin', 'kodama', 'umibozu'],
    ],
  },
  {
    id: 'trial.embers',
    kind: 'archetype',
    name: '残火の夜',
    nameEn: 'Night of Embers',
    watch: '残雷・陽光・燐火・罠・送り火が同じ盤に残る感触',
    watchEn: 'Lingering lightning, sunlight, phosphor, pits, and sending-fire on one board',
    bossId: 'nurarihyon',
    enemyRows: [
      ['yatagarasu', 'raiju', 'nurarihyon', 'umibozu', 'shiranui'],
      ['rinka', 'tsurube', 'onibi', 'kasha', 'kamaitachi'],
    ],
  },
  {
    id: 'trial.blast',
    kind: 'verify',
    name: '道連れの前',
    nameEn: 'Blast in Front',
    watch: '前段中央の鬼火。大将で取ると即敗、通常駒で取ると両者消滅になるか',
    watchEn: 'Onibi stands in the front center. A general capturing it loses at once. A normal piece takes both down',
    bossId: 'shuten',
    seed: 12041,
    playerRows: ALLY,
    enemyRows: [
      ['tengu', 'nurikabe', 'shuten', 'kappa', 'rokuro'],
      ['kooni', 'nekomata', 'onibi', 'aooni', 'ittan'],
    ],
  },
  {
    id: 'trial.charm-blast',
    kind: 'verify',
    name: '誘いと爆炎',
    nameEn: 'Charm and Blast',
    watch: '玉藻前が取った駒が味方になるか。その駒や別の駒で鬼火を取ったとき道連れが誰に乗るか',
    watchEn: 'Does Tamamo-no-Mae turn a capture into an ally? When that piece or another captures Onibi, who is destroyed?',
    bossId: 'kyubi',
    seed: 12042,
    playerRows: ALLY,
    enemyRows: [
      ['nekomata', 'nurikabe', 'kyubi', 'kappa', 'tengu'],
      ['ittan', 'tamamo', 'onibi', 'aooni', 'kamaitachi'],
    ],
  },
  {
    id: 'trial.hydra',
    kind: 'verify',
    name: '八岐',
    nameEn: 'Eight Heads',
    watch: '八岐大蛇は2回まで隣へ逃げ、3度目で落ちるか。大将は取れないか',
    watchEn: 'Yamata-no-Orochi escapes to an adjacent square twice and falls on the third capture. It cannot take the general',
    bossId: 'shuten',
    seed: 12043,
    playerRows: ALLY,
    enemyRows: [
      ['kappa', 'nurikabe', 'shuten', 'oonyudo', 'karakasa'],
      ['kooni', 'yamata', 'aooni', 'nekomata', 'ittan'],
    ],
  },
  {
    id: 'trial.veil',
    kind: 'verify',
    name: '隱形',
    nameEn: 'Concealment',
    watch: '自軍の隱神刑部で取った直後に、残留・帰影・影遁を選べるか',
    watchEn: 'After your Inugami Gyobu captures, you can choose to stay, return, or slip aside',
    bossId: 'nurarihyon',
    seed: 12044,
    playerRows: VEIL_ALLY,
    enemyRows: [
      ['kappa', 'nurikabe', 'nurarihyon', 'oonyudo', 'tengu'],
      ['kooni', 'nekomata', 'aooni', 'ittan', 'nue'],
    ],
  },
  {
    id: 'trial.jam',
    kind: 'verify',
    name: '会心封じ',
    nameEn: 'Sealed Criticals',
    watch: '砂かけ婆とすねこすりがいるあいだ、確率会心と満月会心の両方が止まるか',
    watchEn: 'While Sunakake-baba and Sunekosuri are on the board, both chance criticals and full-moon criticals should stop',
    bossId: 'shuten',
    seed: 12045,
    playerRows: ALLY,
    enemyRows: [
      ['sunakake', 'nurikabe', 'shuten', 'kappa', 'sunekosuri'],
      ['kooni', 'nekomata', 'aooni', 'ittan', 'nue'],
    ],
  },
];

export function trialById(id: string): Trial | undefined {
  return TRIALS.find(trial => trial.id === id);
}

export function bossIdIn(rows: readonly (readonly (string | null)[])[]): string | null {
  for (const id of rows.flat()) {
    if (id && YOKAI[id]?.boss) return id;
  }
  return null;
}

/** 並びが対局に出せる形なら null */
export function trialIssue(trial: Trial): string | null {
  if (!trial.id.startsWith('trial.')) return 'id';
  if (!YOKAI[trial.bossId]?.boss) return 'boss';
  const enemy = rowsIssue(trial.enemyRows, trial.bossId);
  if (enemy) return `enemy:${enemy}`;
  if (trial.kind === 'verify') {
    if (!trial.playerRows) return 'player-rows';
    if (trial.seed == null) return 'seed';
    const player = rowsIssue(trial.playerRows, bossIdIn(trial.playerRows) ?? '');
    if (player) return `player:${player}`;
  } else if (trial.playerRows || trial.seed != null) {
    return 'archetype-fixed';
  }
  return null;
}

function rowsIssue(rows: readonly (readonly (string | null)[])[], bossId: string): string | null {
  if (rows.length !== 2 || rows.some(row => row.length !== 5)) return 'shape';
  const ids = rows.flat().filter((id): id is string => !!id);
  if (ids.length !== 10) return 'empty';
  if (new Set(ids).size !== ids.length) return 'duplicate';
  if (ids.some(id => !YOKAI[id])) return 'unknown';
  const bosses = ids.filter(id => YOKAI[id].boss);
  if (bosses.length !== 1 || bosses[0] !== bossId) return 'boss';
  return null;
}

/** 検証陣のスキル乱数。対局開始のたびに同じ seed から作り直す */
export function makeTrialRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
