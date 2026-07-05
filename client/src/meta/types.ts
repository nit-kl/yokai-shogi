/* ============================================================
   メタ進行プロバイダの共通インターフェース(doc 02)
   ローカル版(ソロ・オフライン)とAPI版(サーバー権威)の2実装を
   TSのinterfaceで強制する。UIは MetaState を同期で読み、
   変更操作(ガチャ・交換・編成・勝利報酬)は非同期で呼ぶ。
   ============================================================ */

import { YOKAI, PLAYER_BOSS } from '../../../shared/data';
import { validateFormation as sharedValidateFormation } from '../../../shared/validate';

export type { GachaResult } from '../../../shared/gacha';
import type { GachaResult } from '../../../shared/gacha';
export type { HyakkiProgress, HyakkiRanking } from '../../../shared/hyakki';
import type { HyakkiProgress, HyakkiRanking } from '../../../shared/hyakki';

/* UIが同期で参照する読み取りモデル(キャッシュ) */
export interface MetaState {
  tickets: number;
  yoryoku: number;
  owned: Record<string, number>;   // id -> 1(各妖怪は1体まで)
  formation: (string | null)[][];  // [前段, 最奥段]
  name: string;
  wins: number;
  isGuest: boolean;
  online: boolean;                 // true=サーバー権威 / false=ローカル(オフライン)
  onboardingDone: boolean;
}

export interface LoginBonus { day: number; tickets: number; }

export const EXCHANGE_COST = 300; // 妖力→チケット1枚(doc 08)

/* 2実装が満たすべき契約 */
export interface MetaProvider {
  readonly data: MetaState;
  /** 起動時: 認証・ロード・ログインボーナス判定。付与があれば返す */
  init(): Promise<LoginBonus | null>;
  /** count連ガチャ。チケット不足や失敗なら null */
  pull(count: 1 | 10): Promise<GachaResult[] | null>;
  /** 妖力300→チケット1枚。成功で true */
  exchange(): Promise<boolean>;
  /** 編成保存。正常なら null、問題があればエラーメッセージ */
  setFormation(rows: (string | null)[][]): Promise<string | null>;
  /** プレイヤー表示名を変更。正常なら null、問題があればエラーメッセージ */
  setName(name: string): Promise<string | null>;
  /** ソロ(AI)勝利報酬。付与されたチケット数を返す(0=上限到達) */
  recordSoloWin(): Promise<number>;
  /** 引き継ぎコードを発行(別端末への持ち出し用)。オフラインは非対応で例外 */
  issueLinkCode(): Promise<string>;
  /** 引き継ぎコードでこの端末のデータを別アカウントに差し替え。成功で true */
  redeemLinkCode(code: string): Promise<boolean>;
  /** オンライン対戦WebSocket URL。オフライン版は null */
  battleUrl(): string | null;
  /** 初回オンボーディング: 大将を選ぶ */
  pickBoss(bossId: string): Promise<string | null>;
  /** 初回オンボーディング完了。ログインボーナスがあれば返す */
  completeOnboarding(): Promise<LoginBonus | null>;
  /** 百鬼夜行(連戦・上級)の対局開始申告(doc 21)。オフライン版は null */
  hyakkiStart(): Promise<HyakkiProgress | null>;
  /** 百鬼夜行の結果申告。オフライン版は null */
  hyakkiResult(win: boolean): Promise<HyakkiProgress | null>;
  /** 百鬼夜行 週間ランキング取得。オフライン版は null */
  hyakkiRanking(): Promise<HyakkiRanking | null>;
}

/* ---------- data から導出する同期ヘルパ(両実装共通) ---------- */

export function bossIdOf(data: MetaState): string {
  for (const id of data.formation.flat()) {
    if (id && YOKAI[id].type === 'boss') return id;
  }
  return PLAYER_BOSS;
}

export function ownedListOf(data: MetaState): string[] {
  const rOrder: Record<string, number> = { SSR: 0, SR: 1, R: 2, N: 3 };
  const tOrder: Record<string, number> = { boss: 0, attack: 1, defense: 2, ambush: 3 };
  return Object.keys(data.owned)
    .filter(id => data.owned[id])
    .sort((a, b) => {
      const A = YOKAI[a], B = YOKAI[b];
      return (rOrder[A.rarity] - rOrder[B.rarity]) ||
             ((tOrder[A.type] ?? 9) - (tOrder[B.type] ?? 9)) ||
             (B.atk - A.atk) || a.localeCompare(b);
    });
}

export function ownedSet(data: MetaState): Set<string> {
  return new Set(Object.keys(data.owned).filter(id => data.owned[id]));
}

export function validateFormationOf(data: MetaState, rows: (string | null)[][]): string | null {
  return sharedValidateFormation(rows, ownedSet(data));
}
