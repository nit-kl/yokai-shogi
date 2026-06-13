/* APIの統合テスト(Workersランタイム + ローカルD1)
   doc 10 の「改ざん検証」: 不正リクエストがサーバーで拒否されることを確認する */
import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { runDailyJobs } from '../../server/src/cron';
import { gameDate, prevGameDate } from '../../server/src/lib/time';

const BASE = 'http://example.com';

/* IPレート制限はモジュールメモリ上で全テスト共有のため、テストごとにユニークIPを振る
   (本番では実IPが分散するため非問題。ここではレート制限ロジック自体の単体検証は別テストで行う) */
let ipCounter = 0;
function freshIp(): string {
  ipCounter++;
  return `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.1`;
}

async function api(path: string, init?: RequestInit & { token?: string; ip?: string }) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init?.token) headers.Authorization = `Bearer ${init.token}`;
  if (init?.ip) headers['CF-Connecting-IP'] = init.ip;
  const res = await SELF.fetch(`${BASE}${path}`, { ...init, headers });
  return { status: res.status, body: await res.json<any>().catch(() => null) };
}

async function createGuest() {
  const r = await api('/v1/auth/guest', { method: 'POST', body: '{}', ip: freshIp() });
  expect(r.status).toBe(201);
  return r.body as { userId: string; accessToken: string; refreshToken: string };
}

