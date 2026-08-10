/* Steam Session Ticket 検証(doc 06 / 23)
   - 本番: Steam Web API AuthenticateUserTicket
   - 開発: STEAM_AUTH_MOCK=1 または API キー未設定時に mock:<steamId> を許可 */

import type { Env } from '../env';

export type SteamTicketResult =
  | { ok: true; steamId: string; mock: boolean }
  | { ok: false; reason: string };

const MOCK_PREFIX = 'mock:';

export function steamMockAllowed(env: Env): boolean {
  if (env.STEAM_AUTH_MOCK === '1') return true;
  /* キー未設定のローカル/CI はモック可。本番でキーを入れたらモック不可 */
  return !env.STEAM_WEB_API_KEY;
}

/** Session Ticket(hex または mock:…) を検証し SteamID64 を返す */
export async function verifySteamSessionTicket(env: Env, ticket: string): Promise<SteamTicketResult> {
  const trimmed = ticket.trim();
  if (!trimmed || trimmed.length > 8192) {
    return { ok: false, reason: 'チケットが不正です' };
  }

  if (trimmed.startsWith(MOCK_PREFIX)) {
    if (!steamMockAllowed(env)) {
      return { ok: false, reason: 'モックチケットは許可されていません' };
    }
    const steamId = trimmed.slice(MOCK_PREFIX.length).trim();
    if (!/^\d{5,20}$/.test(steamId)) {
      return { ok: false, reason: 'モック SteamID が不正です' };
    }
    return { ok: true, steamId, mock: true };
  }

  const key = env.STEAM_WEB_API_KEY;
  const appId = env.STEAM_APP_ID;
  if (!key || !appId) {
    return { ok: false, reason: 'Steam 認証のサーバー設定が不足しています' };
  }

  /* Publisher Key は partner.steam-api.com 向け(公式 Web API Overview) */
  const url = new URL('https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/');
  url.searchParams.set('key', key);
  url.searchParams.set('appid', appId);
  url.searchParams.set('ticket', trimmed);

  let res: Response;
  try {
    res = await fetch(url.toString(), { method: 'GET' });
  } catch {
    return { ok: false, reason: 'Steam 認証サーバーに接続できません' };
  }

  const data = await res.json().catch(() => null) as {
    response?: {
      error?: { errorcode?: number; errordesc?: string };
      params?: { result?: string; steamid?: string; ownersteamid?: string };
    };
  } | null;

  const params = data?.response?.params;
  if (!params || params.result !== 'OK' || !params.steamid) {
    const desc = data?.response?.error?.errordesc || 'Steam チケットの検証に失敗しました';
    return { ok: false, reason: desc };
  }

  return { ok: true, steamId: params.steamid, mock: false };
}
