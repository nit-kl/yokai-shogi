import { test, expect } from 'vitest';
import { COLS, ROWS, YOKAI } from '../shared/data';
import { Game, HUNGER_DRAIN, HUNGER_GRACE } from '../shared/game';
import type { ApplyOptions, GameState, Side } from '../shared/game';

let uid = 900;

const blank = (): GameState => {
  const s = Game.newState();
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) s.board[y][x] = null;
  return s;
};

const put = (s: GameState, x: number, y: number, id: string, owner: Side) => {
  s.board[y][x] = { uid: ++uid, id, owner, promoted: false };
};

const move = (s: GameState, fx: number, fy: number, tx: number, ty: number, opts?: ApplyOptions & { phaseTo?: { x: number; y: number } }) =>
  Game.applyAction(s, {
    kind: 'move', from: { x: fx, y: fy }, to: { x: tx, y: ty },
    ...(opts?.phaseTo ? { phaseTo: opts.phaseTo } : {}),
  }, opts || { rng: true });

test('新駒6体がYOKAIに定義されていること', () => {
  for (const id of ['makuragaeshi', 'rinka', 'tsurube', 'shiranui', 'enenra', 'ingyo'] as const) {
    expect(YOKAI[id], id).toBeTruthy();
    expect(YOKAI[id].gachaOnly).toBe(true);
    expect(YOKAI[id].img).toBe(`assets/pieces/${id}.webp`);
  }
});

test('飢餓の夜: 無取りが GRACE を超えると双方の魂力が減る', () => {
  const s = blank();
  s.turn = 'p';
  put(s, 2, 4, 'kappa', 'p');
  put(s, 2, 1, 'kappa', 'e');
  put(s, 0, 0, 'ittan', 'e');
  put(s, 0, 5, 'ittan', 'p');
  for (let i = 0; i <= HUNGER_GRACE; i++) {
    const y = s.turn === 'p' ? 4 : 1;
    const pcX = [0, 1, 2, 3, 4].find(x => s.board[y][x]?.id === 'kappa')!;
    const toX = pcX === 2 ? 3 : 2;
    Game.applyAction(s, { kind: 'move', from: { x: pcX, y }, to: { x: toX, y } }, { rng: false });
  }
  expect(Game.hungerActive(s)).toBe(true);
  expect(s.hp.p).toBe(3000 - HUNGER_DRAIN);
  expect(s.hp.e).toBe(3000 - HUNGER_DRAIN);
});

test('枕返し: 取ったあと元マスへ帰影する', () => {
  const s = blank();
  s.turn = 'p';
  put(s, 2, 3, 'makuragaeshi', 'p');
  put(s, 2, 2, 'kooni', 'e');
  put(s, 0, 0, 'ittan', 'e');
  move(s, 2, 3, 2, 2, { rng: false });
  expect(s.board[2][2]).toBeNull();
  expect(s.board[3][2]?.id).toBe('makuragaeshi');
  expect(s.hands.p.kooni).toBe(1);
});

test('不知火: 残火マスで取るとダメージ+120', () => {
  const s = blank();
  s.turn = 'p';
  put(s, 2, 3, 'shiranui', 'p');
  put(s, 1, 2, 'kooni', 'e');
  put(s, 0, 0, 'ittan', 'e');
  move(s, 2, 3, 1, 2, { rng: false }); // 斜め取り → 残火設置
  expect(s.embers.some(e => e.mode === 'atk' && e.x === 1 && e.y === 2)).toBe(true);

  s.turn = 'p';
  s.combo.p = 0;
  put(s, 0, 3, 'nekomata', 'p'); // ATK 200・斜め
  put(s, 1, 2, 'kooni', 'e');
  put(s, 4, 0, 'ittan', 'e');
  const ev = move(s, 0, 3, 1, 2, { rng: false }).find(e => e.t === 'capture');
  expect(ev && ev.t === 'capture' && ev.damage).toBe(200 + 120);
});

test('煙々羅: phaseTo で隣接へ影遁できる', () => {
  const s = blank();
  s.turn = 'p';
  put(s, 2, 3, 'enenra', 'p');
  put(s, 1, 2, 'kooni', 'e');
  put(s, 0, 0, 'ittan', 'e');
  move(s, 2, 3, 1, 2, { rng: false, phaseTo: { x: 2, y: 2 } });
  expect(s.board[2][1]).toBeNull();
  expect(s.board[2][2]?.id).toBe('enenra');
});

test('隱神刑部: veil で元マスへ帰影できる', () => {
  const s = blank();
  s.turn = 'p';
  put(s, 2, 3, 'ingyo', 'p');
  put(s, 2, 2, 'kooni', 'e');
  put(s, 0, 0, 'ittan', 'e');
  move(s, 2, 3, 2, 2, { rng: false, phaseTo: { x: 2, y: 3 } });
  expect(s.board[2][2]).toBeNull();
  expect(s.board[3][2]?.id).toBe('ingyo');
});

test('釣瓶落とし: 相手が落とし穴マスに入るとダメージ', () => {
  const s = blank();
  s.turn = 'p';
  put(s, 2, 4, 'tsurube', 'p');
  put(s, 2, 2, 'kooni', 'e');
  put(s, 0, 0, 'ittan', 'e');
  move(s, 2, 4, 2, 2, { rng: false });
  expect(s.embers.some(e => e.mode === 'trap' && e.x === 2 && e.y === 2)).toBe(true);

  s.turn = 'e';
  const hpBefore = s.hp.e;
  put(s, 2, 1, 'kappa', 'e');
  move(s, 2, 1, 2, 2, { rng: false });
  expect(s.hp.e).toBe(hpBefore - 80);
  expect(s.embers.some(e => e.mode === 'trap' && e.x === 2 && e.y === 2)).toBe(false);
});

test('COLS定数が壊れていないこと', () => {
  expect(COLS).toBe(5);
});
