/* Steam ストア／ライブラリ画像。Steamworks 掲載サイズのみ出力する。
   node scripts/steam-capsules.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sheet = path.join(root, 'ops', 'steam-store', 'capsule-sheet.html');
const capsuleDir = path.join(root, 'ops', 'steam-store', 'capsules');
const libraryDir = path.join(root, 'ops', 'steam-store', 'library');

const STORE = [
  { id: 'header', file: 'header_capsule.png' },
  { id: 'small', file: 'small_capsule.png' },
  { id: 'main', file: 'main_capsule.png' },
  { id: 'vertical', file: 'vertical_capsule.png' },
  { id: 'background', file: 'page_background.png' },
];

const LIBRARY = [
  { id: 'library-capsule', file: 'library_capsule.png' },
  { id: 'header', file: 'library_header.png' },
  { id: 'library-hero', file: 'library_hero.png', shared: true },
  { id: 'library-logo', file: 'library_logo.png', transparent: true },
];

for (const dir of [capsuleDir, path.join(capsuleDir, 'en'), libraryDir, path.join(libraryDir, 'en')]) {
  fs.mkdirSync(dir, { recursive: true });
}

async function capture(lang) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 3920, height: 4200 },
    deviceScaleFactor: 1,
    locale: lang === 'en' ? 'en-US' : 'ja-JP',
  });
  await page.goto(pathToFileURL(sheet).href, { waitUntil: 'load' });
  await page.evaluate(locale => {
    document.documentElement.lang = locale;
    for (const el of document.querySelectorAll('[data-ja][data-en]')) {
      el.textContent = locale === 'en' ? el.dataset.en : el.dataset.ja;
    }
  }, lang);
  await page.evaluate(() => document.fonts.ready.catch(() => {}));
  await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));

  const storeDest = lang === 'en' ? path.join(capsuleDir, 'en') : capsuleDir;
  const libDest = lang === 'en' ? path.join(libraryDir, 'en') : libraryDir;

  for (const item of STORE) {
    const dest = path.join(storeDest, item.file);
    await page.locator(`#${item.id}`).screenshot({ path: dest, type: 'png' });
    console.log('wrote', dest);
  }
  for (const item of LIBRARY) {
    if (item.shared && lang === 'en') {
      fs.copyFileSync(path.join(libraryDir, item.file), path.join(libDest, item.file));
      console.log('copied', path.join(libDest, item.file));
      continue;
    }
    const dest = path.join(libDest, item.file);
    if (item.transparent) {
      await page.evaluate(() => {
        document.documentElement.style.background = 'transparent';
        document.body.style.background = 'transparent';
      });
    }
    await page.locator(`#${item.id}`).screenshot({
      path: dest,
      type: 'png',
      omitBackground: !!item.transparent,
    });
    console.log('wrote', dest);
  }
  await browser.close();
}

await capture('ja');
await capture('en');
console.log('Steam store + library assets ready');
