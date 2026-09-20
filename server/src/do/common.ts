import { ROWS, YOKAI } from '../../../shared/data';
import type { Side } from '../../../shared/data';
import { Game } from '../../../shared/game';
import type { Action, GameState } from '../../../shared/game';
import {
  SHADOW_FALLBACK_FORMATION, SHADOW_USER_ID, type BattlePlayer, type ServerBattleMessage,
} from '../../../shared/battle';

export const TURN_MS = 60_000;
/** 本時間切れ後の秒読み。切れても即負けにせず、この時間内に着手すれば続行 */
export const BYOYOMI_MS = 30_000;
export const DISCONNECT_GRACE_MS = 60_000;
export const RULE_VERSION = 'phase2-v17'; // v17: 八咫烏は陽光

export function envClockMs(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 50 ? n : fallback;
}

export function send(ws: WebSocket, message: ServerBattleMessage): void {
  try { ws.send(JSON.stringify(message)); } catch { /* closed socket */ }
}

export function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

export function bossId(formation: (string | null)[][]): string {
  return formation.flat().find(id => id && YOKAI[id].boss) || 'kyubi';
}

export function newOnlineState(pFormation: (string | null)[][], eFormation: (string | null)[][]): GameState {
  const state = Game.newState(pFormation);
  const enemyRows = [eFormation[1], eFormation[0]];
  for (let y = 0; y < 2; y++) {
    state.board[y] = enemyRows[y].slice().reverse().map(id =>
      id ? { uid: 0, id, owner: 'e' as const, promoted: false } : null);
  }
  let uid = 0;
  for (let y = 0; y < ROWS; y++) {
    for (const piece of state.board[y]) if (piece) piece.uid = ++uid;
  }
  state.nextUid = uid;
  return state;
}

export function isLegalAction(state: GameState, side: Side, candidate: unknown): candidate is Action {
  if (!candidate || typeof candidate !== 'object') return false;
  const json = JSON.stringify(candidate);
  return Game.getAllActions(state, side).some(action => JSON.stringify(action) === json);
}

function playableFormation(raw: string): (string | null)[][] | null {
  try {
    const formation = JSON.parse(raw) as (string | null)[][];
    if (formation.flat().some(id => id && YOKAI[id]?.boss)) return formation;
  } catch { /* invalid */ }
  return null;
}

export async function loadShadowOpponent(db: D1Database, humanId: string): Promise<BattlePlayer> {
  const row = await db.prepare(
    `SELECT p.name, p.rating, p.formation FROM user_profiles p
     JOIN users u ON u.id = p.user_id AND u.status = 'active'
     WHERE p.user_id != ?1 AND p.user_id != ?2
     ORDER BY RANDOM() LIMIT 1`,
  ).bind(humanId, SHADOW_USER_ID).first<{ name: string; rating: number; formation: string }>();
  let formation = SHADOW_FALLBACK_FORMATION;
  let name = 'AIの対戦相手';
  let rating = 1500;
  const source = row ?? await db.prepare(
    'SELECT name, rating, formation FROM user_profiles WHERE user_id = ?1',
  ).bind(humanId).first<{ name: string; rating: number; formation: string }>();
  const parsed = source ? playableFormation(source.formation) : null;
  if (source && parsed) {
    formation = parsed;
    name = source.name;
    rating = source.rating;
  }
  return {
    userId: SHADOW_USER_ID, name, rating, formation,
    bossId: bossId(formation), reconnectToken: crypto.randomUUID(),
  };
}

export async function loadPlayer(db: D1Database, userId: string): Promise<BattlePlayer | null> {
  const row = await db.prepare(
    'SELECT name, rating, formation FROM user_profiles WHERE user_id = ?1',
  ).bind(userId).first<{ name: string; rating: number; formation: string }>();
  if (!row) return null;
  const formation = JSON.parse(row.formation) as (string | null)[][];
  return {
    userId, name: row.name, rating: row.rating, formation,
    bossId: bossId(formation), reconnectToken: crypto.randomUUID(),
  };
}

export function other(side: Side): Side {
  return side === 'p' ? 'e' : 'p';
}

