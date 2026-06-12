/* ============================================================
   妖怪将棋 - ルールエンジン(shared: クライアント/サーバー共用)
   オセロニア式: 駒を取る = 取った駒のATKで相手の魂力にダメージ
   将棋式: 持ち駒・成り・大将討伐
   ※ このモジュールは Web標準APIのみ・I/Oなし を厳守する(doc 02)
   ============================================================ */

import { COLS, ROWS, MAX_HP, ZONE_DEPTH, SETUP, YOKAI } from './data';
import type { Side } from './data';

export type { Side };

export interface Pos { x: number; y: number; }

export interface Piece {
  uid: number;
  id: string;
  owner: Side;
  promoted: boolean;
}

export type Hands = Record<string, number>;
export type GameOverReason = 'boss' | 'hp' | 'explode' | 'nomoves' | 'resign';

export interface GameState {
  board: (Piece | null)[][];
  hp: Record<Side, number>;
  hands: Record<Side, Hands>;
  turn: Side;
  combo: Record<Side, number>;
  winner: Side | null;
  reason: GameOverReason | null;
  lastMove: { to: Pos } | null;
  nextUid: number; // 駒uid採番(モジュール変数ではなく状態側で持つ: 1プロセスで複数対局を扱うため)
}

export type Action =
  | { kind: 'move'; from: Pos; to: Pos }
  | { kind: 'drop'; id: string; to: Pos };

export interface MoveTarget { x: number; y: number; capture: boolean; }

export interface SkillProc { name: string; owner: Side; img: string; text: string; }
export interface PieceRef { uid: number; id: string; owner: Side; promoted: boolean; }

export interface CaptureEvent {
  t: 'capture';
  attacker: PieceRef;
  victim: PieceRef;
  at: Pos;
  damage: number;
  procs: SkillProc[];
  counter: { dmg: number; name: string; img: string; owner: Side; hp: Record<Side, number> } | null;
  decoy: { name: string; img: string } | null;
  explode: { name: string; img: string; uid: number } | null;
  heal: number;
  combo: number;
  comboMult: number;
  hp: Record<Side, number>;
}

export type GameEvent =
  | { t: 'move'; uid: number; from: Pos; to: Pos }
  | { t: 'drop'; uid: number; id: string; owner: Side; to: Pos }
  | { t: 'promote'; uid: number; to: Pos; id: string; owner: Side }
  | CaptureEvent
  | { t: 'gameover'; winner: Side; reason: GameOverReason };

export interface ApplyOptions {
  /** false で確率スキルを期待値計算(AI読み用)。既定 true */
  rng?: boolean;
  /** 乱数の注入(サーバーは対局シード由来のPRNG、クライアントは既定の Math.random) */
  rand?: () => number;
}

