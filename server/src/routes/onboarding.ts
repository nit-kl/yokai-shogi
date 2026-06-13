/* 初回オンボーディング: 大将選択・完了フラグ */

import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { apiError } from '../lib/errors';
import { BOSS_CHOICES, formationWithBoss } from '../../../shared/data';
import { authRequired } from '../middleware';
import { getProfile } from '../db';

export const onboardingRoutes = new Hono<AppEnv>();
onboardingRoutes.use('/onboarding/*', authRequired);

const bossSchema = z.object({
  bossId: z.enum(BOSS_CHOICES),
});

onboardingRoutes.post('/onboarding/boss', async c => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const p = await getProfile(db, userId);
  if (!p) return apiError(c, 'UNAUTHORIZED', 'プロファイルが存在しません');
  if (p.onboarding_done) return apiError(c, 'CONFLICT', 'オンボーディングは完了済みです');

  const body = bossSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return apiError(c, 'VALIDATION', '大将の指定が不正です');

  const bossId = body.data.bossId;
  const formation = formationWithBoss(bossId);
  await db.batch([
    db.prepare('DELETE FROM user_yokai WHERE user_id = ?1').bind(userId),
    db.prepare('INSERT INTO user_yokai (user_id, yokai_id) VALUES (?1, ?2)').bind(userId, bossId),
    db.prepare('UPDATE user_profiles SET formation = ?2 WHERE user_id = ?1')
      .bind(userId, JSON.stringify(formation)),
    db.prepare("DELETE FROM gacha_logs WHERE user_id = ?1 AND idempotency_key = 'onboarding-boss'").bind(userId),
    /* 所持数不変条件(doc 08): 大将付与も gacha_logs.new_count に計上 */
    db.prepare(`INSERT INTO gacha_logs (user_id, idempotency_key, count, new_count, results)
      VALUES (?1, 'onboarding-boss', 0, 1, '[]')`).bind(userId),
  ]);

  return c.json({ bossId, owned: [bossId], rows: formation });
});

onboardingRoutes.post('/onboarding/complete', async c => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const p = await getProfile(db, userId);
  if (!p) return apiError(c, 'UNAUTHORIZED', 'プロファイルが存在しません');
  if (p.onboarding_done) return c.json({ onboardingDone: true });

  await db.prepare('UPDATE user_profiles SET onboarding_done = 1 WHERE user_id = ?1').bind(userId).run();
  return c.json({ onboardingDone: true });
});
