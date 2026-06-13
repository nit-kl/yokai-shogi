/* Phase 2 セキュリティ手動検証の補助スクリプト (B-9)
   実行: node test/manual/security-check.mjs [API_BASE]
   例: node test/manual/security-check.mjs https://yokai-shogi-api-production.kojileo0178.workers.dev */
const BASE = (process.argv[2] || 'https://yokai-shogi-api-production.kojileo0178.workers.dev').replace(/\/$/, '');

const results = [];

function pass(name) { results.push({ name, ok: true }); }
function fail(name, detail) { results.push({ name, ok: false, detail }); }

async function guestToken() {
  const res = await fetch(`${BASE}/v1/auth/guest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`guest failed: ${JSON.stringify(data)}`);
  return data.accessToken;
}

// 1. トークンなしで /me は 401
{
  const res = await fetch(`${BASE}/v1/me`);
  if (res.status === 401) pass('REST: トークンなしは401');
  else fail('REST: トークンなしは401', `status=${res.status}`);
}

// 2. 改ざんトークンで /me は 401
{
  const res = await fetch(`${BASE}/v1/me`, {
    headers: { Authorization: 'Bearer invalid.token.here' },
  });
  if (res.status === 401) pass('REST: 改ざんトークンは401');
  else fail('REST: 改ざんトークンは401', `status=${res.status}`);
}

// 3. CORS: 許可外Originはヘッダなし
{
  const res = await fetch(`${BASE}/v1/gacha/rates`, { headers: { Origin: 'https://evil.example.com' } });
  const allow = res.headers.get('access-control-allow-origin');
  if (!allow) pass('CORS: 許可外Originは拒否');
  else fail('CORS: 許可外Originは拒否', `allow-origin=${allow}`);
}

// 4. CORS: 本番Originは許可（本番APIのみ）
{
  const res = await fetch(`${BASE}/v1/gacha/rates`, { headers: { Origin: 'https://yokai-shogi.pages.dev' } });
  const allow = res.headers.get('access-control-allow-origin');
  if (allow === 'https://yokai-shogi.pages.dev') pass('CORS: 本番Originは許可');
  else if (BASE.includes('staging')) results.push({ name: 'CORS: 本番Originは許可', ok: true, detail: 'stagingはスキップ' });
  else fail('CORS: 本番Originは許可', `allow-origin=${allow}`);
}

// 5. WebSocket: トークンなしは接続不可
{
  const url = new URL('/v1/battle', BASE);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('v', '1');
  const ok = await new Promise(resolve => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => { ws.close(); resolve(false); }, 5000);
    ws.onopen = () => { clearTimeout(timer); ws.close(); resolve(false); };
    ws.onerror = () => { clearTimeout(timer); resolve(true); };
    ws.onclose = () => { clearTimeout(timer); resolve(true); };
  });
  if (ok) pass('WS: トークンなしは接続不可');
  else fail('WS: トークンなしは接続不可', '接続できてしまった');
}

// 6. WebSocket: 改ざんトークンは接続不可
{
  const url = new URL('/v1/battle', BASE);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('v', '1');
  url.searchParams.set('token', 'not.a.valid.jwt');
  const ok = await new Promise(resolve => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => { ws.close(); resolve(false); }, 5000);
    ws.onopen = () => { clearTimeout(timer); ws.close(); resolve(false); };
    ws.onerror = () => { clearTimeout(timer); resolve(true); };
    ws.onclose = () => { clearTimeout(timer); resolve(true); };
  });
  if (ok) pass('WS: 改ざんトークンは接続不可');
  else fail('WS: 改ざんトークンは接続不可', '接続できてしまった');
}

// 7. ゲスト作成は成功（Turnstile有効時は手動確認が必要）
try {
  const token = await guestToken();
  if (token) pass('REST: ゲスト作成成功');
} catch (e) {
  fail('REST: ゲスト作成成功', String(e));
}

console.log('\n=== Security Check: ' + BASE + ' ===\n');
for (const r of results) {
  console.log((r.ok ? '✅' : '❌') + ' ' + r.name + (r.detail ? ` (${r.detail})` : ''));
}
const failed = results.filter(r => !r.ok);
if (failed.length) {
  console.error(`\n${failed.length} 件失敗`);
  process.exit(1);
}
console.log('\n自動検証はすべて合格。以下は手動で確認:');
console.log('- 非手番着手・不正座標・高速連打の拒否（対局中にDevToolsからWS送信）');
console.log('- 同一アカウント同士でマッチしない');
console.log('- フレンドマッチ報酬なし / 切断・時間切れ勝ちで報酬なし');
