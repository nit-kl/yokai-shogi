/* ガチャ・妖力交換(doc 04 / 05 / 08)
   D1パターン: 抽選はbatch前に確定 → 残高UPDATE+ログINSERT+所持INSERTを1batchで原子実行。
   CHECK制約違反/UNIQUE違反はbatch全体をロールバックさせる(最後の防衛線) */

import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { apiError } from '../lib/errors';
import { csprngRand } from '../lib/crypto';
import {
  currencyLogStmt, EXCHANGE_COST, getOwnedSet, getProfile, isConstraintError,
  TICKETS_CAP, YORYOKU_CAP,
} from '../db';
import { authRequired } from '../middleware';
import { drawGacha, gachaRates } from '../../../shared/gacha';
import type { GachaResult } from '../../../shared/gacha';

export const gachaRoutes = new Hono<AppEnv>();

/* ---------- 排出率の公開(静的・認証不要: doc 11) ---------- */
gachaRoutes.get('/gacha/rates', c => c.json(gachaRates()));

/* ---------- ガチャを引く ---------- */
const pullSchema = z.object({
  count: z.union([z.literal(1), z.literal(10)]),
  idempotencyKey: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
});

interface GachaLogRow { results: string; count: number; }

gachaRoutes.post('/gacha/pull', authRequired, async c => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const body = pullSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return apiError(c, 'VALIDATION', 'リクエストが不正です');
  const { count, idempotencyKey } = body.data;

  /* 冪等性: 同一キーは保存済み結果を再返却(doc 05) */
  const replay = async () => {
    const log = await db
      .prepare('SELECT results, count FROM gacha_logs WHERE user_id = ?1 AND idempotency_key = ?2')
      .bind(userId, idempotencyKey)
      .first<GachaLogRow>();
    if (!log) return null;
    const p = (await getProfile(db, userId))!;
    return c.json({ results: JSON.parse(log.results) as GachaResult[], tickets: p.tickets, yoryoku: p.yoryoku });
  };
  const replayed = await replay();
  if (replayed) return replayed;

  /* 抽選(サーバーCSPRNG)→ 書き込みは1batch。所持の同時変化等で制約違反したら1回だけ引き直して再試行 */
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = await getProfile(db, userId);
    if (!p) return apiError(c, 'UNAUTHORIZED', 'プロファイルが存在しません');
    if (p.tickets < count) return apiError(c, 'INSUFFICIENT_TICKETS', 'チケットが不足しています');

    const draw = drawGacha(count, await getOwnedSet(db, userId), csprngRand);
    const yoryokuGain = Math.min(draw.yoryokuGained, YORYOKU_CAP - p.yoryoku);
    const newTickets = p.tickets - count;
    const newYoryoku = p.yoryoku + yoryokuGain;

    try {
      await db.batch([
        db.prepare('UPDATE user_profiles SET tickets = tickets - ?2, yoryoku = MIN(yoryoku + ?3, ?4) WHERE user_id = ?1')
          .bind(userId, count, yoryokuGain, YORYOKU_CAP),
        db.prepare('INSERT INTO gacha_logs (user_id, idempotency_key, count, new_count, results) VALUES (?1, ?2, ?3, ?4, ?5)')
          .bind(userId, idempotencyKey, count, draw.newIds.length, JSON.stringify(draw.results)),
        ...draw.newIds.map(id =>
          db.prepare('INSERT INTO user_yokai (user_id, yokai_id) VALUES (?1, ?2)').bind(userId, id)),
        currencyLogStmt(db, userId, 'tickets', -count, newTickets, 'gacha', idempotencyKey),
        ...(yoryokuGain > 0
          ? [currencyLogStmt(db, userId, 'yoryoku', yoryokuGain, newYoryoku, 'gacha', idempotencyKey)]
          : []),
      ]);
      return c.json({ results: draw.results, tickets: newTickets, yoryoku: newYoryoku });
    } catch (e) {
      if (!isConstraintError(e)) throw e;
      /* 同一キーの並行リクエストが先に成功していた場合は保存結果を返す */
      const again = await replay();
      if (again) return again;
      /* それ以外(残高・所持の競合)は再読込してリトライ */
    }
  }
  return apiError(c, 'CONFLICT', '混み合っています。もう一度お試しください');
});

/* ---------- 妖力交換(300 → チケット1枚) ---------- */
gachaRoutes.post('/exchange', authRequired, async c => {
  const userId = c.get('userId');
  const db = c.env.DB;
  const p = await getProfile(db, userId);
  if (!p) return apiError(c, 'UNAUTHORIZED', 'プロファイルが存在しません');
  if (p.yoryoku < EXCHANGE_COST) return apiError(c, 'INSUFFICIENT_YORYOKU', '妖力が不足しています');
  if (p.tickets >= TICKETS_CAP) return apiError(c, 'CONFLICT', 'チケットが上限に達しています');

  const newTickets = p.tickets + 1;
  const newYoryoku = p.yoryoku - EXCHANGE_COST;
  try {
    await db.batch([
      db.prepare('UPDATE user_profiles SET yoryoku = yoryoku - ?2, tickets = tickets + 1 WHERE user_id = ?1')
        .bind(userId, EXCHANGE_COST),
      currencyLogStmt(db, userId, 'yoryoku', -EXCHANGE_COST, newYoryoku, 'exchange'),
      currencyLogStmt(db, userId, 'tickets', 1, newTickets, 'exchange'),
    ]);
  } catch (e) {
    if (isConstraintError(e)) return apiError(c, 'CONFLICT', '混み合っています。もう一度お試しください');
    throw e;
  }
  return c.json({ tickets: newTickets, yoryoku: newYoryoku });
});
