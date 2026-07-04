/// <reference types="@cloudflare/workers-types" />
/// <reference types="@cloudflare/vitest-pool-workers/types" />

import type { Env as ApiEnv } from '../../server/src/env';
import type { D1Migration } from 'cloudflare:test';

/* cloudflare:test の env は Cloudflare.Env 型を参照する。
   APIのEnvに加えて、テスト用に渡すマイグレーション一覧を持たせる */
declare global {
  namespace Cloudflare {
    interface Env extends ApiEnv {
      TEST_MIGRATIONS: D1Migration[]; // vitest.workers.config.ts で定義
    }
  }
}

export {};
