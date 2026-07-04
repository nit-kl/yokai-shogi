import type { Side } from './data';
import type { Action, GameEvent, GameState } from './game';

export type MatchMode = 'random' | 'friend';
export type BattleEndReason =
  | 'boss' | 'hp' | 'explode' | 'nomoves' | 'resign'
  | 'timeout' | 'disconnect' | 'draw';

export interface BattlePlayer {
  userId: string;
  name: string;
  rating: number;
  bossId: string;
  formation: (string | null)[][];
  reconnectToken: string;
}

export type ClientBattleMessage =
  | { t: 'join_queue' }
  | { t: 'leave_queue'; reason?: 'cancel' | 'timeout' }
  | { t: 'create_room' }
  | { t: 'join_room'; code: string }
  | { t: 'action'; action: Action }
  | { t: 'resign' }
  | { t: 'rematch' };

export type ServerBattleMessage =
  | { t: 'queued'; position: number }
  | { t: 'room_created'; code: string }
  | {
      t: 'match_found'; matchId: string; reconnectToken: string; side: Side;
      opponent: { name: string; rating: number; bossId: string };
      formations: Record<Side, (string | null)[][]>;
    }
  | { t: 'game_start'; state: GameState }
  | { t: 'events'; seq: number; events: GameEvent[] }
  | { t: 'your_turn'; remainMs: number }
  | { t: 'opponent_disconnected'; graceMs: number }
  | { t: 'opponent_reconnected' }
  | { t: 'snapshot'; state: GameState; remainMs: number; seq: number }
  | {
      t: 'game_end'; winner: Side | 'draw'; reason: BattleEndReason;
      /* tickets=勝利報酬 / participation=逢魔が時の完走報酬(勝敗不問・1日1回) /
         eventYokai=土曜対戦会の限定妖怪(このゲームで新規入手した場合のみ) */
      reward: { tickets: number; participation?: number; eventYokai?: string | null };
      rating: { before: number; after: number };
    }
  | { t: 'error'; code: string; message: string };
