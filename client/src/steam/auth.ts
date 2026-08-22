/* Steam Session Ticket 取得(doc 23 / 25)
   Tauri+Steamworks では GetAuthTicketForWebApi の hex。失敗時は開発ビルドのみ mock:<steamId>。
   開発用クエリ: ?steamMockId=76561198… / ?steamDlc=full_collection */

import { STEAM_DLC_FULL_COLLECTION, isSteamDlcId } from '../../../shared/steam-dlc';
import { isTauriRuntime } from '../platform';

const MOCK_STEAM_ID_KEY = 'yokaiShogi.steamMockId.v1';
const MOCK_DLC_KEY = 'yokaiShogi.steamMockDlc.v1';

function applyDevQueryOverrides(): void {
  try {
    const q = new URLSearchParams(location.search);
    const mockId = q.get('steamMockId');
    if (mockId && /^\d{5,20}$/.test(mockId)) localStorage.setItem(MOCK_STEAM_ID_KEY, mockId);
    const dlc = q.get('steamDlc');
    if (dlc === '0' || dlc === 'none') localStorage.removeItem(MOCK_DLC_KEY);
    else if (dlc && isSteamDlcId(dlc)) localStorage.setItem(MOCK_DLC_KEY, dlc);
  } catch { /* 無視 */ }
}

function mockSteamId(): string {
  applyDevQueryOverrides();
  try {
    const existing = localStorage.getItem(MOCK_STEAM_ID_KEY);
    if (existing && /^\d{5,20}$/.test(existing)) return existing;
  } catch { /* 無視 */ }
  /* SteamID64 風の 17 桁(文字列連結で精度落ちを避ける)。端末ごとに固定 */
  const id = `76561198${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`;
  try { localStorage.setItem(MOCK_STEAM_ID_KEY, id); } catch { /* 無視 */ }
  return id;
}

function mockTicket(): string {
  return `mock:${mockSteamId()}`;
}

async function invokeSteamSessionTicket(): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('get_steam_session_ticket');
}

/** Session Ticket(hex) または開発用 mock:<steamId> */
export async function getSteamSessionTicket(): Promise<string> {
  applyDevQueryOverrides();
  if (isTauriRuntime()) {
    try {
      const ticket = (await invokeSteamSessionTicket()).trim();
      if (ticket) return ticket;
    } catch (err) {
      if (!import.meta.env.DEV) throw err;
      console.warn('[steam] Steamworks ticket unavailable, using mock', err);
    }
  } else if (!import.meta.env.DEV) {
    throw new Error('Steam 認証はデスクトップ版でのみ利用できます');
  }
  return mockTicket();
}

/** 開発用に申告する所有 DLC 一覧(本番では Steamworks 所有確認に置き換え) */
export function getMockOwnedSteamDlcIds(): string[] {
  applyDevQueryOverrides();
  try {
    const v = localStorage.getItem(MOCK_DLC_KEY);
    if (v && isSteamDlcId(v)) return [v];
  } catch { /* 無視 */ }
  return [];
}

export { STEAM_DLC_FULL_COLLECTION };
