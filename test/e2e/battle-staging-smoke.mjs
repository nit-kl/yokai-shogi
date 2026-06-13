/* Phase 2 staging接続スモーク:
   staging API接続版のローカルVite(http://localhost:5173)を前提に、
   4つの独立ブラウザセッションでランダムマッチ2局を同時成立させる。 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173/';
const browser = await chromium.launch();
const sessions = [];
const errors = [];

try {
  for (let i = 0; i < 4; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`session ${i + 1}: ${error.message}`));
    await page.goto(BASE);
    await page.waitForSelector('#screen-title.active', { timeout: 30000 });
    if (await page.locator('#modal-login:not(.hidden)').count()) await page.click('#btn-login-ok');
    await page.click('#btn-online');
    await page.click('#btn-online-random');
    sessions.push({ context, page });
  }

  await Promise.all(sessions.map(({ page }, index) =>
    page.waitForSelector('#screen-battle.active', { timeout: 30000 })
      .catch(() => errors.push(`session ${index + 1}: ランダムマッチが成立しなかった`)),
  ));

  const matchIds = await Promise.all(sessions.map(({ page }) =>
    page.evaluate(() => {
      const status = document.querySelector('#online-status')?.textContent || '';
      return { status, battle: document.querySelector('#screen-battle')?.classList.contains('active') };
    }),
  ));
  for (const [index, state] of matchIds.entries()) {
    if (!state.battle) errors.push(`session ${index + 1}: 対局画面ではない`);
  }
} finally {
  await Promise.all(sessions.map(({ context }) => context.close()));
  await browser.close();
}

if (errors.length) {
  console.error('BATTLE STAGING SMOKE FAILED:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('BATTLE STAGING SMOKE PASSED: 4セッションでランダムマッチ2局が同時成立');
