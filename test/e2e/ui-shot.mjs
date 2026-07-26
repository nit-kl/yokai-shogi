/* UIスクリーンショット検証(旧 prototype/test/ui-shot.js の移植)
   node test/e2e/ui-shot.mjs  ※ vite preview (port 4173) が起動済みであること */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { attachPageErrorCollectors, skipOnboarding, waitForBattleInput } from './helpers.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:4173/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
const errors = [];
attachPageErrorCollectors(page, errors);

await page.goto(BASE_URL);
await page.waitForSelector('#screen-title.active, #modal-onboarding-boss:not(.hidden)', { timeout: 30000 });
await skipOnboarding(page);
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(dir, 'shot-1-title.png') });

// プレイヤーネーム変更
await page.click('#btn-profile');
await page.fill('#profile-name-input', '九尾使い');
await page.click('#btn-profile-save');
await page.locator('#modal-profile').waitFor({ state: 'hidden' });
if (await page.locator('#title-player-name').textContent() !== '九尾使い') errors.push('タイトルにプレイヤーネームが反映されていない');

// 駒一覧
await page.click('#btn-pieces');
await page.waitForSelector('#screen-pieces.active');
const pieceCount = await page.locator('#pieces-list .piece-card').count();
const expectedPieceCount = await page.evaluate(() => Object.keys(window.yk.YOKAI).length);
if (pieceCount !== expectedPieceCount) errors.push(`駒一覧の件数が不正: ${pieceCount}/${expectedPieceCount}`);
if (await page.locator('#pieces-list').getByText('ガチャ限定').count()) errors.push('駒一覧に不要なガチャ限定表記がある');
await page.click('#btn-pieces-back');
await page.waitForSelector('#screen-title.active');

// 百鬼夜行(ソロ連戦)
await page.click('#btn-start');
await page.waitForSelector('#screen-solo.active');
if (!(await page.locator('#btn-solo-battle').isVisible())) errors.push('百鬼夜行の挑戦ボタンが表示されていない');
if (!(await page.locator('#solo-current-streak').isVisible())) errors.push('連勝表示がない');
await page.click('#btn-solo-battle');
await page.waitForSelector('#screen-hyakki-preview.active');
const expectedBoss = (await page.locator('#hyakki-preview-boss-name').textContent())?.trim() || '';
if (!expectedBoss) errors.push('プレビューに敵大将名がない');
await page.click('#btn-hyakki-fight');
await page.waitForSelector('#screen-battle.active');
if (await page.locator('#enemy-name').textContent() !== expectedBoss) {
  errors.push(`選択した百鬼の敵大将が反映されていない: ${await page.locator('#enemy-name').textContent()} / 期待 ${expectedBoss}`);
}
// 開幕VS演出を撮ってから、入力ロック(VS・共鳴カットイン)解除を待つ
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(dir, 'shot-2-vs-intro.png') });
if (await page.locator('#vs-label-p').textContent() !== '九尾使い') errors.push('開幕VS演出にプレイヤーネームが表示されていない');
await waitForBattleInput(page);
await page.screenshot({ path: path.join(dir, 'shot-2-battle.png') });

// 小鬼(x=1,y=4)を短タップで選択 → 移動ハイライト確認
// #board-frame の boardFloat でセルが常に動くため、Playwright の stable 判定を force で迂回する
const cell = (x, y) => page.locator('#board-cells .cell').nth(y * 5 + x);
await cell(1, 4).click({ force: true });
if (!await cell(1, 4).evaluate(el => el.classList.contains('hl-selected'))) {
  errors.push('自駒選択のハイライトが付いていない');
}
// 駒説明は長押しで表示（短タップは選択・移動専用）
await cell(1, 4).click({ force: true, delay: 600 });
if (!await page.locator('#info-move').textContent()) errors.push('選択駒の動きが表示されていない');
if (await page.locator('#piece-info').evaluate(el => el.classList.contains('hidden'))) {
  errors.push('長押しで駒説明パネルが開いていない');
}
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(dir, 'shot-3-select.png') });

// 敵駒タップ → 利きプレビュー確認（着手はしない）
// 利きが1マス以上ある敵を選ぶ(角で塞がれた駒だと範囲ハイライト0になりうる)
const enemyPos = await page.evaluate(() => {
  const { yk } = window;
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 5; x++) {
      const pc = yk.G?.board[y][x];
      if (!pc || pc.owner !== 'e') continue;
      if (yk.Game.getMoves(yk.G, x, y).length > 0) return { x, y };
    }
  }
  return null;
});
if (!enemyPos) {
  errors.push('盤上に敵駒が見つからない');
} else {
  await cell(enemyPos.x, enemyPos.y).click({ force: true });
  if (!await cell(enemyPos.x, enemyPos.y).evaluate(el => el.classList.contains('hl-enemy-selected'))) {
    errors.push('敵駒の利きプレビューが付いていない');
  }
  const enemyRange = await page.locator('#board-cells .cell.hl-enemy-move, #board-cells .cell.hl-enemy-capture').count();
  if (enemyRange < 1) errors.push('敵駒の移動・攻撃範囲ハイライトが出ていない');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dir, 'shot-3b-enemy-range.png') });
}

// (1,3)へ移動 → AIの応手まで待つ
await cell(1, 3).click({ force: true });
await page.waitForTimeout(3500);
await page.screenshot({ path: path.join(dir, 'shot-4-after-ai.png') });

// 数手自動で進めて戦闘演出を撮る(取れる手を優先)
for (let i = 0; i < 14; i++) {
  const acted = await page.evaluate(() => {
    const { yk } = window;
    if (!yk.busy && yk.G && !yk.G.winner && yk.G.turn === 'p') {
      const acts = yk.Game.getAllActions(yk.G, 'p');
      const caps = acts.filter(a => a.kind === 'move' && yk.G.board[a.to.y][a.to.x]);
      const pick = (caps.length ? caps : acts)[Math.floor(Math.random() * (caps.length ? caps.length : acts.length))];
      yk.doAction(pick);
      return true;
    }
    return false;
  });
  await page.waitForTimeout(2500);
  if (acted && i === 6) await page.screenshot({ path: path.join(dir, 'shot-5-midgame.png') });
  const over = await page.evaluate(() => window.yk.G && !!window.yk.G.winner);
  if (over) break;
}
await page.screenshot({ path: path.join(dir, 'shot-6-late.png') });

// ルールモーダル
const inBattle = await page.evaluate(() => !window.yk.G.winner);
if (inBattle) {
  await page.click('#btn-rules2');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dir, 'shot-7-rules.png') });
}

await browser.close();
if (errors.length) {
  console.error('UI SHOT TEST: PAGE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('UI SHOT TEST PASSED (NO PAGE ERRORS)');
