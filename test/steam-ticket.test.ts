import { afterEach, expect, test, vi } from 'vitest';
import { STEAM_WEB_API_IDENTITY, verifySteamSessionTicket } from '../server/src/lib/steam';
import type { Env } from '../server/src/env';

afterEach(() => {
  vi.unstubAllGlobals();
});

function envWithSteam(): Env {
  return {
    STEAM_WEB_API_KEY: 'test-publisher-key',
    STEAM_APP_ID: '5138130',
    STEAM_AUTH_MOCK: '0',
  } as Env;
}

test('実チケット検証は AuthenticateUserTicket に identity を付ける', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({
    response: { params: { result: 'OK', steamid: '76561198000000001' } },
  })));
  vi.stubGlobal('fetch', fetchMock);

  const result = await verifySteamSessionTicket(envWithSteam(), 'deadbeef');
  expect(result).toEqual({ ok: true, steamId: '76561198000000001', mock: false });

  const called = String(fetchMock.mock.calls[0]?.[0]);
  const url = new URL(called);
  expect(url.hostname).toBe('partner.steam-api.com');
  expect(url.searchParams.get('ticket')).toBe('deadbeef');
  expect(url.searchParams.get('appid')).toBe('5138130');
  expect(url.searchParams.get('identity')).toBe(STEAM_WEB_API_IDENTITY);
  expect(url.searchParams.get('identity')).toBe('hyakkiban');
  expect(url.searchParams.has('key')).toBe(true);
});
