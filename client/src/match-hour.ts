/* 逢魔が時の表示 — ランダムマッチは常時可、20–22は推奨時間として案内 */

import {
  EVENT_PARTICIPATION_TICKETS, EVENT_YOKAI_ID, PARTICIPATION_TICKETS,
  isEventDay, isMatchHour, MATCH_HOUR_LABEL, msUntilMatchHourOpen,
} from '../../shared/match-hour';
import { YOKAI } from '../../shared/data';
import { $ } from './util';

/** その日の参加メリットの短文(タイトル・オンラインモーダル共通) */
function meritText(): string {
  if (!isEventDay()) return `1局完走でチケット🎟+${PARTICIPATION_TICKETS}(1日1回)`;
  const yokai = EVENT_YOKAI_ID ? YOKAI[EVENT_YOKAI_ID] : null;
  const bonus = `1局完走でチケット🎟+${EVENT_PARTICIPATION_TICKETS}`;
  return yokai ? `${bonus}＆限定「${yokai.name}」入手` : bonus;
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}時間${m}分`;
  return `${m}分`;
}

let timerId: ReturnType<typeof setInterval> | null = null;

export const MatchHourUI = {
  refresh(): void {
    const open = isMatchHour();
    const randomBtn = $<HTMLButtonElement>('btn-online-random');
    const randomNote = $('online-random-schedule');

    if (open) {
      randomNote.textContent = `逢魔が時 開催中（${MATCH_HOUR_LABEL}）— 対戦相手が集まりやすい時間です。${meritText()}`;
    } else {
      const remain = formatCountdown(msUntilMatchHourOpen());
      randomNote.textContent =
        `いつでもマッチ可能。集まりやすい時間は ${MATCH_HOUR_LABEL}（開始まであと ${remain}）。${meritText()}`;
    }

    randomBtn.disabled = false;
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
