/* APIの統合テスト(Workersランタイム + ローカルD1)
   doc 10 の「改ざん検証」: 不正リクエストがサーバーで拒否されることを確認する */
import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { runDailyJobs } from '../../server/src/cron';
import { gameDate, gameWeek, prevGameDate } from '../../server/src/lib/time';

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

  it('ゲスト作成: 初期チケット10・所持なし・オンボーディング未完了', async () => {
    const g = await createGuest();
    expect(g.userId).toBeTruthy();
    expect(g.accessToken).toBeTruthy();

    const me = await api('/v1/me', { token: g.accessToken });
    expect(me.status).toBe(200);
    expect(me.body.loginBonus).toBeUndefined();
    expect(me.body.tickets).toBe(10);
    expect(me.body.onboardingDone).toBe(false);
    expect(me.body.isGuest).toBe(true);

    const col = await api('/v1/me/collection', { token: g.accessToken });
    expect(col.body.owned).toHaveLength(0);

    const f = await api('/v1/me/formation', { token: g.accessToken });
    expect(f.body.rows.flat().every((id: unknown) => !id)).toBe(true);
  });

  it('オンボーディング: 大将選択→完了でログボ付与', async () => {
    const g = await createGuest();
    const boss = await api('/v1/onboarding/boss', {
      method: 'POST', token: g.accessToken, body: JSON.stringify({ bossId: 'kyubi' }),
    });
    expect(boss.status).toBe(200);
    expect(boss.body.rows[1][2]).toBe('kyubi');

    const col = await api('/v1/me/collection', { token: g.accessToken });
    expect(col.body.owned).toEqual(['kyubi']);

    const done = await api('/v1/onboarding/complete', { method: 'POST', token: g.accessToken, body: '{}' });
    expect(done.status).toBe(200);
    expect(done.body.onboardingDone).toBe(true);

    const me = await api('/v1/me', { token: g.accessToken });
    expect(me.body.onboardingDone).toBe(true);
    expect(me.body.loginBonus).toEqual({ day: 1, tickets: 1 });
    expect(me.body.releaseGift).toEqual({ tickets: 100 });
    expect(me.body.tickets).toBe(111); // 初期10 + ログボ1 + リリース記念100
  });

  it('ログインボーナス: 初日付与と同日2回目なし', async () => {
    const g = await createGuest();
    await api('/v1/onboarding/boss', { method: 'POST', token: g.accessToken, body: JSON.stringify({ bossId: 'kyubi' }) });
    await api('/v1/onboarding/complete', { method: 'POST', token: g.accessToken, body: '{}' });
    const first = await api('/v1/me', { token: g.accessToken });
    expect(first.body.loginBonus).toEqual({ day: 1, tickets: 1 });
    expect(first.body.releaseGift).toEqual({ tickets: 100 });
    expect(first.body.tickets).toBe(111);

    const second = await api('/v1/me', { token: g.accessToken });
    expect(second.body.loginBonus).toBeUndefined();
    expect(second.body.releaseGift).toBeUndefined();
    expect(second.body.tickets).toBe(111);
  });

  it('ログインボーナス: オンボーディング中は付与しない', async () => {
    const g = await createGuest();
    const me = await api('/v1/me', { token: g.accessToken });
    expect(me.body.loginBonus).toBeUndefined();
    expect(me.body.releaseGift).toBeUndefined();
    expect(me.body.tickets).toBe(10);
  });

  it('ログインボーナス: 6日連続の翌日(7日目)は3枚', async () => {
    const g = await createGuest();
    await api('/v1/onboarding/complete', { method: 'POST', token: g.accessToken, body: '{}' });
    const today = gameDate();
    // 昨日ログイン済み・6日連続の状態を作る(当日の付与履歴はまだない)→ 今日で7日目=3枚
    await env.DB.prepare('UPDATE user_profiles SET last_login_date = ?2, login_streak = 6 WHERE user_id = ?1')
      .bind(g.userId, prevGameDate(today)).run();
    const seventh = await api('/v1/me', { token: g.accessToken });
    expect(seventh.body.loginBonus).toEqual({ day: 7, tickets: 3 });
    expect(seventh.body.releaseGift).toEqual({ tickets: 100 });
    expect(seventh.body.tickets).toBe(113); // 初期10 + 7日目3 + リリース記念100
  });

  it('ログインボーナス: 連続が途切れたら1日目に戻る', async () => {
    const g = await createGuest();
    await api('/v1/onboarding/complete', { method: 'POST', token: g.accessToken, body: '{}' });
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
  async function readyGuest() {
    const g = await createGuest();
    await api('/v1/onboarding/boss', { method: 'POST', token: g.accessToken, body: JSON.stringify({ bossId: 'kyubi' }) });
    return g;
  }

  it('1連: チケット減・結果保存・冪等キーで再返却', async () => {
    const g = await readyGuest();
    await api('/v1/me', { token: g.accessToken }); // tickets 10(ログボなし)

    const key = 'test-key-00000001';
    const r1 = await api('/v1/gacha/pull', {
      method: 'POST', token: g.accessToken,
      body: JSON.stringify({ count: 1, idempotencyKey: key }),
    });
    expect(r1.status).toBe(200);
    expect(r1.body.results).toHaveLength(1);
    expect(r1.body.tickets).toBe(9);

    // 同一キー再送 → 保存済み結果・残高は減らない(二重引き防止: doc 05)
    const r2 = await api('/v1/gacha/pull', {
      method: 'POST', token: g.accessToken,
      body: JSON.stringify({ count: 1, idempotencyKey: key }),
    });
    expect(r2.body.results).toEqual(r1.body.results);
    expect(r2.body.tickets).toBe(9);
  });

  it('10連: 10件・チケット-10・新規はコレクション追加・被りは妖力化', async () => {
    const g = await readyGuest();
    await api('/v1/me', { token: g.accessToken }); // 10枚

    const r = await api('/v1/gacha/pull', {
      method: 'POST', token: g.accessToken,
      body: JSON.stringify({ count: 10, idempotencyKey: 'test-key-00000002' }),
    });
    expect(r.status).toBe(200);
    expect(r.body.results).toHaveLength(10);
    expect(r.body.tickets).toBe(0);

    const dupes = r.body.results.filter((x: any) => !x.isNew);
    const expectedYoryoku = dupes.reduce((a: number, x: any) => a + x.yoryoku, 0);
    expect(r.body.yoryoku).toBe(expectedYoryoku);

    const col = await api('/v1/me/collection', { token: g.accessToken });
    const newIds = r.body.results.filter((x: any) => x.isNew).map((x: any) => x.id);
    for (const id of newIds) expect(col.body.owned).toContain(id);
  });

  it('チケット不足・不正リクエストは拒否(改ざん検証)', async () => {
    const g = await readyGuest();
    await api('/v1/me', { token: g.accessToken }); // 10枚

    const over = await api('/v1/gacha/pull', {
      method: 'POST', token: g.accessToken,
      body: JSON.stringify({ count: 10, idempotencyKey: 'test-key-00000003' }),
    });
    expect(over.status).toBe(200); // 10枚あるので成功
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
    await api('/v1/onboarding/boss', { method: 'POST', token: g.accessToken, body: JSON.stringify({ bossId: 'kyubi' }) });
    await api('/v1/onboarding/complete', { method: 'POST', token: g.accessToken, body: '{}' });
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
    expect(ok.body.tickets).toBe(112); // 初期10 + ログボ1 + リリース記念100 + 交換1
    expect(ok.body.yoryoku).toBe(0);
  });
});

