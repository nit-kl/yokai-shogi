/* プロフィール・ログインボーナス・コレクション・編成(doc 04 / 08) */

import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { apiError } from '../lib/errors';
import { gameDate, prevGameDate } from '../lib/time';
import {
  currencyLogStmt, getOwnedSet, getProfile, isConstraintError,
  STREAK_BONUS_TICKETS, TICKETS_CAP,
} from '../db';
import { authRequired } from '../middleware';
import { validateFormation, validateDisplayName } from '../../../shared/validate';

export const meRoutes = new Hono<AppEnv>();
meRoutes.use('/me', authRequired);
meRoutes.use('/me/*', authRequired);

/* ---------- GET /me(ログインボーナス判定込み: doc 04) ---------- */
meRoutes.get('/me', async c => {
  const userId = c.get('userId');
  const db = c.env.DB;
  let p = await getProfile(db, userId);
  if (!p) return apiError(c, 'UNAUTHORIZED', 'プロファイルが存在しません');

  const today = gameDate();
  let loginBonus: { day: number; tickets: number } | null = null;

  const onboardingDone = !!p.onboarding_done;

  if (onboardingDone && p.last_login_date !== today) {
    const streak = p.last_login_date === prevGameDate(today) ? p.login_streak + 1 : 1;
    const bonus = streak % 7 === 0 ? STREAK_BONUS_TICKETS : 1;
    const newBalance = Math.min(p.tickets + bonus, TICKETS_CAP);
    const delta = newBalance - p.tickets;
    try {
      await db.batch([
        /* PK(user_id, date)が1日1回の正本。並行リクエストはここで弾かれ全体ロールバック */
        db.prepare('INSERT INTO login_bonus_logs (user_id, date, day_count, tickets) VALUES (?1, ?2, ?3, ?4)')
          .bind(userId, today, streak, delta),
        db.prepare(`UPDATE user_profiles SET
            tickets = MIN(tickets + ?2, ?3), last_login_date = ?4, login_streak = ?5,
            daily_win_reward_count = 0, daily_reset_date = ?4
          WHERE user_id = ?1`)
          .bind(userId, delta, TICKETS_CAP, today, streak),
        currencyLogStmt(db, userId, 'tickets', delta, newBalance, 'login_bonus', today),
      ]);
      loginBonus = { day: streak, tickets: delta };
      p = (await getProfile(db, userId))!;
    } catch (e) {
      if (!isConstraintError(e)) throw e;
      p = (await getProfile(db, userId))!; // 並行リクエストが先に付与済み
    }
  }

  return c.json({
    userId,
    name: p.name,
    isGuest: c.get('isGuest'),
    tickets: p.tickets,
    yoryoku: p.yoryoku,
    onboardingDone,
    ...(loginBonus ? { loginBonus } : {}),
    loginStreak: p.login_streak,
    rating: p.rating,
    wins: p.wins,
    losses: p.losses,
    soloWinRewardToday: p.daily_reset_date === today ? p.daily_win_reward_count : 0,
  });
});

/* ---------- コレクション ---------- */
meRoutes.get('/me/collection', async c => {
  const owned = await getOwnedSet(c.env.DB, c.get('userId'));
  return c.json({ owned: [...owned] });
});

/* ---------- 編成 ---------- */
meRoutes.get('/me/formation', async c => {
  const p = await getProfile(c.env.DB, c.get('userId'));
  if (!p) return apiError(c, 'UNAUTHORIZED', 'プロファイルが存在しません');
  return c.json({ rows: JSON.parse(p.formation) });
});

const formationSchema = z.object({ rows: z.array(z.array(z.string().max(30).nullable())) });

meRoutes.put('/me/formation', async c => {
  const userId = c.get('userId');
  const body = formationSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return apiError(c, 'VALIDATION', 'リクエストが不正です');

  /* クライアントと同一の共有ロジックで権威検証(doc 04) */
  const owned = await getOwnedSet(c.env.DB, userId);
  const err = validateFormation(body.data.rows, owned);
  if (err) return apiError(c, 'INVALID_FORMATION', err);

  await c.env.DB.prepare('UPDATE user_profiles SET formation = ?2 WHERE user_id = ?1')
    .bind(userId, JSON.stringify(body.data.rows))
    .run();
  return c.json({ rows: body.data.rows });
});

/* ---------- 表示名(doc 06) ---------- */
const nameSchema = z.object({ name: z.string().max(40) });

meRoutes.put('/me/name', async c => {
  const body = nameSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return apiError(c, 'VALIDATION', 'リクエストが不正です');
  const err = validateDisplayName(body.data.name);
  if (err) return apiError(c, 'VALIDATION', err);
  const name = body.data.name.trim();
  await c.env.DB.prepare('UPDATE user_profiles SET name = ?2 WHERE user_id = ?1')
    .bind(c.get('userId'), name)
    .run();
  return c.json({ name });
});
