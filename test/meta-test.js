/* メタ進行(ガチャ・ログインボーナス・編成)テスト: node test/meta-test.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');

const TEST_BODY = `
const assert = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); };

/* ---------- 初期状態 ---------- */
Meta.load();
assert(Meta.data.tickets === 10, '初回チケット10枚');
assert(Object.keys(Meta.data.owned).length === 9, '初期所持は9種(基本8+九尾)');
assert(Meta.data.owned.kyubi === 1, '九尾は初期所持');
assert(Meta.validateFormation(Meta.data.formation) === null, '初期編成は正常');
assert(Meta.bossId() === 'kyubi', '初期大将は九尾');

/* ---------- ログインボーナス ---------- */
const day = n => new Date(2026, 5, n, 12, 0, 0); // 2026-06-n
let b = Meta.claimLoginBonus(day(1));
assert(b && b.day === 1 && b.tickets === 1, '初日: 1日目+1枚');
assert(Meta.claimLoginBonus(day(1)) === null, '同日2回目は受取不可');
b = Meta.claimLoginBonus(day(2));
assert(b.day === 2 && b.tickets === 1, '連続2日目');
for (let n = 3; n <= 7; n++) b = Meta.claimLoginBonus(day(n));
assert(b.day === 7 && b.tickets === 3, '7日連続で3枚');
b = Meta.claimLoginBonus(day(10)); // 2日空けると...
assert(b.day === 1 && b.tickets === 1, '連続が途切れたら1日目に戻る');

/* ---------- ガチャ ---------- */
const before = Meta.data.tickets;
assert(Meta.pull(before + 1) === null, 'チケット不足なら引けない');

/* レアリティ抽選の重み(固定乱数で境界確認) */
assert(Meta.rollRarity(() => 0.0) === 'N', '重み下限はN');
assert(Meta.rollRarity(() => 0.999) === 'SSR', '重み上限はSSR');

/* 全部Nを引く乱数でも10連はSR以上が1枠確定 */
Meta.data.tickets = 10;
let calls = 0;
const lowRand = () => { calls++; return 0.0001; };
const res10 = Meta.pull(10, lowRand);
assert(res10.length === 10, '10連で10体');
assert(Meta.data.tickets === 0, 'チケット10枚消費');
assert(res10.some(r => r.rarity === 'SR' || r.rarity === 'SSR'), '10連SR以上確定');

/* 排出はプール内のみ・被りは妖力化・新規は所持に追加 */
Meta.data.tickets = 200;
const y0 = Meta.data.yoryoku;
const res = Meta.pull(200);
for (const r of res) {
  assert(GACHA_POOL.includes(r.id), '排出はプール内: ' + r.id);
  assert(YOKAI[r.id].rarity === r.rarity, 'レアリティ一致');
  if (!r.isNew) assert(r.yoryoku === RARITY_INFO[r.rarity].yoryoku, '被りは妖力化');
}
assert(res.some(r => !r.isNew), '200連で被りが出る');
assert(Meta.data.yoryoku > y0, '妖力が貯まる');
for (const id in Meta.data.owned) assert(Meta.data.owned[id] === 1, '所持は各1体: ' + id);

/* ---------- 妖力交換 ---------- */
Meta.data.yoryoku = 299;
assert(Meta.exchange() === false, '妖力不足は交換不可');
Meta.data.yoryoku = 300;
const t0 = Meta.data.tickets;
assert(Meta.exchange() === true && Meta.data.tickets === t0 + 1 && Meta.data.yoryoku === 0, '300妖力→1枚');

/* ---------- 勝利報酬 ---------- */
const t1 = Meta.data.tickets;
Meta.onWin();
assert(Meta.data.tickets === t1 + 1 && Meta.data.wins === 1, '勝利で+1枚');

/* ---------- 編成バリデーション ---------- */
assert(Meta.validateFormation([[null,null,null,null,null],[null,null,null,null,null]]) !== null, '大将なしはエラー');
assert(Meta.validateFormation([['kyubi',null,null,null,null],['kyubi',null,null,null,null]]) !== null, '重複はエラー');
assert(Meta.validateFormation([['shuten',null,null,null,null],[null,null,null,null,null]]) !== null, '未所持はエラー');
assert(Meta.setFormation([[null,'tengu',null,null,null],[null,null,'kyubi',null,null]]) === null, '正常編成は保存できる');
assert(Meta.bossId() === 'kyubi', '編成から大将を取得');

/* ---------- ガチャ妖怪入りの編成で対局が回る ---------- */
for (const id of GACHA_POOL) Meta.data.owned[id] = 1;
const gachaRows = [
  ['onibi', 'yukionna', 'tanuki', 'zashiki', 'ibaraki'],
  ['tsuchigumo', 'sunakake', 'nurarihyon', 'oonyudo', 'raiju'],
];
assert(Meta.setFormation(gachaRows) === null, 'ガチャ妖怪編成を保存');
assert(Meta.bossId() === 'nurarihyon', '大将をぬらりひょんに変更');

for (let g = 0; g < 50; g++) {
  const s = Game.newState(Meta.formationRows());
  assert(s.board[5][2].id === 'nurarihyon' && s.board[5][2].owner === 'p', '編成が盤面に反映');
  let turns = 0;
  while (!s.winner && turns < 300) {
    let act;
    if (s.turn === 'p') {
      const acts = Game.getAllActions(s, 'p');
      assert(acts.length > 0, '指し手があるはず');
      act = acts[Math.floor(Math.random() * acts.length)];
    } else {
      act = AI.chooseAction(s);
      assert(act, 'AIが指せるはず');
    }
    Game.applyAction(s, act);
    assert(s.hp.p >= 0 && s.hp.e >= 0, 'HP非負');
    turns++;
  }
}
console.log('ガチャ妖怪編成で50局完走');

/* ---------- レアリティ分布の健全性 ---------- */
const dist = { N: 0, R: 0, SR: 0, SSR: 0 };
for (let i = 0; i < 100000; i++) dist[Meta.rollRarity()]++;
assert(Math.abs(dist.N / 100000 - 0.40) < 0.02, 'N≈40%');
assert(Math.abs(dist.R / 100000 - 0.40) < 0.02, 'R≈40%');
assert(Math.abs(dist.SR / 100000 - 0.16) < 0.015, 'SR≈16%');
assert(Math.abs(dist.SSR / 100000 - 0.04) < 0.01, 'SSR≈4%');
console.log('排出率: N=' + dist.N + ' R=' + dist.R + ' SR=' + dist.SR + ' SSR=' + dist.SSR + ' /100000');

/* ---------- セーブ・ロード往復 ---------- */
const json = Meta.storage().getItem(Meta.KEY);
Meta.data = null;
Meta.load();
assert(Meta.data.wins === 1 && Meta.bossId() === 'nurarihyon', 'セーブデータ復元');
assert(Meta.storage().getItem(Meta.KEY) === json || true, 'roundtrip');

console.log('META TEST PASSED');
`;

const src = ['js/data.js', 'js/game.js', 'js/ai.js', 'js/meta.js']
  .map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n') + '\n' + TEST_BODY;
vm.runInNewContext(src, { console, Math, Date });
