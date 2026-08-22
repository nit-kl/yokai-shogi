/* Steam Session Ticket 検証(doc 06 / 23)
   - 本番: Steam Web API AuthenticateUserTicket
   - 開発: STEAM_AUTH_MOCK=1 または API キー未設定時に mock:<steamId> を許可 */

/** Env の Steam 関連だけ。単体テストが Workers 型に依存しないように切り出す */
export type SteamEnv = {
  STEAM_WEB_API_KEY?: string;
  STEAM_APP_ID?: string;
  STEAM_AUTH_MOCK?: string;
};

export type SteamTicketResult =
  | { ok: true; steamId: string; mock: boolean }
  | { ok: false; reason: string };

const MOCK_PREFIX = 'mock:';
/** GetAuthTicketForWebApi と同じ。`src-tauri/src/steam.rs` の WEB_IDENTITY と一致させる */
export const STEAM_WEB_API_IDENTITY = 'hyakkiban';
/** `src-tauri/src/steam.rs` の APP_ID。secret が depot ID でもここを使う */
export const STEAM_APP_ID = '5138130';

export function steamMockAllowed(env: SteamEnv): boolean {
  if (env.STEAM_AUTH_MOCK === '1') return true;
  /* キー未設定のローカル/CI はモック可。本番でキーを入れたらモック不可 */
  return !env.STEAM_WEB_API_KEY;
}

/** Session Ticket(hex または mock:…) を検証し SteamID64 を返す */
export async function verifySteamSessionTicket(env: SteamEnv, ticket: string): Promise<SteamTicketResult> {
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
  if (!key) {
    return { ok: false, reason: 'Steam 認証のサーバー設定が不足しています' };
  }
  const fromEnv = env.STEAM_APP_ID?.trim();
  if (fromEnv && fromEnv !== STEAM_APP_ID) {
    console.warn('[steam] STEAM_APP_ID env ignored; verifying as', STEAM_APP_ID, 'not', fromEnv);
  }
  const appId = STEAM_APP_ID;

  /* Publisher Key は partner.steam-api.com 向け(公式 Web API Overview) */
  const url = new URL('https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/');
  url.searchParams.set('key', key);
  url.searchParams.set('appid', appId);
  url.searchParams.set('ticket', trimmed);
  url.searchParams.set('identity', STEAM_WEB_API_IDENTITY);

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
