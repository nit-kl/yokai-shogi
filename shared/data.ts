/* ============================================================
   妖怪将棋 - 駒データ定義(shared: クライアント/サーバー共用)
   移動はすべて「自分視点」(前 = dy:-1)。敵側は自動で反転される。
   ※ このモジュールは Web標準APIのみ・I/Oなし を厳守する(doc 02)
   ============================================================ */

export type Side = 'p' | 'e';
export type YokaiType =
  | 'attack' | 'defense' | 'ambush' | 'debuff'
  | 'support' | 'transform' | 'trap' | 'boss';
export type Rarity = 'N' | 'R' | 'SR' | 'SSR';

export type XY = readonly [number, number];

export interface MoveSet {
  steps?: readonly XY[];
  jumps?: readonly XY[];
  slides?: readonly XY[];
}

export type Skill =
  | { kind: 'crit'; name: string; desc: string; chance: number; mult: number }
  | { kind: 'zone'; name: string; desc: string; bonus: number }
  | { kind: 'rush'; name: string; desc: string; minDist: number; mult: number }
  | { kind: 'aura'; name: string; desc: string; reduce: number }
  | { kind: 'weaken'; name: string; desc: string; reduce: number }
  | { kind: 'jam'; name: string; desc: string }
  | { kind: 'chill'; name: string; desc: string }
  | { kind: 'heal'; name: string; desc: string; amount: number }
  | { kind: 'counter'; name: string; desc: string; dmg: number }
  | { kind: 'decoy'; name: string; desc: string }
  | { kind: 'explode'; name: string; desc: string }
  /* SSR専用スキル(会心の「運任せ」を「狙って出す」に置き換える: doc 08) */
  | { kind: 'moon'; name: string; desc: string; mult: number }                // 満月の手番は会心確定(それ以外は不発)
  | { kind: 'heads'; name: string; desc: string; step: number; max: number }  // この駒の撃破数だけ与ダメ成長
  | { kind: 'legion'; name: string; desc: string; per: number; cap: number } // 盤上の味方数で与ダメ加算
  /* 食い逃げ・残火 */
  | { kind: 'retreat'; name: string; desc: string }                           // 取ったあと自動で元マスへ戻る
  | { kind: 'phase'; name: string; desc: string }                             // 取ったあと隣接空きへ退避(任意)
  | { kind: 'ember'; name: string; desc: string; mode: 'atk' | 'heal' | 'trap'; value: number; span: number }
  | { kind: 'spawn'; name: string; desc: string; piece: string }              // 取ったあと周囲の空きへ駒を1体置く
  | { kind: 'veil'; name: string; desc: string }                              // SSR: 残留/帰影/影遁を選択
  | { kind: 'charm'; name: string; desc: string }                             // 取った駒を味方にして元マスへ戻る
  | { kind: 'recall'; name: string; desc: string }                            // 取られても自軍の持ち駒に戻る
  | { kind: 'hydra'; name: string; desc: string; extra: number }              // 取られても隣接へ逃げる(extra回)
  | { kind: 'famine'; name: string; desc: string; mult: number; heal: number } // 飢餓の夜に与ダメ倍率+回復
  | { kind: 'dual'; name: string; desc: string; mult: number };               // 取ったあと隣接の別敵を追撃

export interface YokaiDef {
  id: string;
  name: string;
  type: YokaiType;
  atk: number;
  rarity: Rarity;
  gachaOnly?: boolean;
  limited?: boolean;  // ガチャ排出なし(土曜対戦会・百鬼ランキング1位など: match-hour / hyakki)
  img: string;    // フルサイズ(512px WebP)
  imgSm: string;  // 小サイズ(チップ・一覧用 WebP)
  moveText: string;
  skill: Skill;
  moves: MoveSet;
  promoted?: MoveSet;
  dropLimit?: number; // 相手陣最奥 n 段には打てない
  variantOf?: string;
  summonTitle?: string;
  summonColors?: readonly [string, string, string];
  awakenName?: string; // SSRの覚醒必殺技名(覚醒ゲージ: shared/game.ts)
}

export const COLS = 5;
export const ROWS = 6;
export const MAX_HP = 3000;
export const ZONE_DEPTH = 2; // 敵陣の深さ(成りゾーン)

