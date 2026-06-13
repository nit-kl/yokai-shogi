import { defineConfig } from 'vite';

/* API接続先の決め方(クライアントの meta はこの値があればAPI版、なければローカル版で起動):
   - `vite build --mode online`   → 本番API(Pages配信用。npm run build:online)
   - `VITE_API_URL=... vite build` → 任意のAPI(staging検証など)
   - `vite build`(既定)            → 未設定=オフライン(ローカル版。e2eのオフライン経路はこれ) */
const PROD_API = 'https://api.yokai-shogi.nit-games.com';

const STAGING_API = 'https://yokai-shogi-api-staging.kojileo0178.workers.dev';

export default defineConfig(({ mode }) => {
  const apiUrl = mode === 'online'
    ? PROD_API
    : mode === 'staging'
      ? STAGING_API
      : (process.env.VITE_API_URL ?? '');
  const sentryDsn = process.env.VITE_SENTRY_DSN ?? '';
  const release = process.env.VITE_RELEASE ?? 'yokai-shogi@0.1.0';
  return {
    // クライアントをルートに(shared/ は ../shared として import される)
    root: 'client',
    define: {
      __API_URL__: JSON.stringify(apiUrl),
      __SENTRY_DSN__: JSON.stringify(sentryDsn),
      __RELEASE__: JSON.stringify(release),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // 駒画像はWebP最適化済みのためインライン化しない
      assetsInlineLimit: 0,
    },
    server: {
      port: 5173,
    },
  };
});
