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
import { verifyJwt } from './lib/jwt';
import { matchRoutes } from './routes/matches';
import { onboardingRoutes } from './routes/onboarding';
import { statsRoutes } from './routes/stats';
import { announcementRoutes } from './routes/announcements';
import { rankingRoutes } from './routes/rankings';
import { adsRoutes } from './routes/ads';
import { steamRoutes } from './routes/steam';
import { BattleRoom } from './do/battle-room';
import { Matchmaker } from './do/matchmaker';

const app = new Hono<AppEnv>();

app.use('/v1/*', async (c, next) => {
  if (c.req.path === '/v1/announcements') { await next(); return; }
  if (c.env.MAINTENANCE === '1') return apiError(c, 'MAINTENANCE', 'メンテナンス中です');
  await next();
});

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
    return c.json({ ok: true, maintenance: c.env.MAINTENANCE === '1' });
  } catch {
    return c.json({ ok: false, maintenance: c.env.MAINTENANCE === '1' }, 503);
  }
});

app.get('/', c => c.json({ ok: true, service: 'yokai-shogi-api', phase: 2 }));

/* v1 API(doc 04) */
const v1 = new Hono<AppEnv>();
v1.route('/', authRoutes);
v1.route('/', meRoutes);
v1.route('/', gachaRoutes);
v1.route('/', soloRoutes);
v1.route('/', matchRoutes);
v1.route('/', onboardingRoutes);
v1.route('/', statsRoutes);
v1.route('/', announcementRoutes);
v1.route('/', rankingRoutes);
v1.route('/', adsRoutes);
v1.route('/', steamRoutes);
app.route('/v1', v1);

app.notFound(c => apiError(c, 'VALIDATION', '不明なエンドポイントです'));
app.onError((err, c) => {
  console.error('[unhandled]', err instanceof Error ? err.stack || err.message : String(err));
  return apiError(c, 'INTERNAL', 'サーバーエラーが発生しました');
});

async function battleGateway(request: Request, env: Env): Promise<Response> {
  if (env.MAINTENANCE === '1') return new Response('Maintenance', { status: 503 });
  const url = new URL(request.url);
  if (url.searchParams.get('v') !== '1') return new Response('Unsupported protocol version', { status: 400 });
  const claims = await verifyJwt(url.searchParams.get('token') || '', env.JWT_SECRET);
  if (!claims) return new Response('Unauthorized', { status: 401 });
  const user = await env.DB.prepare('SELECT status FROM users WHERE id = ?1').bind(claims.sub).first<{ status: string }>();
  if (!user || user.status !== 'active') return new Response('Unauthorized', { status: 401 });
  const headers = new Headers(request.headers);
  headers.set('X-User-Id', claims.sub);
  const matchId = url.searchParams.get('matchId');
  const stub = matchId
    ? env.BATTLE.get(env.BATTLE.idFromName(matchId))
    : env.MATCHMAKER.get(env.MATCHMAKER.idFromName('global'));
  return stub.fetch(new Request(request, { headers }));
}

export { BattleRoom, Matchmaker };

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === '/v1/battle') return battleGateway(request, env);
    return app.fetch(request, env, ctx);
  },
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runDailyJobs(env));
  },
};
