/* 本番(Pages)スモークテスト: タイトル表示とソロ開戦までを確認
   Turnstile有効時はオンライン初期化を避け、同意→ソロで進む。
   node test/e2e/smoke-live.mjs [URL] */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { acceptConsentForSolo, dismissLegacyLoginModal, startSoloBattle, waitForTitle } from './helpers.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.argv[2] || 'https://yokai-shogi.nit-games.com/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(BASE_URL);
await acceptConsentForSolo(page);
await waitForTitle(page);
await dismissLegacyLoginModal(page);
if (await page.locator('#modal-onboarding-boss:not(.hidden)').count()) {
  await page.evaluate(() => {
    const { Meta, SETUP } = window.yk;
    Meta.data.onboardingDone = true;
    Meta.data.owned = {};
    for (const row of SETUP.slice(-2)) for (const id of row) if (id) Meta.data.owned[id] = 1;
    Meta.data.formation = SETUP.slice(-2).map(row => [...row]);
    Meta.save();
    document.getElementById('modal-onboarding-boss')?.classList.add('hidden');
  });
}
await page.screenshot({ path: path.join(dir, 'live-1-title.png') });

await startSoloBattle(page);
await page.waitForTimeout(1400);
await page.screenshot({ path: path.join(dir, 'live-2-battle.png') });

const ok = await page.evaluate(() => {
  const { yk } = window;
  return !!yk.G && yk.G.turn === 'p' && yk.Game.getAllActions(yk.G, 'p').length > 0;
});
if (!ok) errors.push('対局状態が初期化されていない');

await browser.close();
if (errors.length) {
  console.error('LIVE SMOKE FAILED:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`LIVE SMOKE PASSED: ${BASE_URL}`);