describe('認証', () => {
  it('認証設定: Turnstile未設定時は不要と返す', async () => {
    const config = await api('/v1/auth/config');
    expect(config.status).toBe(200);
    expect(config.body).toEqual({ turnstileRequired: false });
  });

  it('ゲスト作成: 初期チケット10・基本9種・初期編成', async () => {
    const g = await createGuest();
    expect(g.userId).toBeTruthy();
    expect(g.accessToken).toBeTruthy();

    const me = await api('/v1/me', { token: g.accessToken });
    expect(me.status).toBe(200);
    // 初回 /me でログインボーナス(1日目+1枚)が付与される
    expect(me.body.loginBonus).toEqual({ day: 1, tickets: 1 });
    expect(me.body.tickets).toBe(11);
    expect(me.body.isGuest).toBe(true);

    const col = await api('/v1/me/collection', { token: g.accessToken });
    expect(col.body.owned).toHaveLength(9);
    expect(col.body.owned).toContain('kyubi');

    const f = await api('/v1/me/formation', { token: g.accessToken });
    expect(f.body.rows[1][2]).toBe('kyubi');
  });

  it('ログインボーナス: 初日付与と同日2回目なし', async () => {
    const g = await createGuest();
    const first = await api('/v1/me', { token: g.accessToken });
    expect(first.body.loginBonus).toEqual({ day: 1, tickets: 1 });
    expect(first.body.tickets).toBe(11);

    const second = await api('/v1/me', { token: g.accessToken });
    expect(second.body.loginBonus).toBeUndefined();
    expect(second.body.tickets).toBe(11);
  });

  it('ログインボーナス: 6日連続の翌日(7日目)は3枚', async () => {
    const g = await createGuest();
    const today = gameDate();
    // 昨日ログイン済み・6日連続の状態を作る(当日の付与履歴はまだない)→ 今日で7日目=3枚
    await env.DB.prepare('UPDATE user_profiles SET last_login_date = ?2, login_streak = 6 WHERE user_id = ?1')
      .bind(g.userId, prevGameDate(today)).run();
    const seventh = await api('/v1/me', { token: g.accessToken });
    expect(seventh.body.loginBonus).toEqual({ day: 7, tickets: 3 });
    expect(seventh.body.tickets).toBe(13); // 初期10 + 3
  });

  it('ログインボーナス: 連続が途切れたら1日目に戻る', async () => {
    const g = await createGuest();
    // 最終ログインが大昔・streak値は残っている状態(当日の付与履歴なし)
    await env.DB.prepare("UPDATE user_profiles SET last_login_date = '2000-01-01', login_streak = 7 WHERE user_id = ?1")
      .bind(g.userId).run();
    const reset = await api('/v1/me', { token: g.accessToken });
    expect(reset.body.loginBonus!.day).toBe(1);
  });

  it('トークン更新: ローテーション+再利用検知で系列失効', async () => {
    const g = await createGuest();
    const r1 = await api('/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: g.refreshToken }) });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(g.refreshToken);

    // 使用済みトークンの再提示 → 401 + 系列ごと失効
    const reuse = await api('/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: g.refreshToken }) });
    expect(reuse.status).toBe(401);
    const revoked = await api('/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: r1.body.refreshToken }) });
    expect(revoked.status).toBe(401);
  });

  it('引き継ぎコード: 別端末から同一アカウントを復元できる・再発行で旧コード無効', async () => {
    const g = await createGuest();
    const issued = await api('/v1/auth/link-code', { method: 'POST', token: g.accessToken, body: '{}' });
    expect(issued.status).toBe(200);
    const code: string = issued.body.code;
    expect(code).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/);

    // 「別端末」からコードでログイン(小文字・区切りなしでも通る)
    const login = await api('/v1/auth/login/link-code', {
      method: 'POST', ip: freshIp(), body: JSON.stringify({ code: code.toLowerCase().replace(/-/g, '') }),
    });
    expect(login.status).toBe(200);
    expect(login.body.userId).toBe(g.userId);
    const me = await api('/v1/me', { token: login.body.accessToken });
    expect(me.body.userId).toBe(g.userId);

    // 再発行すると旧コードは無効
    const reissued = await api('/v1/auth/link-code', { method: 'POST', token: g.accessToken, body: '{}' });
    expect(reissued.body.code).not.toBe(code);
    const oldLogin = await api('/v1/auth/login/link-code', { method: 'POST', ip: freshIp(), body: JSON.stringify({ code }) });
    expect(oldLogin.status).toBe(401);
  });

  it('BANユーザーはAPIを利用できない', async () => {
    const g = await createGuest();
    await env.DB.prepare("UPDATE users SET status = 'banned' WHERE id = ?1").bind(g.userId).run();
    const me = await api('/v1/me', { token: g.accessToken });
    expect(me.status).toBe(403);
    expect(me.body.error.code).toBe('BANNED');
  });

  it('認証なし・不正トークンは401', async () => {
    expect((await api('/v1/me')).status).toBe(401);
    expect((await api('/v1/me', { token: 'xx.yy.zz' })).status).toBe(401);
  });
});

describe('ガチャ', () => {
  it('1連: チケット減・結果保存・冪等キーで再返却', async () => {
    const g = await createGuest();
    await api('/v1/me', { token: g.accessToken }); // tickets 11

    const key = 'test-key-00000001';
    const r1 = await api('/v1/gacha/pull', {
      method: 'POST', token: g.accessToken,
      body: JSON.stringify({ count: 1, idempotencyKey: key }),
    });
    expect(r1.status).toBe(200);
    expect(r1.body.results).toHaveLength(1);
    expect(r1.body.tickets).toBe(10);

    // 同一キー再送 → 保存済み結果・残高は減らない(二重引き防止: doc 05)
    const r2 = await api('/v1/gacha/pull', {
      method: 'POST', token: g.accessToken,
      body: JSON.stringify({ count: 1, idempotencyKey: key }),
    });
    expect(r2.body.results).toEqual(r1.body.results);
    expect(r2.body.tickets).toBe(10);
  });

  it('10連: 10件・チケット-10・新規はコレクション追加・被りは妖力化', async () => {
    const g = await createGuest();
    await api('/v1/me', { token: g.accessToken }); // 11枚

    const r = await api('/v1/gacha/pull', {
      method: 'POST', token: g.accessToken,
      body: JSON.stringify({ count: 10, idempotencyKey: 'test-key-00000002' }),
    });
    expect(r.status).toBe(200);
    expect(r.body.results).toHaveLength(10);
    expect(r.body.tickets).toBe(1);

    const dupes = r.body.results.filter((x: any) => !x.isNew);
    const expectedYoryoku = dupes.reduce((a: number, x: any) => a + x.yoryoku, 0);
    expect(r.body.yoryoku).toBe(expectedYoryoku);

    const col = await api('/v1/me/collection', { token: g.accessToken });
    const newIds = r.body.results.filter((x: any) => x.isNew).map((x: any) => x.id);
    for (const id of newIds) expect(col.body.owned).toContain(id);
  });

  it('チケット不足・不正リクエストは拒否(改ざん検証)', async () => {
    const g = await createGuest();
    await api('/v1/me', { token: g.accessToken }); // 11枚

    const over = await api('/v1/gacha/pull', {
      method: 'POST', token: g.accessToken,
      body: JSON.stringify({ count: 10, idempotencyKey: 'test-key-00000003' }),
    });
    expect(over.status).toBe(200); // 11枚あるので成功
    const insufficient = await api('/v1/gacha/pull', {
      method: 'POST', token: g.accessToken,
      body: JSON.stringify({ count: 10, idempotencyKey: 'test-key-00000004' }),
    });
    expect(insufficient.status).toBe(400);
    expect(insufficient.body.error.code).toBe('INSUFFICIENT_TICKETS');

    // count改ざん・キー欠落
    for (const bad of [{ count: 5, idempotencyKey: 'test-key-00000005' }, { count: 1 }, { count: -1, idempotencyKey: 'test-key-00000006' }]) {
      const r = await api('/v1/gacha/pull', { method: 'POST', token: g.accessToken, body: JSON.stringify(bad) });
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION');
    }
  });

  it('排出率の公開(認証不要)', async () => {
    const r = await api('/v1/gacha/rates');
    expect(r.status).toBe(200);
    const weights = r.body.rates.map((x: any) => x.weight);
    expect(weights).toEqual([40, 40, 16, 4]);
    // 個別妖怪単位の確率も含む(doc 11)
    expect(r.body.rates[0].yokai.length).toBeGreaterThan(0);
  });
});

describe('妖力交換', () => {
  it('300妖力→チケット1枚・不足時は拒否', async () => {
    const g = await createGuest();
    await api('/v1/me', { token: g.accessToken });

    const ng = await api('/v1/exchange', { method: 'POST', token: g.accessToken, body: '{}' });
    expect(ng.status).toBe(400);
    expect(ng.body.error.code).toBe('INSUFFICIENT_YORYOKU');

    // 妖力300を直接付与(ログも併記して不変条件を保つ)
    await env.DB.batch([
      env.DB.prepare('UPDATE user_profiles SET yoryoku = 300 WHERE user_id = ?1').bind(g.userId),
      env.DB.prepare("INSERT INTO currency_logs (user_id, currency, delta, balance, reason) VALUES (?1, 'yoryoku', 300, 300, 'compensation')").bind(g.userId),
    ]);
    const ok = await api('/v1/exchange', { method: 'POST', token: g.accessToken, body: '{}' });
    expect(ok.status).toBe(200);
    expect(ok.body.tickets).toBe(12);
    expect(ok.body.yoryoku).toBe(0);
  });
});

describe('編成', () => {
  it('未所持・大将なし・重複はサーバーで拒否(改ざん検証)', async () => {
    const g = await createGuest();
    const put = (rows: unknown) => api('/v1/me/formation', {
      method: 'PUT', token: g.accessToken, body: JSON.stringify({ rows }),
    });

    // 未所持(tamamoはガチャ限定)
    const unowned = await put([[null, null, null, null, null], [null, null, 'tamamo', null, null]]);
    expect(unowned.status).toBe(400);
    expect(unowned.body.error.code).toBe('INVALID_FORMATION');

    // 大将なし
    expect((await put([['kooni', null, null, null, null], [null, null, null, null, null]])).status).toBe(400);
    // 重複
    expect((await put([['kooni', 'kooni', null, null, null], [null, null, 'kyubi', null, null]])).status).toBe(400);
    // 構造不正
    expect((await put([['kyubi']])).status).toBe(400);

    // 正常
    const ok = await put([[null, 'tengu', null, null, null], [null, null, 'kyubi', null, null]]);
    expect(ok.status).toBe(200);
    const f = await api('/v1/me/formation', { token: g.accessToken });
    expect(f.body.rows[0][1]).toBe('tengu');
  });
});

describe('ソロ勝利報酬', () => {
  it('日次上限2枚・上限後は付与0(勝利数は加算)', async () => {
    const g = await createGuest();
    await api('/v1/me', { token: g.accessToken }); // 11枚

    const w1 = await api('/v1/solo/win', { method: 'POST', token: g.accessToken, body: '{}' });
    expect(w1.body).toMatchObject({ granted: 1, tickets: 12, dailyCount: 1 });
    const w2 = await api('/v1/solo/win', { method: 'POST', token: g.accessToken, body: '{}' });
    expect(w2.body).toMatchObject({ granted: 1, tickets: 13, dailyCount: 2 });
    const w3 = await api('/v1/solo/win', { method: 'POST', token: g.accessToken, body: '{}' });
    expect(w3.body).toMatchObject({ granted: 0, tickets: 13, dailyCount: 2 });
    expect(w3.body.wins).toBe(3);
  });
});

describe('表示名', () => {
  it('変更できる・不正な名前は拒否', async () => {
    const g = await createGuest();
    const ok = await api('/v1/me/name', { method: 'PUT', token: g.accessToken, body: JSON.stringify({ name: '九尾使い' }) });
    expect(ok.status).toBe(200);
    const me = await api('/v1/me', { token: g.accessToken });
    expect(me.body.name).toBe('九尾使い');

    for (const bad of ['', 'ながすぎるなまえですよ12', '<script>', 'a"b']) {
      const r = await api('/v1/me/name', { method: 'PUT', token: g.accessToken, body: JSON.stringify({ name: bad }) });
      expect(r.status, `name=${bad}`).toBe(400);
    }
  });
});

describe('日次バッチ(Cron)', () => {
  it('一連の操作後も経済の不変条件が成立する(doc 08)', async () => {
    const g = await createGuest();
    await api('/v1/me', { token: g.accessToken });
    await api('/v1/gacha/pull', { method: 'POST', token: g.accessToken, body: JSON.stringify({ count: 10, idempotencyKey: 'test-key-inv-00001' }) });
    await api('/v1/solo/win', { method: 'POST', token: g.accessToken, body: '{}' });

    const summary = await runDailyJobs(env);
    expect(summary.ticketMismatches).toBe(0);
    expect(summary.yoryokuMismatches).toBe(0);
    expect(summary.yokaiMismatch).toBe(false);
  });

  it('休眠ゲスト(30日超・連携なし)が削除され、連携済みは残る', async () => {
    const dormant = await createGuest();
    const linked = await createGuest();
    await api('/v1/auth/link-code', { method: 'POST', token: linked.accessToken, body: '{}' });

    // 両者を31日前作成・最終ログインなしに偽装
    for (const u of [dormant, linked]) {
      await env.DB.prepare("UPDATE users SET created_at = datetime('now', '-31 days') WHERE id = ?1").bind(u.userId).run();
      await env.DB.prepare('UPDATE user_profiles SET last_login_date = NULL WHERE user_id = ?1').bind(u.userId).run();
    }

    const summary = await runDailyJobs(env);
    expect(summary.dormantDeleted).toBe(1);

    const gone = await env.DB.prepare('SELECT id FROM users WHERE id = ?1').bind(dormant.userId).first();
    expect(gone).toBeNull();
    const kept = await env.DB.prepare('SELECT id FROM users WHERE id = ?1').bind(linked.userId).first();
    expect(kept).not.toBeNull();
  });
});

describe('共通', () => {
  it('healthz・CORS', async () => {
    const h = await SELF.fetch(`${BASE}/healthz`);
    expect(h.status).toBe(200);

    const cors = await SELF.fetch(`${BASE}/v1/gacha/rates`, { headers: { Origin: 'http://localhost:5173' } });
    expect(cors.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    const denied = await SELF.fetch(`${BASE}/v1/gacha/rates`, { headers: { Origin: 'https://evil.example.com' } });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });
});