describe('編成', () => {
  it('未所持・大将なし・重複はサーバーで拒否(改ざん検証)', async () => {
    const g = await createGuest();
    await api('/v1/onboarding/boss', { method: 'POST', token: g.accessToken, body: JSON.stringify({ bossId: 'kyubi' }) });
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

    // 正常(tenguを所持させる)
    await env.DB.batch([
      env.DB.prepare('INSERT INTO user_yokai (user_id, yokai_id) VALUES (?1, ?2)').bind(g.userId, 'tengu'),
      env.DB.prepare(`INSERT INTO gacha_logs (user_id, idempotency_key, count, new_count, results)
        VALUES (?1, 'test-grant-tengu', 0, 1, '[]')`).bind(g.userId),
    ]);
    const ok = await put([[null, 'tengu', null, null, null], [null, null, 'kyubi', null, null]]);
    expect(ok.status).toBe(200);
    const f = await api('/v1/me/formation', { token: g.accessToken });
    expect(f.body.rows[0][1]).toBe('tengu');
  });
});

describe('ソロ勝利報酬', () => {
  it('日次上限2枚・上限後は付与0(勝利数は加算)', async () => {
    const g = await createGuest();
    await api('/v1/onboarding/boss', { method: 'POST', token: g.accessToken, body: JSON.stringify({ bossId: 'kyubi' }) });
    await api('/v1/onboarding/complete', { method: 'POST', token: g.accessToken, body: '{}' });
    await api('/v1/me', { token: g.accessToken }); // 111枚(初期10+ログボ1+リリース100)

    const w1 = await api('/v1/solo/win', { method: 'POST', token: g.accessToken, body: '{}' });
    expect(w1.body).toMatchObject({ granted: 1, tickets: 112, dailyCount: 1 });
    const w2 = await api('/v1/solo/win', { method: 'POST', token: g.accessToken, body: '{}' });
    expect(w2.body).toMatchObject({ granted: 1, tickets: 113, dailyCount: 2 });
    const w3 = await api('/v1/solo/win', { method: 'POST', token: g.accessToken, body: '{}' });
    expect(w3.body).toMatchObject({ granted: 0, tickets: 113, dailyCount: 2 });
    expect(w3.body.wins).toBe(3);
  });
});

