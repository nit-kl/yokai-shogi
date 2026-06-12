/* エンジン自動対局テスト: node prototype/test/engine-test.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');

const TEST_BODY = `
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

console.log('200局完了: 大将討伐=' + bossWins + ' 魂力切れ=' + hpWins + ' その他/未決=' + other);
console.log('勝者内訳: プレイヤー側(ランダム)=' + winners.p + ' 敵AI側=' + winners.e);
console.log('ENGINE TEST PASSED');
`;

const src = ['js/data.js', 'js/game.js', 'js/ai.js']
  .map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n') + '\n' + TEST_BODY;
vm.runInNewContext(src, { console, Math });
