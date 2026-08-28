/* Steam ストア用スクリーンショット(1920x1080 / 16:9)
   実プレイ画面のみ。宣伝テキストやロゴは焼き込まない。
   node scripts/steam-screenshots.mjs */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

import { dismissStartupModals, waitForBattleInput, waitForTitle } from '../test/e2e/helpers.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'ops', 'steam-store', 'screenshots');
const PORT = 4188;
const BASE_URL = `http://localhost:${PORT}/`;

const PAUSE_MOTION = `
  #board-frame, #board-frame::after, #board-wrap::before,
  .fog, .title-bg, .title-rays, .title-embers, .title-orbs i,
  .title-logo, .title-center, .title-frame-glow,
  .title-mandala, .title-grain { animation: none !important; }
`;

function cell(page, x, y) {
  return page.locator('#board-cells .cell').nth(y * 5 + x);
}

async function waitForImages(page) {
  await page.evaluate(() => document.fonts.ready.catch(() => {}));
  await page.waitForFunction(() => {
    const imgs = [...document.images].filter(img => {
      if (!img.getAttribute('src')) return false;
      const style = getComputedStyle(img);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      return true;
    });
    return imgs.length === 0 || imgs.every(img => img.complete);
  }, { timeout: 20000 });
}

async function seedShowcase(page) {
  await page.evaluate(() => {
    const { Meta, YOKAI } = window.yk;
    Meta.data.onboardingDone = true;
    Meta.data.owned = {};
    for (const id of Object.keys(YOKAI)) Meta.data.owned[id] = 1;
    Meta.data.formation = [
      ['yamata', 'nue', null, 'yukionna', 'raiju'],
      ['daitengu', 'gashadokuro', 'kyubi', 'ibaraki', 'tamamo'],
    ];
    Meta.data.tickets = 42;
    Meta.data.yoryoku = 880;
    Meta.data.name = '九尾使い';
    Meta.data.wins = 27;
    Meta.save();
  });
  await page.reload();
  await waitForTitle(page);
  await dismissStartupModals(page);
  await waitForImages(page);
}

async function shot(page, name) {
  await delay(350);
  const dest = path.join(outDir, name);
  await page.screenshot({ path: dest, type: 'png' });
  console.log('wrote', dest);
}

const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const server = spawn(process.execPath, [viteBin, '--mode', 'steam-offline', '--host', 'localhost', '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', d => process.stdout.write(d));
server.stderr.on('data', d => process.stderr.write(d));

let up = false;
for (let i = 0; i < 80; i++) {
  try {
    const res = await fetch(BASE_URL);
    if (res.ok) { up = true; break; }
  } catch { /* 起動待ち */ }
  await delay(250);
}
if (!up) {
  server.kill();
  throw new Error(`vite が ${BASE_URL} で起動しませんでした`);
}

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  locale: 'ja-JP',
});

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#screen-title.active, #modal-onboarding-boss:not(.hidden)', { timeout: 30000 });
  await seedShowcase(page);
  await page.addStyleTag({ content: PAUSE_MOTION });

  await shot(page, '07-title.png');

  await page.click('#btn-formation');
  await page.waitForSelector('#screen-formation.active');
  await waitForImages(page);
  await shot(page, '04-formation.png');
  await page.click('#btn-form-back');
  await waitForTitle(page);

  await page.click('#btn-gacha');
  await page.waitForSelector('#screen-gacha.active');
  await waitForImages(page);
  await page.click('#btn-pull10');
  await page.waitForSelector('#gacha-result:not(.hidden)');
  await page.locator('#gacha-summon').waitFor({ state: 'hidden' });
  await delay(1800);
  await waitForImages(page);
  await shot(page, '05-gacha.png');
  await page.click('#btn-gacha-ok');
  await page.locator('#gacha-result').waitFor({ state: 'hidden' });
  await page.click('#btn-gacha-back');
  await waitForTitle(page);

  await page.click('#btn-pieces');
  await page.waitForSelector('#screen-pieces.active');
  await waitForImages(page);
  await shot(page, '08-pieces.png');
  await page.click('#btn-pieces-back');
  await waitForTitle(page);

  await page.click('#btn-start');
  await page.waitForSelector('#screen-solo.active');
  await page.click('#btn-solo-battle');
  await page.waitForSelector('#screen-hyakki-preview.active');
  await waitForImages(page);
  await shot(page, '06-hyakki-preview.png');

  await page.click('#btn-hyakki-fight');
  await page.waitForSelector('#screen-battle.active');
  await delay(950);
  await waitForImages(page);
  await shot(page, '03-battle-vs.png');

  await waitForBattleInput(page);
  await page.addStyleTag({ content: PAUSE_MOTION });
  await waitForImages(page);
  await shot(page, '01-battle-board.png');

  await cell(page, 1, 4).click({ force: true });
  await cell(page, 1, 4).click({ force: true, delay: 600 });
  await delay(400);
  await shot(page, '02-battle-select.png');

  for (let i = 0; i < 10; i++) {
    const acted = await page.evaluate(() => {
      const { yk } = window;
      if (!yk.busy && yk.G && !yk.G.winner && yk.G.turn === 'p') {
        const acts = yk.Game.getAllActions(yk.G, 'p');
        const caps = acts.filter(a => a.kind === 'move' && yk.G.board[a.to.y][a.to.x]);
        const pool = caps.length ? caps : acts;
        yk.doAction(pool[Math.floor(Math.random() * pool.length)]);
        return true;
      }
      return false;
    });
    await delay(2200);
    if (acted && i >= 3) {
      const mid = await page.evaluate(() => {
        const g = window.yk.G;
        return !!(g && !g.winner && g.turn === 'p');
      });
      if (mid) {
        await page.addStyleTag({ content: PAUSE_MOTION });
        await shot(page, '09-battle-midgame.png');
        break;
      }
    }
    const over = await page.evaluate(() => window.yk.G && !!window.yk.G.winner);
    if (over) break;
  }
} finally {
  await browser.close();
  server.kill();
}

console.log('Steam screenshots ready:', outDir);
