/* 妖怪道場: 詰問クリアでチケット1枚(1問1回)。指し手はエンジンで検証する */

import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { apiError } from '../lib/errors';
import { currencyLogStmt, getProfile, isConstraintError, TICKETS_CAP } from '../db';
import { authRequired } from '../middleware';
import { DOJO_PUZZLES, dojoPuzzleById, evaluateDojo, isDojoUnlocked } from '../../../shared/dojo';

export const dojoRoutes = new Hono<AppEnv>();
dojoRoutes.use('/dojo', authRequired);
dojoRoutes.use('/dojo/*', authRequired);

dojoRoutes.get('/dojo', async c => {
  const userId = c.get('userId');
  const rs = await c.env.DB.prepare(
    'SELECT puzzle_id FROM dojo_clears WHERE user_id = ?1',
  ).bind(userId).all<{ puzzle_id: string }>();
  return c.json({
    cleared: rs.results.map(row => row.puzzle_id),
    total: DOJO_PUZZLES.length,
  });
});

dojoRoutes.post('/dojo/clear', async c => {
  const body = await c.req.json().catch(() => null) as { id?: unknown; actions?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  const puzzle = dojoPuzzleById(id);
  if (!puzzle) return apiError(c, 'VALIDATION', '課題が見つかりません');
  const judged = evaluateDojo(puzzle, body?.actions);
  if (!judged.ok) return apiError(c, 'VALIDATION', judged.reason);

  const userId = c.get('userId');
  const db = c.env.DB;
  const p = await getProfile(db, userId);
  if (!p) return apiError(c, 'UNAUTHORIZED', 'プロファイルが存在しません');

  const clearedRs = await db.prepare(
    'SELECT puzzle_id FROM dojo_clears WHERE user_id = ?1',
  ).bind(userId).all<{ puzzle_id: string }>();
  const cleared = clearedRs.results.map(row => row.puzzle_id);
  if (cleared.includes(puzzle.id)) {
    return c.json({ granted: 0, tickets: p.tickets, already: true });
  }
  if (!isDojoUnlocked(puzzle.id, cleared)) {
    return apiError(c, 'VALIDATION', 'まだ挑戦できない課題です');
  }

  const grant = Math.min(puzzle.tickets, Math.max(0, TICKETS_CAP - p.tickets));
  const newTickets = p.tickets + grant;
  try {
    await db.batch([
      db.prepare('INSERT INTO dojo_clears (user_id, puzzle_id, tickets) VALUES (?1, ?2, ?3)')
        .bind(userId, puzzle.id, grant),
      ...(grant > 0 ? [
        db.prepare('UPDATE user_profiles SET tickets = MIN(tickets + ?2, ?3) WHERE user_id = ?1')
          .bind(userId, grant, TICKETS_CAP),
        currencyLogStmt(db, userId, 'tickets', grant, newTickets, 'dojo_clear', puzzle.id),
      ] : []),
    ]);
  } catch (e) {
    if (isConstraintError(e)) {
      const now = await db.prepare('SELECT tickets FROM user_profiles WHERE user_id = ?1')
        .bind(userId).first<{ tickets: number }>();
      return c.json({ granted: 0, tickets: now?.tickets ?? p.tickets, already: true });
    }
    throw e;
  }

  return c.json({ granted: grant, tickets: newTickets, already: false });
});
