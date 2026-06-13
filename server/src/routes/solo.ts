/* ソロ(AI)勝利報酬: 申告制+日次上限2枚(doc 07 / 08)
   ソロ対局はクライアント完結のため申告は信用できない前提。
   上限を小さくして不正の旨味を消す。Phase 2以降でサーバー進行に寄せるか再検討 */

import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { apiError } from '../lib/errors';
import { gameDate } from '../lib/time';
import { currencyLogStmt, getProfile, isConstraintError, SOLO_WIN_DAILY_CAP, TICKETS_CAP } from '../db';
import { authRequired } from '../middleware';

export const soloRoutes = new Hono<AppEnv>();

soloRoutes.post('/solo/win', authRequired, async c => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const p = await getProfile(db, userId);
  if (!p) return apiError(c, 'UNAUTHORIZED', 'プロファイルが存在しません');

  const today = gameDate();
  const countToday = p.daily_reset_date === today ? p.daily_win_reward_count : 0;
  const grant = countToday < SOLO_WIN_DAILY_CAP ? Math.min(1, TICKETS_CAP - p.tickets) : 0;
  const newTickets = p.tickets + grant;

  try {
    await db.batch([
      db.prepare(`UPDATE user_profiles SET
          wins = wins + 1,
          tickets = MIN(tickets + ?2, ?3),
          daily_win_reward_count = ?4,
          daily_reset_date = ?5
        WHERE user_id = ?1`)
        .bind(userId, grant, TICKETS_CAP, countToday + (grant > 0 ? 1 : 0), today),
      ...(grant > 0 ? [currencyLogStmt(db, userId, 'tickets', grant, newTickets, 'win_reward', `solo:${today}`)] : []),
    ]);
  } catch (e) {
    if (isConstraintError(e)) return apiError(c, 'CONFLICT', '混み合っています。もう一度お試しください');
    throw e;
  }

  return c.json({
    granted: grant,
    tickets: newTickets,
    dailyCount: countToday + (grant > 0 ? 1 : 0),
    dailyCap: SOLO_WIN_DAILY_CAP,
    wins: p.wins + 1,
  });
});
