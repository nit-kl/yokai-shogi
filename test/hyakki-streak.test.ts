import { expect, test } from 'vitest';
import { elapsedSincePending, HYAKKI_MIN_DURATION_MS } from '../shared/hyakki';

test('連勝の最短時間は速攻の対局を捨てない', () => {
  expect(HYAKKI_MIN_DURATION_MS).toBeLessThanOrEqual(3_000);
  expect(HYAKKI_MIN_DURATION_MS).toBeGreaterThan(0);
});

test('開始時刻は ISO と SQLite datetime の両方で経過を測る', () => {
  const now = Date.parse('2026-11-01T03:31:05.000Z');
  expect(elapsedSincePending('2026-11-01T03:31:00.000Z', now)).toBe(5_000);
  expect(elapsedSincePending('2026-11-01 03:31:00', now)).toBe(5_000);
  expect(Number.isNaN(elapsedSincePending('not-a-time', now))).toBe(true);
});
