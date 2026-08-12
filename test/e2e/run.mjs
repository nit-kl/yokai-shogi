/* e2e一括実行: vite preview を起動して playwright スクリプトを順に流す
   事前に `npm run build` が必要(CIでは build ステップ後に実行) */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..', '..');
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}/`;

/* 煙突テストのみ。スキル/演出/SSR詳細は unit テスト側で担保 */
const SCRIPTS = ['ui-shot.mjs', 'ui-gacha.mjs', 'i18n-smoke.mjs'];

/* vite preview を起動(node直接起動: killを確実にするため) */
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const server = spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', d => process.stderr.write(d));

/* サーバー起動待ち */
let up = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(BASE_URL);
    if (res.ok) { up = true; break; }
  } catch { /* まだ */ }
  await delay(500);
}
if (!up) {
  console.error('vite preview が起動しませんでした');
  server.kill();
  process.exit(1);
}
console.log(`preview server up: ${BASE_URL}`);

/* 各スクリプトを直列実行 */
let failed = 0;
for (const script of SCRIPTS) {
  console.log(`\n=== ${script} ===`);
  const code = await new Promise(resolve => {
    const p = spawn(process.execPath, [path.join(dir, script)], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, E2E_BASE_URL: BASE_URL },
    });
    p.on('close', resolve);
  });
  if (code !== 0) { failed++; console.error(`${script}: FAILED (exit ${code})`); }
}

server.kill();
if (failed) {
  console.error(`\nE2E: ${failed}/${SCRIPTS.length} scripts failed`);
  process.exit(1);
}
console.log(`\nE2E: all ${SCRIPTS.length} scripts passed`);
