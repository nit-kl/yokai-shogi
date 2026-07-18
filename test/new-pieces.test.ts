import { test, expect } from 'vitest';
import { COLS, ROWS, YOKAI } from '../shared/data';
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

const STOCK_PIECE_IDS = [
  'bakezouri', 'sunekosuri', 'kodama', 'nopperabo', 'tenome', 'inugami',
  'aoandon', 'umibozu', 'wanyudo', 'yatagarasu', 'oomyukade', 'gashadokuro', 'sukuna',
] as const;

test('ストック駒13体がYOKAIに定義されていること', () => {
  for (const id of STOCK_PIECE_IDS) {
    expect(YOKAI[id], id).toBeTruthy();
    expect(YOKAI[id].gachaOnly).toBe(true);
    expect(YOKAI[id].img).toBe(`assets/pieces/${id}.webp`);
    expect(YOKAI[id].imgSm).toBe(`assets/pieces/sm/${id}.webp`);
  }
});

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

test('新規駒(yamata): 八岐の首は駒を取るたび成長する(1体目は素、2体目+30%)', () => {
  const s = blank();
  s.turn = 'p';
  put(s, 2, 3, 'yamata', 'p'); // プレイヤーの八岐大蛇 (ATK 420, 撃破ごとに+30%)
  put(s, 2, 2, 'ittan', 'e');
  put(s, 0, 0, 'ittan', 'e');

  // 1体目: 首はまだ目覚めていない → 素のATK
  const ev1 = capEv(cap(s, 2, 3, 2, 2, { rng: false }));
  expect(ev1.damage).toBe(420);
  expect(s.board[2][2]?.kills).toBe(1);

  // 2体目: 二の首覚醒 ×1.3(コンボの影響を除外して首の成長だけを見る)
  s.turn = 'p';
  s.combo.p = 0;
  put(s, 2, 1, 'ittan', 'e');
  put(s, 4, 0, 'ittan', 'e'); // 敵の手を残すダミー
  const ev2 = capEv(cap(s, 2, 2, 2, 1, { rng: false }));
  expect(ev2.damage).toBe(Math.round(420 * 1.3)); // 546
  expect(s.board[1][2]?.kills).toBe(2);
});

test('ストック駒(kodama): 木霊が駒を取ったとき魂力が150回復すること', () => {
  const s = blank();
  s.turn = 'p';
  s.hp.p = 2000;
  put(s, 2, 3, 'kodama', 'p');
  put(s, 2, 2, 'ittan', 'e');
  put(s, 0, 0, 'ittan', 'e');
  const ev = capEv(cap(s, 2, 3, 2, 2));
  expect(s.hp.p).toBe(2150);
  expect(ev.heal).toBe(150);
});

test('ストック駒(aoandon): 青行燈が駒を取ったとき魂力が280回復すること', () => {
  const s = blank();
  s.turn = 'p';
  s.hp.p = 2000;
  put(s, 2, 3, 'aoandon', 'p');
  put(s, 2, 2, 'ittan', 'e');
  put(s, 0, 0, 'ittan', 'e');
  const ev = capEv(cap(s, 2, 3, 2, 2));
  expect(s.hp.p).toBe(2280);
  expect(ev.heal).toBe(280);
});

test('ストック駒(umibozu): 海坊主のオーラで自軍の被ダメージが23%軽減されること', () => {
  const s = blank();
  s.turn = 'e';
  put(s, 2, 3, 'kooni', 'p');
  put(s, 1, 2, 'nekomata', 'e');
  put(s, 4, 5, 'umibozu', 'p');
  put(s, 0, 5, 'ittan', 'p');
  put(s, 0, 0, 'ittan', 'e');
  const ev = capEv(cap(s, 1, 2, 2, 3));
  expect(ev.damage).toBe(Math.round(200 * 0.77));
});

test('ストック駒(oomyukade): 大百足が盤上にいるとき敵軍の与ダメージが14%軽減されること', () => {
  const s = blank();
  s.turn = 'e';
  put(s, 2, 3, 'kooni', 'p');
  put(s, 1, 2, 'nekomata', 'e');
  put(s, 4, 5, 'oomyukade', 'p');
  put(s, 0, 5, 'ittan', 'p');
  put(s, 0, 0, 'ittan', 'e');
  const ev = capEv(cap(s, 1, 2, 2, 3));
  expect(ev.damage).toBe(Math.round(200 * 0.86));
});

test('ストック駒(bakezouri): 化け草履はダメージ半減&持ち駒にならないこと', () => {
  const s = blank();
  s.turn = 'e';
  put(s, 2, 3, 'bakezouri', 'p');
  put(s, 1, 2, 'nekomata', 'e');
  put(s, 0, 5, 'ittan', 'p');
  const ev = capEv(cap(s, 1, 2, 2, 3));
  expect(ev.decoy).toBeTruthy();
  expect(s.hp.p).toBe(3000 - 100);
  expect(s.hands.e.bakezouri).toBeUndefined();
});

test('ストック駒(tenome): 手の目は取られたとき280の反撃ダメージを与えること', () => {
  const s = blank();
  s.turn = 'e';
  put(s, 2, 3, 'tenome', 'p');
  put(s, 1, 2, 'nekomata', 'e');
  put(s, 0, 5, 'ittan', 'p');
  put(s, 0, 0, 'ittan', 'e');
  const ev = capEv(cap(s, 1, 2, 2, 3));
  expect(ev.counter?.dmg).toBe(280);
  expect(s.hp.e).toBe(3000 - 280);
});

test('ストック駒(gashadokuro): 餓鬼の骨積みは駒を取るたび成長する(1体目は素、2体目+25%)', () => {
  const s = blank();
  s.turn = 'p';
  put(s, 2, 3, 'gashadokuro', 'p');
  put(s, 2, 2, 'ittan', 'e');
  put(s, 0, 0, 'ittan', 'e');

  const ev1 = capEv(cap(s, 2, 3, 2, 2, { rng: false }));
  expect(ev1.damage).toBe(410);
  expect(s.board[2][2]?.kills).toBe(1);

  s.turn = 'p';
  s.combo.p = 0;
  put(s, 2, 1, 'ittan', 'e');
  put(s, 4, 0, 'ittan', 'e');
  const ev2 = capEv(cap(s, 2, 2, 2, 1, { rng: false }));
  expect(ev2.damage).toBe(Math.round(410 * 1.25));
  expect(s.board[1][2]?.kills).toBe(2);
});

test('ストック駒(sunekosuri): すねこすりは敵の会心スキルを封じること', () => {
  const mk = (withSune: boolean) => {
    const s = blank();
    s.turn = 'e';
    put(s, 2, 3, 'rokuro', 'p');
    put(s, 2, 2, 'kooni', 'e');
    put(s, 0, 5, 'ittan', 'p');
    put(s, 0, 0, 'ittan', 'e');
    if (withSune) put(s, 4, 5, 'sunekosuri', 'p');
    return capEv(cap(s, 2, 2, 2, 3, { rng: false }));
  };
  expect(mk(false).damage).toBe(Math.round(150 * 1.15));
  expect(mk(true).damage).toBe(150);
});
