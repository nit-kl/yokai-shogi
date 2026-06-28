import { test, expect } from 'vitest';
import { COLS, ROWS } from '../shared/data';
import { Game } from '../shared/game';
import type { ApplyOptions, GameState, Side } from '../shared/game';

let uid = 500;

/* 空盤面の状態を作る */
const blank = (): GameState => {
  const s = Game.newState();
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) s.board[y][x] = null;
  return s;
};

const put = (s: GameState, x: number, y: number, id: string, owner: Side) => {
  s.board[y][x] = { uid: ++uid, id, owner, promoted: false };
};

const cap = (s: GameState, fx: number, fy: number, tx: number, ty: number, opts?: ApplyOptions) =>
  Game.applyAction(s, { kind: 'move', from: { x: fx, y: fy }, to: { x: tx, y: ty } }, opts || { rng: true });

const capEv = (events: ReturnType<typeof cap>) => {
  const ev = events.find(e => e.t === 'capture');
  if (!ev || ev.t !== 'capture') throw new Error('capture event missing');
  return ev;
};

test('新規駒(karakasa): からかさ小僧のオーラで自軍の被ダメージが12%軽減されること', () => {
  const s = blank();
  s.turn = 'e';
  put(s, 2, 3, 'kooni', 'p'); // プレイヤーの小鬼
  put(s, 1, 2, 'nekomata', 'e'); // 敵の猫又 (ATK 200)
  put(s, 4, 5, 'karakasa', 'p'); // 味方のからかさ小僧 (被ダメ-12%)
  put(s, 0, 5, 'ittan', 'p'); // ダミー
  put(s, 0, 0, 'ittan', 'e'); // ダミー
  
  const ev = capEv(cap(s, 1, 2, 2, 3));
  expect(ev.damage).toBe(Math.round(200 * 0.88)); // 200 * 0.88 = 176
});

test('新規駒(chochin): 提灯お化けが駒を取ったとき、魂力が200回復すること', () => {
  const s = blank();
  s.turn = 'p';
  s.hp.p = 2000;
  put(s, 2, 3, 'chochin', 'p'); // プレイヤーの提灯お化け
  put(s, 2, 2, 'ittan', 'e'); // 敵の一反木綿
  put(s, 0, 0, 'ittan', 'e'); // ダミー
  
  const ev = capEv(cap(s, 2, 3, 2, 2));
  expect(s.hp.p).toBe(2200); // 2000 + 200
  expect(ev.heal).toBe(200);
});

test('新規駒(baku): 獏が盤上にいるとき、敵軍の与ダメージが15%軽減されること', () => {
  const s = blank();
  s.turn = 'e';
  put(s, 2, 3, 'kooni', 'p');
  put(s, 1, 2, 'nekomata', 'e'); // 敵の猫又 (ATK 200)
  put(s, 4, 5, 'baku', 'p'); // 味方の獏 (敵与ダメ-15%)
  put(s, 0, 5, 'ittan', 'p'); // ダミー
  put(s, 0, 0, 'ittan', 'e'); // ダミー
  
  const ev = capEv(cap(s, 1, 2, 2, 3));
  expect(ev.damage).toBe(Math.round(200 * 0.85)); // 200 * 0.85 = 170
});

test('新規駒(yamata): 八岐大蛇が駒を取ったとき、期待値計算で会心ダメージが乗ること', () => {
  const s = blank();
  s.turn = 'p';
  put(s, 2, 3, 'yamata', 'p'); // プレイヤーの八岐大蛇 (ATK 420, 30%で2.2倍)
  put(s, 2, 2, 'ittan', 'e');
  put(s, 0, 0, 'ittan', 'e');
  
  // 期待値計算 (rng: false)
  // 会心確率 30% で 2.2倍 ダメージ。
  // 期待倍率 = 1 + 0.3 * (2.2 - 1) = 1 + 0.3 * 1.2 = 1.36
  // ダメージ期待値 = 420 * 1.36 = 571.2 -> 四捨五入か切り捨てで 571
  const ev = capEv(cap(s, 2, 3, 2, 2, { rng: false }));
  expect(ev.damage).toBe(Math.round(420 * 1.36)); // 571
});
