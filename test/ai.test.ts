import { test, expect, vi } from 'vitest';
import { Game } from '../shared/game';
import { AI } from '../client/src/ai';
import { YOKAI } from '../shared/data';

test('hasAnyAction は getAllActions の空判定と一致する', () => {
  const s = Game.newState();
  expect(Game.hasAnyAction(s, 'p')).toBe(true);
  expect(Game.hasAnyAction(s, 'e')).toBe(true);

  for (let y = 0; y < 6; y++) for (let x = 0; x < 5; x++) s.board[y][x] = null;
  s.hands.p = {};
  s.hands.e = {};
  s.awaken.p.used = true;
  s.awaken.e.used = true;
  expect(Game.getAllActions(s, 'p')).toEqual([]);
  expect(Game.hasAnyAction(s, 'p')).toBe(false);
  expect(Game.hasAnyAction(s, 'e')).toBe(false);
});

test('持ち駒が多い局面でも hard は予算内に合法手を返す', () => {
  const s = Game.newState();
  s.turn = 'e';
  const ids = Object.values(YOKAI).filter(d => !d.boss).map(d => d.id).slice(0, 5);
  for (const id of ids) {
    s.hands.e[id] = 1;
    s.hands.p[id] = 1;
  }
  expect(Game.getAllActions(s, 'e').length).toBeGreaterThan(50);

  const t0 = performance.now();
  const action = AI.chooseAction(s, 'hard');
  const ms = performance.now() - t0;

  expect(action).toBeTruthy();
  expect(Game.getAllActions(s, 'e')).toContainEqual(action);
  expect(ms, `hard think ${ms.toFixed(1)}ms`).toBeLessThan(500);
  console.log(`CPU crowded board: ${ms.toFixed(1)}ms`);
});

function tacticalState() {
  const s = Game.newState();
  s.board = s.board.map(row => row.map(() => null));
  s.turn = 'e';
  s.board[0][2] = { uid: 1, id: 'shuten', owner: 'e', promoted: false };
  s.board[5][4] = { uid: 2, id: 'kyubi', owner: 'p', promoted: false };
  s.nextUid = 10;
  return s;
}

test('hard takes an immediate general capture without mutating the board', () => {
  const s = tacticalState();
  s.board[4][4] = { uid: 3, id: 'kappa', owner: 'e', promoted: false };
  const before = Game.clone(s);
  const action = AI.chooseAction(s, 'hard');
  expect(s).toEqual(before);
  expect(action).toBeTruthy();
  Game.applyAction(s, action!, { rng: false });
  expect(s.winner).toBe('e');
});

test('hard saves its general instead of taking an unrelated piece', () => {
  const s = tacticalState();
  s.board[3][2] = { uid: 3, id: 'ittan', owner: 'p', promoted: false };
  s.board[2][0] = { uid: 4, id: 'kappa', owner: 'e', promoted: false };
  s.board[3][0] = { uid: 5, id: 'nue', owner: 'p', promoted: false };
  expect(AI.bossThreatened(s, 'e')).toBe(true);
  const action = AI.chooseAction(s, 'hard');
  expect(action).toBeTruthy();
  Game.applyAction(s, action!, { rng: false });
  for (const reply of Game.getAllActions(s, 'p')) {
    const next = Game.clone(s);
    Game.applyAction(next, reply, { rng: false });
    expect(next.winner).not.toBe('p');
  }
});

test('hard avoids a capture whose counterattack would kill it', () => {
  const s = tacticalState();
  s.hp.e = 200;
  s.board[2][0] = { uid: 3, id: 'kappa', owner: 'e', promoted: false };
  s.board[3][0] = { uid: 4, id: 'tengu', owner: 'p', promoted: false };
  const action = AI.chooseAction(s, 'hard');
  expect(action).toBeTruthy();
  Game.applyAction(s, action!, { rng: false });
  expect(s.winner).not.toBe('p');
});

test('budget includes preparation and returns a legal fallback when already expired', () => {
  const s = Game.newState();
  s.turn = 'e';
  const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(251);
  try {
    expect(Game.getAllActions(s, 'e')).toContainEqual(AI.chooseAction(s, 'hard'));
    expect(clock).toHaveBeenCalledTimes(2);
  } finally {
    clock.mockRestore();
  }
});
