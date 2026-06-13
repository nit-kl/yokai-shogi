/* オンライン2台同期の実証(Phase 1 完了条件)
   前提: VITE_API_URL を埋め込んでビルド済み(npm run build)。
   2つのブラウザコンテキスト(=別端末相当・localStorage分離)で、
   引き継ぎコードにより同一アカウントのチケット・所持が同期することを確認する。
   node test/e2e/sync-online.mjs */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..', '..');
const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;

/* preview 起動 */
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const server = spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', d => process.stderr.write(d));

let up = false;
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(BASE)).ok) { up = true; break; } } catch { /* retry */ }
  await delay(500);
}
if (!up) { console.error('preview server が起動しませんでした'); server.kill(); process.exit(1); }

const errors = [];
const browser = await chromium.launch();

async function setupAccount(page) {
  await page.goto(BASE);
  await page.waitForSelector('#modal-onboarding-boss:not(.hidden), #screen-title.active', { timeout: 30000 });
  if (await page.locator('#modal-onboarding-boss:not(.hidden)').count()) {
    await page.evaluate(async () => {
      const { Meta, YOKAI } = window.yk;
      await Meta.pickBoss('kyubi');
      await Meta.pull(10);
      const ids = Object.keys(Meta.data.owned).filter(id => YOKAI[id].type !== 'boss');
      const rows = [
        [ids[0] || null, ids[1] || null, ids[2] || null, ids[3] || null, ids[4] || null],
        [ids[5] || null, ids[6] || null, 'kyubi', ids[7] || null, ids[8] || null],
      ];
      await Meta.setFormation(rows);
      const bonus = await Meta.completeOnboarding();
      if (bonus) Meta.pendingLoginBonus = bonus;
    });
    await page.reload();
  }
  await page.waitForSelector('#screen-title.active', { timeout: 30000 });
  if (await page.locator('#modal-login:not(.hidden)').count()) {
    await page.click('#btn-login-ok');
    await page.waitForTimeout(200);
  }
}
const tickets = page => page.evaluate(() => window.yk.Meta.data.tickets);
const ownedCount = page => page.evaluate(() => Object.keys(window.yk.Meta.data.owned).length);
const online = page => page.evaluate(() => window.yk.Meta.data.online);

try {
  /* ===== 端末A: ゲスト作成 → ガチャ消費 → 引き継ぎコード発行 ===== */
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  pageA.on('pageerror', e => errors.push('A pageerror: ' + e.message));
  await setupAccount(pageA);

  if (!(await online(pageA))) errors.push('端末Aがオンライン(サーバー権威)で起動していない');
  const aStart = await tickets(pageA);
  if (aStart !== 1) errors.push(`端末Aの初期チケットが${aStart}(期待1=10連後+ログボ1)`);

  // 1連ガチャでチケットを1→0に
  await pageA.evaluate(() => window.yk.Meta.pull(1));
  const aTickets = await tickets(pageA);
  const aOwned = await ownedCount(pageA);
  if (aTickets !== 0) errors.push(`端末Aのガチャ後チケットが${aTickets}(期待0)`);

  // 引き継ぎコードをUIから発行
  await pageA.click('#btn-link');
  await pageA.click('#btn-link-issue');
  await pageA.waitForSelector('#link-code-display:not(.hidden)', { timeout: 10000 });
  const code = (await pageA.textContent('#link-code-display'))?.trim() ?? '';
  if (!/^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/.test(code)) errors.push(`発行コードの形式が不正: "${code}"`);

  /* ===== 端末B: 別ゲスト → 引き継ぎコードで端末Aのデータに同期 ===== */
  const ctxB = await browser.newContext(); // 別コンテキスト = 別localStorage = 別端末相当
  const pageB = await ctxB.newPage();
  pageB.on('pageerror', e => errors.push('B pageerror: ' + e.message));
  await setupAccount(pageB);

  const bStart = await tickets(pageB);
  if (bStart !== 1) errors.push(`端末Bの初期チケットが${bStart}(別アカウントなので期待1)`);

  await pageB.click('#btn-link');
  await pageB.fill('#link-code-input', code);
  await pageB.click('#btn-link-redeem');

  // 引き継ぎ完了で端末Bのチケットが端末A(=1)に同期する
  await pageB.waitForFunction(t => window.yk.Meta.data.tickets === t, aTickets, { timeout: 15000 })
    .catch(() => errors.push('端末Bのチケットが端末Aに同期しなかった'));
  const bTickets = await tickets(pageB);
  const bOwned = await ownedCount(pageB);

  if (bTickets !== aTickets) errors.push(`同期後チケット不一致: A=${aTickets} B=${bTickets}`);
  if (bOwned !== aOwned) errors.push(`同期後の所持数不一致: A=${aOwned} B=${bOwned}`);

  console.log(`端末A: 初期${aStart} → ガチャ後${aTickets}枚 / 所持${aOwned}種, コード=${code}`);
  console.log(`端末B: 初期${bStart} → 引き継ぎ後${bTickets}枚 / 所持${bOwned}種`);
} finally {
  await browser.close();
  server.kill();
}

if (errors.length) {
  console.error('ONLINE SYNC TEST FAILED:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('ONLINE SYNC TEST PASSED: 2台のブラウザで同一アカウントのチケット・所持が同期');
