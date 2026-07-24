/* ソロ(AI)勝利報酬: 申告制+日次上限2枚(doc 07 / 08)
   ソロ対局はクライアント完結のため申告は信用できない前提。
   上限を小さくして不正の旨味を消す。Phase 2以降でサーバー進行に寄せるか再検討 */

import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { apiError } from '../lib/errors';
import { gameDate, gameWeek } from '../lib/time';
import { currencyLogStmt, getProfile, isConstraintError, SOLO_WIN_DAILY_CAP, TICKETS_CAP } from '../db';
import { authRequired } from '../middleware';
import { HYAKKI_MIN_DURATION_MS } from '../../../shared/hyakki';
import type { HyakkiProgress } from '../../../shared/hyakki';

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

/* ---------- 百鬼夜行 週間連勝ランキング(doc 21) ----------
   連勝カウンタの正本はサーバー。start/resultのペア申告で、
   劣勢リロード(start未解決)と連打申告(最短時間未満)を負け扱いにする。
   報酬は名誉のみなので、これ以上の検証は行わない */

/* 今週の自己ベストと順位(同率同順位)。未勝利なら {0, null} */
async function hyakkiStanding(db: D1Database, userId: string, week: string): Promise<{ bestStreak: number; rank: number | null }> {
  const mine = await db.prepare('SELECT best_streak FROM hyakki_weekly WHERE user_id = ?1 AND week = ?2')
    .bind(userId, week).first<{ best_streak: number }>();
  if (!mine) return { bestStreak: 0, rank: null };
  const above = await db.prepare(
    `SELECT COUNT(*) AS n FROM hyakki_weekly w
       JOIN users u ON u.id = w.user_id AND u.status = 'active'
      WHERE w.week = ?1 AND w.best_streak > ?2`,
  ).bind(week, mine.best_streak).first<{ n: number }>();
  return { bestStreak: mine.best_streak, rank: (above?.n ?? 0) + 1 };
}

soloRoutes.post('/solo/hyakki/start', authRequired, async c => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const p = await getProfile(db, userId);
  if (!p) return apiError(c, 'UNAUTHORIZED', 'プロファイルが存在しません');

  const week = gameWeek();
  /* 週替わりで連勝リセット。前局のstartが未報告なら負け扱いで0から */
  const streak = p.hyakki_week === week && !p.hyakki_pending_at ? p.hyakki_streak : 0;
  await db.prepare('UPDATE user_profiles SET hyakki_streak = ?2, hyakki_week = ?3, hyakki_pending_at = ?4 WHERE user_id = ?1')
    .bind(userId, streak, week, new Date().toISOString()).run();

  const { bestStreak, rank } = await hyakkiStanding(db, userId, week);
  return c.json<HyakkiProgress>({ currentStreak: streak, bestStreak, rank });
});

/* ロビー表示用: pendingを立てずに現在連勝・今週ベストを返す */
soloRoutes.get('/solo/hyakki/status', authRequired, async c => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const p = await getProfile(db, userId);
  if (!p) return apiError(c, 'UNAUTHORIZED', 'プロファイルが存在しません');

  const week = gameWeek();
  const currentStreak = p.hyakki_week === week ? p.hyakki_streak : 0;
  const { bestStreak, rank } = await hyakkiStanding(db, userId, week);
  return c.json<HyakkiProgress>({ currentStreak, bestStreak, rank });
});

soloRoutes.post('/solo/hyakki/result', authRequired, async c => {
  const body = await c.req.json().catch(() => null) as { win?: unknown } | null;
  if (!body || typeof body.win !== 'boolean') return apiError(c, 'VALIDATION', 'win(boolean)が必要です');
  const userId = c.get('userId');
  const db = c.env.DB;
  const p = await getProfile(db, userId);
  if (!p) return apiError(c, 'UNAUTHORIZED', 'プロファイルが存在しません');
  if (!p.hyakki_pending_at) return apiError(c, 'VALIDATION', '対局の開始が申告されていません');

  const now = Date.now();
  const week = gameWeek(new Date(now));
  /* 週を跨いだ対局は新週側で0から数える。最短時間未満の勝利は負け扱い */
  const carried = p.hyakki_week === week ? p.hyakki_streak : 0;
  const elapsed = now - Date.parse(p.hyakki_pending_at);
  const streak = body.win && elapsed >= HYAKKI_MIN_DURATION_MS ? carried + 1 : 0;

  await db.batch([
    db.prepare('UPDATE user_profiles SET hyakki_streak = ?2, hyakki_week = ?3, hyakki_pending_at = NULL WHERE user_id = ?1')
      .bind(userId, streak, week),
    ...(streak > 0 ? [db.prepare(
      `INSERT INTO hyakki_weekly (user_id, week, best_streak) VALUES (?1, ?2, ?3)
       ON CONFLICT (user_id, week) DO UPDATE SET best_streak = excluded.best_streak, updated_at = datetime('now')
       WHERE excluded.best_streak > hyakki_weekly.best_streak`,
    ).bind(userId, week, streak)] : []),
  ]);

  const { bestStreak, rank } = await hyakkiStanding(db, userId, week);
  return c.json<HyakkiProgress>({ currentStreak: streak, bestStreak, rank });
});
