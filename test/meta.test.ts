/* メタ進行ロジックのユニットテスト(Phase 1 でロジックの正本は shared/ に移行)
   - shared/gacha:    抽選・10連確定枠・被り妖力変換・排出率
   - shared/validate: 編成検証・表示名検証
   - client LocalMeta: ログインボーナス・日次上限・永続化(オフライン/ソロ用) */
import { beforeEach, test, expect } from 'vitest';
import { GACHA_POOL, RARITY_INFO, YOKAI, SETUP, ROWS, EMPTY_FORMATION } from '../shared/data';
import { drawGacha, rollRarity, gachaRates } from '../shared/gacha';
import { validateFormation, validateDisplayName } from '../shared/validate';
import { Game } from '../shared/game';
import { AI } from '../client/src/ai';

/* node環境に localStorage シムを用意(LocalMeta の永続化パスを実際に通す) */
const lsStore = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (lsStore.has(k) ? lsStore.get(k)! : null),
  setItem: (k: string, v: string) => { lsStore.set(k, String(v)); },
  removeItem: (k: string) => { lsStore.delete(k); },
  clear: () => lsStore.clear(),
  key: () => null,
  length: 0,
};

const initialOwned = new Set<string>();

/* ---------------------------------------------------------------- */
test('shared/gacha: レアリティ抽選の重み境界', () => {
  expect(rollRarity(() => 0.0), '下限はN').toBe('N');
  expect(rollRarity(() => 0.999), '上限はSSR').toBe('SSR');
});

test('shared/gacha: SSR異装はSSR内の0.5%枠から抽選される', () => {
  const values = [0.999, 0, 0];
  const draw = drawGacha(1, initialOwned, () => values.shift() ?? 0);
  expect(draw.results[0]).toMatchObject({ id: 'kyubi_eclipse', rarity: 'SSR', isNew: true });
  const specialRates = gachaRates().rates
    .flatMap(r => r.yokai)
    .filter(y => YOKAI[y.id].variantOf)
    .map(y => y.rate);
  const poolVariants = GACHA_POOL.filter(id => YOKAI[id].variantOf);
  expect(specialRates).toHaveLength(poolVariants.length);
  expect(specialRates.reduce((sum, rate) => sum + rate, 0)).toBeCloseTo(0.005);
});

test('shared/gacha: 10連はSR以上1枠確定(全N乱数でも)', () => {
  const draw = drawGacha(10, initialOwned, () => 0.0001);
  expect(draw.results).toHaveLength(10);
  expect(draw.results.some(r => r.rarity === 'SR' || r.rarity === 'SSR'), '10連SR以上確定').toBe(true);
});

test('shared/gacha: 排出はプール内・レアリティ一致・被りは妖力化', () => {
  const draw = drawGacha(100, initialOwned);
  for (const r of draw.results) {
    expect(GACHA_POOL.includes(r.id), '排出はプール内: ' + r.id).toBe(true);
    expect(YOKAI[r.id].rarity, 'レアリティ一致').toBe(r.rarity);
    if (!r.isNew) expect(r.yoryoku, '被りは妖力化').toBe(RARITY_INFO[r.rarity].yoryoku);
    else expect(r.yoryoku).toBe(0);
  }
  // 妖力合計と newIds の整合
  const dupeYoryoku = draw.results.filter(r => !r.isNew).reduce((a, r) => a + r.yoryoku, 0);
  expect(draw.yoryokuGained).toBe(dupeYoryoku);
  expect(new Set(draw.newIds).size).toBe(draw.newIds.length);
});

test('shared/gacha: limited(イベント限定)以外の全妖怪が排出対象', () => {
  expect(new Set(GACHA_POOL)).toEqual(new Set(Object.keys(YOKAI).filter(id => !YOKAI[id].limited)));
  for (const id of GACHA_POOL) expect(YOKAI[id].limited, '限定妖怪はガチャ排出しない: ' + id).toBeFalsy();
  expect(GACHA_POOL.includes('nurarihyon_hyakki'), '対戦会限定はプール外').toBe(false);
});

test('shared/gacha: 排出率公開の重みと個別確率', () => {
  const rates = gachaRates();
  expect(rates.rates.map(r => r.weight)).toEqual([40, 40, 16, 4]);
  for (const r of rates.rates) expect(r.yokai.length).toBeGreaterThan(0);
});

