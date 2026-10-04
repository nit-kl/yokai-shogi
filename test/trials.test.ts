import { test, expect } from 'vitest';
import { Game } from '../shared/game';
import { TRIALS, makeTrialRand, trialIssue } from '../client/src/trials';

test('試陣は戦型5つと検証陣5つで、どの並びも対局に出せる', () => {
  expect(TRIALS.filter(trial => trial.kind === 'archetype')).toHaveLength(5);
  expect(TRIALS.filter(trial => trial.kind === 'verify')).toHaveLength(5);
  expect(new Set(TRIALS.map(trial => trial.id)).size).toBe(TRIALS.length);
  const seeds = TRIALS.flatMap(trial => trial.seed == null ? [] : [trial.seed]);
  expect(new Set(seeds).size).toBe(seeds.length);

  for (const trial of TRIALS) {
    expect(trialIssue(trial), trial.id).toBeNull();
    const state = Game.newState(trial.playerRows ?? null, trial.enemyRows);
    const placed = state.board.flat().find(piece => piece?.owner === 'e' && piece.id === trial.bossId);
    expect(placed?.id, trial.id).toBe(trial.bossId);
  }
});

test('検証陣の乱数は同じseedなら同じ列になる', () => {
  const a = makeTrialRand(12041);
  const b = makeTrialRand(12041);
  const rolls = [a(), a(), a()];
  expect([b(), b(), b()]).toEqual(rolls);
  expect(makeTrialRand(12042)()).not.toBe(rolls[0]);
});
