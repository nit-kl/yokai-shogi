/* Steam DLC entitlement 同期(doc 08 / 23)
   - 開発: mockAllowed 時はクライアント申告の dlcIds を信頼
   - 本番: Steam Web API 所有確認を後続で差し込む(現状は空=未所持) */

import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { apiError } from '../lib/errors';
import { getOwnedSet } from '../db';
import { authRequired } from '../middleware';
import { steamMockAllowed } from '../lib/steam';
import { grantSteamDlc } from '../lib/steam-dlc';
import { STEAM_DLC_FULL_COLLECTION, isSteamDlcId } from '../../../shared/steam-dlc';

export const steamRoutes = new Hono<AppEnv>();
steamRoutes.use('/steam/*', authRequired);

const syncSchema = z.object({
  /** クライアントが申告する所有 DLC。mock 時のみサーバーが信頼する */
  dlcIds: z.array(z.string().min(1).max(64)).max(20).optional(),
});

steamRoutes.post('/steam/dlc/sync', async c => {
  const userId = c.get('userId');
  const db = c.env.DB;

  const steamId = await db
    .prepare("SELECT subject FROM auth_identities WHERE user_id = ?1 AND provider = 'steam'")
    .bind(userId)
    .first<{ subject: string }>();
  if (!steamId) return apiError(c, 'VALIDATION', 'Steam アカウントが紐付いていません');

  const body = syncSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return apiError(c, 'VALIDATION', 'リクエストが不正です');

  const claimed = (body.data.dlcIds || []).filter(isSteamDlcId);
  const owned = steamMockAllowed(c.env) ? claimed : [];

  const grantedDlc: string[] = [];
  const newlyGrantedYokai: string[] = [];
  for (const dlcId of owned) {
    const result = await grantSteamDlc(db, userId, dlcId);
    if (result.grantedDlc) grantedDlc.push(dlcId);
    newlyGrantedYokai.push(...result.yokaiIds);
  }

  const already = await db
    .prepare('SELECT dlc_id FROM steam_entitlement_grants WHERE user_id = ?1')
    .bind(userId)
    .all<{ dlc_id: string }>();
  const grantedAll = (already.results || []).map(r => r.dlc_id);

  const ownedSet = await getOwnedSet(db, userId);
  return c.json({
    steamId: steamId.subject,
    mock: steamMockAllowed(c.env),
    ownedDlc: grantedAll,
    newlyGrantedDlc: grantedDlc,
    newlyGrantedYokai: [...new Set(newlyGrantedYokai)],
    collectionCount: ownedSet.size,
    fullCollection: grantedAll.includes(STEAM_DLC_FULL_COLLECTION),
  });
});

steamRoutes.get('/steam/dlc', async c => {
  const userId = c.get('userId');
  const rows = await c.env.DB
    .prepare('SELECT dlc_id FROM steam_entitlement_grants WHERE user_id = ?1')
    .bind(userId)
    .all<{ dlc_id: string }>();
  const ownedDlc = (rows.results || []).map(r => r.dlc_id);
  return c.json({
    ownedDlc,
    fullCollection: ownedDlc.includes(STEAM_DLC_FULL_COLLECTION),
    mockAllowed: steamMockAllowed(c.env),
  });
});