test('shared/gacha: レアリティ分布の健全性(10万回)', () => {
  const dist: Record<string, number> = { N: 0, R: 0, SR: 0, SSR: 0 };
  for (let i = 0; i < 100000; i++) dist[rollRarity()]++;
  expect(Math.abs(dist.N / 100000 - 0.40), 'N≈40%').toBeLessThan(0.02);
  expect(Math.abs(dist.R / 100000 - 0.40), 'R≈40%').toBeLessThan(0.02);
  expect(Math.abs(dist.SR / 100000 - 0.16), 'SR≈16%').toBeLessThan(0.015);
  expect(Math.abs(dist.SSR / 100000 - 0.04), 'SSR≈4%').toBeLessThan(0.01);
});

/* ---------------------------------------------------------------- */
test('shared/validate: 編成検証', () => {
  const owned = new Set([...initialOwned, 'kyubi', 'tamamo', 'nurarihyon', 'kooni', 'tengu']);
  expect(validateFormation([['kyubi', null, null, null, null], [null, null, null, null, null]], owned)).toBeNull();
  expect(validateFormation([[null, null, null, null, null], [null, null, null, null, null]], owned), '大将なし').not.toBeNull();
  expect(validateFormation([['kyubi', null, null, null, null], ['nurarihyon', null, null, null, null]], owned), '大将2体').not.toBeNull();
  expect(validateFormation([['kooni', 'kooni', null, null, null], [null, null, 'kyubi', null, null]], owned), '重複').not.toBeNull();
  expect(validateFormation([['onibi', null, null, null, null], [null, null, 'kyubi', null, null]], owned), '未所持').not.toBeNull();
  expect(validateFormation([['kyubi']], owned), '構造不正').not.toBeNull();
});

test('shared/validate: 表示名検証', () => {
  expect(validateDisplayName('九尾使い')).toBeNull();
  expect(validateDisplayName('')).not.toBeNull();
  expect(validateDisplayName('ながすぎるなまえですよ12')).not.toBeNull();
  expect(validateDisplayName('<script>')).not.toBeNull();
  expect(validateDisplayName('a"b')).not.toBeNull();
});

/* ---------------------------------------------------------------- */
/* LocalMeta(オフライン/ソロ用)— 動的importでlocalStorageシム設定後に読み込む */
let LocalMeta: typeof import('../client/src/meta/local').LocalMeta;
beforeEach(async () => {
  lsStore.clear();
  ({ LocalMeta } = await import('../client/src/meta/local'));
});

test('LocalMeta: 初期状態(チケット10・所持なし・オンボーディング未完了)', () => {
  const m = new LocalMeta();
  expect(m.data.tickets).toBe(10);
  expect(Object.keys(m.data.owned)).toHaveLength(0);
  expect(m.data.onboardingDone).toBe(false);
  expect(m.data.formation).toEqual(EMPTY_FORMATION);
  expect(m.data.online).toBe(false);
});

test('LocalMeta: オンボーディング(大将選択→完了でログボ)', async () => {
  const m = new LocalMeta();
  expect(await m.init(), '未完了時はログボなし').toBeNull();
  expect(await m.pickBoss('nurarihyon')).toBeNull();
  expect(m.data.owned.nurarihyon).toBe(1);
  expect(m.data.formation[1][2]).toBe('nurarihyon');
  const bonus = await m.completeOnboarding();
  expect(bonus).toEqual({ day: 1, tickets: 1 });
  expect(m.data.onboardingDone).toBe(true);
  expect(m.data.tickets).toBe(11);
});

test('LocalMeta: ログインボーナス(初日・同日・7日連続・途切れ)', () => {
  const m = new LocalMeta();
  const day = (n: number) => new Date(2026, 5, n, 12, 0, 0);
  let b = m.claimLoginBonus(day(1));
  expect(b).toEqual({ day: 1, tickets: 1 });
  expect(m.claimLoginBonus(day(1)), '同日2回目なし').toBeNull();
  b = m.claimLoginBonus(day(2));
  expect(b!.day).toBe(2);
  for (let n = 3; n <= 7; n++) b = m.claimLoginBonus(day(n));
  expect(b, '7日連続で3枚').toEqual({ day: 7, tickets: 3 });
  b = m.claimLoginBonus(day(10));
  expect(b, '連続途切れで1日目に戻る').toEqual({ day: 1, tickets: 1 });
});

