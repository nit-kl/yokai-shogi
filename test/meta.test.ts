/* メタ進行(ガチャ・ログインボーナス・編成)テスト(旧 prototype/test/meta-test.js の移植)
   Metaシングルトンの状態を順に進めるため、テストはファイル内で直列に実行される前提 */
import { test, expect } from 'vitest';
import { GACHA_POOL, RARITY_INFO, YOKAI } from '../shared/data';
import { Game } from '../shared/game';
import { AI } from '../client/src/ai';
import { Meta } from '../client/src/meta';

test('初期状態', () => {
  Meta.load();
  expect(Meta.data.tickets, '初回チケット10枚').toBe(10);
  expect(Object.keys(Meta.data.owned).length, '初期所持は9種(基本8+九尾)').toBe(9);
  expect(Meta.data.owned.kyubi, '九尾は初期所持').toBe(1);
  expect(Meta.validateFormation(Meta.data.formation), '初期編成は正常').toBeNull();
  expect(Meta.bossId(), '初期大将は九尾').toBe('kyubi');
});

test('ログインボーナス', () => {
  const day = (n: number) => new Date(2026, 5, n, 12, 0, 0); // 2026-06-n
  let b = Meta.claimLoginBonus(day(1));
  expect(b && b.day === 1 && b.tickets === 1, '初日: 1日目+1枚').toBe(true);
  expect(Meta.claimLoginBonus(day(1)), '同日2回目は受取不可').toBeNull();
  b = Meta.claimLoginBonus(day(2));
  expect(b!.day === 2 && b!.tickets === 1, '連続2日目').toBe(true);
  for (let n = 3; n <= 7; n++) b = Meta.claimLoginBonus(day(n));
  expect(b!.day === 7 && b!.tickets === 3, '7日連続で3枚').toBe(true);
  b = Meta.claimLoginBonus(day(10)); // 2日空けると...
  expect(b!.day === 1 && b!.tickets === 1, '連続が途切れたら1日目に戻る').toBe(true);
});

test('ガチャ', () => {
  const before = Meta.data.tickets;
  expect(Meta.pull(before + 1), 'チケット不足なら引けない').toBeNull();

  /* レアリティ抽選の重み(固定乱数で境界確認) */
  expect(Meta.rollRarity(() => 0.0), '重み下限はN').toBe('N');
  expect(Meta.rollRarity(() => 0.999), '重み上限はSSR').toBe('SSR');

  /* 全部Nを引く乱数でも10連はSR以上が1枠確定 */
  Meta.data.tickets = 10;
  const lowRand = () => 0.0001;
  const res10 = Meta.pull(10, lowRand)!;
  expect(res10.length, '10連で10体').toBe(10);
  expect(Meta.data.tickets, 'チケット10枚消費').toBe(0);
  expect(res10.some(r => r.rarity === 'SR' || r.rarity === 'SSR'), '10連SR以上確定').toBe(true);

  /* 排出はプール内のみ・被りは妖力化・新規は所持に追加 */
  Meta.data.tickets = 200;
  const y0 = Meta.data.yoryoku;
  const res = Meta.pull(200)!;
  for (const r of res) {
    expect(GACHA_POOL.includes(r.id), '排出はプール内: ' + r.id).toBe(true);
    expect(YOKAI[r.id].rarity, 'レアリティ一致').toBe(r.rarity);
    if (!r.isNew) expect(r.yoryoku, '被りは妖力化').toBe(RARITY_INFO[r.rarity].yoryoku);
  }
  expect(res.some(r => !r.isNew), '200連で被りが出る').toBe(true);
  expect(Meta.data.yoryoku, '妖力が貯まる').toBeGreaterThan(y0);
  for (const id in Meta.data.owned) expect(Meta.data.owned[id], '所持は各1体: ' + id).toBe(1);
});

