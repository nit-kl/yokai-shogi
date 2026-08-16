import { test, expect } from 'vitest';
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
  expect(ms, `hard think ${ms.toFixed(1)}ms`).toBeLessThan(900);
});
