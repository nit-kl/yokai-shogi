/* 逢魔が時の表示・ランダムマッチボタン制御 */

import { isMatchHour, MATCH_HOUR_LABEL, msUntilMatchHourOpen } from '../../shared/match-hour';
import { $ } from './util';

let timerId: ReturnType<typeof setInterval> | null = null;

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}時間${m}分`;
  return `${m}分`;
}

export const MatchHourUI = {
  refresh(): void {
    const open = isMatchHour();
    const schedule = $('title-online-schedule');
    const randomBtn = $<HTMLButtonElement>('btn-online-random');
    const randomNote = $('online-random-schedule');

    schedule.classList.remove('hidden');
    if (open) {
      schedule.textContent = '逢魔が時 開催中 — ランダムマッチに参加できます';
      randomNote.textContent = 'ランダムマッチは逢魔が時（20:00〜22:00）に開放されています';
    } else {
      const remain = formatCountdown(msUntilMatchHourOpen());
      schedule.textContent = `ランダムマッチ: ${MATCH_HOUR_LABEL}（開始まであと ${remain}）`;
      randomNote.textContent = `ランダムマッチは ${MATCH_HOUR_LABEL} のみです（開始まであと ${remain}）`;
    }

    randomBtn.disabled = !open;
    randomNote.classList.toggle('match-hour-open', open);
  },

  start(): void {
    this.stop();
    this.refresh();
    timerId = setInterval(() => this.refresh(), 30_000);
  },

  stop(): void {
    if (timerId !== null) clearInterval(timerId);
    timerId = null;
  },
};
