/* 日次バッチ(Cron Triggers: JST 04:00)
   - 経済の不変条件チェック(doc 08)→ 違反はWorkers Logsへ(console.error)
   - 休眠ゲスト削除(30日未アクセス・連携なし: doc 06)
   - 期限切れリフレッシュトークン掃除 */

import type { Env } from './env';
import { gameDateDaysAgo } from './lib/time';

interface BalanceMismatch { user_id: string; balance: number; log_sum: number; }

/* 不変条件1: 残高 == currency_logs の delta 合計(通貨別) */
async function checkCurrencyInvariant(db: D1Database, currency: 'tickets' | 'yoryoku'): Promise<BalanceMismatch[]> {
  const rs = await db.prepare(`
    SELECT p.user_id, p.${currency} AS balance,
           IFNULL((SELECT SUM(c.delta) FROM currency_logs c WHERE c.user_id = p.user_id AND c.currency = ?1), 0) AS log_sum
    FROM user_profiles p
    WHERE balance != log_sum
    LIMIT 50`).bind(currency).all<BalanceMismatch>();
  return rs.results;
}

/* 不変条件2: 所持妖怪数 == ガチャ・オンボーディング大将の new_count 合計 + 対戦会限定妖怪の新規付与数 */
async function checkYokaiInvariant(db: D1Database): Promise<{ actual: number; expected: number } | null> {
  const row = await db.prepare(`
    SELECT (SELECT COUNT(*) FROM user_yokai) AS actual,
           IFNULL((SELECT SUM(new_count) FROM gacha_logs), 0)
         + IFNULL((SELECT SUM(yokai_new) FROM participation_logs), 0) AS expected`)
    .first<{ actual: number; expected: number }>();
  return row && row.actual !== row.expected ? row : null;
}

/* 休眠ゲスト削除: 連携なし(auth_identitiesなし)・作成から30日超・最終ログイン30日超 */
async function cleanupDormantGuests(db: D1Database): Promise<number> {
  const cutoffDate = gameDateDaysAgo(30);
  const rs = await db.prepare(`
    SELECT u.id FROM users u
    LEFT JOIN user_profiles p ON p.user_id = u.id
    WHERE u.is_guest = 1
      AND u.status = 'active'
      AND u.created_at < datetime('now', '-30 days')
      AND (p.last_login_date IS NULL OR p.last_login_date < ?1)
      AND NOT EXISTS (SELECT 1 FROM auth_identities a WHERE a.user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.p_user_id = u.id OR m.e_user_id = u.id)
    LIMIT 200`).bind(cutoffDate).all<{ id: string }>();

  for (const { id } of rs.results) {
    await db.batch([
      db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?1').bind(id),
      db.prepare('DELETE FROM login_bonus_logs WHERE user_id = ?1').bind(id),
      db.prepare('DELETE FROM participation_logs WHERE user_id = ?1').bind(id),
      db.prepare('DELETE FROM ad_reward_logs WHERE user_id = ?1').bind(id),
      db.prepare('DELETE FROM currency_logs WHERE user_id = ?1').bind(id),
      db.prepare('DELETE FROM gacha_logs WHERE user_id = ?1').bind(id),
      db.prepare('DELETE FROM user_yokai WHERE user_id = ?1').bind(id),
      db.prepare('DELETE FROM user_profiles WHERE user_id = ?1').bind(id),
      db.prepare('DELETE FROM users WHERE id = ?1').bind(id),
    ]);
  }
  return rs.results.length;
}

async function cleanupExpiredTokens(db: D1Database): Promise<number> {
  const r = await db.prepare(`
    DELETE FROM refresh_tokens
    WHERE expires_at < datetime('now')
       OR (used_at IS NOT NULL AND used_at < datetime('now', '-7 days'))`).run();
  return r.meta.changes;
}

export async function runDailyJobs(env: Env): Promise<{
  ticketMismatches: number; yoryokuMismatches: number; yokaiMismatch: boolean;
  dormantDeleted: number; tokensDeleted: number;
}> {
  const db = env.DB;
  await db.prepare('UPDATE user_profiles SET online_win_reward_count = 0').run();

  const tickets = await checkCurrencyInvariant(db, 'tickets');
  const yoryoku = await checkCurrencyInvariant(db, 'yoryoku');
  const yokai = await checkYokaiInvariant(db);

  /* 違反はログに残す(Workers Logsで検知・アラート: doc 09) */
  for (const m of tickets) console.error('[invariant] tickets mismatch', JSON.stringify(m));
  for (const m of yoryoku) console.error('[invariant] yoryoku mismatch', JSON.stringify(m));
  if (yokai) console.error('[invariant] user_yokai count mismatch', JSON.stringify(yokai));

  const dormantDeleted = await cleanupDormantGuests(db);
  const tokensDeleted = await cleanupExpiredTokens(db);

  const summary = {
    ticketMismatches: tickets.length,
    yoryokuMismatches: yoryoku.length,
    yokaiMismatch: !!yokai,
    dormantDeleted,
    tokensDeleted,
  };
  console.log('[cron] daily jobs done', JSON.stringify(summary));
  return summary;
}