test('LocalMeta: ガチャ(チケット消費・不足・所持反映)', async () => {
  const m = new LocalMeta();
  await m.pickBoss('kyubi');
  expect(m.pullSync(10), '初期10枚で10連は可').not.toBeNull();
  expect(m.data.tickets).toBe(0);
  expect(m.pullSync(1), 'チケット0で引けない').toBeNull();
  expect(m.pullSync(5), 'count 5は不可').toBeNull();

  // 多数引いても所持は各1体・チケットは正しく減る
  m.data.tickets = 200;
  const before = Object.keys(m.data.owned).length;
  for (let i = 0; i < 20; i++) {
    const res = m.pullSync(10)!;
    expect(res).toHaveLength(10);
  }
  expect(m.data.tickets).toBe(0);
  for (const id in m.data.owned) expect(m.data.owned[id], '所持は各1体').toBe(1);
  expect(Object.keys(m.data.owned).length).toBeGreaterThan(before);
});

test('LocalMeta: 妖力交換(300→1枚・不足は不可)', async () => {
  const m = new LocalMeta();
  m.data.yoryoku = 299;
  expect(await m.exchange()).toBe(false);
  m.data.yoryoku = 300;
  const t0 = m.data.tickets;
  expect(await m.exchange()).toBe(true);
  expect(m.data.tickets).toBe(t0 + 1);
  expect(m.data.yoryoku).toBe(0);
});

test('LocalMeta: ソロ勝利報酬は日次上限2枚', async () => {
  const m = new LocalMeta();
  expect(await m.recordSoloWin()).toBe(1);
  expect(await m.recordSoloWin()).toBe(1);
  expect(await m.recordSoloWin(), '上限到達で0').toBe(0);
  expect(m.data.wins).toBe(3);
});

test('LocalMeta: 編成保存・所持外/大将なしは拒否', async () => {
  const m = new LocalMeta();
  await m.pickBoss('kyubi');
  m.data.owned.tengu = 1;
  expect(await m.setFormation([[null, null, null, null, null], [null, null, 'tamamo', null, null]]), '未所持').not.toBeNull();
  expect(await m.setFormation([[null, 'tengu', null, null, null], [null, null, 'kyubi', null, null]]), '正常').toBeNull();
  expect(m.data.formation[0][1]).toBe('tengu');
});

test('LocalMeta: セーブ・ロード往復(localStorage経由)', () => {
  const m = new LocalMeta();
  m.claimLoginBonus(new Date(2026, 5, 1));
  m.data.tickets = 42;
  m.save();
  const m2 = new LocalMeta();
  expect(m2.data.tickets).toBe(42);
});

test('LocalMeta: プレイヤーネーム変更を保存する', async () => {
  const m = new LocalMeta();
  expect(await m.setName('九尾使い')).toBeNull();
  expect(m.data.name).toBe('九尾使い');
  expect(await m.setName('')).not.toBeNull();
  expect(new LocalMeta().data.name).toBe('九尾使い');
});

/* ---------------------------------------------------------------- */
test('ガチャ妖怪入りの編成で対局が回る(エンジン統合)', () => {
  const m = new LocalMeta();
  for (const id of GACHA_POOL) m.data.owned[id] = 1;
  m.data.owned.nurarihyon = 1;
  const rows = [
    ['onibi', 'yukionna', 'tanuki', 'zashiki', 'ibaraki'],
    ['tsuchigumo', 'sunakake', 'nurarihyon', 'oonyudo', 'raiju'],
  ];
  expect(validateFormation(rows, new Set(Object.keys(m.data.owned)))).toBeNull();

  for (let g = 0; g < 30; g++) {
    const s = Game.newState(rows);
    expect(s.board[5][2]!.id).toBe('nurarihyon');
    let turns = 0;
    while (!s.winner && turns < 300) {
      const act = s.turn === 'p'
        ? Game.getAllActions(s, 'p')[0]
        : AI.chooseAction(s);
      expect(act).toBeTruthy();
      Game.applyAction(s, act!);
      expect(s.hp.p >= 0 && s.hp.e >= 0).toBe(true);
      turns++;
    }
  }
});
