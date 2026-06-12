/* UIスクリーンショット検証: node prototype/test/ui-shot.js */
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const url = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
  await page.goto(url);

  // タイトル画面が出るまで待機(プリロード完了)
  await page.waitForSelector('#screen-title.active', { timeout: 30000 });
  await page.waitForTimeout(800);
  // 初回起動時はログインボーナスモーダルを閉じる
  if (await page.locator('#modal-login:not(.hidden)').count()) {
    await page.click('#btn-login-ok');
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: path.join(__dirname, 'shot-1-title.png') });

  // 開戦
  await page.click('#btn-start');
  await page.waitForSelector('#screen-battle.active');
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(__dirname, 'shot-2-battle.png') });

  // 小鬼(x=1,y=4)を選択 → 移動ハイライト確認
  const cell = (x, y) => page.locator('#board-cells .cell').nth(y * 5 + x);
  await cell(1, 4).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, 'shot-3-select.png') });

  // (1,3)へ移動 → AIの応手まで待つ
  await cell(1, 3).click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(__dirname, 'shot-4-after-ai.png') });

  // 数手自動で進めて戦闘演出を撮る(取れる手を優先)
  for (let i = 0; i < 14; i++) {
    const acted = await page.evaluate(() => {
      if (typeof busy !== 'undefined' && !busy && G && !G.winner && G.turn === 'p') {
        const acts = Game.getAllActions(G, 'p');
        const caps = acts.filter(a => a.kind === 'move' && G.board[a.to.y][a.to.x]);
        const pick = (caps.length ? caps : acts)[Math.floor(Math.random() * (caps.length ? caps.length : acts.length))];
        doAction(pick);
        return true;
      }
      return false;
    });
    await page.waitForTimeout(2500);
    if (acted && i === 6) await page.screenshot({ path: path.join(__dirname, 'shot-5-midgame.png') });
    const over = await page.evaluate(() => G && !!G.winner);
    if (over) break;
  }
  await page.screenshot({ path: path.join(__dirname, 'shot-6-late.png') });

  // ルールモーダル
  const inBattle = await page.evaluate(() => !G.winner);
  if (inBattle) {
    await page.click('#btn-rules2');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(__dirname, 'shot-7-rules.png') });
  }

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
  await browser.close();
})();
