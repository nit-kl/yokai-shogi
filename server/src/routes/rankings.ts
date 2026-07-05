/* 百鬼夜行 週間連勝ランキングの閲覧(doc 21)
   認証不要。Authorizationがあれば自分の順位(me)も返す */

import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { gameWeek } from '../lib/time';
import { verifyJwt } from '../lib/jwt';
import { HYAKKI_LAST_WEEK_TOP, HYAKKI_RANKING_TOP } from '../../../shared/hyakki';
import type { HyakkiRanking, HyakkiRankingEntry } from '../../../shared/hyakki';

export const rankingRoutes = new Hono<AppEnv>();

rankingRoutes.get('/rankings/hyakki', async c => {
  const db = c.env.DB;
  const now = new Date();
  const week = gameWeek(now);
  const lastWeek = gameWeek(new Date(now.getTime() - 7 * 86400e3));

  const topStmt = (weekKey: string, limit: number) => db.prepare(
    `SELECT p.name AS name, r.best_streak AS bestStreak
       FROM hyakki_weekly r
       JOIN users u ON u.id = r.user_id AND u.status = 'active'
       JOIN user_profiles p ON p.user_id = r.user_id
      WHERE r.week = ?1
      ORDER BY r.best_streak DESC, r.updated_at ASC
      LIMIT ?2`,
  ).bind(weekKey, limit);

  const [topRes, lastRes] = await db.batch<HyakkiRankingEntry>([
    topStmt(week, HYAKKI_RANKING_TOP),
    topStmt(lastWeek, HYAKKI_LAST_WEEK_TOP),
  ]);

  /* 認証は任意: トークンが有効なときだけ自分の順位を添える */
  let me: HyakkiRanking['me'] = null;
  const auth = c.req.header('Authorization');
  if (auth?.startsWith('Bearer ')) {
    const claims = await verifyJwt(auth.slice(7), c.env.JWT_SECRET);
    if (claims) {
      const mine = await db.prepare('SELECT best_streak FROM hyakki_weekly WHERE user_id = ?1 AND week = ?2')
        .bind(claims.sub, week).first<{ best_streak: number }>();
      if (mine) {
        const above = await db.prepare(
          `SELECT COUNT(*) AS n FROM hyakki_weekly r
             JOIN users u ON u.id = r.user_id AND u.status = 'active'
            WHERE r.week = ?1 AND r.best_streak > ?2`,
        ).bind(week, mine.best_streak).first<{ n: number }>();
        me = { rank: (above?.n ?? 0) + 1, bestStreak: mine.best_streak };
      }
    }
  }

  /* 認証の有無でレスポンスが変わるため、共有キャッシュにはVaryで区別させる */
  c.header('Vary', 'Authorization');
  c.header('Cache-Control', me ? 'private, max-age=60' : 'public, max-age=60');
  return c.json<HyakkiRanking>({
    week,
    top: topRes.results,
    lastWeek: lastRes.results,
    me,
  });
});
