/* 運営向け。ブラウザからは呼ばない。ADMIN_SECRET 未設定時は存在を返さない */

import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { apiError } from '../lib/errors';
import { normalizeLinkCode, sha256b64url } from '../lib/crypto';

const buckets = new Map<string, number[]>();

function rateLimited(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= limit) { buckets.set(key, arr); return true; }
  arr.push(now);
  buckets.set(key, arr);
  return false;
}

function secretMatches(provided: string, expected: string): boolean {
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const bodySchema = z.object({ code: z.string().min(10).max(40) });

export const adminRoutes = new Hono<AppEnv>();

/* 引き継ぎコードのアカウントを全妖怪所持扱いにする */
adminRoutes.post('/admin/demo-unlock', async c => {
  const expected = c.env.ADMIN_SECRET;
  if (!expected) return apiError(c, 'NOT_FOUND', '指定された機能は利用できません');
  const ip = c.req.header('CF-Connecting-IP') || 'local';
  if (rateLimited(`demo-unlock:${ip}`, 10)) return apiError(c, 'RATE_LIMITED', 'しばらく待ってからお試しください');
  const provided = c.req.header('x-admin-secret') || '';
  if (!secretMatches(provided, expected)) return apiError(c, 'NOT_FOUND', '指定された機能は利用できません');

  const body = bodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return apiError(c, 'VALIDATION', 'リクエストが不正です');

  const hash = await sha256b64url(normalizeLinkCode(body.data.code));
  const row = await c.env.DB
    .prepare(`SELECT a.user_id, u.status, p.name FROM auth_identities a
      JOIN users u ON u.id = a.user_id
      JOIN user_profiles p ON p.user_id = a.user_id
      WHERE a.provider = 'link_code' AND a.subject = ?1`)
    .bind(hash)
    .first<{ user_id: string; status: string; name: string }>();
  if (!row) return apiError(c, 'UNAUTHORIZED', '引き継ぎコードが見つかりません');
  if (row.status !== 'active') return apiError(c, 'BANNED', 'このアカウントは利用停止されています');

  await c.env.DB.prepare('UPDATE user_profiles SET unlock_all = 1 WHERE user_id = ?1')
    .bind(row.user_id).run();
  return c.json({ userId: row.user_id, name: row.name, unlockAll: true });
});
