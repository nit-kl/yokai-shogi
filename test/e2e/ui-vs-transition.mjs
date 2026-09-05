// npm run dev, then node test/e2e/ui-vs-transition.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { skipOnboarding, waitForBattleInput } from './helpers.mjs';

const browser = await chromium.launch();
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await page.goto(process.env.E2E_BASE_URL || 'http://localhost:5173/');
    await page.waitForSelector('#screen-title.active, #modal-onboarding-boss:not(.hidden)');
    await skipOnboarding(page);
    await page.click('#btn-start');
    await page.click('#btn-solo-battle');
    // Freeze the very first VS frame: transparent entrance animations must not expose the board.
    await page.evaluate(() => {
      document.querySelector('#btn-hyakki-fight').click();
      document.querySelector('#vs-intro').getAnimations({ subtree: true }).forEach(animation => {
        animation.pause();
        animation.currentTime = 0;
      });
    });
    assert(await page.locator('#screen-battle.active').count());
    assert(await page.evaluate(() => window.yk.busy), 'input stays locked during VS');
    const board = await page.locator('#board-frame').boundingBox();
    const image = await page.screenshot();
    // Check an interior board patch, not the screen edge: it must be uniformly covered.
    const { data } = await sharp(image).extract({
      left: Math.round(board.x + board.width * 0.45),
      top: Math.round(board.y + board.height * 0.45), width: 8, height: 8,
    }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 3) {
      assert.deepEqual([...data.subarray(i, i + 3)], [12, 9, 21], 'board visible through first VS frame');
    }
    await page.evaluate(() => {
      document.querySelector('#vs-intro').getAnimations({ subtree: true }).forEach(animation => animation.play());
    });
    await waitForBattleInput(page);
    assert(await page.locator('#board-frame').isVisible());
    await page.close();
  }
  console.log('VS transition passed: initial frame opaque, board revealed after intro, desktop + mobile');
} finally {
  await browser.close();
}
