/* SSR体験改修(月齢・覚醒・因縁共鳴)のUI検証
   node test/e2e/ui-ssr.mjs  ※ vite preview (port 4173) が起動済みであること

   激怒・覚醒は doAction(演出+hard AI) を使わず Game.applyAction で状態を進め、
   renderAll/updateHUD で DOM を同期する。CI の長尺演出・AI手番タイムアウトを避ける。 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { skipOnboarding, startSoloBattle } from './helpers.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:4173/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(BASE_URL);
await page.waitForSelector('#screen-title.active, #modal-onboarding-boss:not(.hidden)', { timeout: 30000 });
await skipOnboarding(page);
await startSoloBattle(page);
await page.waitForTimeout(800);

/* 1) 月齢HUD: 初期編成の九尾(moonスキル)が盤上にいるため表示される。満月で盤が月光に染まる */
const moonShown = await page.evaluate(() => !document.getElementById('moon-hud').classList.contains('hidden'));
if (!moonShown) errors.push('月齢HUDが表示されていない');
await page.evaluate(() => { const { yk } = window; yk.G.plies = 6; yk.updateHUD(); }); // 4夜目=満月
const fullMoon = await page.evaluate(() =>
  document.getElementById('moon-hud').classList.contains('full-moon') &&
  document.getElementById('board-frame').classList.contains('moonlit'));
if (!fullMoon) errors.push('満月の月齢表示・盤の月光演出が出ていない');
await page.screenshot({ path: path.join(dir, 'shot-ssr1-fullmoon.png') });

/* 2) 因縁共鳴(鬼の宴): 酒呑(異装)+茨木が並ぶと共鳴の光輪が出る */
await page.evaluate(() => {
  const { yk } = window;
  yk.G.board[3][0] = { uid: 910, id: 'shuten_kishin', owner: 'p', promoted: false };
  yk.G.board[3][1] = { uid: 911, id: 'ibaraki', owner: 'p', promoted: false };
  yk.renderAll();
});
const resonating = await page.evaluate(() => document.querySelectorAll('.piece.resonating').length);
if (resonating < 2) errors.push(`共鳴中の駒の光輪が出ていない: ${resonating}個(期待2以上)`);

/* 3) 妖狐相伝: エンジンで捕獲を適用し、激怒状態+オーラDOMを同期確認(AI/演出なし) */
const enrageOk = await page.evaluate(() => {
  const { yk } = window;
  yk.busy = false;
  yk.G.winner = null;
  /* unit test と同じ斜め取り: 猫又(1,2) → 玉藻前(2,3)。九尾は明示配置 */
  yk.G.board[5][2] = { uid: 919, id: 'kyubi', owner: 'p', promoted: false };
  yk.G.board[3][2] = { uid: 920, id: 'tamamo', owner: 'p', promoted: false };
  yk.G.board[2][1] = { uid: 921, id: 'nekomata', owner: 'e', promoted: false };
  yk.G.turn = 'e';
  const events = yk.Game.applyAction(yk.G, { kind: 'move', from: { x: 1, y: 2 }, to: { x: 2, y: 3 } });
  yk.renderAll();
  yk.updateHUD();
  const kyubi = yk.G.board.flat().find(pc => pc && pc.id === 'kyubi');
  const hasEvent = events.some(e => e.t === 'capture' && e.enrage && e.enrage.id === 'kyubi');
  return {
    hasEvent,
    enraged: !!(kyubi && kyubi.enraged),
    aura: document.querySelectorAll('.piece.enraged').length >= 1,
    turn: yk.G.turn,
  };
});
if (!enrageOk.hasEvent || !enrageOk.enraged || !enrageOk.aura) {
  errors.push('妖狐相伝の激怒(状態+オーラ)が発動していない');
}
await page.screenshot({ path: path.join(dir, 'shot-ssr2-enraged.png') });

/* 4) 覚醒: ボタン点灯・対象ハイライトはUI、発動本体は applyAction(AIに渡さない) */
await page.evaluate(() => {
  const { yk } = window;
  yk.busy = false;
  yk.G.winner = null;
  yk.G.turn = 'p';
  /* 九尾+酒呑異装を残し、覚醒対象が2体以上になるようにする */
  if (!yk.G.board.flat().some(pc => pc && pc.id === 'kyubi')) {
    yk.G.board[5][2] = { uid: 930, id: 'kyubi', owner: 'p', promoted: false };
  }
  if (!yk.G.board.flat().some(pc => pc && pc.id === 'shuten_kishin')) {
    yk.G.board[3][0] = { uid: 910, id: 'shuten_kishin', owner: 'p', promoted: false };
  }
  /* 覚醒未使用の九尾にする */
  const kyubi = yk.G.board.flat().find(pc => pc && pc.id === 'kyubi');
  if (kyubi) delete kyubi.awakenUntil;
  yk.G.awaken.p = { gauge: 6, used: false };
  yk.renderAll();
  yk.updateHUD();
});
if (!await page.locator('#btn-awaken:not(.hidden)').count()) errors.push('覚醒ボタンが点灯しない');

await page.click('#btn-awaken');
const targets = await page.evaluate(() => document.querySelectorAll('.cell.hl-awaken').length);
if (targets < 2) errors.push(`覚醒対象のハイライトが出ていない: ${targets}マス(期待2以上)`);
/* 再クリックで選択キャンセル(1体だと doAction が走り AI に入るため、クリック着手は使わない) */
await page.click('#btn-awaken');

const awakenOk = await page.evaluate(() => {
  const { yk } = window;
  yk.busy = false;
  yk.G.winner = null;
  yk.G.turn = 'p';
  yk.G.awaken.p = { gauge: 6, used: false };
  let at = null;
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 5; x++) {
      const pc = yk.G.board[y][x];
      if (pc && pc.id === 'kyubi' && pc.owner === 'p') { at = { x, y }; break; }
    }
    if (at) break;
  }
  if (!at) return { ok: false, reason: 'no-kyubi' };
  yk.Game.applyAction(yk.G, { kind: 'awaken', to: at });
  /* 敵手番にはせず、UI同期だけ行う */
  yk.G.turn = 'p';
  yk.busy = false;
  yk.renderAll();
  yk.updateHUD();
  const kyubi = yk.G.board.flat().find(pc => pc && pc.id === 'kyubi');
  return {
    ok: true,
    used: yk.G.awaken.p.used === true,
    until: kyubi?.awakenUntil !== undefined,
    aura: document.querySelectorAll('.piece.awakened').length >= 1,
    btnHidden: document.getElementById('btn-awaken').classList.contains('hidden'),
  };
});
if (!awakenOk.ok || !awakenOk.used || !awakenOk.until || !awakenOk.aura || !awakenOk.btnHidden) {
  errors.push('覚醒の発動(状態・オーラ・ボタン消灯)が確認できない');
}
await page.screenshot({ path: path.join(dir, 'shot-ssr3-awaken.png') });

await browser.close();
if (errors.length) {
  console.error('UI SSR TEST FAILED:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('UI SSR TEST PASSED');
