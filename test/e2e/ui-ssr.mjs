/* SSR体験改修(月齢・覚醒・因縁共鳴)のUI検証
   node test/e2e/ui-ssr.mjs  ※ vite preview (port 4173) が起動済みであること */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { skipOnboarding, startSoloBattle, waitForBattleInput } from './helpers.mjs';

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
await startSoloBattle(page);
await page.waitForTimeout(1200);

/* 1) 月齢HUD: 初期編成の九尾(moonスキル)が盤上にいるため表示される。満月で盤が月光に染まる */
const moonShown = await page.evaluate(() => !document.getElementById('moon-hud').classList.contains('hidden'));
if (!moonShown) errors.push('月齢HUDが表示されていない');
await page.evaluate(() => { const { yk } = window; yk.G.plies = 6; yk.updateHUD(); }); // 4夜目=満月
const fullMoon = await page.evaluate(() =>
  document.getElementById('moon-hud').classList.contains('full-moon') &&
  document.getElementById('board-frame').classList.contains('moonlit'));
if (!fullMoon) errors.push('満月の月齢表示・盤の月光演出が出ていない');
await page.screenshot({ path: path.join(dir, 'shot-ssr1-fullmoon.png') });

/* 2) 因縁共鳴(鬼の宴): 酒呑(異装)+茨木が並ぶと共鳴の光輪が出る */
await page.evaluate(() => {
  const { yk } = window;
  yk.G.board[3][0] = { uid: 910, id: 'shuten_kishin', owner: 'p', promoted: false }; // 異装でも共鳴する
  yk.G.board[3][1] = { uid: 911, id: 'ibaraki', owner: 'p', promoted: false };
  yk.renderAll();
});
const resonating = await page.evaluate(() => document.querySelectorAll('.piece.resonating').length);
if (resonating < 2) errors.push(`共鳴中の駒の光輪が出ていない: ${resonating}個(期待2以上)`);

/* 3) 妖狐相伝: 玉藻前を取られると九尾が激怒(確定会心の予告オーラ)
   猫又は斜め1マスのみ。unit test と同じ配置(1,2)→(2,3)にする */
await page.evaluate(() => {
  const { yk } = window;
  yk.G.winner = null;
  yk.busy = false;
  /* 九尾を自陣に明示配置(百鬼の敵編成で盤が埋まっていても相伝できるようにする) */
  yk.G.board[5][2] = { uid: 919, id: 'kyubi', owner: 'p', promoted: false };
  yk.G.board[3][2] = { uid: 920, id: 'tamamo', owner: 'p', promoted: false };
  yk.G.board[2][1] = { uid: 921, id: 'nekomata', owner: 'e', promoted: false };
  yk.renderAll();
  yk.G.turn = 'e';
  void yk.doAction({ kind: 'move', from: { x: 1, y: 2 }, to: { x: 2, y: 3 } });
});
try {
  await page.waitForFunction(() => {
    const { yk } = window;
    if (!yk?.G || yk.busy) return false;
    const kyubi = yk.G.board.flat().find(pc => pc && pc.id === 'kyubi');
    return !!(kyubi && kyubi.enraged) && document.querySelectorAll('.piece.enraged').length >= 1;
  }, { timeout: 20000 });
} catch {
  errors.push('妖狐相伝の激怒(状態+オーラ)が発動していない');
}
await page.screenshot({ path: path.join(dir, 'shot-ssr2-enraged.png') });

/* 4) 覚醒: ゲージ満タン → ボタン点灯 → 対象選択 → 発動 */
await page.waitForFunction(() => window.yk && !window.yk.busy && window.yk.G?.turn === 'p', { timeout: 15000 });
await page.evaluate(() => {
  const { yk } = window;
  yk.G.winner = null;
  yk.G.turn = 'p';
  yk.busy = false;
  /* 九尾が盤上にいることを保証 */
  if (!yk.G.board.flat().some(pc => pc && pc.id === 'kyubi')) {
    yk.G.board[5][2] = { uid: 930, id: 'kyubi', owner: 'p', promoted: false };
    yk.renderAll();
  }
  yk.G.awaken.p = { gauge: 6, used: false };
  yk.updateHUD();
});
if (!await page.locator('#btn-awaken:not(.hidden)').count()) errors.push('覚醒ボタンが点灯しない');
await page.click('#btn-awaken');
const targets = await page.evaluate(() => document.querySelectorAll('.cell.hl-awaken').length);
if (targets < 1) errors.push(`覚醒対象のハイライトが出ていない: ${targets}マス(期待1以上)`);
await page.evaluate(() => {
  const { yk } = window;
  /* 盤上の九尾マスをクリック(位置が変わっていても追従) */
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 5; x++) {
      const pc = yk.G.board[y][x];
      if (pc && pc.id === 'kyubi' && pc.owner === 'p') {
        document.getElementById('board-cells').children[y * 5 + x].click();
        return;
      }
    }
  }
});
try {
  await page.waitForFunction(() => {
    const { yk } = window;
    if (!yk?.G || yk.busy) return false;
    const kyubi = yk.G.board.flat().find(pc => pc && pc.id === 'kyubi');
    return yk.G.awaken.p.used === true
      && !!(kyubi && kyubi.awakenUntil !== undefined)
      && document.querySelectorAll('.piece.awakened').length >= 1
      && document.getElementById('btn-awaken').classList.contains('hidden');
  }, { timeout: 20000 });
} catch {
  errors.push('覚醒の発動(状態・オーラ・ボタン消灯)が確認できない');
}
await page.screenshot({ path: path.join(dir, 'shot-ssr3-awaken.png') });
await waitForBattleInput(page).catch(() => {});

await browser.close();
if (errors.length) {
  console.error('UI SSR TEST FAILED:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('UI SSR TEST PASSED');
