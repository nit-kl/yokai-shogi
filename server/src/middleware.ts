/* Bearer認証ミドルウェア: JWT検証 + BAN状態チェック(doc 06 / 07) */

import { createMiddleware } from 'hono/factory';
import type { AppEnv } from './env';
import { apiError } from './lib/errors';
import { verifyJwt } from './lib/jwt';

export const authRequired = createMiddleware<AppEnv>(async (c, next) => {
  const auth = c.req.header('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return apiError(c, 'UNAUTHORIZED', '認証が必要です');
  const claims = await verifyJwt(auth.slice(7), c.env.JWT_SECRET);
  if (!claims) return apiError(c, 'UNAUTHORIZED', 'トークンが無効か期限切れです');

  const user = await c.env.DB
    .prepare('SELECT status, is_guest FROM users WHERE id = ?1')
    .bind(claims.sub)
    .first<{ status: string; is_guest: number }>();
  if (!user) return apiError(c, 'UNAUTHORIZED', 'ユーザーが存在しません');
  if (user.status !== 'active') return apiError(c, 'BANNED', 'このアカウントは利用停止されています');

  c.set('userId', claims.sub);
  c.set('isGuest', !!user.is_guest);
  await next();
});
