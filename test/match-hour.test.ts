import { describe, expect, it } from 'vitest';
import { isMatchHour, msUntilMatchHourOpen } from '../shared/match-hour';

describe('match-hour', () => {
  it('JST 20時台を逢魔が時と判定する', () => {
    expect(isMatchHour(new Date('2026-06-27T11:00:00Z'))).toBe(true);
    expect(isMatchHour(new Date('2026-06-27T08:00:00Z'))).toBe(false);
    expect(isMatchHour(new Date('2026-06-27T13:30:00Z'))).toBe(false);
  });

  it('開催前は次の開始までの時間を返す', () => {
    const now = Date.parse('2026-06-27T08:00:00Z'); // 17:00 JST
    expect(msUntilMatchHourOpen(now)).toBe(3 * 3600 * 1000);
    expect(msUntilMatchHourOpen(Date.parse('2026-06-27T11:00:00Z'))).toBe(0);
  });
});
