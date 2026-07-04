/* 逢魔が時 — ランダムマッチ開放時間帯(JST) */

export const MATCH_HOUR_START = 20;
export const MATCH_HOUR_END = 22;

export function jstParts(now: Date = new Date()): { hour: number; minute: number; second: number } {
  const jst = new Date(now.getTime() + 9 * 3600e3);
  return {
    hour: jst.getUTCHours(),
    minute: jst.getUTCMinutes(),
    second: jst.getUTCSeconds(),
  };
}

export function isMatchHour(now: Date = new Date()): boolean {
  const { hour } = jstParts(now);
  return hour >= MATCH_HOUR_START && hour < MATCH_HOUR_END;
}

/** 次の逢魔が時開始までのミリ秒(開催中は0) */
export function msUntilMatchHourOpen(now = Date.now()): number {
  if (isMatchHour(new Date(now))) return 0;
  const { hour, minute, second } = jstParts(new Date(now));
  const elapsed = (hour * 3600 + minute * 60 + second) * 1000;
  const start = MATCH_HOUR_START * 3600 * 1000;
  if (hour < MATCH_HOUR_START) return start - elapsed;
  return 24 * 3600 * 1000 - elapsed + start;
}

export const MATCH_HOUR_LABEL = '毎日 20:00〜22:00';

/* ---------- 参加報酬(逢魔が時)・土曜対戦会(doc 18) ---------- */

/** 参加報酬の対象となる最低アクション数(即投了の空回し対策) */
export const PARTICIPATION_MIN_ACTIONS = 10;
/** 逢魔が時のランダムマッチ1局完走報酬(1日1回) */
export const PARTICIPATION_TICKETS = 1;
/** 土曜対戦会(土曜の逢魔が時)の完走報酬(1日1回) */
export const EVENT_PARTICIPATION_TICKETS = 2;
/** 対戦会参加で入手できる限定妖怪(nullで無効化)。shared/data.ts 側の limited フラグと対で運用 */
export const EVENT_YOKAI_ID: string | null = 'nurarihyon_hyakki';
export const EVENT_LABEL = '土曜対戦会';

function jstDate(now: Date = new Date()): Date {
  return new Date(now.getTime() + 9 * 3600e3);
}

/** 土曜対戦会の開催日か(JSTの土曜日) */
export function isEventDay(now: Date = new Date()): boolean {
  return jstDate(now).getUTCDay() === 6;
}

/** JSTの暦日 'YYYY-MM-DD'(参加報酬の1日1回判定に使用) */
export function jstDateString(now: Date = new Date()): string {
  return jstDate(now).toISOString().slice(0, 10);
}

/** その日の参加報酬チケット数 */
export function participationTicketsFor(now: Date = new Date()): number {
  return isEventDay(now) ? EVENT_PARTICIPATION_TICKETS : PARTICIPATION_TICKETS;
}
