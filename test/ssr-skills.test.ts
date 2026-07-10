/* SSR体験改修(月齢・八岐の首・百鬼の陣・覚醒・因縁共鳴)のエンジンテスト */
import { test, expect } from 'vitest';
import { ROWS, COLS, YOKAI } from '../shared/data';
import { AWAKEN_MAX, AWAKEN_SPAN, Game, MOON_CYCLE } from '../shared/game';
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
const cap = (s: GameState, fx: number, fy: number, tx: number, ty: number, opts?: ApplyOptions) =>
  Game.applyAction(s, { kind: 'move', from: { x: fx, y: fy }, to: { x: tx, y: ty } }, opts || { rng: true });
const capEv = (events: ReturnType<typeof cap>) => {
  const ev = events.find(e => e.t === 'capture');
  if (!ev || ev.t !== 'capture') throw new Error('capture event missing');
  return ev;
};
/* 満月の手数(ply)に合わせる。fullMoon=falseなら新月に */
const setMoon = (s: GameState, fullMoon: boolean) => {
  s.plies = fullMoon ? (MOON_CYCLE - 1) * 2 : 0;
};

/* ---------- 月齢(moon) ---------- */

test('moon: 満月以外の手番では会心が発動しない', () => {
  const s = blank();
  s.turn = 'p';
  setMoon(s, false);
  put(s, 2, 3, 'kyubi', 'p');
  put(s, 2, 2, 'ittan', 'e');
  put(s, 0, 0, 'shuten', 'e'); // 敵大将(勝敗確定を避ける)
  put(s, 0, 5, 'ittan', 'p');
  const ev = capEv(cap(s, 2, 3, 2, 2));
  expect(ev.damage, '新月: 素のATK400').toBe(400);
  expect(ev.procs).toHaveLength(0);
});

test('moon: 満月の手番は会心が確定発動する(乱数不要)', () => {
  const s = blank();
  s.turn = 'p';
  setMoon(s, true);
  put(s, 2, 3, 'kyubi', 'p');
  put(s, 2, 2, 'ittan', 'e');
  put(s, 0, 0, 'shuten', 'e');
  put(s, 0, 5, 'ittan', 'p');
  const ev = capEv(cap(s, 2, 3, 2, 2, { rand: () => 0.99 })); // 乱数は最悪値でも確定
  expect(ev.damage, '満月: 400×2').toBe(800);
  expect(ev.procs.some(p => p.name === '妖狐の業火')).toBe(true);
});

test('moon: 期待値計算(AI読み)でも満月は決定的に評価される', () => {
  for (const fullMoon of [true, false]) {
    const s = blank();
    s.turn = 'p';
    setMoon(s, fullMoon);
    put(s, 2, 3, 'tamamo', 'p'); // ATK450 ×2.2
    put(s, 2, 2, 'ittan', 'e');
    put(s, 0, 0, 'shuten', 'e');
    put(s, 0, 5, 'ittan', 'p');
    const ev = capEv(cap(s, 2, 3, 2, 2, { rng: false }));
    expect(ev.damage).toBe(fullMoon ? Math.round(450 * 2.2) : 450);
  }
});

test('moon: 砂かけ婆(jam)は満月会心も封じる', () => {
  const s = blank();
  s.turn = 'p';
  setMoon(s, true);
  put(s, 2, 3, 'kyubi', 'p');
  put(s, 2, 2, 'ittan', 'e');
  put(s, 4, 0, 'sunakake', 'e');
  put(s, 0, 0, 'shuten', 'e');
  put(s, 0, 5, 'ittan', 'p');
  const ev = capEv(cap(s, 2, 3, 2, 2));
  expect(ev.damage, '封じ: 素のATK').toBe(400);
});

test('moon: 月齢は両者共通で1夜=2手で進む', () => {
  const s = Game.newState();
  expect(Game.moonPhase(s)).toBe(0);
  s.plies = 2;
  expect(Game.moonPhase(s), '2手で次の夜').toBe(1);
  s.plies = (MOON_CYCLE - 1) * 2;
  expect(Game.isFullMoonPly(s.plies)).toBe(true);
  expect(Game.nightsUntilFullMoon(s)).toBe(0);
  s.plies = MOON_CYCLE * 2;
  expect(Game.moonPhase(s), '満月の翌夜は新月に戻る').toBe(0);
});

/* ---------- 八岐の首(heads) ---------- */

