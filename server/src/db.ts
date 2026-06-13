/* D1アクセスヘルパ・ゲーム定数(doc 05 のパターンに従う) */

import { ROWS, SETUP } from '../../shared/data';

/* ---------- 経済定数(doc 08) ---------- */
export const TICKETS_CAP = 999;
export const YORYOKU_CAP = 99999;
export const EXCHANGE_COST = 300;   // 妖力→チケット1枚
export const FIRST_BONUS = 10;      // ゲスト作成時
export const STREAK_BONUS_TICKETS = 3; // 7日連続ごと
export const SOLO_WIN_DAILY_CAP = 2;   // ソロ勝利報酬の日次上限(申告制のため低め: doc 07)

/* 初期編成・初期所持(shared/data.ts の既定配置が正) */
export const DEFAULT_FORMATION: (string | null)[][] = SETUP.slice(ROWS - 2).map(r => [...r]);
export const INITIAL_YOKAI: string[] = [...new Set(DEFAULT_FORMATION.flat().filter((id): id is string => !!id))];

/* ---------- 行型 ---------- */
export interface ProfileRow {
  user_id: string;
  name: string;
  tickets: number;
  yoryoku: number;
  formation: string; // JSON
  rating: number;
  wins: number;
  losses: number;
  last_login_date: string | null;
  login_streak: number;
  daily_win_reward_count: number;
  daily_reset_date: string | null;
}

export async function getProfile(db: D1Database, userId: string): Promise<ProfileRow | null> {
  return db.prepare('SELECT * FROM user_profiles WHERE user_id = ?1').bind(userId).first<ProfileRow>();
}

export async function getOwnedSet(db: D1Database, userId: string): Promise<Set<string>> {
  const rs = await db.prepare('SELECT yokai_id FROM user_yokai WHERE user_id = ?1').bind(userId).all<{ yokai_id: string }>();
  return new Set(rs.results.map(r => r.yokai_id));
}

/* currency_logs へのINSERT文(残高UPDATEと必ず同一batchで使う) */
export function currencyLogStmt(
  db: D1Database, userId: string, currency: 'tickets' | 'yoryoku',
  delta: number, balance: number, reason: string, refId?: string,
) {
  return db
    .prepare('INSERT INTO currency_logs (user_id, currency, delta, balance, reason, ref_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(userId, currency, delta, balance, reason, refId ?? null);
}

/* D1の制約エラー(UNIQUE/CHECK違反)か判定。batch内で発生すると全体がロールバックされている */
export function isConstraintError(e: unknown): boolean {
  return e instanceof Error && /SQLITE_CONSTRAINT|UNIQUE constraint|CHECK constraint/i.test(e.message);
}