export const Game = {
  /* playerRows: 自軍2段(手前から2段目, 最奥段)の編成。省略時は既定配置 */
  newState(playerRows: (string | null)[][] | null = null): GameState {
    let uid = 0;
    const board: (Piece | null)[][] = [];
    for (let y = 0; y < ROWS; y++) {
      const row: (Piece | null)[] = [];
      for (let x = 0; x < COLS; x++) {
        let id = SETUP[y][x];
        if (playerRows && y >= ROWS - 2) id = playerRows[y - (ROWS - 2)][x];
        row.push(id ? { uid: ++uid, id, owner: y < ROWS / 2 ? 'e' : 'p', promoted: false } : null);
      }
      board.push(row);
    }
    return {
      board,
      hp: { p: MAX_HP, e: MAX_HP },
      hands: { p: {}, e: {} },
      turn: 'p',
      combo: { p: 0, e: 0 },
      winner: null,
      reason: null,
      lastMove: null,
      nextUid: uid,
    };
  },

  clone(s: GameState): GameState {
    return {
      board: s.board.map(row => row.map(pc => pc ? { ...pc } : null)),
      hp: { ...s.hp },
      hands: { p: { ...s.hands.p }, e: { ...s.hands.e } },
      turn: s.turn,
      combo: { ...s.combo },
      winner: s.winner,
      reason: s.reason,
      lastMove: s.lastMove,
      nextUid: s.nextUid,
    };
  },

  inBounds(x: number, y: number): boolean { return x >= 0 && x < COLS && y >= 0 && y < ROWS; },

  atkOf(pc: Piece): number {
    const base = YOKAI[pc.id].atk;
    return pc.promoted ? Math.round(base * 1.5) : base;
  },

  /* 敵陣(成りゾーン)判定 */
  inZone(owner: Side, y: number): boolean {
    return owner === 'p' ? y < ZONE_DEPTH : y >= ROWS - ZONE_DEPTH;
  },

  /* (x,y)の駒の移動先一覧 */
  getMoves(s: GameState, x: number, y: number): MoveTarget[] {
    const pc = s.board[y][x];
    if (!pc) return [];
    const def = YOKAI[pc.id];
    const mv = (pc.promoted && def.promoted) ? def.promoted : def.moves;
    const sign = pc.owner === 'p' ? 1 : -1;
    const out: MoveTarget[] = [];
    const tryAdd = (nx: number, ny: number): boolean => {
      if (!this.inBounds(nx, ny)) return false;
      const occ = s.board[ny][nx];
      if (occ && occ.owner === pc.owner) return false;
      out.push({ x: nx, y: ny, capture: !!occ });
      return !occ; // 進行可能か(スライド用)
    };
    if (mv.steps) for (const [dx, dy] of mv.steps) tryAdd(x + dx, y + dy * sign);
    if (mv.jumps) for (const [dx, dy] of mv.jumps) tryAdd(x + dx, y + dy * sign);
    if (mv.slides) for (const [dx, dy] of mv.slides) {
      let nx = x + dx, ny = y + dy * sign;
      while (this.inBounds(nx, ny)) {
        if (!tryAdd(nx, ny)) break;
        nx += dx; ny += dy * sign;
      }
    }
    return out;
  },

  /* 持ち駒 id を打てるマス一覧 */
  getDrops(s: GameState, owner: Side, id: string): Pos[] {
    const def = YOKAI[id];
    const limit = def.dropLimit || 0; // 相手陣最奥 n 段には打てない
    const out: Pos[] = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (s.board[y][x]) continue;
        const depth = owner === 'p' ? y : ROWS - 1 - y; // 相手最奥からの距離
        if (depth < limit) continue;
        out.push({ x, y });
      }
    }
    return out;
  },

  /* 手番側の全行動 */
  getAllActions(s: GameState, side: Side): Action[] {
    const acts: Action[] = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const pc = s.board[y][x];
        if (!pc || pc.owner !== side) continue;
        for (const m of this.getMoves(s, x, y)) {
          acts.push({ kind: 'move', from: { x, y }, to: { x: m.x, y: m.y } });
        }
      }
    }
    for (const id in s.hands[side]) {
      if (s.hands[side][id] <= 0) continue;
      for (const d of this.getDrops(s, side, id)) {
        acts.push({ kind: 'drop', id, to: { x: d.x, y: d.y } });
      }
    }
    return acts;
  },

  /* 防御オーラ(守)+弱体オーラ(妨)による軽減率(受ける側 side) */
  defenseMult(s: GameState, side: Side): number {
    let m = 1;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const pc = s.board[y][x];
        if (!pc || pc.owner !== side) continue;
        const sk = YOKAI[pc.id].skill;
        if (sk.kind === 'aura' || sk.kind === 'weaken') m *= (1 - sk.reduce);
      }
    }
    return m;
  },

  /* side 側の盤上に指定スキルの駒がいるか */
  hasSkill(s: GameState, side: Side, kind: string): boolean {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const pc = s.board[y][x];
        if (pc && pc.owner === side && YOKAI[pc.id].skill.kind === kind) return true;
      }
    }
    return false;
  },

  comboMult(n: number): number { return Math.min(2, 1 + 0.25 * (n - 1)); },

  /* ------------------------------------------------------------
     行動を適用し、演出用イベント列を返す
     opts.rng=false で確率スキルを期待値計算(AI読み用)
     opts.rand で乱数を注入(省略時 Math.random)
     ------------------------------------------------------------ */
  applyAction(s: GameState, action: Action, opts: ApplyOptions = {}): GameEvent[] {
    const rng = opts.rng !== false;
    const rand = opts.rand ?? Math.random;
    const events: GameEvent[] = [];
    const side = s.turn;
    const foe: Side = side === 'p' ? 'e' : 'p';

    if (action.kind === 'drop') {
      const pc: Piece = { uid: ++s.nextUid, id: action.id, owner: side, promoted: false };
      s.board[action.to.y][action.to.x] = pc;
      s.hands[side][action.id]--;
      if (s.hands[side][action.id] <= 0) delete s.hands[side][action.id];
      s.combo[side] = 0;
      events.push({ t: 'drop', uid: pc.uid, id: action.id, owner: side, to: { ...action.to } });
    } else {
      const { from, to } = action;
      const pc = s.board[from.y][from.x]!;
      const victim = s.board[to.y][to.x];
      s.board[to.y][to.x] = pc;
      s.board[from.y][from.x] = null;
      events.push({ t: 'move', uid: pc.uid, from: { ...from }, to: { ...to } });

      if (victim) {
        const ended = this._resolveCapture(s, pc, victim, from, to, side, foe, rng, rand, events);
        if (ended) return events; // 勝敗決定
      } else {
        s.combo[side] = 0;
      }

      /* 成り(鬼火の道連れで消えた駒は成れない) */
      const def = YOKAI[pc.id];
      if (!pc.promoted && def.promoted && def.type !== 'boss' && this.inZone(side, to.y) && !s.winner &&
          s.board[to.y][to.x] === pc) {
        pc.promoted = true;
        events.push({ t: 'promote', uid: pc.uid, to: { ...to }, id: pc.id, owner: side });
      }
    }

    if (!s.winner) {
      s.turn = foe;
      s.lastMove = { to: { ...action.to } };
      /* 相手が指し手なし → 手番側勝利 */
      if (this.getAllActions(s, foe).length === 0) {
        s.winner = side;
        s.reason = 'nomoves';
        events.push({ t: 'gameover', winner: side, reason: 'nomoves' });
      }
    }
    return events;
  },

  _resolveCapture(
    s: GameState, attacker: Piece, victim: Piece, from: Pos, to: Pos,
    side: Side, foe: Side, rng: boolean, rand: () => number, events: GameEvent[],
  ): boolean {
    const vDef = YOKAI[victim.id];
    const aDef = YOKAI[attacker.id];
    const procs: SkillProc[] = [];

    /* --- ダメージ計算 --- */
    const base = this.atkOf(attacker);
    let mult = 1, bonus = 0;
    const sk = aDef.skill;
    /* 妨(jam): 砂かけ婆がいる側への攻撃は会心スキルが封じられる */
    if (sk.kind === 'crit' && !this.hasSkill(s, foe, 'jam')) {
      if (rng) {
        if (rand() < sk.chance) {
          mult *= sk.mult;
          procs.push({ name: sk.name, owner: side, img: aDef.img, text: `ダメージ${sk.mult}倍!` });
        }
      } else {
        mult *= 1 + sk.chance * (sk.mult - 1); // 期待値
      }
    } else if (sk.kind === 'zone' && this.inZone(side, to.y)) {
      bonus += sk.bonus;
      if (rng) procs.push({ name: sk.name, owner: side, img: aDef.img, text: `敵陣強襲 +${sk.bonus}!` });
    } else if (sk.kind === 'rush') {
      const dist = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
      if (dist >= sk.minDist) {
        mult *= sk.mult;
        if (rng) procs.push({ name: sk.name, owner: side, img: aDef.img, text: `疾風一閃 ${sk.mult}倍!` });
      }
    }

    s.combo[side]++;
    let cMult = this.comboMult(s.combo[side]);
    /* 妨(chill): 雪女がいる側へのコンボ倍率は無効 */
    if (cMult > 1 && this.hasSkill(s, foe, 'chill')) cMult = 1;
    const defMult = this.defenseMult(s, foe);
    let damage = Math.max(1, Math.round((base * mult + bonus) * cMult * defMult));

    /* 化(decoy): 化け狸は取られてもダメージ半減 */
    let decoy: CaptureEvent['decoy'] = null;
    if (vDef.skill.kind === 'decoy') {
      damage = Math.max(1, Math.round(damage * 0.5));
      decoy = { name: vDef.skill.name, img: vDef.img };
    }
    s.hp[foe] = Math.max(0, s.hp[foe] - damage);

    /* 援(heal): 駒を取ると自軍の魂力回復 */
    let heal = 0;
    if (sk.kind === 'heal') {
      heal = Math.min(MAX_HP - s.hp[side], sk.amount);
      s.hp[side] += heal;
      if (rng && heal > 0) procs.push({ name: sk.name, owner: side, img: aDef.img, text: `魂力${heal}回復!` });
    }
    const hpAfterAttack = { ...s.hp };

    /* --- 反撃(罠) --- */
    let counter: CaptureEvent['counter'] = null;
    if (vDef.skill.kind === 'counter') {
      const cDmg = Math.max(1, Math.round(vDef.skill.dmg * this.defenseMult(s, side)));
      s.hp[side] = Math.max(0, s.hp[side] - cDmg);
      counter = { dmg: cDmg, name: vDef.skill.name, img: vDef.img, owner: foe, hp: { ...s.hp } };
    }

    /* --- 持ち駒へ(化け狸と鬼火は消滅して渡らない) --- */
    const bossCaptured = vDef.type === 'boss';
    const vanish = vDef.skill.kind === 'decoy' || vDef.skill.kind === 'explode';
    if (!bossCaptured && !vanish) {
      s.hands[side][victim.id] = (s.hands[side][victim.id] || 0) + 1;
    }

    /* --- 爆(explode): 鬼火は取った駒を道連れにする --- */
    let explode: CaptureEvent['explode'] = null;
    if (vDef.skill.kind === 'explode') {
      s.board[to.y][to.x] = null;
      explode = { name: vDef.skill.name, img: vDef.img, uid: attacker.uid };
    }

    events.push({
      t: 'capture',
      attacker: { uid: attacker.uid, id: attacker.id, owner: side, promoted: attacker.promoted },
      victim: { uid: victim.uid, id: victim.id, owner: foe, promoted: victim.promoted },
      at: { ...to },
      damage, procs, counter, decoy, explode, heal,
      combo: s.combo[side], comboMult: cMult,
      hp: hpAfterAttack,
    });

    /* --- 勝敗判定 --- */
    if (bossCaptured) {
      s.winner = side; s.reason = 'boss';
      events.push({ t: 'gameover', winner: side, reason: 'boss' });
      return true;
    }
    if (s.hp[foe] <= 0) {
      s.winner = side; s.reason = 'hp';
      events.push({ t: 'gameover', winner: side, reason: 'hp' });
      return true;
    }
    if (s.hp[side] <= 0) { // 反撃で自滅
      s.winner = foe; s.reason = 'hp';
      events.push({ t: 'gameover', winner: foe, reason: 'hp' });
      return true;
    }
    if (explode && aDef.type === 'boss') { // 大将が鬼火を取ってしまった
      s.winner = foe; s.reason = 'explode';
      events.push({ t: 'gameover', winner: foe, reason: 'explode' });
      return true;
    }
    return false;
  },
};
