import { ROWS, YOKAI } from '../../../shared/data';
import type { Side } from '../../../shared/data';
import { Game } from '../../../shared/game';
import type { Action, GameState } from '../../../shared/game';
import type { BattlePlayer, ServerBattleMessage } from '../../../shared/battle';

export const TURN_MS = 60_000;
/** 本時間切れ後の秒読み。切れても即負けにせず、この時間内に着手すれば続行 */
export const BYOYOMI_MS = 30_000;
export const DISCONNECT_GRACE_MS = 60_000;
export const RULE_VERSION = 'phase2-v7'; // v7: 八岐大蛇の逃げ1回、宿儺は大将を追撃不可

export function send(ws: WebSocket, message: ServerBattleMessage): void {
  try { ws.send(JSON.stringify(message)); } catch { /* closed socket */ }
}

export function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

export function bossId(formation: (string | null)[][]): string {
  return formation.flat().find(id => id && YOKAI[id].type === 'boss') || 'kyubi';
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

