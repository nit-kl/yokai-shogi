/* 演出検証(旧 prototype/test/ui-fx.js の移植)
   node test/e2e/ui-fx.mjs  ※ vite preview (port 4173) が起動済みであること */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { skipOnboarding } from './helpers.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:4173/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

await page.goto(BASE_URL);
await page.waitForSelector('#screen-title.active, #modal-onboarding-boss:not(.hidden)', { timeout: 30000 });
await skipOnboarding(page);
await page.click('#btn-start');
await page.waitForTimeout(800);

// カットイン(スキル)
await page.evaluate(() => {
  const { yk } = window;
  yk.FX.cutin(yk.YOKAI.kyubi.img, '妖狐の業火', 'ダメージ2倍!', 'boss');
});
await page.waitForTimeout(650);
await page.screenshot({ path: path.join(dir, 'fx-1-cutin.png') });
await page.waitForTimeout(1000);

// 撃破バースト+ダメージ数字+シェイク
await page.evaluate(() => {
  const { yk } = window;
  const c = yk.cellCenter(2, 2);
  yk.FX.burst(c.x, c.y, yk.COLORS_P, 44, 7.5);
  yk.FX.ring(c.x, c.y, yk.COLORS_P[0], 16, 80);
  yk.FX.shake(true);
  yk.FX.damageNumber(c.x, c.y - 14, 800, 'big');
  yk.FX.floatLabel(c.x, c.y - 70, '3 COMBO!', '#6bd6ff');
});
await page.waitForTimeout(350);
await page.screenshot({ path: path.join(dir, 'fx-2-hit.png') });

// 罠カットイン
await page.evaluate(() => {
  const { yk } = window;
  yk.FX.cutin(yk.YOKAI.tengu.img, '神隠しの返し風', '反撃ダメージ 300!', 'counter');
});
await page.waitForTimeout(650);
await page.screenshot({ path: path.join(dir, 'fx-3-counter.png') });
await page.waitForTimeout(1000);

// リザルト(勝利)
await page.evaluate(() => {
  const { yk } = window;
  yk.G.winner = 'p'; yk.G.reason = 'boss';
  yk.showResult();
});
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(dir, 'fx-4-result.png') });

// ルールモーダル
await page.evaluate(() => { document.getElementById('modal-rules').classList.remove('hidden'); });
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(dir, 'fx-5-rules.png') });

await browser.close();
if (errors.length) {
  console.error('UI FX TEST: PAGE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('UI FX TEST PASSED (NO PAGE ERRORS)');
