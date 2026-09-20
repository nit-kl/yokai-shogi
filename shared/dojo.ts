/* 妖怪道場: 1〜2手の詰問。定義はクライアント/サーバー共用、解答検証はエンジン権威 */

import type { Side } from './data';
import { Game } from './game';
import type { Action, GameState, Piece } from './game';

export type DojoGoal = 'boss' | 'hp' | 'promo' | 'combo';

export interface DojoPiece {
  x: number;
  y: number;
  id: string;
  owner: Side;
  promoted?: boolean;
}

export interface DojoPuzzle {
  id: string;
  order: number;
  title: string;
  titleEn: string;
  brief: string;
  briefEn: string;
  hint: string;
  hintEn: string;
  goal: DojoGoal;
  maxPlies: 1 | 2;
  tickets: number;
  pieces: DojoPiece[];
  hands?: Partial<Record<Side, Record<string, number>>>;
  hp?: Partial<Record<Side, number>>;
}

export interface DojoEval {
  ok: boolean;
  reason: string;
}

export const DOJO_TICKETS = 1;

const selfKyubi = (pieces: DojoPiece[]): DojoPiece[] => [
  ...pieces,
  { x: 4, y: 5, id: 'kyubi', owner: 'p' },
];

export const DOJO_PUZZLES: DojoPuzzle[] = [
  {
    id: 'd01-advance',
    order: 1,
    title: '前へ進め',
    titleEn: 'Step Forward',
    brief: '1手で敵大将を討て',
    briefEn: 'Capture the enemy general in one move',
    hint: '小鬼は前に1マス進む。目の前の大将を取ろう。',
    hintEn: 'Oni cubs move one square forward. Capture the general ahead.',
    goal: 'boss',
    maxPlies: 1,
    tickets: DOJO_TICKETS,
    pieces: selfKyubi([
      { x: 2, y: 2, id: 'kooni', owner: 'p' },
      { x: 2, y: 1, id: 'kyubi', owner: 'e' },
    ]),
  },
  {
    id: 'd02-diagonal',
    order: 2,
    title: '斜めに跳べ',
    titleEn: 'Strike Diagonally',
    brief: '斜めの動きで大将を討て',
    briefEn: 'Capture the general with a diagonal step',
    hint: '猫又は斜めに1マス。右斜め前の大将が取れる。',
    hintEn: 'Nekomata steps diagonally. The general is one diagonal forward.',
    goal: 'boss',
    maxPlies: 1,
    tickets: DOJO_TICKETS,
    pieces: selfKyubi([
      { x: 1, y: 2, id: 'nekomata', owner: 'p' },
      { x: 2, y: 1, id: 'kyubi', owner: 'e' },
    ]),
  },
  {
    id: 'd03-rush',
    order: 3,
    title: '遠くから斬れ',
    titleEn: 'Cut From Afar',
    brief: '長い移動で大将を討て',
    briefEn: 'Capture the general with a long slide',
    hint: '一反木綿は前へどこまでも進める。3マス以上の取りはダメージ2倍。',
    hintEn: 'Ittan-momen slides forward. Captures of 3+ squares deal double damage.',
    goal: 'boss',
    maxPlies: 1,
    tickets: DOJO_TICKETS,
    pieces: selfKyubi([
      { x: 2, y: 5, id: 'ittan', owner: 'p' },
      { x: 2, y: 1, id: 'kyubi', owner: 'e' },
    ]),
  },
  {
    id: 'd04-promo',
    order: 4,
    title: '成りの力',
    titleEn: 'Power of Promotion',
    brief: '成駒を使って大将を討て',
    briefEn: 'Capture the general with a promoted piece',
    hint: '成った小鬼は金の動き。斜め前にも進める。',
    hintEn: 'A promoted oni cub moves like gold, including diagonally forward.',
    goal: 'promo',
    maxPlies: 1,
    tickets: DOJO_TICKETS,
    pieces: selfKyubi([
      { x: 2, y: 2, id: 'kooni', owner: 'p', promoted: true },
      { x: 3, y: 1, id: 'kyubi', owner: 'e' },
    ]),
  },
  {
    id: 'd05-drop',
    order: 5,
    title: '持ち駒を打て',
    titleEn: 'Drop Into Play',
    brief: '持ち駒を打ち、次の手で大将を討て',
    briefEn: 'Drop a piece, then capture the general',
    hint: '空きマスに小鬼を打ち、その駒で大将を取ろう。最奥には打てない。',
    hintEn: 'Drop the oni cub onto an empty square, then capture. You cannot drop on the last rank.',
    goal: 'boss',
    maxPlies: 2,
    tickets: DOJO_TICKETS,
    pieces: selfKyubi([
      { x: 2, y: 1, id: 'kyubi', owner: 'e' },
    ]),
    hands: { p: { kooni: 1 } },
  },
  {
    id: 'd06-combo',
    order: 6,
    title: '連続で取れ',
    titleEn: 'Chain Captures',
    brief: '2連続で取り、コンボを決めろ',
    briefEn: 'Capture twice in a row to score a combo',
    hint: '手前の河童を取ったあと、同じ小鬼で大将まで取り切る。',
    hintEn: 'Capture the kappa first, then the same oni cub takes the general.',
    goal: 'combo',
    maxPlies: 2,
    tickets: DOJO_TICKETS,
    pieces: selfKyubi([
      { x: 2, y: 3, id: 'kooni', owner: 'p' },
      { x: 2, y: 2, id: 'kappa', owner: 'e' },
      { x: 2, y: 1, id: 'kyubi', owner: 'e' },
    ]),
  },
  {
    id: 'd07-zone',
    order: 7,
    title: '敵陣で強襲',
    titleEn: 'Assault the Camp',
    brief: '敵陣の取りで魂力を0にしろ',
    briefEn: 'Capture in the enemy camp to drain HP to 0',
    hint: '猫又は敵陣で取るとダメージ+120。残り少ない魂力を削り切ろう。',
    hintEn: 'Nekomata gains +120 damage in the enemy camp. Finish the remaining HP.',
    goal: 'hp',
    maxPlies: 1,
    tickets: DOJO_TICKETS,
    hp: { e: 250 },
    pieces: selfKyubi([
      { x: 1, y: 2, id: 'nekomata', owner: 'p' },
      { x: 2, y: 1, id: 'kappa', owner: 'e' },
      { x: 0, y: 0, id: 'kyubi', owner: 'e' },
    ]),
  },
  {
    id: 'd08-jump',
    order: 8,
    title: '駒を飛び越えろ',
    titleEn: 'Leap Over',
    brief: '跳びの動きで大将を討て',
    briefEn: 'Jump over a piece to capture the general',
    hint: '鵺は前へ斜めに跳ぶ。途中の駒を飛び越えられる。',
    hintEn: 'Nue jumps forward-diagonally and can leap over pieces.',
    goal: 'boss',
    maxPlies: 1,
    tickets: DOJO_TICKETS,
    pieces: selfKyubi([
      { x: 1, y: 3, id: 'nue', owner: 'p' },
      { x: 1, y: 2, id: 'nurikabe', owner: 'e' },
      { x: 2, y: 1, id: 'kyubi', owner: 'e' },
    ]),
  },
  {
    id: 'd09-tengu',
    order: 9,
    title: '天狗の羽ばたき',
    titleEn: 'Tengu Wings',
    brief: '斜めに飛んで大将を討て',
    briefEn: 'Fly diagonally to capture the general',
    hint: '天狗は斜めに1〜2マス飛ぶ。2マス先の大将を狙おう。',
    hintEn: 'Tengu flies 1–2 squares diagonally. The general is two squares away.',
    goal: 'boss',
    maxPlies: 1,
    tickets: DOJO_TICKETS,
    pieces: selfKyubi([
      { x: 0, y: 3, id: 'tengu', owner: 'p' },
      { x: 2, y: 1, id: 'kyubi', owner: 'e' },
    ]),
  },
  {
    id: 'd10-promote-break',
    order: 10,
    title: '敵陣で成れ',
    titleEn: 'Promote Then Break',
    brief: '敵陣で成り、成駒で大将を討て',
    briefEn: 'Promote in the enemy camp, then capture the general',
    hint: '小鬼を敵陣へ進めて成らせ、金の動きで斜めの大将を取る。',
    hintEn: 'Advance the oni cub into the camp to promote, then capture diagonally like gold.',
    goal: 'promo',
    maxPlies: 2,
    tickets: DOJO_TICKETS,
    pieces: selfKyubi([
      { x: 2, y: 2, id: 'kooni', owner: 'p' },
      { x: 3, y: 0, id: 'kyubi', owner: 'e' },
    ]),
  },
];

