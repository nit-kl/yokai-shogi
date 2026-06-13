/* staging接続版の初回同意UIスモーク。ローカルVite(http://localhost:5173)を前提とする。 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173/';
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await page.goto(BASE);
  await page.waitForSelector('#modal-consent:not(.hidden)', { timeout: 30000 });
  const terms = await page.getAttribute('#modal-consent a[href="/legal/terms.html"]', 'href');
  const privacy = await page.getAttribute('#modal-consent a[href="/legal/privacy.html"]', 'href');
  if (terms !== '/legal/terms.html' || privacy !== '/legal/privacy.html') errors.push('法務文書リンクが不正');

  await page.click('#btn-consent-local');
  await page.waitForSelector('#screen-title.active', { timeout: 30000 });
  const onlineHidden = await page.locator('#btn-online').evaluate(el => el.classList.contains('hidden'));
  if (!onlineHidden) errors.push('同意しない場合もオンライン対戦ボタンが表示されている');
} finally {
  await context.close();
  await browser.close();
}

if (errors.length) {
  console.error('CONSENT STAGING SMOKE FAILED:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('CONSENT STAGING SMOKE PASSED: 初回同意表示・法務リンク・ソロ切替を確認');
