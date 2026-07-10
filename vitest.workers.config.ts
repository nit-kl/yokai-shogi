/* APIのWorkersランタイムテスト(@cloudflare/vitest-pool-workers v0.16: Viteプラグイン方式)
   実行: npm run test:workers
   ローカルD1(miniflare)に server/migrations を適用してから各テストを実行する */
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(process.cwd(), 'server', 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        main: './server/src/index.ts',
        wrangler: { configPath: './server/wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            JWT_SECRET: 'test-secret',
            ALLOWED_ORIGINS: 'http://localhost:5173',
            MATCH_HOUR_ENFORCE: '0',
            PARTICIPATION_MIN_ACTIONS: '1',
            ADS_REWARD_ENABLED: '1',
            ADS_REWARD_PROVIDER: 'mock',
          },
        },
      }),
    ],
    test: {
      include: ['test/workers/**/*.spec.ts'],
      setupFiles: ['./test/workers/apply-migrations.ts'],
      testTimeout: 30000,
    },
  };
});