export function dojoPuzzleById(id: string): DojoPuzzle | undefined {
  return DOJO_PUZZLES.find(p => p.id === id);
}

export function isDojoUnlocked(id: string, cleared: readonly string[]): boolean {
  const puzzle = dojoPuzzleById(id);
  if (!puzzle) return false;
  if (puzzle.order <= 1) return true;
  const prev = DOJO_PUZZLES.find(p => p.order === puzzle.order - 1);
  return !!prev && cleared.includes(prev.id);
}

export function buildDojoState(puzzle: DojoPuzzle): GameState {
  const s = Game.newState();
  for (const row of s.board) row.fill(null);
  s.hands = { p: {}, e: {} };
  s.hp = { p: 3000, e: 3000 };
  if (puzzle.hp?.p != null) s.hp.p = puzzle.hp.p;
  if (puzzle.hp?.e != null) s.hp.e = puzzle.hp.e;
  if (puzzle.hands?.p) s.hands.p = { ...puzzle.hands.p };
  if (puzzle.hands?.e) s.hands.e = { ...puzzle.hands.e };
  let uid = 0;
  for (const spec of puzzle.pieces) {
    const pc: Piece = Game.preparePiece({
      uid: ++uid, id: spec.id, owner: spec.owner, promoted: !!spec.promoted,
    });
    s.board[spec.y][spec.x] = pc;
  }
  s.nextUid = uid;
  s.turn = 'p';
  s.winner = null;
  s.reason = null;
  s.combo = { p: 0, e: 0 };
  s.plies = 0;
  s.lastCapturePly = 0;
  s.embers = [];
  s.awaken = { p: { gauge: 0, used: false }, e: { gauge: 0, used: false } };
  return s;
}

