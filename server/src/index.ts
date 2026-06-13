/* ============================================================
   妖怪将棋 API - Phase 0 雛形(疎通確認のみ)
   Phase 1 で Hono + D1 による認証・ガチャ・編成APIを実装する(doc 04)
   shared/ のエンジンが Workers で import できることの確認を兼ねる
   ============================================================ */

import { Game } from '../../shared/game';

export interface Env {
  // Phase 1 で D1 / KV / Turnstile のバインディングを追加
}

export default {
  async fetch(_req: Request, _env: Env): Promise<Response> {
    // 共有エンジンがWorkersランタイムで動作することの自己診断
    const s = Game.newState();
    const engineOk = Game.getAllActions(s, 'p').length > 0;
    return Response.json({
      ok: true,
      service: 'yokai-shogi-api',
      phase: 0,
      engine: engineOk ? 'shared engine loaded' : 'engine error',
    });
  },
};
