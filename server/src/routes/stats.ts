import { Hono } from 'hono';
import type { AppEnv } from '../env';
import type { PlayerRegistrationStats } from '../../../shared/stats';

export const statsRoutes = new Hono<AppEnv>();

statsRoutes.get('/stats/players', async c => {
  const row = await c.env.DB.prepare(
    "SELECT COUNT(*) AS registered FROM users WHERE status = 'active'",
  ).first<{ registered: number }>();
  return c.json<PlayerRegistrationStats>({ registered: row?.registered ?? 0 });
});
