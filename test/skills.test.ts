/* 新スキル(妨・援・化・爆)の動作テスト(旧 prototype/test/skills-test.js の移植) */
import { test, expect } from 'vitest';
import { COLS, ROWS } from '../shared/data';
import { Game } from '../shared/game';
import type { ApplyOptions, GameState, Side } from '../shared/game';

let uid = 100;

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

test('援(heal): 座敷童子は取ると回復', () => {
  const s = blank();
  s.turn = 'p'; s.hp.p = 2000;
  put(s, 2, 3, 'zashiki', 'p');
  put(s, 2, 2, 'ittan', 'e');
  put(s, 0, 0, 'ittan', 'e'); // 双方の手を残すための置き駒
  const ev = capEv(cap(s, 2, 3, 2, 2));
  expect(s.hp.e, '座敷童子ATK130のダメージ').toBe(3000 - 130);
  expect(s.hp.p, '魂力250回復').toBe(2250);
  expect(ev.heal, 'healイベント').toBe(250);
});

test('援(heal): 回復は上限3000で頭打ち', () => {
  const s = blank();
  s.turn = 'p'; s.hp.p = 2900;
  put(s, 2, 3, 'zashiki', 'p');
  put(s, 2, 2, 'ittan', 'e');
  put(s, 0, 0, 'ittan', 'e');
  const ev = capEv(cap(s, 2, 3, 2, 2));
  expect(s.hp.p, '回復は最大魂力まで').toBe(3000);
  expect(ev.heal).toBe(100);
});

test('化(decoy): 化け狸はダメージ半減&持ち駒にならない', () => {
  const s = blank();
  s.turn = 'e';
  put(s, 2, 3, 'tanuki', 'p');
  put(s, 1, 2, 'nekomata', 'e');
  put(s, 0, 5, 'ittan', 'p');
  const ev = capEv(cap(s, 1, 2, 2, 3)); // 猫又(ATK200)が化け狸を取る
  expect(ev.decoy, 'decoyイベントが発生').toBeTruthy();
  expect(s.hp.p, 'ダメージ半減(200→100)').toBe(3000 - 100);
  expect(s.hands.e.tanuki, '化け狸は持ち駒にならない').toBeUndefined();
});

test('爆(explode): 鬼火は取った駒を道連れにする', () => {
  const s = blank();
  s.turn = 'e';
  put(s, 2, 3, 'onibi', 'p');
  put(s, 1, 2, 'nekomata', 'e');
  put(s, 0, 5, 'ittan', 'p');
  put(s, 0, 0, 'ittan', 'e');
  const ev = capEv(cap(s, 1, 2, 2, 3));
  expect(ev.explode, 'explodeイベントが発生').toBeTruthy();
  expect(s.board[3][2], '取った猫又が道連れで消滅').toBeNull();
  expect(s.hands.e.onibi, '鬼火は持ち駒にならない').toBeUndefined();
  expect(s.hp.p, 'ダメージ自体は通る').toBe(3000 - 200);
  expect(s.winner, '大将以外なら勝敗はつかない').toBeNull();
});

test('爆(explode): 大将が鬼火を取ると即敗北', () => {
  const s = blank();
  s.turn = 'e';
  put(s, 2, 3, 'onibi', 'p');
  put(s, 2, 2, 'shuten', 'e');
  put(s, 0, 5, 'kyubi', 'p');
  cap(s, 2, 2, 2, 3);
  expect(s.winner, '敵大将が鬼火を取って自滅').toBe('p');
  expect(s.reason).toBe('explode');
});

test('妨(chill): 雪女は敵のコンボ倍率を無効化', () => {
  const mk = (withYuki: boolean) => {
    const s = blank();
    s.turn = 'e'; s.combo.e = 1; // この捕獲で2コンボ目(通常×1.25)
    put(s, 2, 3, 'kooni', 'p');
    put(s, 1, 2, 'nekomata', 'e');
    put(s, 0, 5, 'ittan', 'p');
    put(s, 0, 0, 'ittan', 'e');
    if (withYuki) put(s, 4, 5, 'yukionna', 'p');
    return capEv(cap(s, 1, 2, 2, 3));
  };
  expect(mk(false).damage, '雪女なし: コンボ×1.25で250').toBe(250);
  const ev = mk(true);
  expect(ev.comboMult, '雪女あり: コンボ無効').toBe(1);
  expect(ev.damage).toBe(200);
});

test('妨(jam): 砂かけ婆は敵の会心スキルを封じる', () => {
  const mk = (withSuna: boolean) => {
    const s = blank();
    s.turn = 'e';
    put(s, 2, 3, 'rokuro', 'p'); // 反撃持ちだがダメージ計算の検証には影響しない側
    put(s, 2, 2, 'kooni', 'e');  // 会心30%×1.5
    put(s, 0, 5, 'ittan', 'p');
    put(s, 0, 0, 'ittan', 'e');
    if (withSuna) put(s, 4, 5, 'sunakake', 'p');
    return capEv(cap(s, 2, 2, 2, 3, { rng: false })); // 期待値計算で比較
  };
  expect(mk(false).damage, '砂かけ婆なし: 会心期待値込み').toBe(Math.round(150 * 1.15));
  expect(mk(true).damage, '砂かけ婆あり: 会心封じ').toBe(150);
});

test('妨(weaken): 土蜘蛛は敵の与ダメージを減らす', () => {
  const s = blank();
  s.turn = 'e';
  put(s, 2, 3, 'kooni', 'p');
  put(s, 1, 2, 'nekomata', 'e');
  put(s, 4, 5, 'tsuchigumo', 'p');
  put(s, 0, 5, 'ittan', 'p');
  put(s, 0, 0, 'ittan', 'e');
  const ev = capEv(cap(s, 1, 2, 2, 3));
  expect(ev.damage, '土蜘蛛: 与ダメ-12%(176)').toBe(Math.round(200 * 0.88));
});

test('道連れで消えた駒は成れない', () => {
  const s = blank();
  s.turn = 'e';
  put(s, 2, 4, 'onibi', 'p');   // y=4 は敵(e)から見て成りゾーン
  put(s, 1, 3, 'nekomata', 'e');
  put(s, 0, 5, 'ittan', 'p');
  put(s, 0, 0, 'ittan', 'e');
  const events = cap(s, 1, 3, 2, 4);
  expect(events.some(e => e.t === 'promote'), '消滅した駒の成りイベントが出ない').toBe(false);
});
