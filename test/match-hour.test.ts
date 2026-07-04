import { describe, expect, it } from 'vitest';
import {
  EVENT_PARTICIPATION_TICKETS, EVENT_YOKAI_ID, PARTICIPATION_TICKETS,
  isEventDay, isMatchHour, jstDateString, msUntilMatchHourOpen, participationTicketsFor,
} from '../shared/match-hour';
import { YOKAI } from '../shared/data';

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

  it('JSTの土曜日を対戦会開催日と判定する(日付境界含む)', () => {
    expect(isEventDay(new Date('2026-07-04T11:00:00Z'))).toBe(true);  // 土曜 20:00 JST
    expect(isEventDay(new Date('2026-07-03T16:00:00Z'))).toBe(true);  // 金曜16時UTC = 土曜01:00 JST
    expect(isEventDay(new Date('2026-07-04T16:00:00Z'))).toBe(false); // 土曜16時UTC = 日曜01:00 JST
    expect(isEventDay(new Date('2026-07-03T11:00:00Z'))).toBe(false); // 金曜 20:00 JST
  });

  it('JSTの暦日を返す', () => {
    expect(jstDateString(new Date('2026-07-04T11:00:00Z'))).toBe('2026-07-04');
    expect(jstDateString(new Date('2026-07-04T16:00:00Z'))).toBe('2026-07-05'); // JSTでは翌日
  });

  it('参加報酬は通常日+1・対戦会日+2', () => {
    expect(participationTicketsFor(new Date('2026-07-03T11:00:00Z'))).toBe(PARTICIPATION_TICKETS);
    expect(participationTicketsFor(new Date('2026-07-04T11:00:00Z'))).toBe(EVENT_PARTICIPATION_TICKETS);
  });

  it('対戦会限定妖怪の設定がマスタと整合する', () => {
    if (EVENT_YOKAI_ID === null) return;
    expect(YOKAI[EVENT_YOKAI_ID], '限定妖怪がマスタに存在する').toBeDefined();
    expect(YOKAI[EVENT_YOKAI_ID].limited, '限定フラグが立っている').toBe(true);
  });
});
