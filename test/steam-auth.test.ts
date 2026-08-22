import { afterEach, expect, test, vi } from 'vitest';
import { getSteamSessionTicket } from '../client/src/steam/auth';

afterEach(() => {
  vi.unstubAllGlobals();
});

test('ブラウザ開発では mock チケットを返す', async () => {
  const ls = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (ls.has(k) ? ls.get(k)! : null),
    setItem: (k: string, v: string) => { ls.set(k, String(v)); },
    removeItem: (k: string) => { ls.delete(k); },
  });
  vi.stubGlobal('location', { search: '?steamMockId=76561198000000001' });

  const ticket = await getSteamSessionTicket();
  expect(ticket).toBe('mock:76561198000000001');
});
