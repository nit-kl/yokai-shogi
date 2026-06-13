/* ゲーム内日付: JST 04:00 リセット(doc 08)
   JST(UTC+9)から4時間引く = UTC+5 のカレンダー日付がゲーム内日付になる */

export function gameDate(now: Date = new Date()): string {
  const t = new Date(now.getTime() + 5 * 3600e3);
  return t.toISOString().slice(0, 10);
}

export function prevGameDate(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* n日前のゲーム内日付(休眠判定などに使用) */
export function gameDateDaysAgo(days: number, now: Date = new Date()): string {
  return gameDate(new Date(now.getTime() - days * 86400e3));
}
