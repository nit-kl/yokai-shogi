/* UIスクリーンショット検証(旧 prototype/test/ui-shot.js の移植)
   node test/e2e/ui-shot.mjs  ※ vite preview (port 4173) が起動済みであること */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { skipOnboarding } from './helpers.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:4173/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

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

// ソロ対戦
await page.click('#btn-start');
await page.waitForSelector('#screen-solo.active');
if (await page.locator('.solo-stage-card').count() !== 4) errors.push('ソロステージが4件表示されていない');
if (await page.locator('.solo-difficulty').count() !== 3) errors.push('ソロ難易度が3件表示されていない');
if (await page.locator('.solo-mode').count() !== 2) errors.push('通常戦・連戦の切替が表示されていない');
await page.locator('.solo-stage-card').nth(2).click();
await page.locator('.solo-difficulty').nth(2).click();
await page.click('#btn-solo-battle');
await page.waitForSelector('#screen-battle.active');
if (await page.locator('#enemy-name').textContent() !== '九尾の狐') errors.push('選択したソロステージの敵大将が反映されていない');
await page.waitForTimeout(1400);
await page.screenshot({ path: path.join(dir, 'shot-2-battle.png') });

// 小鬼(x=1,y=4)を選択 → 移動ハイライト確認
const cell = (x, y) => page.locator('#board-cells .cell').nth(y * 5 + x);
await cell(1, 4).click();
if (!await page.locator('#info-move').textContent()) errors.push('選択駒の動きが表示されていない');
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(dir, 'shot-3-select.png') });

// (1,3)へ移動 → AIの応手まで待つ
await cell(1, 3).click();
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
