import { defineConfig } from 'vitest/config';

export default defineConfig({
  // meta/index.ts を読むテストが現れても __API_URL__ が解決できるよう保険(node testはオフライン扱い)
  define: { __API_URL__: '""', __SENTRY_DSN__: '""', __RELEASE__: '"test"' },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // メタテストはシングルトン状態を順に進めるため、ファイル内は直列実行(vitest既定)
    testTimeout: 60000,
  },
});
