/* ============================================================
   妖怪将棋 API(Workers + Hono + D1)- Phase 1
   メタ系(認証・ガチャ・編成)のサーバー権威化(doc 02 / 04)
   対戦(Durable Objects)は Phase 2
   ============================================================ */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv, Env } from './env';
import { apiError } from './lib/errors';
import { authRoutes } from './routes/auth';
import { meRoutes } from './routes/me';
import { gachaRoutes } from './routes/gacha';
import { soloRoutes } from './routes/solo';
import { runDailyJobs } from './cron';

const app = new Hono<AppEnv>();

/* CORS: 許可オリジンは環境変数で管理(doc 07) */
app.use('*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return cors({
    origin: origin => (allowed.includes(origin) ? origin : null),
    allowHeaders: ['Authorization', 'Content-Type'],
    maxAge: 86400,
  })(c, next);
});

/* 死活監視(doc 09) */
app.get('/healthz', async c => {
  try {
    await c.env.DB.prepare('SELECT 1').first();
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false }, 503);
  }
});

app.get('/', c => c.json({ ok: true, service: 'yokai-shogi-api', phase: 1 }));

/* v1 API(doc 04) */
const v1 = new Hono<AppEnv>();
v1.route('/', authRoutes);
v1.route('/', meRoutes);
v1.route('/', gachaRoutes);
v1.route('/', soloRoutes);
app.route('/v1', v1);

app.notFound(c => apiError(c, 'VALIDATION', '不明なエンドポイントです'));
app.onError((err, c) => {
  console.error('[unhandled]', err instanceof Error ? err.stack || err.message : String(err));
  return apiError(c, 'INTERNAL', 'サーバーエラーが発生しました');
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runDailyJobs(env));
  },
};