test('heads: 首は最大+90%で頭打ち', () => {
  const s = blank();
  s.turn = 'p';
  put(s, 2, 3, 'yamata', 'p');
  s.board[3][2]!.kills = 10; // 育ちきった状態
  put(s, 2, 2, 'ittan', 'e');
  put(s, 0, 0, 'shuten', 'e');
  put(s, 0, 5, 'ittan', 'p');
  const ev = capEv(cap(s, 2, 3, 2, 2));
  expect(ev.damage).toBe(Math.round(420 * 1.9)); // 798
});

test('heads: jamで倍率は封じられるが撃破数は貯まる', () => {
  const s = blank();
  s.turn = 'p';
  put(s, 2, 3, 'yamata', 'p');
  s.board[3][2]!.kills = 2;
  put(s, 2, 2, 'ittan', 'e');
  put(s, 4, 0, 'sunakake', 'e');
  put(s, 0, 0, 'shuten', 'e');
  put(s, 0, 5, 'ittan', 'p');
  const ev = capEv(cap(s, 2, 3, 2, 2));
  expect(ev.damage).toBe(420);
  expect(s.board[2][2]?.kills).toBe(3);
});

/* ---------- 百鬼の陣(legion) ---------- */

test('legion: 盤上の味方1体につき+5%、上限+40%', () => {
  const mk = (allies: number) => {
    const s = blank();
    s.turn = 'p';
    put(s, 2, 3, 'nurarihyon', 'p'); // ATK430
    put(s, 2, 2, 'ittan', 'e');
    put(s, 0, 0, 'shuten', 'e');
    for (let i = 0; i < allies; i++) put(s, i % COLS, 5 - Math.floor(i / COLS), 'ittan', 'p');
    return capEv(cap(s, 2, 3, 2, 2)).damage;
  };
  expect(mk(0), '単騎: 素のATK').toBe(430);
  expect(mk(2), '+10%').toBe(Math.round(430 * 1.1));
  expect(mk(10), '10体でも上限+40%').toBe(Math.round(430 * 1.4));
});

/* ---------- 覚醒(awaken) ---------- */

test('awaken: 取り合いで両陣営のゲージが+1ずつ溜まる', () => {
  const s = blank();
  s.turn = 'p';
  put(s, 2, 3, 'kooni', 'p');
  put(s, 2, 2, 'ittan', 'e');
  put(s, 0, 0, 'shuten', 'e');
  put(s, 0, 5, 'kyubi', 'p');
  cap(s, 2, 3, 2, 2);
  expect(s.awaken.p.gauge).toBe(1);
  expect(s.awaken.e.gauge).toBe(1);
});

test('awaken: ゲージ満タンで自軍SSRへの覚醒アクションが合法手に加わる', () => {
  const s = blank();
  s.turn = 'p';
  put(s, 2, 5, 'kyubi', 'p');
  put(s, 0, 3, 'kooni', 'p'); // SSRでない駒は対象外
  put(s, 2, 0, 'shuten', 'e');
  const before = Game.getAllActions(s, 'p').filter(a => a.kind === 'awaken');
  expect(before, 'ゲージ不足では出ない').toHaveLength(0);
  s.awaken.p.gauge = AWAKEN_MAX;
  const acts = Game.getAllActions(s, 'p').filter(a => a.kind === 'awaken');
  expect(acts).toHaveLength(1);
  expect(acts[0].to).toEqual({ x: 2, y: 5 });
});

test('awaken: 発動でATK1.5倍が自分の3手番続き、その後切れる。1局1回のみ', () => {
  const s = blank();
  s.turn = 'p';
  put(s, 2, 4, 'kyubi', 'p');
  put(s, 0, 0, 'shuten', 'e');
  put(s, 0, 5, 'ittan', 'p');
  s.awaken.p.gauge = AWAKEN_MAX;
  setMoon(s, false); // 満月会心を混ぜない

  const events = Game.applyAction(s, { kind: 'awaken', to: { x: 2, y: 4 } });
  expect(events[0].t).toBe('awaken');
  expect(s.awaken.p.used).toBe(true);
  expect(s.turn, '手番を消費する').toBe('e');
  expect(Game.getAllActions(s, 'p').some(a => a.kind === 'awaken'), '再発動不可').toBe(false);

  /* 覚醒中の攻撃はATK1.5倍(発動がply0 → 有効はply6まで=自分の3手番) */
  const kyubi = s.board[4][2]!;
  expect(Game.isAwakened(kyubi, s.plies)).toBe(true);
  put(s, 2, 3, 'ittan', 'e');
  s.turn = 'p';
  s.plies = 2; // 自分の1手番目
  const ev = capEv(cap(s, 2, 4, 2, 3));
  expect(ev.damage).toBe(Math.round(400 * 1.5));
  expect(ev.procs.some(p => p.name === '九尾開眼')).toBe(true);

  /* 期限切れ後は素に戻る */
  s.turn = 'p';
  s.combo.p = 0;
  s.plies = AWAKEN_SPAN + 2; // 発動ply0 + SPAN を超えた
  put(s, 2, 2, 'ittan', 'e');
  const ev2 = capEv(cap(s, 2, 3, 2, 2));
  expect(ev2.damage, '覚醒切れ: 素のATK').toBe(400);
});

