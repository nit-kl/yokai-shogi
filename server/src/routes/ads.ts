/* リワード広告: 視聴完了後のチケット付与(doc 08 / 22)
   - ユーザー課金はなく、広告ネットワークからの配信報酬が運営収入
   - 日次上限で不正の旨味を抑え、ソロ勝利と同様にクライアント完了申告を信頼する
   - 本番で GPT 等を使う場合も、当面は日次上限が主防衛線(SSV は将来拡張) */

import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { apiError } from '../lib/errors';
import { gameDate } from '../lib/time';
import { AD_REWARD_DAILY_CAP, currencyLogStmt, getProfile, isConstraintError, TICKETS_CAP } from '../db';
import { authRequired } from '../middleware';

export const adsRoutes = new Hono<AppEnv>();

function adsEnabled(env: AppEnv['Bindings']): boolean {
  return env.ADS_REWARD_ENABLED === '1';
}

function adsProvider(env: AppEnv['Bindings']): 'mock' | 'gpt' {
  return env.ADS_REWARD_PROVIDER === 'gpt' ? 'gpt' : 'mock';
}

function dailyCap(env: AppEnv['Bindings']): number {
  const raw = env.ADS_REWARD_DAILY_CAP;
  if (raw && /^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n >= 1 && n <= 10) return n;
  }
  return AD_REWARD_DAILY_CAP;
}

async function claimedToday(db: D1Database, userId: string, today: string): Promise<number> {
  const row = await db.prepare(
    'SELECT COUNT(*) AS n FROM ad_reward_logs WHERE user_id = ?1 AND date = ?2',
  ).bind(userId, today).first<{ n: number }>();
  return row?.n ?? 0;
}

adsRoutes.get('/ads/status', authRequired, async c => {
  const userId = c.get('userId');
  const enabled = adsEnabled(c.env);
  const cap = dailyCap(c.env);
  const provider = adsProvider(c.env);
  const today = gameDate();
  const claimed = enabled ? await claimedToday(c.env.DB, userId, today) : 0;
  const remaining = enabled ? Math.max(0, cap - claimed) : 0;

  return c.json({
    enabled,
    provider,
    dailyCap: cap,
    claimed,
    remaining,
    ticketsPerReward: 1,
    clientConfig: provider === 'gpt'
      ? { adUnitPath: c.env.ADS_GPT_AD_UNIT_PATH ?? '' }
      : {},
  });
});

adsRoutes.post('/ads/reward', authRequired, async c => {
  if (!adsEnabled(c.env)) {
    return apiError(c, 'FEATURE_DISABLED', 'リワード広告は現在利用できません');
  }

  const body = await c.req.json().catch(() => null) as { provider?: unknown } | null;
  const expected = adsProvider(c.env);
  if (!body || body.provider !== expected) {
    return apiError(c, 'VALIDATION', `provider は "${expected}" である必要があります`);
  }

  const userId = c.get('userId');
  const db = c.env.DB;
  const p = await getProfile(db, userId);
  if (!p) return apiError(c, 'UNAUTHORIZED', 'プロファイルが存在しません');

  const cap = dailyCap(c.env);
  const today = gameDate();
  const claimed = await claimedToday(db, userId, today);
  if (claimed >= cap) {
    return c.json({
      granted: 0,
      tickets: p.tickets,
      dailyCount: claimed,
      dailyCap: cap,
      remaining: 0,
    });
  }

  const grant = Math.min(1, Math.max(0, TICKETS_CAP - p.tickets));
  const claimIndex = claimed + 1;
  const newTickets = p.tickets + grant;

  try {
    const stmts = [
      db.prepare(
        'INSERT INTO ad_reward_logs (user_id, date, claim_index, tickets, provider) VALUES (?1, ?2, ?3, ?4, ?5)',
      ).bind(userId, today, claimIndex, grant, expected),
    ];
    if (grant > 0) {
      stmts.push(
        db.prepare('UPDATE user_profiles SET tickets = MIN(tickets + ?2, ?3) WHERE user_id = ?1')
          .bind(userId, grant, TICKETS_CAP),
        currencyLogStmt(db, userId, 'tickets', grant, newTickets, 'ad_reward', `ad:${today}:${claimIndex}`),
      );
    }
    await db.batch(stmts);
  } catch (e) {
    if (isConstraintError(e)) {
      /* 並行請求で PK 衝突 → 最新状態を返す */
      const again = await claimedToday(db, userId, today);
      const fresh = await getProfile(db, userId);
      return c.json({
        granted: 0,
        tickets: fresh?.tickets ?? p.tickets,
        dailyCount: again,
        dailyCap: cap,
        remaining: Math.max(0, cap - again),
      });
    }
    throw e;
  }

  return c.json({
    granted: grant,
    tickets: newTickets,
    dailyCount: claimIndex,
    dailyCap: cap,
    remaining: Math.max(0, cap - claimIndex),
  });
});
