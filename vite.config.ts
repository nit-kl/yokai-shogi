import { defineConfig, type Plugin } from 'vite';

/* API接続先の決め方(クライアントの meta はこの値があればAPI版、なければローカル版で起動):
   - `vite build --mode online`   → 本番API(Pages配信用。npm run build:online)
   - `vite build --mode steam`    → Steam向け・本番API・広告なし
   - `vite build --mode steam-offline` → Steam向け・APIなし(オフライン検証)
   - `vite build --mode steam-staging` → Steam向け・staging API
   - `VITE_API_URL=... vite build` → 任意のAPI(staging検証など)
   - `vite build`(既定)            → 未設定=オフライン(ローカル版。e2eのオフライン経路はこれ) */
const PROD_API = 'https://api.yokai-shogi.nit-games.com';

const STAGING_API = 'https://yokai-shogi-api-staging.kojileo0178.workers.dev';

type AppPlatform = 'web' | 'steam';

function resolvePlatform(mode: string): AppPlatform {
  if (mode === 'steam' || mode === 'steam-offline' || mode === 'steam-staging') return 'steam';
  if (process.env.VITE_PLATFORM === 'steam') return 'steam';
  return 'web';
}

function resolveApiUrl(mode: string): string {
  if (mode === 'online' || mode === 'steam') return PROD_API;
  if (mode === 'staging' || mode === 'steam-staging') return STAGING_API;
  if (mode === 'steam-offline') return '';
  return process.env.VITE_API_URL ?? '';
}

/** Steam ビルドから AdSense meta / スクリプトを除去する */
function stripAdsHtmlPlugin(platform: AppPlatform): Plugin {
  return {
    name: 'strip-ads-for-steam',
    transformIndexHtml(html) {
      if (platform !== 'steam') return html;
      return html
        .replace(/<meta\s+name="google-adsense-account"[^>]*>\s*/i, '')
        .replace(/<!--\s*AdSense:[\s\S]*?-->\s*/i, '')
        .replace(/<script[^>]*adsbygoogle\.js[^>]*><\/script>\s*/i, '');
    },
  };
}

export default defineConfig(({ mode }) => {
  const platform = resolvePlatform(mode);
  const apiUrl = resolveApiUrl(mode);
  const sentryDsn = process.env.VITE_SENTRY_DSN ?? '';
  const release = process.env.VITE_RELEASE ?? 'yokai-shogi@0.1.0';
  return {
    // クライアントをルートに(shared/ は ../shared として import される)
    root: 'client',
    define: {
      __API_URL__: JSON.stringify(apiUrl),
      __SENTRY_DSN__: JSON.stringify(sentryDsn),
      __RELEASE__: JSON.stringify(release),
      __PLATFORM__: JSON.stringify(platform),
    },
    plugins: [stripAdsHtmlPlugin(platform)],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // 駒画像はWebP最適化済みのためインライン化しない
      assetsInlineLimit: 0,
    },
    server: {
      port: 5173,
      watch: {
        ignored: ['**/src-tauri/**'],
      },
    },
    clearScreen: false,
  };
});