describe('リワード広告(doc 22)', () => {
  it('status: 有効時は残回数を返す', async () => {
    const g = await createGuest();
    const st = await api('/v1/ads/status', { token: g.accessToken });
    expect(st.status).toBe(200);
    expect(st.body).toMatchObject({
      enabled: true,
      provider: 'mock',
      dailyCap: 2,
      claimed: 0,
      remaining: 2,
      ticketsPerReward: 1,
    });
  });

  it('reward: 日次上限2枚・provider不一致は拒否・上限後は付与0', async () => {
    const g = await createGuest();
    await api('/v1/onboarding/boss', { method: 'POST', token: g.accessToken, body: JSON.stringify({ bossId: 'kyubi' }) });
    await api('/v1/onboarding/complete', { method: 'POST', token: g.accessToken, body: '{}' });
    await api('/v1/me', { token: g.accessToken }); // 111枚(初期10+ログボ1+リリース100)

    const bad = await api('/v1/ads/reward', {
      method: 'POST', token: g.accessToken, body: JSON.stringify({ provider: 'gpt' }),
    });
    expect(bad.status).toBe(400);

    const r1 = await api('/v1/ads/reward', {
      method: 'POST', token: g.accessToken, body: JSON.stringify({ provider: 'mock' }),
    });
    expect(r1.status).toBe(200);
    expect(r1.body).toMatchObject({ granted: 1, tickets: 112, dailyCount: 1, remaining: 1 });

    const r2 = await api('/v1/ads/reward', {
      method: 'POST', token: g.accessToken, body: JSON.stringify({ provider: 'mock' }),
    });
    expect(r2.body).toMatchObject({ granted: 1, tickets: 113, dailyCount: 2, remaining: 0 });

    const r3 = await api('/v1/ads/reward', {
      method: 'POST', token: g.accessToken, body: JSON.stringify({ provider: 'mock' }),
    });
    expect(r3.body).toMatchObject({ granted: 0, tickets: 113, dailyCount: 2, remaining: 0 });

    const st = await api('/v1/ads/status', { token: g.accessToken });
    expect(st.body).toMatchObject({ claimed: 2, remaining: 0 });

    const logs = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM currency_logs WHERE user_id = ?1 AND reason = 'ad_reward'",
    ).bind(g.userId).first<{ n: number }>();
    expect(logs?.n).toBe(2);
  });
});

