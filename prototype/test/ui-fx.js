/* 演出検証: node prototype/test/ui-fx.js */
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  const url = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
  await page.goto(url);
  await page.waitForSelector('#screen-title.active', { timeout: 30000 });
  // 初回起動時はログインボーナスモーダルを閉じる
  if (await page.locator('#modal-login:not(.hidden)').count()) {
    await page.click('#btn-login-ok');
    await page.waitForTimeout(300);
  }
  await page.click('#btn-start');
  await page.waitForTimeout(800);

  // カットイン(スキル)
  await page.evaluate(() => { FX.cutin(YOKAI.kyubi.img, '妖狐の業火', 'ダメージ2倍!', 'boss'); });
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(__dirname, 'fx-1-cutin.png') });
  await page.waitForTimeout(1000);

  // 撃破バースト+ダメージ数字+シェイク
  await page.evaluate(() => {
    const c = cellCenter(2, 2);
    FX.burst(c.x, c.y, COLORS_P, 44, 7.5);
    FX.ring(c.x, c.y, COLORS_P[0], 16, 80);
    FX.shake(true);
    FX.damageNumber(c.x, c.y - 14, 800, 'big');
    FX.floatLabel(c.x, c.y - 70, '3 COMBO!', '#6bd6ff');
  });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(__dirname, 'fx-2-hit.png') });

  // 罠カットイン
  await page.evaluate(() => { FX.cutin(YOKAI.tengu.img, '神隠しの返し風', '反撃ダメージ 300!', 'counter'); });
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(__dirname, 'fx-3-counter.png') });
  await page.waitForTimeout(1000);

  // リザルト(勝利)
  await page.evaluate(() => { G.winner = 'p'; G.reason = 'boss'; showResult(); });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(__dirname, 'fx-4-result.png') });

  // ルールモーダル
  await page.evaluate(() => { document.getElementById('modal-rules').classList.remove('hidden'); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, 'fx-5-rules.png') });

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
  await browser.close();
})();
