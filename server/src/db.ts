/* D1アクセスヘルパ・ゲーム定数(doc 05 のパターンに従う) */

import { EMPTY_FORMATION } from '../../shared/data';

/* ---------- 経済定数(doc 08) ---------- */
export const TICKETS_CAP = 999;
export const YORYOKU_CAP = 99999;
export const EXCHANGE_COST = 300;   // 妖力→チケット1枚
export const FIRST_BONUS = 10;      // ゲスト作成時(初回10連ガチャ用)
export const STREAK_BONUS_TICKETS = 3; // 7日連続ごと
export const SOLO_WIN_DAILY_CAP = 2;   // ソロ勝利報酬の日次上限(申告制のため低め: doc 07)
export const AD_REWARD_DAILY_CAP = 2;  // リワード広告の日次上限(doc 08 / 22)

/* キャンペーン配布(オンライン・お一人様1回。GET /me で自動付与) */
export interface CampaignGiftDef {
  id: string;
  tickets: number;
  title: string;
  subtitle: string;
}
export const RELEASE_GIFT_CAMPAIGN_ID = 'release-2026-07';
export const RELEASE_GIFT_TICKETS = 100;
export const NEW_PIECES_GIFT_CAMPAIGN_ID = 'pieces-2026-08';
export const NEW_PIECES_GIFT_TICKETS = 50;
export const CAMPAIGN_GIFTS: CampaignGiftDef[] = [
  {
    id: RELEASE_GIFT_CAMPAIGN_ID,
    tickets: RELEASE_GIFT_TICKETS,
    title: 'リリース記念',
    subtitle: 'オンライン公開をお祝いして',
  },
  {
    id: NEW_PIECES_GIFT_CAMPAIGN_ID,
    tickets: NEW_PIECES_GIFT_TICKETS,
    title: '新妖怪追加記念',
    subtitle: '新駒リリースをお祝いして',
  },
];

/* 新規アカウントはオンボーディングで大将・編成を決める */
export const DEFAULT_FORMATION: (string | null)[][] = EMPTY_FORMATION.map(r => [...r]);
export const INITIAL_YOKAI: string[] = [];

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
  onboarding_done: number;
  hyakki_streak: number;
  hyakki_week: string | null;
  hyakki_pending_at: string | null;
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
