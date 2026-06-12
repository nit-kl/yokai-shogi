/* 新スキル(妨・援・化・爆)の動作テスト: node test/skills-test.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');

const TEST_BODY = `
const assert = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); };
let uid = 100;

/* 空盤面の状態を作る */
const blank = () => {
  const s = Game.newState();
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) s.board[y][x] = null;
  return s;
};
const put = (s, x, y, id, owner) => { s.board[y][x] = { uid: ++uid, id, owner, promoted: false }; };
const cap = (s, fx, fy, tx, ty, opts) =>
  Game.applyAction(s, { kind: 'move', from: { x: fx, y: fy }, to: { x: tx, y: ty } }, opts || { rng: true });
const capEv = events => events.find(e => e.t === 'capture');

/* ---------- 援(heal): 座敷童子は取ると回復 ---------- */
{
  const s = blank();
  s.turn = 'p'; s.hp.p = 2000;
  put(s, 2, 3, 'zashiki', 'p');
  put(s, 2, 2, 'ittan', 'e');
  put(s, 0, 0, 'ittan', 'e'); // 双方の手を残すための置き駒
  const ev = capEv(cap(s, 2, 3, 2, 2));
  assert(s.hp.e === 3000 - 130, '座敷童子ATK130のダメージ: ' + s.hp.e);
  assert(s.hp.p === 2250, '魂力250回復: ' + s.hp.p);
  assert(ev.heal === 250, 'healイベント: ' + ev.heal);
}
/* 回復は上限3000で頭打ち */
{
  const s = blank();
  s.turn = 'p'; s.hp.p = 2900;
  put(s, 2, 3, 'zashiki', 'p');
  put(s, 2, 2, 'ittan', 'e');
  put(s, 0, 0, 'ittan', 'e');
  const ev = capEv(cap(s, 2, 3, 2, 2));
  assert(s.hp.p === 3000 && ev.heal === 100, '回復は最大魂力まで: ' + s.hp.p);
}

/* ---------- 化(decoy): 化け狸はダメージ半減&持ち駒にならない ---------- */
{
  const s = blank();
  s.turn = 'e';
  put(s, 2, 3, 'tanuki', 'p');
  put(s, 1, 2, 'nekomata', 'e');
  put(s, 0, 5, 'ittan', 'p');
  const ev = capEv(cap(s, 1, 2, 2, 3)); // 猫又(ATK200)が化け狸を取る
  assert(ev.decoy, 'decoyイベントが発生');
  assert(s.hp.p === 3000 - 100, 'ダメージ半減(200→100): ' + s.hp.p);
  assert(!s.hands.e.tanuki, '化け狸は持ち駒にならない');
}

/* ---------- 爆(explode): 鬼火は取った駒を道連れにする ---------- */
{
  const s = blank();
  s.turn = 'e';
  put(s, 2, 3, 'onibi', 'p');
  put(s, 1, 2, 'nekomata', 'e');
  put(s, 0, 5, 'ittan', 'p');
  put(s, 0, 0, 'ittan', 'e');
  const ev = capEv(cap(s, 1, 2, 2, 3));
  assert(ev.explode, 'explodeイベントが発生');
  assert(s.board[3][2] === null, '取った猫又が道連れで消滅');
  assert(!s.hands.e.onibi, '鬼火は持ち駒にならない');
  assert(s.hp.p === 3000 - 200, 'ダメージ自体は通る: ' + s.hp.p);
  assert(!s.winner, '大将以外なら勝敗はつかない');
}
/* 大将が鬼火を取ると即敗北 */
{
  const s = blank();
  s.turn = 'e';
  put(s, 2, 3, 'onibi', 'p');
  put(s, 2, 2, 'shuten', 'e');
  put(s, 0, 5, 'kyubi', 'p');
  cap(s, 2, 2, 2, 3);
  assert(s.winner === 'p' && s.reason === 'explode', '敵大将が鬼火を取って自滅: ' + s.winner + '/' + s.reason);
}

/* ---------- 妨(chill): 雪女は敵のコンボ倍率を無効化 ---------- */
{
  const mk = withYuki => {
    const s = blank();
    s.turn = 'e'; s.combo.e = 1; // この捕獲で2コンボ目(通常×1.25)
    put(s, 2, 3, 'kooni', 'p');
    put(s, 1, 2, 'nekomata', 'e');
    put(s, 0, 5, 'ittan', 'p');
    put(s, 0, 0, 'ittan', 'e');
    if (withYuki) put(s, 4, 5, 'yukionna', 'p');
    return capEv(cap(s, 1, 2, 2, 3));
  };
  assert(mk(false).damage === 250, '雪女なし: コンボ×1.25で250');
  const ev = mk(true);
  assert(ev.comboMult === 1 && ev.damage === 200, '雪女あり: コンボ無効で200: ' + ev.damage);
}

/* ---------- 妨(jam): 砂かけ婆は敵の会心スキルを封じる ---------- */
{
  const mk = withSuna => {
    const s = blank();
    s.turn = 'e';
    put(s, 2, 3, 'rokuro', 'p'); // 反撃持ちだがダメージ計算の検証には影響しない側
    put(s, 2, 2, 'kooni', 'e');  // 会心30%×1.5
    put(s, 0, 5, 'ittan', 'p');
    put(s, 0, 0, 'ittan', 'e');
    if (withSuna) put(s, 4, 5, 'sunakake', 'p');
    return capEv(cap(s, 2, 2, 2, 3, { rng: false })); // 期待値計算で比較
  };
  assert(mk(false).damage === Math.round(150 * 1.15), '砂かけ婆なし: 会心期待値込み');
  assert(mk(true).damage === 150, '砂かけ婆あり: 会心封じ');
}

/* ---------- 妨(weaken): 土蜘蛛は敵の与ダメージを減らす ---------- */
{
  const s = blank();
  s.turn = 'e';
  put(s, 2, 3, 'kooni', 'p');
  put(s, 1, 2, 'nekomata', 'e');
  put(s, 4, 5, 'tsuchigumo', 'p');
  put(s, 0, 5, 'ittan', 'p');
  put(s, 0, 0, 'ittan', 'e');
  const ev = capEv(cap(s, 1, 2, 2, 3));
  assert(ev.damage === Math.round(200 * 0.88), '土蜘蛛: 与ダメ-12%(176): ' + ev.damage);
}

/* ---------- 道連れで消えた駒は成れない ---------- */
{
  const s = blank();
  s.turn = 'e';
  put(s, 2, 4, 'onibi', 'p');   // y=4 は敵(e)から見て成りゾーン
  put(s, 1, 3, 'nekomata', 'e');
  put(s, 0, 5, 'ittan', 'p');
  put(s, 0, 0, 'ittan', 'e');
  const events = cap(s, 1, 3, 2, 4);
  assert(!events.some(e => e.t === 'promote'), '消滅した駒の成りイベントが出ない');
}

console.log('SKILLS TEST PASSED');
`;

const src = ['js/data.js', 'js/game.js']
  .map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n') + '\n' + TEST_BODY;
vm.runInNewContext(src, { console, Math });
