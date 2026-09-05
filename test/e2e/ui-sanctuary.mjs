/* Visual checks: run against npm run dev, or set E2E_BASE_URL. */
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { attachPageErrorCollectors, skipOnboarding, startSoloBattle, waitForBattleInput } from './helpers.mjs';

const browser = await (process.env.E2E_BROWSER === 'webkit' ? webkit : chromium).launch();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  attachPageErrorCollectors(page, errors);
  await page.goto(process.env.E2E_BASE_URL || 'http://localhost:5173/');
  await page.waitForSelector('#screen-title.active, #modal-onboarding-boss:not(.hidden)');
  await skipOnboarding(page);
  await startSoloBattle(page);
  console.log('Battle ready');
  await page.locator('.battle-sanctuary img').evaluate(img => img.decode());
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844], ['compact', 360, 640]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(450);
    await page.locator('.battle-sanctuary img').evaluate(img => img.decode());
    assert(await page.locator('.battle-sanctuary img').evaluate(img => img.naturalWidth > 0));
    const layout = await page.evaluate(() => {
      const board = document.querySelector('#board-frame').getBoundingClientRect();
      const hud = document.querySelector('#player-hud').getBoundingClientRect();
      return { left: board.left, right: board.right, bottom: hud.bottom, width: innerWidth, height: innerHeight };
    });
    assert(layout.left >= 0 && layout.right <= layout.width, `${name}: board clipped`);
    assert(layout.bottom <= layout.height, `${name}: HP below viewport`);
    await page.screenshot({ path: `test/e2e/shot-sanctuary-${name}.png` });
  }
  await page.evaluate(async () => {
    const { FX, cellCenter, updateHP } = window.yk;
    const c = cellCenter(2, 2);
    await FX.soulStrike(c.x, c.y, document.querySelector('#enemy-hud'), '#efc96c', true);
    updateHP({ p: 3000, e: 600 });
  });
  assert.equal(await page.locator('.fx-soul').count(), 0, 'soul elements must be cleaned up');
  await page.screenshot({ path: 'test/e2e/shot-sanctuary-critical.png' });
  assert(await page.locator('#screen-battle.world-critical').count());
  await page.evaluate(() => window.yk.updateHP({ p: 3000, e: 3000 }));
  assert.equal(await page.locator('#screen-battle.world-critical').count(), 0, 'critical state must reset');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.battle-seal').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.evaluate(async () => {
    await window.yk.FX.soulStrike(100, 200, document.querySelector('#enemy-hud'), '#efc96c');
  });
  assert.equal(await page.locator('.fx-soul').count(), 0);

  // A real touch context checks that the decorative layers never intercept taps.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  attachPageErrorCollectors(phone, errors);
  const backgrounds = [];
  phone.on('request', req => { if (/battle-shrine.*webp/.test(req.url())) backgrounds.push(req.url()); });
  await phone.goto(process.env.E2E_BASE_URL || 'http://localhost:5173/');
  await phone.waitForSelector('#screen-title.active, #modal-onboarding-boss:not(.hidden)');
  await skipOnboarding(phone);
  await startSoloBattle(phone);
  await phone.locator('.battle-sanctuary img').evaluate(img => img.decode());
  assert(backgrounds.some(url => url.endsWith('battle-shrine-mobile.webp')));
  assert(!backgrounds.some(url => url.endsWith('/battle-shrine.webp')), 'portrait phone should not download desktop art');
  await phone.waitForTimeout(1600); // Let the opening turn banner finish.
  const move = await phone.evaluate(() => {
    const { Game, G } = window.yk;
    const action = Game.getAllActions(G, 'p').find(a => a.kind === 'move' && !G.board[a.to.y][a.to.x]);
    return { ...action, uid: G.board[action.from.y][action.from.x].uid };
  });
  const cell = pos => phone.locator('#board-cells .cell').nth(pos.y * 5 + pos.x);
  await cell(move.from).tap();
  assert(await cell(move.from).evaluate(el => el.classList.contains('hl-selected')));
  await cell(move.to).tap();
  await phone.waitForFunction(({ to, uid }) => window.yk.G.board[to.y][to.x]?.uid === uid, move);
  await waitForBattleInput(phone, 30000);
  for (const [name, width, height] of [['touch', 390, 844], ['small-touch', 320, 568], ['landscape', 844, 390]]) {
    await phone.setViewportSize({ width, height });
    await phone.waitForTimeout(350);
    await phone.locator('.battle-sanctuary img').evaluate(img => img.decode());
    assert(await phone.locator('#screen-battle').evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${name}: horizontal overflow`);
    await phone.locator('#btn-battle-status').scrollIntoViewIfNeeded();
    await phone.locator('#btn-battle-status').tap();
    assert(await phone.locator('#battle-status-panel').isVisible(), `${name}: status control unreachable`);
    await phone.locator('#btn-battle-status').tap();
    await phone.locator('#screen-battle').evaluate(el => { el.scrollTop = 0; });
    await phone.screenshot({ path: `test/e2e/shot-sanctuary-${name}.png` });
  }
  await phone.close();
  assert.deepEqual(errors, []);
  console.log('Sanctuary: responsive art, touch move, portrait/landscape controls, soul cleanup, critical reset, reduced motion passed');
} finally {
  await browser.close();
}
