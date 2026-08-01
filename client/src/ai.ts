/* ============================================================
   妖怪将棋 - 敵AI(酒呑童子)
   評価関数 + αβ探索 + 静止探索(取り合い延長)
   ============================================================ */

import { YOKAI, ROWS } from '../../shared/data';
import { Game, HUNGER_GRACE, AWAKEN_MAX } from '../../shared/game';
import type { Action, GameState, Piece, Side } from '../../shared/game';

export type AIDifficulty = 'easy' | 'normal' | 'hard';

interface SearchProfile {
  depth: number;
  quiesce: number;
  noise: number;
  randomPick: number;
}

const PROFILE: Record<AIDifficulty, SearchProfile> = {
  easy:   { depth: 1, quiesce: 0, noise: 48, randomPick: 0.35 },
  normal: { depth: 2, quiesce: 2, noise: 16, randomPick: 0 },
  hard:   { depth: 3, quiesce: 4, noise: 3,  randomPick: 0 },
};

const WIN = 1_000_000;
const APPLY = { rng: false as const };

export const AI = {
  /* 駒の素材価値 */
  pieceValue(pc: Piece): number {
    const def = YOKAI[pc.id];
    if (def.type === 'boss') return 100000;
    let v = def.atk * (pc.promoted ? 1.5 : 1);
    if (def.skill.kind === 'aura' || def.skill.kind === 'weaken') v += 160;
    if (def.skill.kind === 'chill' || def.skill.kind === 'jam') v += 130;
    if (def.skill.kind === 'heal') v += 90;
    if (def.skill.kind === 'counter') v += 60;
    if (def.skill.kind === 'explode') v += 50;
    if (def.skill.kind === 'heads') v += (pc.kills ?? 0) * 80;
    if (def.skill.kind === 'retreat' || def.skill.kind === 'phase' || def.skill.kind === 'veil') v += 70;
    if (def.skill.kind === 'ember') v += 55;
    if (def.skill.kind === 'legion') v += 70;
    if (def.skill.kind === 'moon') v += 80;
    if (def.rarity === 'SSR') v += 40;
    else if (def.rarity === 'SR') v += 20;
    return v;
  },

  chooseAction(state: GameState, difficulty: AIDifficulty = 'normal'): Action | null {
    const acts = Game.getAllActions(state, 'e');
    if (acts.length === 0) return null;

    const prof = PROFILE[difficulty];
    if (prof.randomPick > 0 && Math.random() < prof.randomPick) {
      return acts[Math.floor(Math.random() * acts.length)];
    }

    const ordered = this.orderActions(state, acts);
    for (const act of ordered) {
      const sim = Game.clone(state);
      Game.applyAction(sim, act, APPLY);
      if (sim.winner === 'e') return act;
    }

    let best: Action | null = null;
    let bestScore = -Infinity;

    for (const act of ordered) {
      const sim = Game.clone(state);
      Game.applyAction(sim, act, APPLY);
      if (sim.winner === 'p') continue;

      let score = this.search(sim, prof.depth - 1, -WIN, WIN, prof.quiesce);
      score += Math.random() * prof.noise;

      if (score > bestScore) {
        bestScore = score;
        best = act;
      }
    }
    return best || acts[Math.floor(Math.random() * acts.length)];
  },

  /* αβ探索。評価は常に敵AI('e')視点 */
  search(s: GameState, depth: number, alpha: number, beta: number, quiesce: number): number {
    const terminal = this.terminalScore(s);
    if (terminal !== null) return terminal;
    if (depth <= 0) return this.quiesce(s, quiesce, alpha, beta);

    const side = s.turn;
    const acts = this.orderActions(s, Game.getAllActions(s, side));
    if (acts.length === 0) return this.evaluate(s);

    if (side === 'e') {
      let best = -Infinity;
      for (const act of acts) {
        const child = Game.clone(s);
        Game.applyAction(child, act, APPLY);
        const score = this.search(child, depth - 1, alpha, beta, quiesce);
        if (score > best) best = score;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    }

    let best = Infinity;
    for (const act of acts) {
      const child = Game.clone(s);
      Game.applyAction(child, act, APPLY);
      const score = this.search(child, depth - 1, alpha, beta, quiesce);
      if (score < best) best = score;
      if (best < beta) beta = best;
      if (alpha >= beta) break;
    }
    return best;
  },

  /* 取り合いが続くあいだだけ延長(stand-patあり) */
  quiesce(s: GameState, depth: number, alpha: number, beta: number): number {
    const terminal = this.terminalScore(s);
    if (terminal !== null) return terminal;

    const standPat = this.evaluate(s);
    if (depth <= 0) return standPat;

    const side = s.turn;
    const captures = this.orderActions(s, this.captureActions(s, side));
    if (captures.length === 0) return standPat;

    if (side === 'e') {
      let best = standPat;
      if (best >= beta) return best;
      if (best > alpha) alpha = best;
      for (const act of captures) {
        const child = Game.clone(s);
        Game.applyAction(child, act, APPLY);
        const score = this.quiesce(child, depth - 1, alpha, beta);
        if (score > best) best = score;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    }

    let best = standPat;
    if (best <= alpha) return best;
    if (best < beta) beta = best;
    for (const act of captures) {
      const child = Game.clone(s);
      Game.applyAction(child, act, APPLY);
      const score = this.quiesce(child, depth - 1, alpha, beta);
      if (score < best) best = score;
      if (best < beta) beta = best;
      if (alpha >= beta) break;
    }
    return best;
  },

  terminalScore(s: GameState): number | null {
    if (s.winner === 'e') return WIN - s.plies;
    if (s.winner === 'p') return -(WIN - s.plies);
    if (s.reason === 'draw') return 0;
    return null;
  },

  captureActions(s: GameState, side: Side): Action[] {
    const out: Action[] = [];
    for (const act of Game.getAllActions(s, side)) {
      if (act.kind === 'move' && s.board[act.to.y][act.to.x]) out.push(act);
    }
    return out;
  },

  /* ---------- 評価(常に敵AI='e'視点) ---------- */
  evaluate(s: GameState): number {
    let score = (s.hp.e - s.hp.p) * 1.05;
    score += this.material(s, 'e') - this.material(s, 'p');
    score += this.bossSafety(s, 'e') - this.bossSafety(s, 'p');
    score += this.positionScore(s, 'e') - this.positionScore(s, 'p');
    score += this.supportScore(s, 'e') - this.supportScore(s, 'p');
    score += this.awakenScore(s, 'e') - this.awakenScore(s, 'p');
    score += this.hungerScore(s);
    score += this.threatScore(s, 'e') - this.threatScore(s, 'p');
    return score;
  },

  material(s: GameState, side: Side): number {
    let v = 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const pc = s.board[y][x];
        if (pc && pc.owner === side) v += this.pieceValue(pc);
      }
    }
    for (const id in s.hands[side]) {
      const n = s.hands[side][id];
      if (n <= 0) continue;
      const def = YOKAI[id];
      if (def.type === 'boss') continue;
      const base = def.atk + (def.rarity === 'SSR' ? 40 : def.rarity === 'SR' ? 20 : 0);
      v += base * 0.85 * n;
    }
    return v;
  },

  bossSafety(s: GameState, side: Side): number {
    let boss: { x: number; y: number } | null = null;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const pc = s.board[y][x];
        if (pc && pc.owner === side && YOKAI[pc.id].type === 'boss') {
          boss = { x, y };
          break;
        }
      }
      if (boss) break;
    }
    if (!boss) return -WIN * 0.5;

    let score = 0;
    const homeY = side === 'e' ? 0 : ROWS - 1;
    score += (3 - Math.abs(boss.y - homeY)) * 14;
    score += (2 - Math.abs(boss.x - 2)) * 6;

    const foe: Side = side === 'e' ? 'p' : 'e';
    let attackers = 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const pc = s.board[y][x];
        if (!pc || pc.owner !== foe) continue;
        for (const m of Game.getMoves(s, x, y)) {
          if (m.x === boss.x && m.y === boss.y && m.capture) {
            attackers++;
            score -= 220 + Game.atkOf(pc) * 0.35;
          }
        }
      }
    }
    if (attackers >= 2) score -= 180;
    return score;
  },

  positionScore(s: GameState, side: Side): number {
    let score = 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const pc = s.board[y][x];
        if (!pc || pc.owner !== side) continue;
        const def = YOKAI[pc.id];
        const forward = side === 'e' ? y : (ROWS - 1 - y);
        if (def.type === 'attack') score += forward * 5;
        else if (def.type === 'defense' || def.type === 'support') score += (forward <= 2 ? 10 : 2);
        else if (def.type === 'boss') score += (forward <= 1 ? 16 : -forward * 8);
        else score += forward * 2;

        score += (2 - Math.abs(x - 2)) * 2;
        if (pc.promoted) score += 35;
        if (Game.isAwakened(pc, s.plies)) score += 55;
      }
    }
    return score;
  },

  supportScore(s: GameState, side: Side): number {
    let score = 0;
    if (Game.hasSkill(s, side, 'aura') || Game.hasSkill(s, side, 'weaken')) score += 70;
    if (Game.hasSkill(s, side, 'jam')) score += 45;
    if (Game.hasSkill(s, side, 'chill')) score += 40;
    if (Game.hasSkill(s, side, 'heal')) score += 30;
    for (const em of s.embers ?? []) {
      if (em.side === side && em.until >= s.plies) score += 18;
    }
    return score;
  },

  awakenScore(s: GameState, side: Side): number {
    const st = s.awaken?.[side];
    if (!st || st.used) return 0;
    if (st.gauge >= AWAKEN_MAX) return 90;
    return st.gauge * 10;
  },

  hungerScore(s: GameState): number {
    const idle = Game.hungerIdle(s);
    if (idle <= HUNGER_GRACE) {
      if (idle >= HUNGER_GRACE - 2) {
        const hpLead = s.hp.e - s.hp.p;
        return hpLead > 200 ? -15 : 25;
      }
      return 0;
    }
    return (s.hp.e - s.hp.p) * 0.15;
  },

  threatScore(s: GameState, side: Side): number {
    let best = 0;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const pc = s.board[y][x];
        if (!pc || pc.owner !== side) continue;
        for (const m of Game.getMoves(s, x, y)) {
          if (!m.capture) continue;
          const victim = s.board[m.y][m.x]!;
          const vDef = YOKAI[victim.id];
          if (vDef.type === 'boss') return 800;
          let val = Game.atkOf(pc) * 0.5 + this.pieceValue(victim) * 0.45;
          if (vDef.skill.kind === 'counter') val -= vDef.skill.dmg * 0.7;
          if (vDef.skill.kind === 'explode') val -= this.pieceValue(pc) * 0.5;
          if (val > best) best = val;
        }
      }
    }
    return best * 0.35;
  },

  /* ---------- 手の並べ替え(αβ剪定用) ---------- */
  orderActions(s: GameState, acts: Action[]): Action[] {
    return acts
      .map((act, i) => ({ act, i, key: this.moveOrderKey(s, act) }))
      .sort((a, b) => b.key - a.key || a.i - b.i)
      .map(x => x.act);
  },

  moveOrderKey(s: GameState, act: Action): number {
    if (act.kind === 'awaken') return 500;
    if (act.kind === 'drop') {
      const def = YOKAI[act.id];
      let k = 40 + def.atk * 0.2;
      if (def.skill.kind === 'counter') k += act.to.y * 3;
      return k;
    }
    const victim = s.board[act.to.y][act.to.x];
    if (victim) {
      if (YOKAI[victim.id].type === 'boss') return 10000;
      let k = 800 + this.pieceValue(victim);
      const atk = s.board[act.from.y][act.from.x];
      if (atk) k += Game.atkOf(atk) * 0.3;
      return k;
    }
    const pc = s.board[act.from.y][act.from.x];
    if (!pc) return 0;
    const def = YOKAI[pc.id];
    let k = 10;
    if (def.type === 'attack') k += act.to.y * 4;
    k += (2 - Math.abs(act.to.x - 2)) * 2;
    return k;
  },

  /* 後方互換 */
  bestThreat(s: GameState, side: 'p' | 'e'): number {
    return this.threatScore(s, side) / 0.35;
  },

  positionBonus(before: GameState, _after: GameState, act: Action): number {
    if (act.kind === 'awaken') return 0;
    let b = 0;
    const def = YOKAI[act.kind === 'drop' ? act.id : before.board[act.from.y][act.from.x]!.id];
    if (act.kind === 'move') {
      if (def.type === 'attack') b += act.to.y * 6;
      if (def.type === 'boss') {
        b -= act.to.y * 10;
        b += (act.to.y === 0) ? 12 : 0;
      }
      if (def.type === 'defense') b -= Math.abs(act.to.y - 1) * 4;
    } else {
      b += act.to.y * 4;
      if (def.skill.kind === 'counter') b += act.to.y * 4;
      b -= 18;
    }
    b += (2 - Math.abs(act.to.x - 2)) * 3;
    return b;
  },
};
