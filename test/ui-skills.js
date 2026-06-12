/* 新スキル演出の検証: node test/ui-skills.js */
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
  await page.waitForSelector('#screen-title.active', { timeout: 30000 });
  if (await page.locator('#modal-login:not(.hidden)').count()) {
    await page.click('#btn-login-ok');
    await page.waitForTimeout(300);
  }
  await page.click('#btn-start');
  await page.waitForSelector('#screen-battle.active');
  await page.waitForTimeout(1200);

  /* 座敷童子の回復演出 */
  await page.evaluate(() => {
    G.hp.p = 2000; updateHP(G.hp);
    G.board[3][2] = { uid: 900, id: 'zashiki', owner: 'p', promoted: false };
    G.board[2][2] = { uid: 901, id: 'ittan', owner: 'e', promoted: false };
    renderAll();
    G.turn = 'p'; busy = false;
    doAction({ kind: 'move', from: { x: 2, y: 3 }, to: { x: 2, y: 2 } });
  });
  /* applyActionは同期実行されるため、AI応手前に回復後の値が読める */
  const healed = await page.evaluate(() => G.hp.p);
  if (healed !== 2250) errors.push(`回復が反映されていない: ${healed}(期待2250)`);
  await page.waitForTimeout(1300);
  await page.screenshot({ path: 'test/shot-s1-heal.png' });
  await page.waitForTimeout(3500); // AI応手を待つ

  /* 鬼火の道連れ演出(プレイヤーが敵の鬼火を取ってしまう) */
  await page.evaluate(() => {
    G.winner = null; G.turn = 'p'; busy = false;
    G.board[2][1] = { uid: 902, id: 'onibi', owner: 'e', promoted: false };
    G.board[3][1] = { uid: 903, id: 'nekomata', owner: 'p', promoted: false };
    renderAll();
    doAction({ kind: 'move', from: { x: 1, y: 3 }, to: { x: 1, y: 2 } });
  });
  await page.waitForTimeout(1100);
  await page.screenshot({ path: 'test/shot-s2-explode-cutin.png' });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: 'test/shot-s3-explode-after.png' });

  const gone = await page.evaluate(() => G.board[2][1] === null && !G.hands.p.onibi);
  if (!gone) errors.push('道連れ処理が盤面に反映されていない');

  await browser.close();
  if (errors.length) {
    console.error('UI SKILLS TEST FAILED:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log('UI SKILLS TEST PASSED');
})();