/* ---------- 因縁共鳴 ---------- */

test('oniFeast(鬼の宴): 酒呑と茨木が並ぶと互いの会心率+15%(期待値で検証)', () => {
  const mk = (withPartner: boolean) => {
    const s = blank();
    s.turn = 'p';
    put(s, 2, 3, 'ibaraki', 'p'); // ATK320 30%×2
    if (withPartner) put(s, 4, 5, 'shuten', 'p');
    else put(s, 4, 5, 'kyubi', 'p');
    put(s, 2, 2, 'ittan', 'e');
    put(s, 0, 0, 'nurarihyon', 'e');
    put(s, 0, 5, 'ittan', 'p');
    return capEv(cap(s, 2, 3, 2, 2, { rng: false })).damage;
  };
  expect(mk(false)).toBe(Math.round(320 * (1 + 0.3 * 1)));   // 期待倍率1.30
  expect(mk(true)).toBe(Math.round(320 * (1 + 0.45 * 1)));   // 会心率45% → 期待倍率1.45
});

test('oniFeast: 異装(鬼神・酒呑童子)でも共鳴する', () => {
  const s = blank();
  s.turn = 'p';
  put(s, 2, 3, 'ibaraki_rashomon', 'p');
  put(s, 4, 5, 'shuten_kishin', 'p');
  put(s, 2, 2, 'ittan', 'e');
  put(s, 0, 0, 'nurarihyon', 'e');
  put(s, 0, 5, 'ittan', 'p');
  const ev = capEv(cap(s, 2, 3, 2, 2, { rng: false }));
  expect(ev.damage).toBe(Math.round(320 * 1.45));
});

test('foxBond(妖狐相伝): 玉藻前を取られると九尾が激怒し、次の攻撃が確定会心', () => {
  const s = blank();
  s.turn = 'e';
  setMoon(s, false); // 満月ではない状況で確定会心を検証
  put(s, 2, 3, 'tamamo', 'p');
  put(s, 1, 2, 'nekomata', 'e');
  put(s, 2, 5, 'kyubi', 'p');
  put(s, 0, 0, 'shuten', 'e');
  put(s, 0, 5, 'ittan', 'p');

  const ev = capEv(cap(s, 1, 2, 2, 3)); // 猫又が玉藻前を取る
  expect(ev.enrage?.id, '九尾が激怒').toBe('kyubi');
  const kyubi = s.board[5][2]!;
  expect(kyubi.enraged).toBe(true);

  /* 激怒中の攻撃は月齢に関係なく確定会心。一撃で解除される */
  s.turn = 'p';
  s.plies = 0;
  put(s, 2, 4, 'ittan', 'e');
  const ev2 = capEv(cap(s, 2, 5, 2, 4, { rand: () => 0.99 }));
  expect(ev2.damage).toBe(800); // 400×2 確定
  expect(s.board[4][2]?.enraged, '激怒は消費される').toBeUndefined();
});

/* ---------- 互換性 ---------- */

test('互換: plies/awaken を持たない旧状態でも applyAction が動く', () => {
  const s = Game.newState();
  delete (s as Partial<GameState>).plies;
  delete (s as Partial<GameState>).awaken;
  const acts = Game.getAllActions(s, 'p');
  expect(acts.length).toBeGreaterThan(0);
  expect(() => Game.applyAction(s, acts[0])).not.toThrow();
  expect(s.plies).toBe(1);
  expect(s.awaken.p.gauge).toBe(0);
});

test('全SSRに覚醒技名が定義されている', () => {
  for (const id in YOKAI) {
    if (YOKAI[id].rarity === 'SSR') {
      expect(YOKAI[id].awakenName, `${id} の awakenName`).toBeTruthy();
    }
  }
});
