import type { Side } from './data';
import type { Action, GameEvent, GameState } from './game';

export type MatchMode = 'random' | 'friend' | 'shadow';
/** 影CPUの対戦相手として matches / user_profiles に置く番兵アカウント */
export const SHADOW_USER_ID = 'u_shadow';
/** ランダムマッチが成立しなければ影の対戦へ切り替えるまでの待ち(本番) */
export const SHADOW_WAIT_MS = 15_000;
/** 待ち時間のゆらぎ上限。実待ちは 15〜20 秒 */
export const SHADOW_WAIT_JITTER_MS = 5_000;
/** 影CPUが使う予備編成(他プレイヤーがいないとき) */
export const SHADOW_FALLBACK_FORMATION: (string | null)[][] = [
  ['ittan', 'kooni', null, 'nekomata', 'nue'],
  ['tengu', 'kappa', 'kyubi', 'nurikabe', 'rokuro'],
];
export type ClockPhase = 'main' | 'byoyomi';
export type SkipStreak = Record<Side, number>;
/** 同一対局で連続スキップがこの回数に達したら時間切れ負け */
export const SKIP_LIMIT = 2;
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
  | { t: 'request_shadow' }
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
      /** 実在プレイヤーの編成を使ったCPU代理対戦 */
      shadow?: boolean;
    }
  | { t: 'game_start'; state: GameState }
  | { t: 'events'; seq: number; events: GameEvent[] }
  | { t: 'your_turn'; remainMs: number; phase: ClockPhase; skipStreak?: SkipStreak; skipLimit?: number }
  | { t: 'clock'; remainMs: number; phase: ClockPhase; skipStreak?: SkipStreak; skipLimit?: number }
  | { t: 'opponent_disconnected'; graceMs: number }
  | { t: 'opponent_reconnected' }
  | {
      t: 'turn_skipped'; side: Side; skips: number; skipLimit: number;
      remainMs: number; phase: ClockPhase; skipStreak: SkipStreak;
    }
  | { t: 'snapshot'; state: GameState; remainMs: number; phase: ClockPhase; seq: number;
      skipStreak?: SkipStreak; skipLimit?: number }
  | {
      t: 'game_end'; winner: Side | 'draw'; reason: BattleEndReason;
      /* tickets=勝利報酬 / participation=逢魔が時の完走報酬(勝敗不問・1日1回) /
         eventYokai=土曜対戦会の限定妖怪(このゲームで新規入手した場合のみ) */
      reward: { tickets: number; participation?: number; eventYokai?: string | null };
      rating: { before: number; after: number };
    }
  | { t: 'error'; code: string; message: string };