describe('百鬼夜行 週間連勝ランキング(doc 21)', () => {
  const hyakkiStart = (token: string) =>
    api('/v1/solo/hyakki/start', { method: 'POST', token, body: '{}' });
  const hyakkiResult = (token: string, win: unknown) =>
    api('/v1/solo/hyakki/result', { method: 'POST', token, body: JSON.stringify({ win }) });
  /* 最短対局時間(30秒)を満たすため、start申告を過去に戻す */
  const backdatePending = (userId: string, secondsAgo = 60) =>
    env.DB.prepare('UPDATE user_profiles SET hyakki_pending_at = ?2 WHERE user_id = ?1')
      .bind(userId, new Date(Date.now() - secondsAgo * 1000).toISOString()).run();
  const hyakkiWin = async (g: { userId: string; accessToken: string }) => {
    await hyakkiStart(g.accessToken);
    await backdatePending(g.userId);
    return hyakkiResult(g.accessToken, true);
  };

  it('週キー: JST月曜4:00で週が替わる', () => {
    expect(gameWeek(new Date('2026-07-05T03:59:00+09:00'))).toBe('2026-06-29'); // 日曜未明=土曜扱い
    expect(gameWeek(new Date('2026-07-06T03:59:00+09:00'))).toBe('2026-06-29'); // 月曜3:59はまだ前週
    expect(gameWeek(new Date('2026-07-06T04:00:00+09:00'))).toBe('2026-07-06'); // 月曜4:00から新週
  });

  it('勝利で連勝・週間ベスト・順位が伸び、敗北で連勝が0に戻る', async () => {
    const g = await createGuest();
    const w1 = await hyakkiWin(g);
    expect(w1.body).toEqual({ currentStreak: 1, bestStreak: 1, rank: 1 });
    const w2 = await hyakkiWin(g);
    expect(w2.body).toEqual({ currentStreak: 2, bestStreak: 2, rank: 1 });

    await hyakkiStart(g.accessToken);
    await backdatePending(g.userId);
    const lose = await hyakkiResult(g.accessToken, false);
    expect(lose.body).toEqual({ currentStreak: 0, bestStreak: 2, rank: 1 });
  });

  it('開始から30秒未満の勝利報告は負け扱い(連打対策)', async () => {
    const g = await createGuest();
    await hyakkiStart(g.accessToken);
    const r = await hyakkiResult(g.accessToken, true);
    expect(r.status).toBe(200);
    expect(r.body.currentStreak).toBe(0);
  });

  it('結果未報告のまま再開始すると前局は負け扱い(劣勢リロード対策)', async () => {
    const g = await createGuest();
    await hyakkiWin(g);
    await hyakkiStart(g.accessToken); // 1局目: 開始したが結果を報告しない
    const again = await hyakkiStart(g.accessToken);
    expect(again.body.currentStreak).toBe(0);
  });

  it('開始申告なしの結果報告・不正なwinは400', async () => {
    const g = await createGuest();
    const noStart = await hyakkiResult(g.accessToken, true);
    expect(noStart.status).toBe(400);
    await hyakkiStart(g.accessToken);
    const badWin = await hyakkiResult(g.accessToken, 'yes');
    expect(badWin.status).toBe(400);
  });

  /* D1はファイル内のテスト間で共有されるため、他テストの記録が混ざる前提で
     自分の名前のエントリだけを検証する(他のdescribeと同じ流儀) */

  it('週替わりで連勝はリセットされ、前週の記録はlastWeekに掲載される', async () => {
    const g = await createGuest();
    await api('/v1/me/name', { method: 'PUT', token: g.accessToken, body: JSON.stringify({ name: '週跨ぎの丙' }) });
    await hyakkiWin(g);
    /* 記録を丸ごと前週へ移す */
    const lastWeek = gameWeek(new Date(Date.now() - 7 * 86400e3));
    await env.DB.prepare('UPDATE user_profiles SET hyakki_week = ?2 WHERE user_id = ?1').bind(g.userId, lastWeek).run();
    await env.DB.prepare('UPDATE hyakki_weekly SET week = ?2 WHERE user_id = ?1').bind(g.userId, lastWeek).run();

    const start = await hyakkiStart(g.accessToken);
    expect(start.body.currentStreak).toBe(0);

    const ranking = await api('/v1/rankings/hyakki');
    expect(ranking.status).toBe(200);
    expect(ranking.body.week).toBe(gameWeek());
    const names = (ranking.body.top as { name: string }[]).map(e => e.name);
    expect(names).not.toContain('週跨ぎの丙');
    expect(ranking.body.lastWeek).toContainEqual({ name: '週跨ぎの丙', bestStreak: 1 });
  });

  it('ランキングは連勝数降順で名前つき・認証時はmeつき・BANは除外', async () => {
    const a = await createGuest();
    const b = await createGuest();
    const c = await createGuest();
    await api('/v1/me/name', { method: 'PUT', token: a.accessToken, body: JSON.stringify({ name: '鬼神の甲' }) });
    await api('/v1/me/name', { method: 'PUT', token: b.accessToken, body: JSON.stringify({ name: '妖狐の乙' }) });
    await api('/v1/me/name', { method: 'PUT', token: c.accessToken, body: JSON.stringify({ name: '化猫の丁' }) });
    await hyakkiWin(a);
    await hyakkiWin(a);
    await hyakkiWin(b);
    await hyakkiWin(c);
    /* 同率の並びは先着順(updated_at ASC)。datetime('now')は秒精度で
       テスト内では同時刻になり得るため、bを確実に先着にする */
    await env.DB.prepare("UPDATE hyakki_weekly SET updated_at = datetime('now', '-60 seconds') WHERE user_id = ?1")
      .bind(b.userId).run();

    const anon = await api('/v1/rankings/hyakki');
    const top = anon.body.top as { name: string; bestStreak: number }[];
    expect(top.filter(e => ['鬼神の甲', '妖狐の乙', '化猫の丁'].includes(e.name))).toEqual([
      { name: '鬼神の甲', bestStreak: 2 },
      { name: '妖狐の乙', bestStreak: 1 },
      { name: '化猫の丁', bestStreak: 1 },
    ]);
    expect(anon.body.me).toBeNull();

    /* bの順位: 自分よりベストが大きい記録の数+1(同率同順位) */
    const asB = await api('/v1/rankings/hyakki', { token: b.accessToken });
    const expectedRank = top.filter(e => e.bestStreak > 1).length + 1;
    expect(asB.body.me).toEqual({ rank: expectedRank, bestStreak: 1 });

    await env.DB.prepare("UPDATE users SET status = 'banned' WHERE id = ?1").bind(c.userId).run();
    const afterBan = await api('/v1/rankings/hyakki');
    const namesAfter = (afterBan.body.top as { name: string }[]).map(e => e.name);
    expect(namesAfter).not.toContain('化猫の丁');
    expect(namesAfter).toContain('鬼神の甲');
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
    await api('/v1/onboarding/boss', { method: 'POST', token: g.accessToken, body: JSON.stringify({ bossId: 'kyubi' }) });
    await api('/v1/me', { token: g.accessToken });
    await api('/v1/gacha/pull', { method: 'POST', token: g.accessToken, body: JSON.stringify({ count: 10, idempotencyKey: 'test-key-inv-00001' }) });
    await api('/v1/solo/win', { method: 'POST', token: g.accessToken, body: '{}' });

    const summary = await runDailyJobs(env);
    expect(summary.ticketMismatches).toBe(0);
    expect(summary.yoryokuMismatches).toBe(0);
    expect(summary.yokaiMismatch).toBe(false);
  });

  it('先週1位へ覇者・九尾を冪等付与し、既所持ならスキップする', async () => {
    const g = await createGuest();
    await api('/v1/onboarding/boss', { method: 'POST', token: g.accessToken, body: JSON.stringify({ bossId: 'kyubi' }) });
    const lastWeek = gameWeek(new Date(Date.now() - 7 * 86400e3));
    /* 先行テストの cron / 週跨ぎ記録が lastWeek を埋めているので作り直す。
       報酬行だけ消すと yokai_new と user_yokai が食い違うため、新規付与分の所持も戻す */
    const prior = await env.DB.prepare(
      'SELECT user_id, yokai_id FROM hyakki_week_rewards WHERE yokai_new = 1',
    ).all<{ user_id: string; yokai_id: string }>();
    for (const r of prior.results) {
      await env.DB.prepare('DELETE FROM user_yokai WHERE user_id = ?1 AND yokai_id = ?2')
        .bind(r.user_id, r.yokai_id).run();
    }
    await env.DB.prepare('DELETE FROM hyakki_week_rewards').run();
    await env.DB.prepare('DELETE FROM hyakki_weekly WHERE week = ?1').bind(lastWeek).run();
    await env.DB.prepare(
      'INSERT INTO hyakki_weekly (user_id, week, best_streak) VALUES (?1, ?2, 3)',
    ).bind(g.userId, lastWeek).run();

    const first = await runDailyJobs(env);
    expect(first.hyakkiRewardGranted).toBe(true);
    expect(first.yokaiMismatch).toBe(false);
    const owned = await env.DB.prepare(
      "SELECT yokai_id FROM user_yokai WHERE user_id = ?1 AND yokai_id = 'kyubi_hasha'",
    ).bind(g.userId).first();
    expect(owned).not.toBeNull();
    const reward = await env.DB.prepare(
      'SELECT yokai_new FROM hyakki_week_rewards WHERE week = ?1',
    ).bind(lastWeek).first<{ yokai_new: number }>();
    expect(reward?.yokai_new).toBe(1);

    const second = await runDailyJobs(env);
    expect(second.hyakkiRewardGranted).toBe(false);
    expect(second.yokaiMismatch).toBe(false);
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM user_yokai WHERE user_id = ?1 AND yokai_id = 'kyubi_hasha'",
    ).bind(g.userId).first<{ n: number }>();
    expect(count?.n).toBe(1);
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

  it('お知らせ一覧を公開APIで返す', async () => {
    const r = await api('/v1/announcements');
    expect(r.status).toBe(200);
    expect(r.body.announcements[0]).toMatchObject({
      id: '2026-07-19-hyakki-hasha-kyubi',
      type: 'campaign',
      priority: 'high',
      title: '百鬼夜行ランキング1位に「覇者・九尾」を授与',
    });
    expect(r.body.announcements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: '2026-07-18-release-gift',
        type: 'campaign',
        priority: 'high',
        title: 'リリース記念！ガチャチケット🎟100枚配布',
      }),
      expect.objectContaining({
        id: '2026-07-10-rewarded-ads',
        type: 'campaign',
        priority: 'high',
        title: 'ガチャ画面で広告視聴ボーナスを準備中です',
      }),
      expect.objectContaining({
        id: '2026-07-05-hyakki-weekly-ranking',
        type: 'update',
        priority: 'high',
        title: '百鬼夜行の週間連勝ランキングが始まりました',
      }),
      expect.objectContaining({ id: '2026-07-04-hyakki-nurarihyon-event' }),
    ]));
  });

  it('お知らせ一覧は公開中のものを新しい順で返す', async () => {
    const r = await api('/v1/announcements');
    expect(r.status).toBe(200);
    expect(r.body.announcements[0]).toMatchObject({
      id: '2026-07-19-hyakki-hasha-kyubi',
      type: 'campaign',
      priority: 'high',
    });
    const timestamps = r.body.announcements.map((item: { publishedAt: string }) => Date.parse(item.publishedAt));
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
  });
});

describe('統計', () => {
  it('登録プレイヤー数を返す', async () => {
    const before = await api('/v1/stats/players');
    expect(before.status).toBe(200);
    const base = before.body.registered as number;

    await createGuest();
    const after = await api('/v1/stats/players');
    expect(after.status).toBe(200);
    expect(after.body.registered).toBe(base + 1);
  });
});