test('妖力交換', () => {
  Meta.data.yoryoku = 299;
  expect(Meta.exchange(), '妖力不足は交換不可').toBe(false);
  Meta.data.yoryoku = 300;
  const t0 = Meta.data.tickets;
  expect(Meta.exchange(), '300妖力→1枚').toBe(true);
  expect(Meta.data.tickets).toBe(t0 + 1);
  expect(Meta.data.yoryoku).toBe(0);
});

test('勝利報酬', () => {
  const t1 = Meta.data.tickets;
  Meta.onWin();
  expect(Meta.data.tickets, '勝利で+1枚').toBe(t1 + 1);
  expect(Meta.data.wins).toBe(1);
});

test('編成バリデーション', () => {
  expect(Meta.validateFormation([[null,null,null,null,null],[null,null,null,null,null]]), '大将なしはエラー').not.toBeNull();
  expect(Meta.validateFormation([['kyubi',null,null,null,null],['kyubi',null,null,null,null]]), '重複はエラー').not.toBeNull();
  expect(Meta.validateFormation([['shuten',null,null,null,null],[null,null,null,null,null]]), '未所持はエラー').not.toBeNull();
  expect(Meta.setFormation([[null,'tengu',null,null,null],[null,null,'kyubi',null,null]]), '正常編成は保存できる').toBeNull();
  expect(Meta.bossId(), '編成から大将を取得').toBe('kyubi');
});

test('ガチャ妖怪入りの編成で対局が回る', () => {
  for (const id of GACHA_POOL) Meta.data.owned[id] = 1;
  const gachaRows = [
    ['onibi', 'yukionna', 'tanuki', 'zashiki', 'ibaraki'],
    ['tsuchigumo', 'sunakake', 'nurarihyon', 'oonyudo', 'raiju'],
  ];
  expect(Meta.setFormation(gachaRows), 'ガチャ妖怪編成を保存').toBeNull();
  expect(Meta.bossId(), '大将をぬらりひょんに変更').toBe('nurarihyon');

  for (let g = 0; g < 50; g++) {
    const s = Game.newState(Meta.formationRows());
    expect(s.board[5][2]!.id === 'nurarihyon' && s.board[5][2]!.owner === 'p', '編成が盤面に反映').toBe(true);
    let turns = 0;
    while (!s.winner && turns < 300) {
      let act;
      if (s.turn === 'p') {
        const acts = Game.getAllActions(s, 'p');
        expect(acts.length, '指し手があるはず').toBeGreaterThan(0);
        act = acts[Math.floor(Math.random() * acts.length)];
      } else {
        act = AI.chooseAction(s);
        expect(act, 'AIが指せるはず').toBeTruthy();
      }
      Game.applyAction(s, act!);
      expect(s.hp.p >= 0 && s.hp.e >= 0, 'HP非負').toBe(true);
      turns++;
    }
  }
});

test('レアリティ分布の健全性', () => {
  const dist: Record<string, number> = { N: 0, R: 0, SR: 0, SSR: 0 };
  for (let i = 0; i < 100000; i++) dist[Meta.rollRarity()]++;
  expect(Math.abs(dist.N / 100000 - 0.40), 'N≈40%').toBeLessThan(0.02);
  expect(Math.abs(dist.R / 100000 - 0.40), 'R≈40%').toBeLessThan(0.02);
  expect(Math.abs(dist.SR / 100000 - 0.16), 'SR≈16%').toBeLessThan(0.015);
  expect(Math.abs(dist.SSR / 100000 - 0.04), 'SSR≈4%').toBeLessThan(0.01);
  console.log(`排出率: N=${dist.N} R=${dist.R} SR=${dist.SR} SSR=${dist.SSR} /100000`);
});

test('セーブ・ロード往復', () => {
  const json = Meta.storage().getItem(Meta.KEY);
  expect(json).toBeTruthy();
  (Meta as any).data = null;
  Meta.load();
  expect(Meta.data.wins, 'セーブデータ復元').toBe(1);
  expect(Meta.bossId()).toBe('nurarihyon');
});
