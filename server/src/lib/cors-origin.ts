/* CORS 許可判定。ALLOWLIST に加え、Tauri WebView の *.localhost を許可する */

const TAURI_LOOPBACK_HOSTS = new Set([
  'tauri.localhost',
  'asset.localhost',
  'ipc.localhost',
]);

export function resolveCorsOrigin(requestOrigin: string, allowed: string[]): string | null {
  if (!requestOrigin) return null;
  if (allowed.includes(requestOrigin)) return requestOrigin;
  try {
    const u = new URL(requestOrigin);
    const host = u.hostname.toLowerCase();
    if (u.protocol === 'tauri:') return requestOrigin;
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (TAURI_LOOPBACK_HOSTS.has(host) || host.endsWith('.localhost')) {
      /* localhost 本体は allowlist のみ。開発サーバーを本番 API に開けない */
      if (host === 'localhost') return null;
      return requestOrigin;
    }
  } catch { /* 不正な Origin */ }
  return null;
}