const STEPS_ALL8: readonly XY[] = [[0,-1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[1,1],[-1,1]];
const STEPS_GOLD: readonly XY[] = [[0,-1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1]];
const STEPS_DIAG4: readonly XY[] = [[1,-1],[-1,-1],[1,1],[-1,1]];
const STEPS_ORTHO4: readonly XY[] = [[0,-1],[1,0],[-1,0],[0,1]];

export const TYPE_INFO: Record<YokaiType, { label: string; cls: string; color: string }> = {
  attack:    { label: '攻', cls: 't-attack',    color: '#ff6b4a' },
  defense:   { label: '守', cls: 't-defense',   color: '#4aa8ff' },
  ambush:    { label: '罠', cls: 't-ambush',    color: '#b06bff' },
  debuff:    { label: '妨', cls: 't-debuff',    color: '#6bd6e8' },
  support:   { label: '援', cls: 't-support',   color: '#7cf2a4' },
  transform: { label: '化', cls: 't-transform', color: '#d8a05a' },
  trap:      { label: '爆', cls: 't-trap',      color: '#ff9a3c' },
  boss:      { label: '大将', cls: 't-boss',    color: '#ffc83d' },
};

/* レアリティ: weight=ガチャ排出比, yoryoku=被り時の妖力変換量 */
export const RARITY_INFO: Record<Rarity, { label: string; cls: string; color: string; weight: number; yoryoku: number }> = {
  N:   { label: 'N',   cls: 'r-n',   color: '#9aa0b5', weight: 40, yoryoku: 20 },
  R:   { label: 'R',   cls: 'r-r',   color: '#58b6ff', weight: 40, yoryoku: 50 },
  SR:  { label: 'SR',  cls: 'r-sr',  color: '#c88aff', weight: 16, yoryoku: 150 },
  SSR: { label: 'SSR', cls: 'r-ssr', color: '#ffd24a', weight: 4,  yoryoku: 400 },
};

const img = (name: string) => `assets/pieces/${name}.webp`;
const imgSm = (name: string) => `assets/pieces/sm/${name}.webp`;

export const YOKAI: Record<string, YokaiDef> = {
  /* ---------- 大将 ---------- */
  kyubi: {
    id: 'kyubi', name: '九尾の狐', type: 'boss', atk: 400, rarity: 'SSR',
    img: img('kyubi'), imgSm: imgSm('kyubi'),
    moveText: '全方向に1マス',
    skill: { kind: 'moon', name: '妖狐の業火', desc: '満月の夜に駒を取ると、狐火が燃え上がり、必ずダメージ2倍(月齢は対局ステータスで確認)', mult: 2 },
    moves: { steps: STEPS_ALL8 },
    awakenName: '九尾開眼',
  },
  shuten: {
    id: 'shuten', name: '酒呑童子', type: 'boss', atk: 400, rarity: 'SSR',
    img: img('shuten'), imgSm: imgSm('shuten'),
    moveText: '全方向に1マス',
    skill: { kind: 'crit', name: '鬼神の剛腕', desc: '駒を取った時、20%で剛腕が唸りダメージ2倍', chance: 0.2, mult: 2 },
    moves: { steps: STEPS_ALL8 },
    awakenName: '鬼神羅刹',
  },

  /* ---------- 攻タイプ ---------- */
  kooni: {
    id: 'kooni', name: '小鬼', type: 'attack', atk: 150, rarity: 'N',
    img: img('kooni'), imgSm: imgSm('kooni'),
    moveText: '前に1マス(成:金の動き)',
    skill: { kind: 'crit', name: '鬼火', desc: '駒を取った時、30%で鬼火が爆ぜダメージ1.5倍', chance: 0.3, mult: 1.5 },
    moves: { steps: [[0,-1]] },
    promoted: { steps: STEPS_GOLD },
    dropLimit: 1, // 最奥1段には打てない
  },
  nekomata: {
    id: 'nekomata', name: '猫又', type: 'attack', atk: 200, rarity: 'R',
    img: img('nekomata'), imgSm: imgSm('nekomata'),
    moveText: '斜めに1マス(成:斜め+前後)',
    skill: { kind: 'zone', name: '化け猫の祟り', desc: '敵陣で駒を取るとダメージ+120', bonus: 120 },
    moves: { steps: STEPS_DIAG4 },
    promoted: { steps: [...STEPS_DIAG4, [0,-1], [0,1]] },
  },
  ittan: {
    id: 'ittan', name: '一反木綿', type: 'attack', atk: 250, rarity: 'R',
    img: img('ittan'), imgSm: imgSm('ittan'),
    moveText: '前にどこまでも(成:+横・後ろ1マス)',
    skill: { kind: 'rush', name: '風斬り', desc: '3マス以上移動して駒を取るとダメージ2倍', minDist: 3, mult: 2 },
    moves: { slides: [[0,-1]] },
    promoted: { slides: [[0,-1]], steps: [[1,0],[-1,0],[0,1]] },
    dropLimit: 1,
  },
  nue: {
    id: 'nue', name: '鵺', type: 'attack', atk: 300, rarity: 'SR',
    img: img('nue'), imgSm: imgSm('nue'),
    moveText: '前へ変則跳び・駒を飛び越す(成:+斜め1マス)',
    skill: { kind: 'crit', name: '混沌の咆哮', desc: '駒を取った時、25%で雷鳴が轟きダメージ1.8倍', chance: 0.25, mult: 1.8 },
    moves: { jumps: [[1,-2],[-1,-2]] },
    promoted: { jumps: [[1,-2],[-1,-2]], steps: STEPS_DIAG4 },
    dropLimit: 2, // 最奥2段には打てない
  },

  /* ---------- 守タイプ ---------- */
  kappa: {
    id: 'kappa', name: '河童', type: 'defense', atk: 120, rarity: 'N',
    img: img('kappa'), imgSm: imgSm('kappa'),
    moveText: '縦横に1マス(成:全方向1マス)',
    skill: { kind: 'aura', name: '水神の加護', desc: '盤上にいる間、自軍の受けるダメージ-15%', reduce: 0.15 },
    moves: { steps: STEPS_ORTHO4 },
    promoted: { steps: STEPS_ALL8 },
  },
  nurikabe: {
    id: 'nurikabe', name: 'ぬりかべ', type: 'defense', atk: 100, rarity: 'R',
    img: img('nurikabe'), imgSm: imgSm('nurikabe'),
    moveText: '前と横に1マス(成:縦横+斜め前)',
    skill: { kind: 'aura', name: '鉄壁', desc: '盤上にいる間、自軍の受けるダメージ-20%', reduce: 0.2 },
    moves: { steps: [[0,-1],[1,0],[-1,0]] },
    promoted: { steps: [[0,-1],[0,1],[1,0],[-1,0],[1,-1],[-1,-1]] },
  },

  /* ---------- 罠タイプ ---------- */
  tengu: {
    id: 'tengu', name: '天狗', type: 'ambush', atk: 220, rarity: 'SR',
    img: img('tengu'), imgSm: imgSm('tengu'),
    moveText: '斜めに1〜2マス飛行・駒を飛び越す(成:+前後1マス)',
    skill: { kind: 'counter', name: '神隠しの返し風', desc: '取られた時、取った相手に300の反撃ダメージ!', dmg: 300 },
    moves: { jumps: [[1,-1],[2,-2],[-1,-1],[-2,-2],[1,1],[2,2],[-1,1],[-2,2]] },
    promoted: { jumps: [[1,-1],[2,-2],[-1,-1],[-2,-2],[1,1],[2,2],[-1,1],[-2,2]], steps: [[0,-1],[0,1]] },
  },
  rokuro: {
    id: 'rokuro', name: 'ろくろ首', type: 'ambush', atk: 180, rarity: 'R',
    img: img('rokuro'), imgSm: imgSm('rokuro'),
    moveText: '横にどこまでも+前1マス(成:+後ろ・斜め前)',
    skill: { kind: 'counter', name: '怨念の絞めつけ', desc: '取られた時、取った相手に250の反撃ダメージ!', dmg: 250 },
    moves: { slides: [[1,0],[-1,0]], steps: [[0,-1]] },
    promoted: { slides: [[1,0],[-1,0]], steps: [[0,-1],[0,1],[1,-1],[-1,-1]] },
  },

  /* ==================== ガチャ限定妖怪 ==================== */
  aooni: {
    id: 'aooni', name: '青鬼', type: 'attack', atk: 190, rarity: 'R', gachaOnly: true,
    img: img('aooni'), imgSm: imgSm('aooni'),
    moveText: '前と斜め前に1マス(成:金の動き)',
    skill: { kind: 'crit', name: '青碧の剛撃', desc: '駒を取った時、25%で剛撃が走りダメージ1.6倍', chance: 0.25, mult: 1.6 },
    moves: { steps: [[0,-1],[1,-1],[-1,-1]] },
    promoted: { steps: STEPS_GOLD },
    dropLimit: 1,
  },
  kasha: {
    id: 'kasha', name: '火車', type: 'attack', atk: 230, rarity: 'R', gachaOnly: true,
    img: img('kasha'), imgSm: imgSm('kasha'),
    moveText: '斜めに1マス(成:斜め+前後)',
    skill: { kind: 'zone', name: '獄炎の車輪', desc: '敵陣で駒を取ると炎車の轟きでダメージ+150', bonus: 150 },
    moves: { steps: STEPS_DIAG4 },
    promoted: { steps: [...STEPS_DIAG4, [0,-1], [0,1]] },
  },
  kamaitachi: {
    id: 'kamaitachi', name: '鎌鼬', type: 'attack', atk: 230, rarity: 'R', gachaOnly: true,
    img: img('kamaitachi'), imgSm: imgSm('kamaitachi'),
    moveText: '前にどこまでも(成:+横・後ろ1マス)',
    skill: { kind: 'rush', name: '真空斬り', desc: '2マス以上移動して駒を取るとダメージ1.8倍', minDist: 2, mult: 1.8 },
    moves: { slides: [[0,-1]] },
    promoted: { slides: [[0,-1]], steps: [[1,0],[-1,0],[0,1]] },
    dropLimit: 1,
  },
  hitouban: {
    id: 'hitouban', name: '飛頭蛮', type: 'ambush', atk: 200, rarity: 'R', gachaOnly: true,
    img: img('hitouban'), imgSm: imgSm('hitouban'),
    moveText: '横にどこまでも+前1マス(成:+後ろ・斜め前)',
    skill: { kind: 'counter', name: '宙飛ぶ怨嗟', desc: '取られた時、飛んだ首が怨嗟を放ち、取った相手に300の反撃ダメージ!', dmg: 300 },
    moves: { slides: [[1,0],[-1,0]], steps: [[0,-1]] },
    promoted: { slides: [[1,0],[-1,0]], steps: [[0,-1],[0,1],[1,-1],[-1,-1]] },
  },
  suiko: {
    id: 'suiko', name: '水虎', type: 'defense', atk: 180, rarity: 'SR', gachaOnly: true,
    img: img('suiko'), imgSm: imgSm('suiko'),
    moveText: '縦横に1マス(成:全方向1マス)',
    skill: { kind: 'aura', name: '大水の帳', desc: '盤上にいる間、滔々たる水壁で自軍の受けるダメージ-22%', reduce: 0.22 },
    moves: { steps: STEPS_ORTHO4 },
    promoted: { steps: STEPS_ALL8 },
  },
  oonyudo: {
    id: 'oonyudo', name: '大入道', type: 'defense', atk: 140, rarity: 'SR', gachaOnly: true,
    img: img('oonyudo'), imgSm: imgSm('oonyudo'),
    moveText: '前と横に1マス(成:縦横+斜め前)',
    skill: { kind: 'aura', name: '虚空の威圧', desc: '盤上にいる間、虚空の結界で自軍の受けるダメージ-25%', reduce: 0.25 },
    moves: { steps: [[0,-1],[1,0],[-1,0]] },
    promoted: { steps: [[0,-1],[0,1],[1,0],[-1,0],[1,-1],[-1,-1]] },
  },
  daitengu: {
    id: 'daitengu', name: '大天狗', type: 'ambush', atk: 260, rarity: 'SR', gachaOnly: true,
    img: img('daitengu'), imgSm: imgSm('daitengu'),
    moveText: '斜めに1〜2マス飛行・駒を飛び越す(成:+前後1マス)',
    skill: { kind: 'counter', name: '天狗颪', desc: '取られた時、羽団扇の烈風が吹き荒れ、取った相手に400の反撃ダメージ!', dmg: 400 },
    moves: { jumps: [[1,-1],[2,-2],[-1,-1],[-2,-2],[1,1],[2,2],[-1,1],[-2,2]] },
    promoted: { jumps: [[1,-1],[2,-2],[-1,-1],[-2,-2],[1,1],[2,2],[-1,1],[-2,2]], steps: [[0,-1],[0,1]] },
  },
  raiju: {
    id: 'raiju', name: '雷獣', type: 'attack', atk: 330, rarity: 'SR', gachaOnly: true,
    img: img('raiju'), imgSm: imgSm('raiju'),
    moveText: '前へ変則跳び・駒を飛び越す(成:+斜め1マス)',
    skill: { kind: 'crit', name: '迅雷の牙', desc: '駒を取った時、30%で雷光が走りダメージ1.8倍', chance: 0.3, mult: 1.8 },
    moves: { jumps: [[1,-2],[-1,-2]] },
    promoted: { jumps: [[1,-2],[-1,-2]], steps: STEPS_DIAG4 },
    dropLimit: 2,
  },
  ibaraki: {
    id: 'ibaraki', name: '茨木童子', type: 'attack', atk: 320, rarity: 'SSR', gachaOnly: true,
    img: img('ibaraki'), imgSm: imgSm('ibaraki'),
    moveText: '金の動き(成:全方向1マス)',
    skill: { kind: 'recall', name: '腕の回帰', desc: '取られても相手の持ち駒にならず、自分の持ち駒に戻る。何度斬られても羅生門へ帰り来る' },
    moves: { steps: STEPS_GOLD },
    promoted: { steps: STEPS_ALL8 },
    awakenName: '羅生門の腕',
  },
  tamamo: {
    id: 'tamamo', name: '玉藻前', type: 'attack', atk: 450, rarity: 'SSR', gachaOnly: true,
    img: img('tamamo'), imgSm: imgSm('tamamo'),
    moveText: '全方向に1マス',
    skill: { kind: 'charm', name: '傾国の誘い', desc: 'この駒で取ったあと元のマスへ戻り、取った駒はその場で味方になる(持ち駒を経由しない)' },
    moves: { steps: STEPS_ALL8 },
    awakenName: '傾国乱世',
  },

  /* ---------- 妨タイプ(敵軍を弱体化) ---------- */
  sunakake: {
    id: 'sunakake', name: '砂かけ婆', type: 'debuff', atk: 120, rarity: 'N', gachaOnly: true,
    img: img('sunakake'), imgSm: imgSm('sunakake'),
    moveText: '前と斜め前に1マス(成:金の動き)',
    skill: { kind: 'jam', name: '目つぶしの砂', desc: '盤上にいる間、敵の会心系スキル(確率会心・満月会心)を封じる' },
    moves: { steps: [[0,-1],[1,-1],[-1,-1]] },
    promoted: { steps: STEPS_GOLD },
  },
  tsuchigumo: {
    id: 'tsuchigumo', name: '土蜘蛛', type: 'debuff', atk: 180, rarity: 'R', gachaOnly: true,
    img: img('tsuchigumo'), imgSm: imgSm('tsuchigumo'),
    moveText: '斜めに1マス+前へ2マス跳び(成:+縦横1マス)',
    skill: { kind: 'weaken', name: '蝕む毒糸', desc: '盤上にいる間、敵軍の与えるダメージ-12%', reduce: 0.12 },
    moves: { steps: STEPS_DIAG4, jumps: [[0,-2]] },
    promoted: { steps: [...STEPS_DIAG4, ...STEPS_ORTHO4], jumps: [[0,-2]] },
  },
  yukionna: {
    id: 'yukionna', name: '雪女', type: 'debuff', atk: 220, rarity: 'SR', gachaOnly: true,
    img: img('yukionna'), imgSm: imgSm('yukionna'),
    moveText: '斜め前と前後に1マス(成:全方向1マス)',
    skill: { kind: 'chill', name: '凍てつく吐息', desc: '盤上にいる間、敵のコンボ倍率を無効化する' },
    moves: { steps: [[1,-1],[-1,-1],[0,-1],[0,1]] },
    promoted: { steps: STEPS_ALL8 },
  },

  /* ---------- 援タイプ(自軍を支援) ---------- */
  zashiki: {
    id: 'zashiki', name: '座敷童子', type: 'support', atk: 130, rarity: 'SR', gachaOnly: true,
    img: img('zashiki'), imgSm: imgSm('zashiki'),
    moveText: '縦横に1マス(成:全方向1マス)',
    skill: { kind: 'heal', name: '福招き', desc: '駒を取った時、自軍の魂力を250回復する', amount: 250 },
    moves: { steps: STEPS_ORTHO4 },
    promoted: { steps: STEPS_ALL8 },
  },

  /* ---------- 化タイプ(化かして身を守る) ---------- */
  tanuki: {
    id: 'tanuki', name: '化け狸', type: 'transform', atk: 160, rarity: 'R', gachaOnly: true,
    img: img('tanuki'), imgSm: imgSm('tanuki'),
    moveText: '前3方向と後ろに1マス(成:金の動き)',
    skill: { kind: 'decoy', name: '葉隠れの術', desc: '取られた時、正体は葉っぱだった! ダメージ半減&相手の持ち駒にならない' },
    moves: { steps: [[0,-1],[1,-1],[-1,-1],[0,1]] },
    promoted: { steps: STEPS_GOLD },
  },

  /* ---------- 爆タイプ(取ると爆発) ---------- */
  onibi: {
    id: 'onibi', name: '鬼火', type: 'trap', atk: 100, rarity: 'SR', gachaOnly: true,
    img: img('onibi'), imgSm: imgSm('onibi'),
    moveText: '斜めに1マス(成:+前後1マス)',
    skill: { kind: 'explode', name: '道連れの爆炎', desc: '取られた時、取った駒を道連れにして消滅させる(大将で取ると即敗北!)' },
    moves: { steps: STEPS_DIAG4 },
    promoted: { steps: [...STEPS_DIAG4, [0,-1], [0,1]] },
  },

  /* ---------- ガチャ限定・新大将 ---------- */
  nurarihyon: {
    id: 'nurarihyon', name: 'ぬらりひょん', type: 'boss', atk: 430, rarity: 'SSR', gachaOnly: true,
    img: img('nurarihyon'), imgSm: imgSm('nurarihyon'),
    moveText: '全方向に1マス',
    skill: { kind: 'legion', name: '百鬼夜行の総帥', desc: '盤上の味方1体につき与えるダメージ+5%(最大+40%)。軍勢を率いるほど強くなる', per: 0.05, cap: 0.4 },
    moves: { steps: STEPS_ALL8 },
    awakenName: '百鬼夜行・真',
  },

  /* ---------- 新規追加妖怪 ---------- */
  karakasa: {
    id: 'karakasa', name: 'からかさ小僧', type: 'defense', atk: 110, rarity: 'N', gachaOnly: true,
    img: img('karakasa'), imgSm: imgSm('karakasa'),
    moveText: '前と斜め後ろに1マス(成:全方向1マス)',
    skill: { kind: 'aura', name: '唐傘の守り', desc: '盤上にいる間、唐傘の守りで自軍の受けるダメージ-12%', reduce: 0.12 },
    moves: { steps: [[0,-1], [1,1], [-1,1]] },
    promoted: { steps: STEPS_ALL8 },
  },
  chochin: {
    id: 'chochin', name: '提灯お化け', type: 'support', atk: 150, rarity: 'R', gachaOnly: true,
    img: img('chochin'), imgSm: imgSm('chochin'),
    moveText: '縦横に1マス(成:全方向1マス)',
    skill: { kind: 'heal', name: '提灯の灯火', desc: '駒を取った時、自軍の魂力を200回復する', amount: 200 },
    moves: { steps: STEPS_ORTHO4 },
    promoted: { steps: STEPS_ALL8 },
  },
  baku: {
    id: 'baku', name: '獏', type: 'debuff', atk: 200, rarity: 'SR', gachaOnly: true,
    img: img('baku'), imgSm: imgSm('baku'),
    moveText: '前後1マス、横にどこまでも(成:縦横+斜め前)',
    skill: { kind: 'weaken', name: '悪夢喰らい', desc: '盤上にいる間、悪夢喰らいの霧で敵軍の与えるダメージ-15%', reduce: 0.15 },
    moves: { steps: [[0,-1], [0,1]], slides: [[1,0], [-1,0]] },
    promoted: { steps: [[0,-1],[0,1],[1,0],[-1,0],[1,-1],[-1,-1]] },
  },
  yamata: {
    id: 'yamata', name: '八岐大蛇', type: 'attack', atk: 420, rarity: 'SSR', gachaOnly: true,
    img: img('yamata'), imgSm: imgSm('yamata'),
    moveText: '前3方向と横2方向、後ろに1マス',
    skill: { kind: 'hydra', name: '八岐の首', desc: '取られても隣接の空きマスへ逃げ、首が1つ減る。2回まで逃げ、3度目で討ち取られる', extra: 2 },
    moves: { steps: [[0,-1], [1,-1], [-1,-1], [1,0], [-1,0], [0,1]] },
    awakenName: '八岐咆哮',
  },

  /* ---------- ストック画像ラインナップ ---------- */
  bakezouri: {
    id: 'bakezouri', name: '化け草履', type: 'transform', atk: 100, rarity: 'N', gachaOnly: true,
    img: img('bakezouri'), imgSm: imgSm('bakezouri'),
    moveText: '前と斜め前に1マス(成:金の動き)',
    skill: { kind: 'decoy', name: '空蝉の草履', desc: '取られた時、正体はただの草履だった! ダメージ半減&相手の持ち駒にならない' },
    moves: { steps: [[0,-1],[1,-1],[-1,-1]] },
    promoted: { steps: STEPS_GOLD },
    dropLimit: 1,
  },
  sunekosuri: {
    id: 'sunekosuri', name: 'すねこすり', type: 'debuff', atk: 115, rarity: 'N', gachaOnly: true,
    img: img('sunekosuri'), imgSm: imgSm('sunekosuri'),
    moveText: '前と横に1マス(成:縦横+斜め前)',
    skill: { kind: 'jam', name: '脛擦りの呪い', desc: '盤上にいる間、敵の会心系スキル(確率会心・満月会心)を封じる' },
    moves: { steps: [[0,-1],[1,0],[-1,0]] },
    promoted: { steps: [[0,-1],[0,1],[1,0],[-1,0],[1,-1],[-1,-1]] },
  },
  kodama: {
    id: 'kodama', name: '木霊', type: 'support', atk: 105, rarity: 'N', gachaOnly: true,
    img: img('kodama'), imgSm: imgSm('kodama'),
    moveText: '縦横に1マス(成:全方向1マス)',
    skill: { kind: 'heal', name: '木魂の息吹', desc: '駒を取った時、自軍の魂力を150回復する', amount: 150 },
    moves: { steps: STEPS_ORTHO4 },
    promoted: { steps: STEPS_ALL8 },
  },
  nopperabo: {
    id: 'nopperabo', name: 'のっぺらぼう', type: 'transform', atk: 165, rarity: 'R', gachaOnly: true,
    img: img('nopperabo'), imgSm: imgSm('nopperabo'),
    moveText: '前3方向と後ろに1マス(成:金の動き)',
    skill: { kind: 'decoy', name: '無貌の化かし', desc: '取られた時、顔のない幻影だった! ダメージ半減&相手の持ち駒にならない' },
    moves: { steps: [[0,-1],[1,-1],[-1,-1],[0,1]] },
    promoted: { steps: STEPS_GOLD },
  },
  tenome: {
    id: 'tenome', name: '手の目', type: 'ambush', atk: 195, rarity: 'R', gachaOnly: true,
    img: img('tenome'), imgSm: imgSm('tenome'),
    moveText: '横にどこまでも+前1マス(成:+後ろ・斜め前)',
    skill: { kind: 'counter', name: '手の目の睨み', desc: '取られた時、掌の目が睨み返し、取った相手に280の反撃ダメージ!', dmg: 280 },
    moves: { slides: [[1,0],[-1,0]], steps: [[0,-1]] },
    promoted: { slides: [[1,0],[-1,0]], steps: [[0,-1],[0,1],[1,-1],[-1,-1]] },
  },
  inugami: {
    id: 'inugami', name: '犬神', type: 'attack', atk: 215, rarity: 'R', gachaOnly: true,
    img: img('inugami'), imgSm: imgSm('inugami'),
    moveText: '斜めに1マス(成:斜め+前後)',
    skill: { kind: 'zone', name: '憑き犬の呪い', desc: '敵陣で駒を取ると憑き犬の呪いでダメージ+140', bonus: 140 },
    moves: { steps: STEPS_DIAG4 },
    promoted: { steps: [...STEPS_DIAG4, [0,-1], [0,1]] },
  },
  aoandon: {
    id: 'aoandon', name: '青行燈', type: 'support', atk: 155, rarity: 'SR', gachaOnly: true,
    img: img('aoandon'), imgSm: imgSm('aoandon'),
    moveText: '縦横に1マス(成:全方向1マス)',
    skill: { kind: 'heal', name: '青炎の灯', desc: '駒を取った時、自軍の魂力を280回復する', amount: 280 },
    moves: { steps: STEPS_ORTHO4 },
    promoted: { steps: STEPS_ALL8 },
  },
  umibozu: {
    id: 'umibozu', name: '海坊主', type: 'defense', atk: 155, rarity: 'SR', gachaOnly: true,
    img: img('umibozu'), imgSm: imgSm('umibozu'),
    moveText: '縦横に1マス(成:全方向1マス)',
    skill: { kind: 'aura', name: '墨海の帳', desc: '盤上にいる間、墨のような海で自軍の受けるダメージ-23%', reduce: 0.23 },
    moves: { steps: STEPS_ORTHO4 },
    promoted: { steps: STEPS_ALL8 },
  },
  wanyudo: {
    id: 'wanyudo', name: '輪入道', type: 'attack', atk: 275, rarity: 'SR', gachaOnly: true,
    img: img('wanyudo'), imgSm: imgSm('wanyudo'),
    moveText: '前にどこまでも(成:+横・後ろ1マス)',
    skill: { kind: 'rush', name: '業火の車輪', desc: '2マス以上移動して駒を取るとダメージ2倍', minDist: 2, mult: 2 },
    moves: { slides: [[0,-1]] },
    promoted: { slides: [[0,-1]], steps: [[1,0],[-1,0],[0,1]] },
    dropLimit: 1,
  },
  yatagarasu: {
    id: 'yatagarasu', name: '八咫烏', type: 'attack', atk: 305, rarity: 'SR', gachaOnly: true,
    img: img('yatagarasu'), imgSm: imgSm('yatagarasu'),
    moveText: '前へ変則跳び・駒を飛び越す(成:+斜め1マス)',
    skill: { kind: 'crit', name: '三本足の導き', desc: '駒を取った時、28%で神鳥の導きが宿りダメージ1.9倍', chance: 0.28, mult: 1.9 },
    moves: { jumps: [[1,-2],[-1,-2]] },
    promoted: { jumps: [[1,-2],[-1,-2]], steps: STEPS_DIAG4 },
    dropLimit: 2,
  },
  oomyukade: {
    id: 'oomyukade', name: '大百足', type: 'debuff', atk: 205, rarity: 'SR', gachaOnly: true,
    img: img('oomyukade'), imgSm: imgSm('oomyukade'),
    moveText: '斜めに1マス+前へ2マス跳び(成:+縦横1マス)',
    skill: { kind: 'weaken', name: '百足の毒', desc: '盤上にいる間、百足の毒で敵軍の与えるダメージ-14%', reduce: 0.14 },
    moves: { steps: STEPS_DIAG4, jumps: [[0,-2]] },
    promoted: { steps: [...STEPS_DIAG4, ...STEPS_ORTHO4], jumps: [[0,-2]] },
  },
  gashadokuro: {
    id: 'gashadokuro', name: 'がしゃどくろ', type: 'attack', atk: 410, rarity: 'SSR', gachaOnly: true,
    img: img('gashadokuro'), imgSm: imgSm('gashadokuro'),
    moveText: '前3方向と横2方向、後ろに1マス',
    skill: { kind: 'famine', name: '餓鬼の骨', desc: '飢餓の夜のあいだ、駒を取るとダメージ1.8倍かつ自軍の魂力を250回復する', mult: 1.8, heal: 250 },
    moves: { steps: [[0,-1], [1,-1], [-1,-1], [1,0], [-1,0], [0,1]] },
    awakenName: '餓鬼髑髏',
  },
  sukuna: {
    id: 'sukuna', name: '宿儺', type: 'attack', atk: 380, rarity: 'SSR', gachaOnly: true,
    img: img('sukuna'), imgSm: imgSm('sukuna'),
    moveText: '金の動き(成:全方向1マス)',
    skill: { kind: 'dual', name: '双面', desc: 'この駒で取ったあと、着地マスに隣接する別の敵を1体追撃できる(2体目のダメージは半分)', mult: 0.5 },
    moves: { steps: STEPS_GOLD },
    promoted: { steps: STEPS_ALL8 },
    awakenName: '両面宿儺',
  },

  /* ---------- 攻め改善ラインナップ(食い逃げ・残火) ---------- */
  makuragaeshi: {
    id: 'makuragaeshi', name: '枕返し', type: 'transform', atk: 170, rarity: 'R', gachaOnly: true,
    img: img('makuragaeshi'), imgSm: imgSm('makuragaeshi'),
    moveText: '前3方向と後ろに1マス(成:金の動き)',
    skill: { kind: 'retreat', name: '枕の帰影', desc: 'この駒で取ったあと、自動で元いたマスへ戻る' },
    moves: { steps: [[0,-1],[1,-1],[-1,-1],[0,1]] },
    promoted: { steps: STEPS_GOLD },
  },
  rinka: {
    id: 'rinka', name: '燐火', type: 'support', atk: 140, rarity: 'R', gachaOnly: true,
    img: img('rinka'), imgSm: imgSm('rinka'),
    moveText: '縦横に1マス(成:全方向1マス)',
    skill: {
      kind: 'ember', name: '燐の残り火',
      desc: '取ったマスに4手残る燐火を置く。味方がそのマスに入る／取る／打つと魂力+150',
      mode: 'heal', value: 150, span: 4,
    },
    moves: { steps: STEPS_ORTHO4 },
    promoted: { steps: STEPS_ALL8 },
  },
  tsurube: {
    id: 'tsurube', name: '釣瓶落とし', type: 'attack', atk: 210, rarity: 'R', gachaOnly: true,
    img: img('tsurube'), imgSm: imgSm('tsurube'),
    moveText: '前にどこまでも(成:+横・後ろ1マス)',
    skill: {
      kind: 'ember', name: '闇への落とし口',
      desc: '取ったマスに4手残る落とし穴を置く。相手がそのマスに入ると魂力80ダメージ(穴は消える)',
      mode: 'trap', value: 80, span: 4,
    },
    moves: { slides: [[0,-1]] },
    promoted: { slides: [[0,-1]], steps: [[1,0],[-1,0],[0,1]] },
    dropLimit: 1,
  },
  shiranui: {
    id: 'shiranui', name: '不知火', type: 'attack', atk: 260, rarity: 'SR', gachaOnly: true,
    img: img('shiranui'), imgSm: imgSm('shiranui'),
    moveText: '斜めに1マス(成:斜め+前後)',
    skill: {
      kind: 'spawn', name: '送り火',
      desc: 'この駒で取ったあと、周囲の空きマス1つに味方の鬼火を置く',
      piece: 'onibi',
    },
    moves: { steps: STEPS_DIAG4 },
    promoted: { steps: [...STEPS_DIAG4, [0,-1], [0,1]] },
  },
  enenra: {
    id: 'enenra', name: '煙々羅', type: 'transform', atk: 200, rarity: 'SR', gachaOnly: true,
    img: img('enenra'), imgSm: imgSm('enenra'),
    moveText: '斜めに1マス(成:+前後1マス)',
    skill: { kind: 'phase', name: '煙の影遁', desc: 'この駒で取ったあと、隣の空きマスへ1マス逃げられる(任意。取ったマスに残ってもよい)' },
    moves: { steps: STEPS_DIAG4 },
    promoted: { steps: [...STEPS_DIAG4, [0,-1], [0,1]] },
  },
  ingyo: {
    id: 'ingyo', name: '隱神刑部', type: 'transform', atk: 360, rarity: 'SSR', gachaOnly: true,
    img: img('ingyo'), imgSm: imgSm('ingyo'),
    moveText: '斜めに1マスと前へ変則跳び(成:全方向1マス+変則跳び)',
    skill: {
      kind: 'veil', name: '隱形の術',
      desc: 'この駒で取ったあと、(1)その場に残る (2)元いたマスへ戻る (3)隣の空きマスへ逃げる、のいずれかを選べる',
    },
    moves: { steps: STEPS_DIAG4, jumps: [[1,-2],[-1,-2]] },
    promoted: { steps: STEPS_ALL8, jumps: [[1,-2],[-1,-2]] },
    awakenName: '真・隱形',
  },
};

/* ---------- SSR異装（性能は通常版と同一。覚醒技名のみ専用） ---------- */
YOKAI.kyubi_eclipse = {
  ...YOKAI.kyubi,
  id: 'kyubi_eclipse',
  name: '月蝕・九尾の狐',
  gachaOnly: true,
  img: img('kyubi-eclipse'),
  imgSm: imgSm('kyubi-eclipse'),
  variantOf: 'kyubi',
  summonTitle: '神妖 顕現',
  summonColors: ['#fff8df', '#e32f3f', '#d9b75c'],
  awakenName: '月蝕開眼',
};
YOKAI.shuten_kishin = {
  ...YOKAI.shuten,
  id: 'shuten_kishin',
  name: '鬼神・酒呑童子',
  gachaOnly: true,
  img: img('shuten-kishin'),
  imgSm: imgSm('shuten-kishin'),
  variantOf: 'shuten',
  summonTitle: '鬼神 覚醒',
  summonColors: ['#ffdbc2', '#c51c2b', '#8d47d6'],
  awakenName: '鬼神羅刹・極',
};
YOKAI.ibaraki_rashomon = {
  ...YOKAI.ibaraki,
  id: 'ibaraki_rashomon',
  name: '羅生門・茨木童子',
  img: img('ibaraki-rashomon'),
  imgSm: imgSm('ibaraki-rashomon'),
  variantOf: 'ibaraki',
  summonTitle: '羅生門 顕現',
  summonColors: ['#ff555f', '#8d47d6', '#211326'],
  awakenName: '羅生門・真打',
};
YOKAI.tamamo_keikoku = {
  ...YOKAI.tamamo,
  id: 'tamamo_keikoku',
  name: '傾国・玉藻前',
  img: img('tamamo-keikoku'),
  imgSm: imgSm('tamamo-keikoku'),
  variantOf: 'tamamo',
  summonTitle: '傾国 降臨',
  summonColors: ['#fff8df', '#d9b75c', '#b21f32'],
  awakenName: '傾国乱世・極',
};
YOKAI.nurarihyon_hyakki = {
  ...YOKAI.nurarihyon,
  id: 'nurarihyon_hyakki',
  name: '百鬼夜行・ぬらりひょん',
  limited: true,  // 土曜対戦会 限定(EVENT_YOKAI_ID)
  img: img('nurarihyon-hyakki'),
  imgSm: imgSm('nurarihyon-hyakki'),
  variantOf: 'nurarihyon',
  summonTitle: '百鬼夜行 開幕',
  summonColors: ['#dbe7ff', '#6157a8', '#d98945'],
  awakenName: '百鬼夜行・大団円',
};
YOKAI.kyubi_hasha = {
  ...YOKAI.kyubi,
  id: 'kyubi_hasha',
  name: '覇者・九尾',
  limited: true,  // 百鬼夜行週間ランキング1位(HYAKKI_REWARD_YOKAI_ID)
  img: img('kyubi-hasha'),
  imgSm: imgSm('kyubi-hasha'),
  variantOf: 'kyubi',
  summonTitle: '百鬼覇者 降臨',
  summonColors: ['#fff4c8', '#d4a017', '#b21f32'],
  awakenName: '覇者・月蝕開眼',
};

/* ---------- 因縁共鳴(伝承ベースのペア。異装は variantOf 経由で同一扱い) ---------- */
export interface Resonance {
  pair: readonly [string, string]; // baseId(variantOf解決後)のペア
  name: string;
  desc: string;
  effect: 'oniFeast' | 'foxBond';
  colors: readonly [string, string, string];
}
export const RESONANCES: readonly Resonance[] = [
  {
    pair: ['shuten', 'ibaraki'], name: '鬼の宴', effect: 'oniFeast',
    desc: '酒呑童子と茨木童子が共に盤上にいる間、酒呑童子の会心率+15%',
    colors: ['#ffdbc2', '#ff4d4d', '#8d47d6'],
  },
  {
    pair: ['kyubi', 'tamamo'], name: '妖狐相伝', effect: 'foxBond',
    desc: '九尾の狐と玉藻前が盤上にいるとき、片方が取られると残った方が激怒し、次の攻撃が確定会心になる',
    colors: ['#fff8df', '#ff9d3c', '#b21f32'],
  },
];
/* 異装を通常版に正規化(共鳴・図鑑グルーピング用) */
export const baseIdOf = (id: string): string => YOKAI[id]?.variantOf ?? id;

/* 月齢(moonスキル): 1夜=1往復(2手)、4夜周期で満月が巡る */
export const MOON_PHASES = ['新月', '三日月', '半月', '満月'] as const;

/* ガチャ排出対象(limited=イベント限定を除く全妖怪) */
export const GACHA_POOL: string[] = Object.keys(YOKAI).filter(id => !YOKAI[id].limited);

/* 初回オンボーディングで選べる大将(ぬらりひょんはガチャでも排出) */
export const BOSS_CHOICES = ['kyubi', 'shuten', 'nurarihyon'] as const;
export type BossChoice = typeof BOSS_CHOICES[number];

export const EMPTY_FORMATION: (string | null)[][] = [
  [null, null, null, null, null],
  [null, null, null, null, null],
];

export function formationWithBoss(bossId: string): (string | null)[][] {
  return [
    [null, null, null, null, null],
    [null, null, bossId, null, null],
  ];
}

/* 初期配置(y=0 が敵陣最奥、y=5 が自陣最奥) */
export const SETUP: (string | null)[][] = [
  ['rokuro', 'nurikabe', 'shuten', 'kappa', 'tengu'],   // y0 敵・奥
  ['nue', 'nekomata', null, 'kooni', 'ittan'],          // y1 敵・前
  [null, null, null, null, null],                       // y2
  [null, null, null, null, null],                       // y3
  ['ittan', 'kooni', null, 'nekomata', 'nue'],          // y4 自・前
  ['tengu', 'kappa', 'kyubi', 'nurikabe', 'rokuro'],    // y5 自・奥
];

export const PLAYER_BOSS = 'kyubi';
export const ENEMY_BOSS = 'shuten';

/* プリロード対象画像 */
export const ALL_IMAGES: string[] = Object.values(YOKAI).flatMap(y => [y.img, y.imgSm]);
