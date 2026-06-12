/* ガチャ・編成UIの検証: node test/ui-gacha.js */
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

  /* タイトル → ログインボーナスモーダルが出る(初回起動) */
  await page.waitForSelector('#screen-title.active', { timeout: 30000 });
  await page.waitForSelector('#modal-login:not(.hidden)', { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test/shot-g1-login.png' });
  await page.click('#btn-login-ok');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test/shot-g2-title.png' });

  /* ガチャ画面 → 10連(初回10枚+ログボ1枚=11枚あるはず) */
  await page.click('#btn-gacha');
  await page.waitForSelector('#screen-gacha.active');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test/shot-g3-gacha.png' });

  await page.click('#btn-pull10');
  await page.waitForSelector('#gacha-result:not(.hidden)');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'test/shot-g4-pull10.png' });
  const cards = await page.locator('.gacha-card').count();
  if (cards !== 10) errors.push(`10連の結果が${cards}枚`);
  await page.click('#btn-gacha-ok');

  /* チケット残量チェック(11-10=1枚) */
  const tickets = await page.evaluate(() => Meta.data.tickets);
  if (tickets !== 1) errors.push(`チケット残が${tickets}(期待1)`);

  /* 1連 → 残0 → ボタン無効 */
  await page.click('#btn-pull1');
  await page.waitForSelector('#gacha-result:not(.hidden)');
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'test/shot-g5-pull1.png' });
  await page.click('#btn-gacha-ok');
  const disabled = await page.evaluate(() => $('btn-pull1').disabled && $('btn-pull10').disabled);
  if (!disabled) errors.push('チケット0でボタンが無効化されていない');

  /* 編成画面: ガチャ結果を全所持にして玉藻前大将の編成を組む */
  await page.click('#btn-gacha-back');
  await page.waitForSelector('#screen-title.active');
  await page.evaluate(() => { for (const id of GACHA_POOL) Meta.data.owned[id] = 1; Meta.save(); });
  await page.click('#btn-formation');
  await page.waitForSelector('#screen-formation.active');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test/shot-g6-formation.png' });

  /* 九尾を外して玉藻前を配置(大将マスは grid index 7 = 最奥中央) */
  await page.evaluate(() => {
    MenuUI.rows = [
      ['raiju', 'kasha', null, 'aooni', 'ibaraki'],
      ['daitengu', 'suiko', 'tamamo', 'oonyudo', 'hitouban'],
    ];
    MenuUI.renderFormation();
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test/shot-g7-form-edited.png' });
  await page.click('#btn-form-back');
  await page.waitForSelector('#screen-title.active');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test/shot-g8-title-tamamo.png' });

  const bossName = await page.evaluate(() => document.getElementById('title-vs-p').textContent);
  if (bossName !== '玉藻前') errors.push(`タイトルの大将名が「${bossName}」(期待: 玉藻前)`);

  /* 編成で開戦 → 盤面に反映されているか */
  await page.click('#btn-start');
  await page.waitForSelector('#screen-battle.active');
  await page.waitForTimeout(1400);
  await page.screenshot({ path: 'test/shot-g9-battle.png' });
  const placed = await page.evaluate(() => G.board[5][2].id);
  if (placed !== 'tamamo') errors.push(`盤面の大将が${placed}(期待: tamamo)`);

  /* 大将なし編成は保存できないことの確認 */
  await page.evaluate(() => {
    const err = Meta.setFormation([[null,null,null,null,null],[null,null,null,null,null]]);
    if (!err) throw new Error('大将なし編成が通ってしまった');
  });

  await browser.close();
  if (errors.length) {
    console.error('UI GACHA TEST FAILED:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log('UI GACHA TEST PASSED');
})();
