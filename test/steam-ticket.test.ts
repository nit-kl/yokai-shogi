import { afterEach, expect, test, vi } from 'vitest';
import {
  STEAM_WEB_API_IDENTITY,
  type SteamEnv,
  verifySteamSessionTicket,
} from '../server/src/lib/steam';

afterEach(() => {
  vi.unstubAllGlobals();
});

function envWithSteam(appId = '5138130'): SteamEnv {
  return {
    STEAM_WEB_API_KEY: 'test-publisher-key',
    STEAM_APP_ID: appId,
    STEAM_AUTH_MOCK: '0',
  };
}

function mockSteamFetch() {
  return vi.fn(async (_input: string) => new Response(JSON.stringify({
    response: { params: { result: 'OK', steamid: '76561198000000001' } },
  })));
}

test('実チケット検証は AuthenticateUserTicket に identity を付ける', async () => {
  const fetchMock = mockSteamFetch();
  vi.stubGlobal('fetch', fetchMock);

  const result = await verifySteamSessionTicket(envWithSteam(), 'deadbeef');
  expect(result).toEqual({ ok: true, steamId: '76561198000000001', mock: false });

  const called = fetchMock.mock.calls[0]?.[0];
  expect(called).toBeDefined();
  const url = new URL(called!);
  expect(url.hostname).toBe('partner.steam-api.com');
  expect(url.searchParams.get('ticket')).toBe('deadbeef');
  expect(url.searchParams.get('appid')).toBe('5138130');
  expect(url.searchParams.get('identity')).toBe(STEAM_WEB_API_IDENTITY);
  expect(url.searchParams.has('key')).toBe(true);
});

test('secret が depot ID でも検証 appid は 5138130 を使う', async () => {
  const fetchMock = mockSteamFetch();
  vi.stubGlobal('fetch', fetchMock);

  await verifySteamSessionTicket(envWithSteam('5138131'), 'deadbeef');
  const called = fetchMock.mock.calls[0]?.[0];
  expect(called).toBeDefined();
  const url = new URL(called!);
  expect(url.searchParams.get('appid')).toBe('5138130');
});
