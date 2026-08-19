import { chromium } from 'playwright';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:4173/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];

await page.goto(`${BASE_URL}?lang=en`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#locale-select');
await page.waitForFunction(() => document.documentElement.lang === 'en' && document.documentElement.dataset.script === 'latn');
await page.waitForSelector('#pieces-list .piece-card', { state: 'attached' });
await page.waitForTimeout(200);

if (await page.title() !== 'Hyakkiban | Collect yokai, capture, and drain HP') errors.push('English document title was not applied');
if ((await page.locator('#locale-select').inputValue()) !== 'en') errors.push('Language select is not set to English');
const localeOptions = await page.locator('#locale-select option').evaluateAll(opts => opts.map(o => o.value));
if (!localeOptions.includes('ja') || !localeOptions.includes('en')) errors.push(`Language select missing locales: ${localeOptions.join(',')}`);
if ((await page.locator('#btn-start').textContent())?.includes('百鬼夜行')) errors.push('Main action remains untranslated');
if ((await page.locator('#btn-pieces').textContent())?.includes('駒一覧')) errors.push('Compendium action remains untranslated');
if (!(await page.locator('a[href="/legal/terms-en.html"]').count())) errors.push('Terms link does not switch to English');
if (!(await page.locator('a[href="/legal/privacy-en.html"]').count())) errors.push('Privacy link does not switch to English');
for (const path of ['legal/terms-en.html', 'legal/privacy-en.html']) {
  const response = await page.request.get(new URL(path, BASE_URL).href);
  if (!response.ok()) errors.push(`${path} is not available`);
}

// Decorative kanji are part of the visual identity and intentionally remain.
const untranslated = await page.evaluate(() => {
  const decorative = '.loading-mark, .title-emblem, .title-menu-btn > b, .gacha-orb > span, .summon-circle > span';
  const found = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    const text = node.textContent?.trim() || '';
    if (!text || !/[ぁ-んァ-ヶ一-龠々]/.test(text)) continue;
    if (parent?.closest('#locale-select') || parent?.closest('.title-language') || parent?.closest(decorative)) continue;
    found.add(text);
  }
  document.querySelectorAll('[title], [aria-label], [placeholder], [alt]').forEach(element => {
    if (element.closest('#locale-select') || element.closest('.title-language')) return;
    for (const name of ['title', 'aria-label', 'placeholder', 'alt']) {
      const value = element.getAttribute(name) || '';
      if (/[ぁ-んァ-ヶ一-龠々]/.test(value)) found.add(`${name}=${value}`);
    }
  });
  return [...found];
});
if (untranslated.length) errors.push(`Untranslated Japanese text: ${untranslated.join(' | ')}`);
await page.evaluate(() => {
  const { Meta, SETUP } = window.yk;
  Meta.data.onboardingDone = true;
  Meta.data.owned = {};
  for (const row of SETUP.slice(-2)) for (const id of row) if (id) Meta.data.owned[id] = 1;
  Meta.data.formation = SETUP.slice(-2).map(row => [...row]);
  Meta.save();
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#screen-title.active', { timeout: 90000 });
await page.evaluate(() => document.querySelectorAll('.modal').forEach(modal => modal.classList.add('hidden')));
await page.locator('#btn-announcements').click();
await page.waitForSelector('#announcements-list .announcement-card', { timeout: 10000 });
const announcementText = await page.locator('#announcements-list').innerText();
if (/[ぁ-んァ-ヶ一-龠々]/.test(announcementText)) {
  const remaining = [...new Set(announcementText.split(/\s+/).filter(text => /[ぁ-んァ-ヶ一-龠々]/.test(text)))];
  errors.push(`Announcements remain untranslated: ${remaining.join(' | ')}`);
}
await page.locator('#btn-announcements-close').click();
await page.screenshot({ path: 'test/e2e/i18n-en.png', fullPage: true });

await page.locator('#locale-select').selectOption('ja');
await page.waitForFunction(() => document.documentElement.lang === 'ja' && document.documentElement.dataset.script === 'jpan');
if (await page.title() !== '百鬼盤｜妖怪を集めて、取って、HPを削る対戦ゲーム') errors.push('Japanese title was not restored');
if ((await page.locator('#btn-start').textContent())?.includes('百鬼夜行') !== true) errors.push('Japanese UI was not restored');
if (!(await page.locator('a[href="/legal/terms.html"]').count())) errors.push('Japanese terms link was not restored');

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('I18N SMOKE TEST PASSED');
