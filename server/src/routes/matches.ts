import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { authRequired } from '../middleware';
import { apiError } from '../lib/errors';

export const matchRoutes = new Hono<AppEnv>();
matchRoutes.use('/matches*', authRequired);

matchRoutes.get('/matches', async c => {
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') || 20)));
  const userId = c.get('userId');
  const rs = await c.env.DB.prepare(
    `SELECT m.id, m.mode, m.winner, m.reason, m.started_at, m.ended_at,
            CASE WHEN m.p_user_id = ?1 THEN ep.name ELSE pp.name END opponent,
            CASE WHEN m.p_user_id = ?1 THEN 'p' ELSE 'e' END side
     FROM matches m
     JOIN user_profiles pp ON pp.user_id = m.p_user_id
     JOIN user_profiles ep ON ep.user_id = m.e_user_id
     WHERE m.p_user_id = ?1 OR m.e_user_id = ?1
     ORDER BY m.started_at DESC LIMIT ?2`,
  ).bind(userId, limit).all();
  return c.json({ matches: rs.results });
});

matchRoutes.get('/matches/:id/replay', async c => {
  const userId = c.get('userId');
  const match = await c.env.DB.prepare(
    'SELECT * FROM matches WHERE id = ?1 AND (p_user_id = ?2 OR e_user_id = ?2)',
  ).bind(c.req.param('id'), userId).first();
  if (!match) return apiError(c, 'VALIDATION', '対局が見つかりません');
  const rs = await c.env.DB.prepare(
    'SELECT seq, side, action, events FROM match_actions WHERE match_id = ?1 ORDER BY seq',
  ).bind(c.req.param('id')).all<{ seq: number; side: string; action: string; events: string }>();
  return c.json({
    match,
    actions: rs.results.map(row => ({ ...row, action: JSON.parse(row.action), events: JSON.parse(row.events) })),
  });
});
