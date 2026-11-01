/* 百鬼夜行 週間連勝ランキング(doc 21)— サーバー/クライアント共有の定数と型 */

/** ソロ対戦(百鬼夜行)のAI難易度。ランキング対象と同一 */
export const HYAKKI_RANK_DIFFICULTY = 'hard';
/** 今週ランキングの掲載数 */
export const HYAKKI_RANKING_TOP = 20;
/** 「先週の百鬼夜行」の掲載数 */
export const HYAKKI_LAST_WEEK_TOP = 3;
/** 開始の受理からこの時間未満の勝利報告は負け扱い(同一瞬間の連打対策)。
 *  盤面が小さい百鬼夜行は開幕演出のあと数手で終わる。数十秒を下限にすると
 *  正当な勝利が連勝に入らない。クライアントは受理後この時間を空けてから勝利を送る。 */
export const HYAKKI_MIN_DURATION_MS = 2_000;

/** start 申告時刻から now までの経過ミリ秒。解釈できなければ NaN。
 *  ISO 8601 と、D1 が返すことのある SQLite datetime(空白区切り・UTC) の両方を受ける。 */
export function elapsedSincePending(pendingAt: string, now: number): number {
  const trimmed = pendingAt.trim();
  const sqlite = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/.exec(trimmed);
  const parsed = Date.parse(sqlite ? `${sqlite[1]}T${sqlite[2]}Z` : trimmed);
  return Number.isFinite(parsed) ? now - parsed : Number.NaN;
}
/** 先週1位への限定異装報酬(通貨なし・見た目のみ: doc 21) */
export const HYAKKI_REWARD_YOKAI_ID = 'kyubi_hasha';

/** start/result 申告のレスポンス */
export interface HyakkiProgress {
  currentStreak: number;
  bestStreak: number;          // 今週のベスト(未勝利なら0)
  rank: number | null;         // 今週の順位(未勝利ならnull)
}

export interface HyakkiRankingEntry {
  name: string;
  bestStreak: number;
}

/** GET /v1/rankings/hyakki のレスポンス */
export interface HyakkiRanking {
  week: string;                        // 今週の週キー(月曜のゲーム内日付)
  top: HyakkiRankingEntry[];           // 今週TOP20
  lastWeek: HyakkiRankingEntry[];      // 先週TOP3
  me: { rank: number; bestStreak: number } | null; // 認証時のみ・今週未勝利ならnull
}
