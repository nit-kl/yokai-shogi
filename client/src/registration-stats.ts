/* 登録プレイヤー数の取得・表示 */

import type { PlayerRegistrationStats } from '../../shared/stats';
import { $ } from './util';

declare const __API_URL__: string;

const POLL_MS = 60_000;

export async function fetchRegistrationStats(): Promise<PlayerRegistrationStats | null> {
  if (!__API_URL__) return null;
  try {
    const res = await fetch(`${__API_URL__}/v1/stats/players`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json() as PlayerRegistrationStats;
  } catch {
    return null;
  }
}

export const RegistrationStatsUI = {
  timerId: null as ReturnType<typeof setInterval> | null,

  render(count: number): void {
    $('title-registration-count').textContent = String(count);
    $('title-registration-stats').classList.remove('hidden');
  },

  hide(): void {
    $('title-registration-stats').classList.add('hidden');
  },

  async refresh(): Promise<void> {
    const stats = await fetchRegistrationStats();
    if (!stats) { this.hide(); return; }
    this.render(stats.registered);
  },

  startPolling(): void {
    this.stopPolling();
    if (!__API_URL__) { this.hide(); return; }
    void this.refresh();
    this.timerId = setInterval(() => { void this.refresh(); }, POLL_MS);
  },

  stopPolling(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  },
};
