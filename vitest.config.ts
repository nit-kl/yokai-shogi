import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // メタテストはシングルトン状態を順に進めるため、ファイル内は直列実行(vitest既定)
    testTimeout: 60000,
  },
});
