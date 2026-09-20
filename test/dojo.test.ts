import { test, expect } from 'vitest';
import {
  DOJO_PUZZLES, buildDojoState, evaluateDojo, isDojoUnlocked,
} from '../shared/dojo';
import { Game } from '../shared/game';
import type { Action } from '../shared/game';

const SOLUTIONS: Record<string, Action[]> = {
  'd01-advance': [{ kind: 'move', from: { x: 2, y: 2 }, to: { x: 2, y: 1 } }],
  'd02-diagonal': [{ kind: 'move', from: { x: 1, y: 2 }, to: { x: 2, y: 1 } }],
  'd03-rush': [{ kind: 'move', from: { x: 2, y: 5 }, to: { x: 2, y: 1 } }],
  'd04-promo': [{ kind: 'move', from: { x: 2, y: 2 }, to: { x: 3, y: 1 } }],
  'd05-drop': [
    { kind: 'drop', id: 'kooni', to: { x: 2, y: 2 } },
    { kind: 'move', from: { x: 2, y: 2 }, to: { x: 2, y: 1 } },
  ],
  'd06-combo': [
    { kind: 'move', from: { x: 2, y: 3 }, to: { x: 2, y: 2 } },
    { kind: 'move', from: { x: 2, y: 2 }, to: { x: 2, y: 1 } },
  ],
  'd07-zone': [{ kind: 'move', from: { x: 1, y: 2 }, to: { x: 2, y: 1 } }],
  'd08-jump': [{ kind: 'move', from: { x: 1, y: 3 }, to: { x: 2, y: 1 } }],
  'd09-tengu': [{ kind: 'move', from: { x: 0, y: 3 }, to: { x: 2, y: 1 } }],
  'd10-promote-break': [
    { kind: 'move', from: { x: 2, y: 2 }, to: { x: 2, y: 1 } },
    { kind: 'move', from: { x: 2, y: 1 }, to: { x: 3, y: 0 } },
  ],
};

test('道場は10問で、解答がすべて通る', () => {
  expect(DOJO_PUZZLES).toHaveLength(10);
  for (const puzzle of DOJO_PUZZLES) {
    const actions = SOLUTIONS[puzzle.id];
    expect(actions, puzzle.id).toBeTruthy();
    const result = evaluateDojo(puzzle, actions);
    expect(result, `${puzzle.id}: ${result.reason}`).toEqual({ ok: true, reason: 'clear' });
  }
});

test('不正な手・未達成は拒否する', () => {
  const p1 = DOJO_PUZZLES[0];
  expect(evaluateDojo(p1, []).ok).toBe(false);
  expect(evaluateDojo(p1, [{ kind: 'move', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }]).ok).toBe(false);
  const idle = { kind: 'move' as const, from: { x: 4, y: 5 }, to: { x: 4, y: 4 } };
  expect(evaluateDojo(p1, [idle]).ok).toBe(false);
});

test('未クリアの次問は解放されない', () => {
  expect(isDojoUnlocked('d01-advance', [])).toBe(true);
  expect(isDojoUnlocked('d02-diagonal', [])).toBe(false);
  expect(isDojoUnlocked('d02-diagonal', ['d01-advance'])).toBe(true);
});

test('道場の初期局面はプレイヤー手番で構築できる', () => {
  const s = buildDojoState(DOJO_PUZZLES[0]);
  expect(s.turn).toBe('p');
  expect(Game.getAllActions(s, 'p').length).toBeGreaterThan(0);
});
