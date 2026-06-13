/* ApiMeta + ApiClient のクライアント配線テスト(モックfetch)
   サーバー契約自体は test/workers/api.spec.ts(実Workersランタイム)で検証済み。
   ここではリクエスト形・トークン管理・401リフレッシュ・エラーコードのマッピングを確認する。 */
import { beforeEach, test, expect, vi } from 'vitest';
import { ApiClient, ApiError, NetworkError } from '../client/src/meta/client';
import { ApiMeta } from '../client/src/meta/api';

/* localStorageシム(リフレッシュトークン保存先) */
const ls = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (ls.has(k) ? ls.get(k)! : null),
  setItem: (k: string, v: string) => ls.set(k, String(v)),
  removeItem: (k: string) => ls.delete(k),
};

/* ---- 簡易モックサーバー ---- */
interface Server {
  tickets: number; yoryoku: number; owned: string[]; wins: number;
  formation: (string | null)[][];
  validAccess: string;        // 現在有効なアクセストークン
  refreshValid: boolean;      // リフレッシュトークンが有効か
  failNextAuthOnce: boolean;  // 次の認証付きリクエストで一度だけ401を返す
  linkCode: string | null;    // 発行済み引き継ぎコード
  requests: { method: string; path: string; body: any }[];
}
let server: Server;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
function errBody(code: string, status: number): Response {
  return json({ error: { code, message: code } }, status);
}

function install(opts: { offline?: boolean } = {}) {
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit): Promise<Response> => {
    if (opts.offline) throw new TypeError('Failed to fetch');
    const u = new URL(String(url));
    const path = u.pathname;
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    const authed = (init?.headers as Record<string, string> | undefined)?.Authorization;
    server.requests.push({ method, path, body });

    if (path === '/v1/auth/guest') {
      server.validAccess = 'access-1'; server.refreshValid = true;
      return json({ userId: 'u_1', accessToken: 'access-1', refreshToken: 'refresh-1' });
    }
    if (path === '/v1/auth/refresh') {
      if (!server.refreshValid || body?.refreshToken !== 'refresh-1') return errBody('UNAUTHORIZED', 401);
      server.validAccess = 'access-2';
      return json({ userId: 'u_1', accessToken: 'access-2', refreshToken: 'refresh-2' });
    }
    if (path === '/v1/auth/login/link-code') { // 非認証
      if (!server.linkCode || body?.code !== server.linkCode) return errBody('UNAUTHORIZED', 401);
      server.validAccess = 'access-3';
      return json({ userId: 'u_1', accessToken: 'access-3', refreshToken: 'refresh-3' });
    }

    // 以下は認証必須
    if (server.failNextAuthOnce) { server.failNextAuthOnce = false; return errBody('UNAUTHORIZED', 401); }
    if (authed !== `Bearer ${server.validAccess}`) return errBody('UNAUTHORIZED', 401);

    if (path === '/v1/me') return json({ userId: 'u_1', name: 'プレイヤー', isGuest: true, tickets: server.tickets, yoryoku: server.yoryoku, loginBonus: { day: 1, tickets: 1 }, rating: 1500, wins: server.wins, losses: 0 });
    if (path === '/v1/me/collection') return json({ owned: server.owned });
    if (path === '/v1/me/formation' && method === 'GET') return json({ rows: server.formation });
    if (path === '/v1/me/formation' && method === 'PUT') {
      // 大将なしは拒否(サーバー権威の例示)
      const ids = (body.rows as (string|null)[][]).flat().filter(Boolean) as string[];
      if (!ids.includes('kyubi')) return errBody('INVALID_FORMATION', 400);
      server.formation = body.rows;
      return json({ rows: body.rows });
    }
    if (path === '/v1/gacha/pull') {
      if (server.tickets < body.count) return errBody('INSUFFICIENT_TICKETS', 400);
      server.tickets -= body.count;
      const results = Array.from({ length: body.count }, () => ({ id: 'kooni', rarity: 'N', isNew: false, yoryoku: 20 }));
      server.yoryoku += 20 * body.count;
      return json({ results, tickets: server.tickets, yoryoku: server.yoryoku });
    }
    if (path === '/v1/exchange') {
      if (server.yoryoku < 300) return errBody('INSUFFICIENT_YORYOKU', 400);
      server.yoryoku -= 300; server.tickets += 1;
      return json({ tickets: server.tickets, yoryoku: server.yoryoku });
    }
    if (path === '/v1/solo/win') {
      server.wins += 1; server.tickets += 1;
      return json({ granted: 1, tickets: server.tickets, dailyCount: 1, dailyCap: 2, wins: server.wins });
    }
    if (path === '/v1/auth/link-code') {
      server.linkCode = 'LINKCODE1234';
      return json({ code: server.linkCode });
    }
    return errBody('VALIDATION', 400);
  });
  (globalThis as any).fetch = fetchMock;
  return fetchMock;
}

beforeEach(() => {
  ls.clear();
  server = {
    tickets: 11, yoryoku: 0, owned: ['kyubi', 'kooni'], wins: 0,
    formation: [['kyubi', null, null, null, null], [null, null, null, null, null]],
    validAccess: '', refreshValid: false, failNextAuthOnce: false, linkCode: null, requests: [],
  };
});

test('init: ゲスト発行 → /me・collection・formation をキャッシュに反映', async () => {
  install();
  const m = new ApiMeta(new ApiClient('http://api.test'));
  const bonus = await m.init();
  expect(bonus).toEqual({ day: 1, tickets: 1 });
  expect(m.data.online).toBe(true);
  expect(m.data.tickets).toBe(11);
  expect(m.data.owned).toEqual({ kyubi: 1, kooni: 1 });
  expect(m.data.formation[0][0]).toBe('kyubi');
  // リフレッシュトークンが保存される
  expect(ls.get('yokaiShogi.rt.v1')).toBe('refresh-1');
});

