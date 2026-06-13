/* ガチャ・編成UIの検証(初回オンボーディングフロー)
   node test/e2e/ui-gacha.mjs  ※ vite preview (port 4173) が起動済みであること */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startSoloBattle } from './helpers.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:4173/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(BASE_URL);
await page.evaluate(() => localStorage.removeItem('yokaiShogi.save.v1'));
await page.reload();

/* ① 大将選択 */
await page.waitForSelector('#modal-onboarding-boss:not(.hidden)', { timeout: 30000 });
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(dir, 'shot-g1-boss.png') });
await page.locator('.boss-pick-card').filter({ hasText: 'ぬらりひょん' }).click();

/* ② 10連ガチャ */
await page.waitForSelector('#screen-gacha.active');
await page.waitForSelector('#onboarding-hint:not(.hidden)');
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(dir, 'shot-g2-gacha.png') });

await page.click('#btn-pull10');
await page.waitForSelector('#gacha-summon:not(.hidden)');
await page.waitForSelector('#gacha-result:not(.hidden)');
await page.locator('#gacha-summon').waitFor({ state: 'hidden' });
await page.waitForTimeout(1800);
await page.screenshot({ path: path.join(dir, 'shot-g3-pull10.png') });
const cards = await page.locator('.gacha-card').count();
if (cards !== 10) errors.push(`10連の結果が${cards}枚`);
await page.click('#btn-gacha-ok');

/* ③ 編成 */
await page.waitForSelector('#screen-formation.active');
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(dir, 'shot-g4-formation.png') });

await page.evaluate(() => {
  const { yk } = window;
  const owned = Object.keys(yk.Meta.data.owned).filter(id => yk.YOKAI[id].type !== 'boss');
  yk.MenuUI.rows = [
    [owned[0] || null, owned[1] || null, owned[2] || null, owned[3] || null, owned[4] || null],
    [owned[5] || null, owned[6] || null, 'nurarihyon', owned[7] || null, owned[8] || null],
  ];
  yk.MenuUI.renderFormation();
});
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(dir, 'shot-g5-form-edited.png') });
await page.click('#btn-form-save');

/* ④ タイトルへ戻る */
await page.waitForSelector('#screen-title.active, #modal-login:not(.hidden)', { timeout: 10000 });
if (await page.locator('#modal-login:not(.hidden)').count()) {
  await page.click('#btn-login-ok');
  await page.waitForTimeout(300);
}
await page.waitForSelector('#screen-title.active');
await page.screenshot({ path: path.join(dir, 'shot-g6-title.png') });

const bossId = await page.evaluate(() => window.yk.Meta.bossId());
if (bossId !== 'nurarihyon') errors.push(`タイトルの大将が${bossId}(期待: nurarihyon)`);

/* 開戦で盤面に反映されているか */
await startSoloBattle(page);
await page.waitForTimeout(1400);
await page.screenshot({ path: path.join(dir, 'shot-g7-battle.png') });
const placed = await page.evaluate(() => window.yk.G.board[5][2].id);
if (placed !== 'nurarihyon') errors.push(`盤面の大将が${placed}(期待: nurarihyon)`);

const tickets = await page.evaluate(() => window.yk.Meta.data.tickets);
if (tickets !== 1) errors.push(`10連後チケット残が${tickets}(期待1=ログボ付与後)`);

await browser.close();
if (errors.length) {
  console.error('UI GACHA TEST FAILED:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('UI GACHA TEST PASSED');
