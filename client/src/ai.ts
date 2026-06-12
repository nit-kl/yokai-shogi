/* ============================================================
   妖怪将棋 - 敵AI(酒呑童子)
   全行動を期待値評価 + 相手の最善応手(脅威)を差し引く貪欲法
   ============================================================ */

import { YOKAI, COLS, ROWS } from '../../shared/data';
import { Game } from '../../shared/game';
import type { Action, GameState, Piece } from '../../shared/game';

export const AI = {
  /* 駒の素材価値 */
  pieceValue(pc: Piece): number {
    const def = YOKAI[pc.id];
    if (def.type === 'boss') return 100000;
    let v = def.atk * (pc.promoted ? 1.5 : 1);
    if (def.skill.kind === 'aura' || def.skill.kind === 'weaken') v += 160; // 軽減オーラは盤上価値が高い
    if (def.skill.kind === 'chill' || def.skill.kind === 'jam') v += 130;  // 妨害オーラ
    if (def.skill.kind === 'heal') v += 90;
    if (def.skill.kind === 'counter') v += 60;
    if (def.skill.kind === 'explode') v += 50;   // 取られても道連れにできる
    return v;
  },

  chooseAction(state: GameState): Action | null {
    const acts = Game.getAllActions(state, 'e');
    if (acts.length === 0) return null;

    let best: Action | null = null, bestScore = -Infinity;
    for (const act of acts) {
      const sim = Game.clone(state);
      const hpBefore = { p: sim.hp.p, e: sim.hp.e };
      Game.applyAction(sim, act, { rng: false });

      let score = 0;

      if (sim.winner === 'e') return act;            // 勝ち確定なら即決
      if (sim.winner === 'p') { continue; }          // 自滅手は除外

      /* 与ダメ・被ダメ(反撃) */
      score += (hpBefore.p - sim.hp.p) * 1.0;
      score -= (hpBefore.e - sim.hp.e) * 1.15;

      /* 取った駒の素材価値 */
      if (act.kind === 'move') {
        const victim = state.board[act.to.y][act.to.x];
        if (victim) {
          score += this.pieceValue(victim) * 0.55;
          const vSk = YOKAI[victim.id].skill;
          /* 鬼火: 取ると自駒を道連れにされる / 化け狸: 持ち駒にならない */
          if (vSk.kind === 'explode') score -= this.pieceValue(state.board[act.from.y][act.from.x]!) * 0.8;
          else if (vSk.kind === 'decoy') score -= this.pieceValue(victim) * 0.4;
        }
      }

      /* 相手(プレイヤー)の最善応手の脅威を差し引く */
      score -= this.bestThreat(sim, 'p') * 0.85;

      /* 位置評価 */
      score += this.positionBonus(state, sim, act);

      /* 揺らぎ(毎回同じ手にならないように) */
      score += Math.random() * 22;

      if (score > bestScore) { bestScore = score; best = act; }
    }
    return best || acts[Math.floor(Math.random() * acts.length)];
  },

  /* side 側の最善の「取る手」の価値(=こちらへの脅威) */
  bestThreat(s: GameState, side: 'p' | 'e'): number {
    let worst = 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const pc = s.board[y][x];
        if (!pc || pc.owner !== side) continue;
        for (const m of Game.getMoves(s, x, y)) {
          if (!m.capture) continue;
          const victim = s.board[m.y][m.x]!;
          const vDef = YOKAI[victim.id];
          if (vDef.type === 'boss') return 100000; // 大将が取られる
          let val = Game.atkOf(pc); // 与えられるダメージ概算
          val += this.pieceValue(victim) * 0.55;
          if (vDef.skill.kind === 'counter') val -= vDef.skill.dmg * 0.9; // 罠は抑止力
          if (val > worst) worst = val;
        }
      }
    }
    return worst;
  },

  positionBonus(before: GameState, after: GameState, act: Action): number {
    let b = 0;
    const def = YOKAI[act.kind === 'drop' ? act.id : before.board[act.from.y][act.from.x]!.id];

    if (act.kind === 'move') {
      /* 攻タイプ・大将以外は前進を好む(敵=下方向 y+) */
      if (def.type === 'attack') b += act.to.y * 6;
      if (def.type === 'boss') {
        b -= act.to.y * 10;            // 大将は深追いしない
        b += (act.to.y === 0) ? 12 : 0;
      }
      if (def.type === 'defense') b -= Math.abs(act.to.y - 1) * 4; // 守りは自陣に
    } else {
      /* 打ち込み: 中盤〜敵陣寄りを好む、罠駒は前線へ */
      b += act.to.y * 4;
      if (def.skill.kind === 'counter') b += act.to.y * 4;
      b -= 18; // 手駒温存に僅かな価値
    }
    /* 中央寄り微加点 */
    b += (2 - Math.abs(act.to.x - 2)) * 3;
    return b;
  },
};