test('既存リフレッシュトークンがあればゲストではなくrefreshを使う', async () => {
  install();
  ls.set('yokaiShogi.rt.v1', 'refresh-1');
  server.refreshValid = true;
  const m = new ApiMeta(new ApiClient('http://api.test'));
  await m.init();
  const paths = server.requests.map(r => r.path);
  expect(paths).toContain('/v1/auth/refresh');
  expect(paths).not.toContain('/v1/auth/guest');
  expect(ls.get('yokaiShogi.rt.v1')).toBe('refresh-2'); // ローテーション
});

test('pull: サーバー結果でtickets/yoryoku/ownedを更新・idempotencyKey送信', async () => {
  const fetchMock = install();
  const m = new ApiMeta(new ApiClient('http://api.test'));
  await m.init();
  const res = await m.pull(10);
  expect(res).toHaveLength(10);
  expect(m.data.tickets).toBe(1);
  expect(m.data.yoryoku).toBe(200);
  const pullReq = server.requests.find(r => r.path === '/v1/gacha/pull')!;
  expect(pullReq.body.count).toBe(10);
  expect(typeof pullReq.body.idempotencyKey).toBe('string');
  expect(pullReq.body.idempotencyKey.length).toBeGreaterThanOrEqual(8);
  fetchMock.mockClear();
});

test('pull: チケット不足は null(例外にしない)', async () => {
  install();
  server.tickets = 0;
  const m = new ApiMeta(new ApiClient('http://api.test'));
  await m.init();           // /me は loginBonus で +1 にはしない(モックは固定値)
  server.tickets = 0;
  expect(await m.pull(10)).toBeNull();
});

test('exchange: 不足は false、十分なら true でtickets増', async () => {
  install();
  server.yoryoku = 300;
  const m = new ApiMeta(new ApiClient('http://api.test'));
  await m.init();
  expect(await m.exchange()).toBe(true);
  expect(m.data.tickets).toBe(12);
  expect(m.data.yoryoku).toBe(0);
  expect(await m.exchange()).toBe(false);
});

test('setFormation: 不正はサーバーのINVALID_FORMATIONメッセージを返す', async () => {
  install();
  const m = new ApiMeta(new ApiClient('http://api.test'));
  await m.init();
  // クライアント側検証を通過させるため owned に必要駒を足す(大将なし編成をサーバーに投げる)
  m.data.owned['kooni'] = 1;
  const err = await m.setFormation([['kooni', null, null, null, null], [null, null, null, null, null]]);
  expect(err).toBeTruthy(); // 大将なし
  // 正常(kyubiあり)
  const ok = await m.setFormation([['kyubi', null, null, null, null], [null, null, null, null, null]]);
  expect(ok).toBeNull();
  expect(m.data.formation[0][0]).toBe('kyubi');
});

test('recordSoloWin: tickets/winsを更新', async () => {
  install();
  const m = new ApiMeta(new ApiClient('http://api.test'));
  await m.init();
  const granted = await m.recordSoloWin();
  expect(granted).toBe(1);
  expect(m.data.tickets).toBe(12);
  expect(m.data.wins).toBe(1);
});

test('401時に自動でセッション再確立してリトライする', async () => {
  install();
  const m = new ApiMeta(new ApiClient('http://api.test'));
  await m.init();
  // 次の認証付きリクエストを一度だけ401にする → refresh で復帰しリトライ成功
  server.failNextAuthOnce = true;
  server.refreshValid = true;
  const res = await m.pull(1);
  expect(res).not.toBeNull();
  expect(server.requests.some(r => r.path === '/v1/auth/refresh')).toBe(true);
});

test('引き継ぎコード: 発行でゲスト卒業・別端末ログイン相当でデータ再取得', async () => {
  install();
  const m = new ApiMeta(new ApiClient('http://api.test'));
  await m.init();
  const code = await m.issueLinkCode();
  expect(code).toBe('LINKCODE1234');
  expect(m.data.isGuest).toBe(false);

  // 引き継ぎ先で残高が違う状態を模す → redeem後 reload で再取得される
  server.tickets = 3;
  expect(await m.redeemLinkCode(code)).toBe(true);
  expect(m.data.tickets).toBe(3);
  expect(server.requests.some(r => r.path === '/v1/auth/login/link-code')).toBe(true);
});

test('引き継ぎコード: 不正コードは ApiError(UNAUTHORIZED)', async () => {
  install();
  const m = new ApiMeta(new ApiClient('http://api.test'));
  await m.init();
  await expect(m.redeemLinkCode('WRONG-CODE')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('LocalMeta(オフライン)は引き継ぎ非対応で例外', async () => {
  const { LocalMeta } = await import('../client/src/meta/local');
  const lm = new LocalMeta();
  await expect(lm.issueLinkCode()).rejects.toThrow();
  await expect(lm.redeemLinkCode('x')).rejects.toThrow();
});

test('オフライン(fetch失敗)は NetworkError を投げる', async () => {
  install({ offline: true });
  const m = new ApiMeta(new ApiClient('http://api.test'));
  await expect(m.init()).rejects.toBeInstanceOf(NetworkError);
});

test('ApiError は code を保持する', async () => {
  install();
  const client = new ApiClient('http://api.test');
  await client.ensureSession();
  server.tickets = 0;
  await expect(client.post2('/v1/gacha/pull', { count: 10, idempotencyKey: 'k_12345678' }))
    .rejects.toMatchObject({ code: 'INSUFFICIENT_TICKETS' });
  expect(new ApiError('X', 'm', 400)).toBeInstanceOf(Error);
});
