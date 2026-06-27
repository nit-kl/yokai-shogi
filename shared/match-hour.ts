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