function sameAction(a: Action, b: Action): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseAction(raw: unknown): Action | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Action;
  if (v.kind === 'move' && v.from && v.to
    && Number.isInteger(v.from.x) && Number.isInteger(v.from.y)
    && Number.isInteger(v.to.x) && Number.isInteger(v.to.y)) {
    return {
      kind: 'move',
      from: { x: v.from.x, y: v.from.y },
      to: { x: v.to.x, y: v.to.y },
      ...(v.phaseTo ? { phaseTo: { x: v.phaseTo.x, y: v.phaseTo.y } } : {}),
      ...(v.spawnTo ? { spawnTo: { x: v.spawnTo.x, y: v.spawnTo.y } } : {}),
      ...(v.dualTo ? { dualTo: { x: v.dualTo.x, y: v.dualTo.y } } : {}),
    };
  }
  if (v.kind === 'drop' && typeof v.id === 'string' && v.to
    && Number.isInteger(v.to.x) && Number.isInteger(v.to.y)) {
    return { kind: 'drop', id: v.id, to: { x: v.to.x, y: v.to.y } };
  }
  return null;
}

export function parseDojoActions(raw: unknown): Action[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 2) return null;
  const actions: Action[] = [];
  for (const item of raw) {
    const action = parseAction(item);
    if (!action) return null;
    actions.push(action);
  }
  return actions;
}

/** 道場はプレイヤーだけが指す。合法手で目標を満たせばクリア */
export function evaluateDojo(puzzle: DojoPuzzle, rawActions: unknown): DojoEval {
  const actions = parseDojoActions(rawActions);
  if (!actions) return { ok: false, reason: '指し手が不正です' };
  if (actions.length > puzzle.maxPlies) return { ok: false, reason: '手数が多すぎます' };

  const s = buildDojoState(puzzle);
  let usedPromoted = false;
  let maxCombo = 0;

  for (const action of actions) {
    if (s.winner) return { ok: false, reason: '既に対局が終わっています' };
    s.turn = 'p';
    const legal = Game.getAllActions(s, 'p');
    if (!legal.some(a => sameAction(a, action))) return { ok: false, reason: '合法手ではありません' };

    const moving = action.kind === 'move' ? s.board[action.from.y][action.from.x] : null;
    const wasPromoted = !!moving?.promoted;
    const events = Game.applyAction(s, action, { rng: false });
    if (wasPromoted && events.some(ev => ev.t === 'capture')) usedPromoted = true;
    for (const ev of events) {
      if (ev.t === 'capture') maxCombo = Math.max(maxCombo, ev.combo);
    }
  }

  if (s.winner !== 'p') return { ok: false, reason: '課題を達成できていません' };
  if (puzzle.goal === 'boss' && s.reason !== 'boss') return { ok: false, reason: '大将を討ってください' };
  if (puzzle.goal === 'hp' && s.reason !== 'hp') return { ok: false, reason: '魂力を0にしてください' };
  if (puzzle.goal === 'promo' && !usedPromoted) return { ok: false, reason: '成駒で取ってください' };
  if (puzzle.goal === 'combo' && maxCombo < 2) return { ok: false, reason: 'コンボを決めてください' };
  return { ok: true, reason: 'clear' };
}
