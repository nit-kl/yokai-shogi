/* エンジン自動対局テスト(旧 prototype/test/engine-test.js の移植) */
import { test, expect } from 'vitest';
import { COLS, ROWS, YOKAI } from '../shared/data';
import { Game } from '../shared/game';
import { AI } from '../client/src/ai';
import { HYAKKI_STAGE, soloBattleStage } from '../client/src/solo';

test('百鬼夜行のテンプレは大将を含む', () => {
  expect(YOKAI[HYAKKI_STAGE.bossId].boss).toBe(true);
  expect(HYAKKI_STAGE.enemyRows[0].some(id => id === HYAKKI_STAGE.bossId)).toBe(true);
});

test('大将フラグ: 本体系3体とその異装だけが大将', () => {
  const bosses = Object.values(YOKAI).filter(d => d.boss).map(d => d.id).sort();
  expect(bosses).toEqual([
    'kyubi', 'kyubi_eclipse', 'kyubi_hasha',
    'nurarihyon', 'nurarihyon_hyakki',
    'shuten', 'shuten_kishin',
  ].sort());
});

test('百鬼夜行は有効なランダム敵編成を生成する', () => {
  const stage = soloBattleStage(() => 0.42);
  const ids = stage.enemyRows.flat().filter((id): id is string => !!id);
  expect(ids).toHaveLength(10);
  expect(new Set(ids).size).toBe(10);
  expect(stage.enemyRows[0][2]).toBe(stage.bossId);
  expect(YOKAI[stage.bossId].boss).toBe(true);
  expect(ids.filter(id => YOKAI[id].boss)).toEqual([stage.bossId]);
  expect(() => Game.newState(null, stage.enemyRows)).not.toThrow();
});

test('AIは全難易度で合法手を返す', () => {
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    const s = Game.newState();
    s.turn = 'e';
    const action = AI.chooseAction(s, difficulty);
    expect(action).toBeTruthy();
    expect(Game.getAllActions(s, 'e')).toContainEqual(action);
  }
});

test('200局の自動対局がルール破綻なく完走する', () => {
  let bossWins = 0, hpWins = 0, other = 0;
  const winners = { p: 0, e: 0 };

  for (let g = 0; g < 200; g++) {
    const s = Game.newState();
    let turns = 0;
    while (!s.winner && turns < 300) {
      let act;
      if (s.turn === 'p') {
        const acts = Game.getAllActions(s, 'p');
        if (acts.length === 0) throw new Error('no actions but no winner');
        act = acts[Math.floor(Math.random() * acts.length)]; // プレイヤー側はランダム手
      } else {
        act = AI.chooseAction(s);
        if (!act) throw new Error('AI returned null with no winner');
      }
      Game.applyAction(s, act);
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const pc = s.board[y][x];
        if (pc && !YOKAI[pc.id]) throw new Error('unknown piece ' + pc.id);
      }
      if (s.hp.p < 0 || s.hp.e < 0) throw new Error('negative hp');
      turns++;
    }
    if (!s.winner) { other++; continue; }
    winners[s.winner]++;
    if (s.reason === 'boss') bossWins++;
    else if (s.reason === 'hp') hpWins++;
    else other++;
  }

  console.log(`200局完了: 大将討伐=${bossWins} 魂力切れ=${hpWins} その他/未決=${other}`);
  console.log(`勝者内訳: プレイヤー側(ランダム)=${winners.p} 敵AI側=${winners.e}`);
  expect(bossWins + hpWins + other).toBe(200);
});

test('乱数注入: 固定randで会心が決定的に発動/不発になる', () => {
  const mk = (rand: () => number) => {
    const s = Game.newState();
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) s.board[y][x] = null;
    s.turn = 'p';
    s.board[3][2] = { uid: 901, id: 'kooni', owner: 'p', promoted: false };   // 会心30% x1.5
    s.board[2][2] = { uid: 902, id: 'ittan', owner: 'e', promoted: false };
    s.board[0][0] = { uid: 903, id: 'ittan', owner: 'e', promoted: false };
    s.board[5][0] = { uid: 904, id: 'ittan', owner: 'p', promoted: false };
    const events = Game.applyAction(s, { kind: 'move', from: { x: 2, y: 3 }, to: { x: 2, y: 2 } }, { rand });
    const cap = events.find(e => e.t === 'capture');
    if (!cap || cap.t !== 'capture') throw new Error('capture event missing');
    return cap.damage;
  };
  expect(mk(() => 0.99)).toBe(150);                 // 不発: 素のATK
  expect(mk(() => 0.0)).toBe(Math.round(150 * 1.5)); // 確定発動: 1.5倍
});

test('uid採番が状態側(nextUid)で独立している', () => {
  const a = Game.newState();
  const b = Game.newState();
  // 2つの対局が互いに干渉しない
  a.hands.p.kooni = 1;
  const ev = Game.applyAction(a, { kind: 'drop', id: 'kooni', to: { x: 2, y: 3 } });
  const drop = ev.find(e => e.t === 'drop')!;
  expect(drop.t === 'drop' && drop.uid).toBe(a.nextUid);
  expect(b.nextUid).toBeLessThan(a.nextUid);
  // クローンも採番を引き継ぐ
  const c = Game.clone(a);
  expect(c.nextUid).toBe(a.nextUid);
});
