/* ============================================================
   妖怪将棋 - ルールエンジン(shared: クライアント/サーバー共用)
   駒取りバトル: 駒を取る = 取った駒のATKで相手の魂力にダメージ
   将棋式: 持ち駒・成り・大将討伐
   ※ このモジュールは Web標準APIのみ・I/Oなし を厳守する(doc 02)
   ============================================================ */

import { COLS, ROWS, MAX_HP, ZONE_DEPTH, SETUP, YOKAI, RESONANCES, baseIdOf } from './data';
import type { Side, Resonance } from './data';

export type { Side };

export interface Pos { x: number; y: number; }

export interface Piece {
  uid: number;
  id: string;
  owner: Side;
  promoted: boolean;
  kills?: number;       // heads(八岐の首): この駒の撃破数。取られて打ち直されるとリセット
  awakenUntil?: number; // 覚醒の有効期限(この手数まで。plies基準)
  enraged?: boolean;    // foxBond(妖狐相伝): 次の攻撃が確定会心
}

export type Hands = Record<string, number>;
export type GameOverReason = 'boss' | 'hp' | 'explode' | 'nomoves' | 'resign' | 'hunger' | 'draw';

export interface AwakenState { gauge: number; used: boolean }

/** 残火(ember): 取ったマスに残る自軍マーカー */
export interface Ember {
  side: Side;
  x: number;
  y: number;
  until: number; // plies 期限
  mode: 'atk' | 'heal' | 'trap';
  value: number;
}

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
  plies: number;   // 適用済みの手数(月齢・覚醒期限の基準)
  awaken: Record<Side, AwakenState>; // 覚醒ゲージ(SSR必殺技: 1局1回)
  lastCapturePly: number; // 直近捕獲の手数(飢餓の夜)
  embers: Ember[];        // 残火
}

/* 覚醒(SSR必殺技): 駒の取り合いで両陣営に+1、満タンで手番を消費して自軍SSRを覚醒できる */
export const AWAKEN_MAX = 6;   // ゲージ満タンに必要な取り合い回数
export const AWAKEN_SPAN = 6;  // 発動から6手(自分の手番3回)有効
export const AWAKEN_ATK = 1.5; // 覚醒中のATK倍率

/* 月齢(moonスキル): 1夜=2手(両者1手ずつ)、4夜周期の4夜目が満月 */
export const MOON_CYCLE = 4;

/* 飢餓の夜: 無取りが続くと双方の魂力が削れる */
export const HUNGER_GRACE = 8;
export const HUNGER_DRAIN = 50;

export type Action =
  | { kind: 'move'; from: Pos; to: Pos; phaseTo?: Pos; spawnTo?: Pos } // phaseTo: 影遁先 / spawnTo: 送り火の設置先
  | { kind: 'drop'; id: string; to: Pos }
  | { kind: 'awaken'; to: Pos }; // 自軍SSR駒(to)を覚醒させる(手番を消費)

export interface MoveTarget { x: number; y: number; capture: boolean; }

export interface SkillProc { name: string; owner: Side; img: string; text: string; }
export type SkillEffectKind = 'buff' | 'debuff' | 'defense' | 'combo' | 'status';
export interface SkillEffect {
  kind: SkillEffectKind;
  name: string;
  owner: Side;
  img: string;
  text: string;
}
export interface PieceRef { uid: number; id: string; owner: Side; promoted: boolean; }

export interface CaptureEvent {
  t: 'capture';
  attacker: PieceRef;
  victim: PieceRef;
  at: Pos;
  damage: number;
  procs: SkillProc[];
  effects?: SkillEffect[];
  counter: { dmg: number; name: string; img: string; owner: Side; hp: Record<Side, number> } | null;
  decoy: { name: string; img: string } | null;
  explode: { name: string; img: string; uid: number } | null;
  heal: number;
  combo: number;
  comboMult: number;
  hp: Record<Side, number>;
  /* foxBond(妖狐相伝): この捕獲で相方が激怒した(uid=激怒した駒) */
  enrage?: { uid: number; id: string; owner: Side; name: string } | null;
  emberBonus?: number; // 残火(atk)による最終ダメ加算
  trapDmg?: number;    // 残火(trap)を踏んだダメージ
}

export type GameEvent =
  | { t: 'move'; uid: number; from: Pos; to: Pos }
  | { t: 'drop'; uid: number; id: string; owner: Side; to: Pos }
  | { t: 'promote'; uid: number; to: Pos; id: string; owner: Side }
  | { t: 'awaken'; uid: number; id: string; owner: Side; to: Pos; name: string; until: number }
  | CaptureEvent
  | { t: 'hunger'; drain: number; hp: Record<Side, number> }
  | { t: 'gameover'; winner: Side | null; reason: GameOverReason };

export interface ApplyOptions {
  /** false で確率スキルを期待値計算(AI読み用)。既定 true */
  rng?: boolean;
  /** 乱数の注入(サーバーは対局シード由来のPRNG、クライアントは既定の Math.random) */
  rand?: () => number;
}

const posKey = (p: Pos) => `${p.x},${p.y}`;

export const Game = {
  /* playerRows: 自軍2段(手前から2段目, 最奥段)、enemyRows: 敵軍2段(最奥段, 前段) */
  newState(
    playerRows: (string | null)[][] | null = null,
    enemyRows: (string | null)[][] | null = null,
  ): GameState {
    let uid = 0;
    const board: (Piece | null)[][] = [];
    for (let y = 0; y < ROWS; y++) {
      const row: (Piece | null)[] = [];
      for (let x = 0; x < COLS; x++) {
        let id = SETUP[y][x];
        if (enemyRows && y < 2) id = enemyRows[y][x];
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
      plies: 0,
      awaken: { p: { gauge: 0, used: false }, e: { gauge: 0, used: false } },
      lastCapturePly: 0,
      embers: [],
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
      plies: s.plies ?? 0,
      awaken: s.awaken
        ? { p: { ...s.awaken.p }, e: { ...s.awaken.e } }
        : { p: { gauge: 0, used: false }, e: { gauge: 0, used: false } },
      lastCapturePly: s.lastCapturePly ?? 0,
      embers: (s.embers ?? []).map(e => ({ ...e })),
    };
  },

  /* 旧スナップショットを正規化。復元された進行中対局との互換用 */
  ensureMeta(s: GameState): void {
    if (typeof s.plies !== 'number') s.plies = 0;
    if (!s.awaken) s.awaken = { p: { gauge: 0, used: false }, e: { gauge: 0, used: false } };
    if (typeof s.lastCapturePly !== 'number') s.lastCapturePly = 0;
    if (!Array.isArray(s.embers)) s.embers = [];
  },

  /* ---------- 月齢(moonスキル) ---------- */
  moonPhaseOfPly(ply: number): number { return Math.floor(ply / 2) % MOON_CYCLE; },
  moonPhase(s: GameState): number { return this.moonPhaseOfPly(s.plies ?? 0); },
  isFullMoonPly(ply: number): boolean { return this.moonPhaseOfPly(ply) === MOON_CYCLE - 1; },
  nightsUntilFullMoon(s: GameState): number {
    return (MOON_CYCLE - 1) - this.moonPhase(s);
  },

  /* ---------- 飢餓の夜 ---------- */
  hungerIdle(s: GameState): number {
    this.ensureMeta(s);
    return Math.max(0, (s.plies ?? 0) - (s.lastCapturePly ?? 0));
  },
  hungerActive(s: GameState): boolean {
    return this.hungerIdle(s) > HUNGER_GRACE;
  },
  hungerTurnsLeft(s: GameState): number {
    return Math.max(0, HUNGER_GRACE - this.hungerIdle(s));
  },

  /* ---------- 覚醒(SSR必殺技) ---------- */
  awakenReady(s: GameState, side: Side): boolean {
    const st = s.awaken?.[side];
    return !!st && !st.used && st.gauge >= AWAKEN_MAX;
  },
  isAwakened(pc: Piece, ply: number): boolean {
    return pc.awakenUntil !== undefined && ply <= pc.awakenUntil;
  },
  awakenTargets(s: GameState, side: Side): Pos[] {
    const out: Pos[] = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const pc = s.board[y][x];
        if (pc && pc.owner === side && YOKAI[pc.id].rarity === 'SSR' && pc.awakenUntil === undefined) {
          out.push({ x, y });
        }
      }
    }
    return out;
  },

  /* ---------- 因縁共鳴 ---------- */
  activeResonance(s: GameState, side: Side, id: string): Resonance | null {
    const base = baseIdOf(id);
    for (const rs of RESONANCES) {
      if (!rs.pair.includes(base)) continue;
      const partner = rs.pair[0] === base ? rs.pair[1] : rs.pair[0];
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const pc = s.board[y][x];
          if (pc && pc.owner === side && baseIdOf(pc.id) === partner) return rs;
        }
      }
    }
    return null;
  },
  findPartnerPiece(s: GameState, side: Side, rs: Resonance, capturedBase: string): { pc: Piece; at: Pos } | null {
    const partner = rs.pair[0] === capturedBase ? rs.pair[1] : rs.pair[0];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const pc = s.board[y][x];
        if (pc && pc.owner === side && baseIdOf(pc.id) === partner) return { pc, at: { x, y } };
      }
    }
    return null;
  },

  inBounds(x: number, y: number): boolean { return x >= 0 && x < COLS && y >= 0 && y < ROWS; },

  atkOf(pc: Piece): number {
    const base = YOKAI[pc.id].atk;
    return pc.promoted ? Math.round(base * 1.5) : base;
  },

  inZone(owner: Side, y: number): boolean {
    return owner === 'p' ? y < ZONE_DEPTH : y >= ROWS - ZONE_DEPTH;
  },

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
      return !occ;
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

  getDrops(s: GameState, owner: Side, id: string): Pos[] {
    const def = YOKAI[id];
    const limit = def.dropLimit || 0;
    const out: Pos[] = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (s.board[y][x]) continue;
        const depth = owner === 'p' ? y : ROWS - 1 - y;
        if (depth < limit) continue;
        out.push({ x, y });
      }
    }
    return out;
  },

  /* 捕獲後の送り火設置先(to の周囲空き。元マス from も含む) */
  spawnDests(s: GameState, from: Pos, to: Pos): Pos[] {
    return this.escapeDests(s, from, to, 'phase');
  },

  /* 捕獲後の影遁/隱形先(残留は含めない。残留は phaseTo 省略) */
  escapeDests(s: GameState, from: Pos, to: Pos, kind: 'phase' | 'veil'): Pos[] {
    const out: Pos[] = [];
    const seen = new Set<string>();
    const add = (p: Pos) => {
      const k = posKey(p);
      if (seen.has(k)) return;
      if (p.x === to.x && p.y === to.y) return;
      seen.add(k);
      out.push(p);
    };
    if (kind === 'veil') add({ ...from });
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = to.x + dx, ny = to.y + dy;
        if (!this.inBounds(nx, ny)) continue;
        const occ = s.board[ny][nx];
        if (!occ || (nx === from.x && ny === from.y)) add({ x: nx, y: ny });
      }
    }
    return out;
  },

  getAllActions(s: GameState, side: Side): Action[] {
    const acts: Action[] = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const pc = s.board[y][x];
        if (!pc || pc.owner !== side) continue;
        const sk = YOKAI[pc.id].skill.kind;
        for (const m of this.getMoves(s, x, y)) {
          const base: Action = { kind: 'move', from: { x, y }, to: { x: m.x, y: m.y } };
          acts.push(base);
          if (m.capture && (sk === 'phase' || sk === 'veil')) {
            for (const pt of this.escapeDests(s, { x, y }, { x: m.x, y: m.y }, sk)) {
              acts.push({ kind: 'move', from: { x, y }, to: { x: m.x, y: m.y }, phaseTo: pt });
            }
          }
          if (m.capture && sk === 'spawn') {
            for (const st of this.spawnDests(s, { x, y }, { x: m.x, y: m.y })) {
              if (st.x === x && st.y === y) continue; // 元マスへの設置は spawnTo 省略
              acts.push({ kind: 'move', from: { x, y }, to: { x: m.x, y: m.y }, spawnTo: st });
            }
          }
        }
      }
    }
    for (const id in s.hands[side]) {
      if (s.hands[side][id] <= 0) continue;
      for (const d of this.getDrops(s, side, id)) {
        acts.push({ kind: 'drop', id, to: { x: d.x, y: d.y } });
      }
    }
    if (this.awakenReady(s, side)) {
      for (const t of this.awakenTargets(s, side)) acts.push({ kind: 'awaken', to: t });
    }
    return acts;
  },

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

  activeSkillEffects(s: GameState, side: Side, kinds: readonly string[]): SkillEffect[] {
    const effects: SkillEffect[] = [];
    const seen = new Set<string>();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const pc = s.board[y][x];
        if (!pc || pc.owner !== side) continue;
        const def = YOKAI[pc.id];
        const sk = def.skill;
        if (!kinds.includes(sk.kind) || seen.has(`${pc.uid}:${sk.kind}`)) continue;
        seen.add(`${pc.uid}:${sk.kind}`);
        if (sk.kind === 'aura') {
          effects.push({ kind: 'defense', name: sk.name, owner: side, img: def.img, text: `被ダメージ-${Math.round(sk.reduce * 100)}%` });
        } else if (sk.kind === 'weaken') {
          effects.push({ kind: 'debuff', name: sk.name, owner: side, img: def.img, text: `敵の与ダメージ-${Math.round(sk.reduce * 100)}%` });
        } else if (sk.kind === 'jam') {
          effects.push({ kind: 'debuff', name: sk.name, owner: side, img: def.img, text: '会心・月齢・首成長を封じた' });
        } else if (sk.kind === 'chill') {
          effects.push({ kind: 'combo', name: sk.name, owner: side, img: def.img, text: '相手のコンボ倍率を無効化' });
        }
      }
    }
    return effects;
  },

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

  pruneEmbers(s: GameState): void {
    this.ensureMeta(s);
    s.embers = s.embers.filter(e => e.until >= s.plies);
  },

  findEmberAt(s: GameState, x: number, y: number, side?: Side): Ember | undefined {
    this.ensureMeta(s);
    return s.embers.find(e => e.x === x && e.y === y && e.until >= s.plies && (side === undefined || e.side === side));
  },

  placeEmber(s: GameState, side: Side, at: Pos, mode: Ember['mode'], value: number, span: number): void {
    this.ensureMeta(s);
    s.embers = s.embers.filter(e => !(e.side === side));
    s.embers.push({ side, x: at.x, y: at.y, until: s.plies + span - 1, mode, value });
  },

  /* マス進入時の残火(trap/heal)。trapは進入側が被ダメして消滅 */
  resolveEmberEnter(
    s: GameState, side: Side, at: Pos, events: GameEvent[],
    procs?: SkillProc[],
  ): { trapDmg: number; heal: number } {
    this.pruneEmbers(s);
    let trapDmg = 0;
    let heal = 0;
    const mine = this.findEmberAt(s, at.x, at.y, side);
    if (mine?.mode === 'heal') {
      heal = Math.min(MAX_HP - s.hp[side], mine.value);
      if (heal > 0) {
        s.hp[side] += heal;
        if (procs) {
          procs.push({
            name: '燐の残り火', owner: side, img: YOKAI.rinka.img,
            text: `残火の癒やし +${heal}!`,
          });
        }
      }
    }
    const foe: Side = side === 'p' ? 'e' : 'p';
    const enemyTrap = this.findEmberAt(s, at.x, at.y, foe);
    if (enemyTrap?.mode === 'trap') {
      trapDmg = enemyTrap.value;
      s.hp[side] = Math.max(0, s.hp[side] - trapDmg);
      s.embers = s.embers.filter(e => !(e.x === at.x && e.y === at.y && e.side === foe));
      if (procs) {
        procs.push({
          name: '闇への落とし口', owner: foe, img: YOKAI.tsurube.img,
          text: `落とし穴 ${trapDmg}ダメージ!`,
        });
      }
    }
    return { trapDmg, heal };
  },

  /* ------------------------------------------------------------
     行動を適用し、演出用イベント列を返す
     ------------------------------------------------------------ */
  applyAction(s: GameState, action: Action, opts: ApplyOptions = {}): GameEvent[] {
    const rng = opts.rng !== false;
    const rand = opts.rand ?? Math.random;
    const events: GameEvent[] = [];
    const side = s.turn;
    const foe: Side = side === 'p' ? 'e' : 'p';
    this.ensureMeta(s);
    this.pruneEmbers(s);
    const ply = s.plies;
    s.plies++;

    if (action.kind === 'awaken') {
      const pc = s.board[action.to.y][action.to.x]!;
      const st = s.awaken[side];
      st.used = true;
      st.gauge = 0;
      pc.awakenUntil = ply + AWAKEN_SPAN;
      s.combo[side] = 0;
      events.push({
        t: 'awaken', uid: pc.uid, id: pc.id, owner: side, to: { ...action.to },
        name: YOKAI[pc.id].awakenName || '覚醒', until: pc.awakenUntil,
      });
    } else if (action.kind === 'drop') {
      const pc: Piece = { uid: ++s.nextUid, id: action.id, owner: side, promoted: false };
      s.board[action.to.y][action.to.x] = pc;
      s.hands[side][action.id]--;
      if (s.hands[side][action.id] <= 0) delete s.hands[side][action.id];
      s.combo[side] = 0;
      events.push({ t: 'drop', uid: pc.uid, id: action.id, owner: side, to: { ...action.to } });
      const enter = this.resolveEmberEnter(s, side, action.to, events);
      if (enter.trapDmg > 0 || enter.heal > 0) {
        /* drop 自体に capture イベントはないので hunger 前に勝敗だけ見る */
      }
      if (s.hp[side] <= 0) {
        s.winner = foe; s.reason = 'hp';
        events.push({ t: 'gameover', winner: foe, reason: 'hp' });
        return events;
      }
    } else {
      const { from, to } = action;
      const pc = s.board[from.y][from.x]!;
      const victim = s.board[to.y][to.x];
      s.board[to.y][to.x] = pc;
      s.board[from.y][from.x] = null;
      events.push({ t: 'move', uid: pc.uid, from: { ...from }, to: { ...to } });

      if (victim) {
        const ended = this._resolveCapture(
          s, pc, victim, from, to, side, foe, ply, rng, rand, events, action.phaseTo, action.spawnTo,
        );
        if (ended) return events;
      } else {
        s.combo[side] = 0;
        const enter = this.resolveEmberEnter(s, side, to, events);
        if (s.hp[side] <= 0) {
          s.winner = foe; s.reason = 'hp';
          events.push({ t: 'gameover', winner: foe, reason: 'hp' });
          return events;
        }
        void enter;
      }

      /* 成り: 捕獲マスが敵陣なら、帰影/影遁後も成る */
      const def = YOKAI[pc.id];
      let cur: Pos | null = null;
      for (let y = 0; y < ROWS && !cur; y++) {
        for (let x = 0; x < COLS; x++) {
          if (s.board[y][x] === pc) { cur = { x, y }; break; }
        }
      }
      if (cur && !pc.promoted && def.promoted && def.type !== 'boss' && this.inZone(side, to.y) && !s.winner) {
        pc.promoted = true;
        events.push({ t: 'promote', uid: pc.uid, to: { ...cur }, id: pc.id, owner: side });
      }
    }

    if (!s.winner) {
      /* 飢餓の夜 */
      const idle = s.plies - s.lastCapturePly;
      if (idle > HUNGER_GRACE) {
        s.hp.p = Math.max(0, s.hp.p - HUNGER_DRAIN);
        s.hp.e = Math.max(0, s.hp.e - HUNGER_DRAIN);
        events.push({ t: 'hunger', drain: HUNGER_DRAIN, hp: { ...s.hp } });
        const pDead = s.hp.p <= 0;
        const eDead = s.hp.e <= 0;
        if (pDead && eDead) {
          s.winner = null; s.reason = 'draw';
          events.push({ t: 'gameover', winner: null, reason: 'draw' });
        } else if (pDead) {
          s.winner = 'e'; s.reason = 'hunger';
          events.push({ t: 'gameover', winner: 'e', reason: 'hunger' });
        } else if (eDead) {
          s.winner = 'p'; s.reason = 'hunger';
          events.push({ t: 'gameover', winner: 'p', reason: 'hunger' });
        }
      }
    }

    if (!s.winner && s.reason !== 'draw') {
      s.turn = foe;
      s.lastMove = { to: { ...action.to } };
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
    side: Side, foe: Side, ply: number, rng: boolean, rand: () => number, events: GameEvent[],
    phaseTo?: Pos, spawnTo?: Pos,
  ): boolean {
    const vDef = YOKAI[victim.id];
    const aDef = YOKAI[attacker.id];
    const procs: SkillProc[] = [];
    const effects: SkillEffect[] = [];

    let base = this.atkOf(attacker);
    if (this.isAwakened(attacker, ply)) {
      base = Math.round(base * AWAKEN_ATK);
      procs.push({
        name: aDef.awakenName || '覚醒', owner: side, img: aDef.img,
        text: `覚醒の力 ATK×${AWAKEN_ATK}!`,
      });
    }
    let mult = 1, bonus = 0;
    const sk = aDef.skill;
    const jammed = this.hasSkill(s, foe, 'jam');
    if (jammed && (sk.kind === 'crit' || sk.kind === 'moon' || sk.kind === 'heads')) {
      effects.push(...this.activeSkillEffects(s, foe, ['jam']));
    }
    const enraged = attacker.enraged === true;
    if (attacker.enraged) delete attacker.enraged;

    if (sk.kind === 'crit' && !jammed) {
      let chance = sk.chance;
      const feast = this.activeResonance(s, side, attacker.id);
      if (feast?.effect === 'oniFeast') chance = Math.min(1, chance + 0.15);
      if (rng) {
        if (enraged || rand() < chance) {
          mult *= sk.mult;
          procs.push({ name: sk.name, owner: side, img: aDef.img, text: `ダメージ${sk.mult}倍!` });
          if (feast?.effect === 'oniFeast') {
            procs.push({ name: `共鳴【${feast.name}】`, owner: side, img: aDef.img, text: '鬼の血が滾る! 会心率上昇中' });
          }
        }
      } else {
        mult *= enraged ? sk.mult : 1 + chance * (sk.mult - 1);
      }
    } else if (sk.kind === 'moon' && !jammed) {
      if (this.isFullMoonPly(ply) || enraged) {
        mult *= sk.mult;
        if (rng) {
          procs.push({
            name: sk.name, owner: side, img: aDef.img,
            text: enraged && !this.isFullMoonPly(ply) ? `相伝の怒り 確定会心 ×${sk.mult}!` : `満月の妖気 ×${sk.mult}!`,
          });
        }
      }
    } else if (sk.kind === 'heads') {
      const lvl = Math.min(attacker.kills ?? 0, sk.max);
      if (lvl > 0 && !jammed) {
        const headsMult = 1 + sk.step * lvl;
        mult *= headsMult;
        if (rng) {
          const label = ['', '二の首', '三の首', '四の首'][lvl] || `${lvl + 1}の首`;
          procs.push({ name: sk.name, owner: side, img: aDef.img, text: `${label} 覚醒 ×${headsMult.toFixed(1)}!` });
        }
      }
      attacker.kills = (attacker.kills ?? 0) + 1;
    } else if (sk.kind === 'legion') {
      let allies = -1;
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (s.board[y][x]?.owner === side) allies++;
        }
      }
      const legionMult = Math.min(sk.cap, sk.per * Math.max(0, allies));
      if (legionMult > 0) {
        mult *= 1 + legionMult;
        if (rng) {
          procs.push({ name: sk.name, owner: side, img: aDef.img, text: `百鬼の陣 +${Math.round(legionMult * 100)}%!` });
        }
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
    if (cMult > 1 && this.hasSkill(s, foe, 'chill')) {
      cMult = 1;
      effects.push(...this.activeSkillEffects(s, foe, ['chill']));
    }
    const defMult = this.defenseMult(s, foe);
    if (defMult < 1) effects.push(...this.activeSkillEffects(s, foe, ['aura', 'weaken']));
    let damage = Math.max(1, Math.round((base * mult + bonus) * cMult * defMult));

    /* 残火(atk): 最終ダメへ平坦加算 */
    let emberBonus = 0;
    const atkEmber = this.findEmberAt(s, to.x, to.y, side);
    if (atkEmber?.mode === 'atk') {
      emberBonus = atkEmber.value;
      damage += emberBonus;
      if (rng) {
        procs.push({
          name: '不知火の残火', owner: side, img: YOKAI.shiranui.img,
          text: `残火の追撃 +${emberBonus}!`,
        });
      }
    }

    let decoy: CaptureEvent['decoy'] = null;
    if (vDef.skill.kind === 'decoy') {
      damage = Math.max(1, Math.round(damage * 0.5));
      decoy = { name: vDef.skill.name, img: vDef.img };
    }
    s.hp[foe] = Math.max(0, s.hp[foe] - damage);

    let heal = 0;
    if (sk.kind === 'heal') {
      heal = Math.min(MAX_HP - s.hp[side], sk.amount);
      s.hp[side] += heal;
      if (rng && heal > 0) procs.push({ name: sk.name, owner: side, img: aDef.img, text: `魂力${heal}回復!` });
    }
    /* 残火(heal) on capture square */
    const healEnter = this.resolveEmberEnter(s, side, to, events, procs);
    heal += healEnter.heal;
    const trapDmg = healEnter.trapDmg;
    const hpAfterAttack = { ...s.hp };

    let counter: CaptureEvent['counter'] = null;
    if (vDef.skill.kind === 'counter') {
      const cDmg = Math.max(1, Math.round(vDef.skill.dmg * this.defenseMult(s, side)));
      s.hp[side] = Math.max(0, s.hp[side] - cDmg);
      counter = { dmg: cDmg, name: vDef.skill.name, img: vDef.img, owner: foe, hp: { ...s.hp } };
    }

    const bossCaptured = vDef.type === 'boss';
    const vanish = vDef.skill.kind === 'decoy' || vDef.skill.kind === 'explode';
    if (!bossCaptured && !vanish) {
      s.hands[side][victim.id] = (s.hands[side][victim.id] || 0) + 1;
    }

    let explode: CaptureEvent['explode'] = null;
    if (vDef.skill.kind === 'explode') {
      s.board[to.y][to.x] = null;
      explode = { name: vDef.skill.name, img: vDef.img, uid: attacker.uid };
    }

    for (const sd of ['p', 'e'] as const) {
      const st = s.awaken[sd];
      if (!st.used) st.gauge = Math.min(AWAKEN_MAX, st.gauge + 1);
    }

    let enrage: CaptureEvent['enrage'] = null;
    const vBase = baseIdOf(victim.id);
    for (const rs of RESONANCES) {
      if (rs.effect !== 'foxBond' || !rs.pair.includes(vBase)) continue;
      const partner = this.findPartnerPiece(s, foe, rs, vBase);
      if (partner && !partner.pc.enraged) {
        partner.pc.enraged = true;
        enrage = { uid: partner.pc.uid, id: partner.pc.id, owner: foe, name: rs.name };
      }
    }

    s.lastCapturePly = s.plies;

    /* 残火設置(捕獲マス。帰影してもマスに残る) */
    if (!explode && sk.kind === 'ember') {
      this.placeEmber(s, side, to, sk.mode, sk.value, sk.span);
      if (rng) {
        const label = sk.mode === 'atk' ? '残火を灯した' : sk.mode === 'heal' ? '燐火を残した' : '落とし穴を開いた';
        procs.push({ name: sk.name, owner: side, img: aDef.img, text: label });
      }
    }

    /* 送り火: 周囲の空きマスへ実駒を1体置く(省略時は元マス) */
    let spawned: Piece | null = null;
    let spawnAt: Pos | null = null;
    if (!explode && sk.kind === 'spawn') {
      const dests = this.spawnDests(s, from, to);
      const wanted = spawnTo
        ? dests.find(p => p.x === spawnTo.x && p.y === spawnTo.y)
        : dests.find(p => p.x === from.x && p.y === from.y) ?? dests[0];
      if (wanted && !s.board[wanted.y][wanted.x] && YOKAI[sk.piece]) {
        spawned = { uid: ++s.nextUid, id: sk.piece, owner: side, promoted: false };
        s.board[wanted.y][wanted.x] = spawned;
        spawnAt = { ...wanted };
        if (rng) {
          procs.push({
            name: sk.name, owner: side, img: aDef.img,
            text: `${YOKAI[sk.piece].name}を灯した`,
          });
        }
      }
    }

    /* 帰影 / 影遁 / 隱形の行き先を先に確定(演出テキストも capture に含める) */
    let escapeTo: Pos | null = null;
    if (!explode && s.board[to.y][to.x] === attacker) {
      if (sk.kind === 'retreat') {
        escapeTo = { ...from };
        if (rng) procs.push({ name: sk.name, owner: side, img: aDef.img, text: '元のマスへ戻った!' });
      } else if ((sk.kind === 'phase' || sk.kind === 'veil') && phaseTo) {
        const legal = this.escapeDests(s, from, to, sk.kind).some(
          p => p.x === phaseTo.x && p.y === phaseTo.y,
        );
        if (legal) {
          escapeTo = { ...phaseTo };
          if (rng) {
            const home = phaseTo.x === from.x && phaseTo.y === from.y;
            procs.push({
              name: sk.name, owner: side, img: aDef.img,
              text: home ? '元のマスへ戻った!' : '隣のマスへ逃げた!',
            });
          }
        }
      }
    }

    events.push({
      t: 'capture',
      attacker: { uid: attacker.uid, id: attacker.id, owner: side, promoted: attacker.promoted },
      victim: { uid: victim.uid, id: victim.id, owner: foe, promoted: victim.promoted },
      at: { ...to },
      damage, procs, effects, counter, decoy, explode, heal,
      combo: s.combo[side], comboMult: cMult,
      hp: hpAfterAttack,
      enrage,
      emberBonus: emberBonus || undefined,
      trapDmg: trapDmg || undefined,
    });

    if (spawned && spawnAt) {
      events.push({ t: 'drop', uid: spawned.uid, id: spawned.id, owner: side, to: spawnAt });
    }

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
    if (s.hp[side] <= 0) {
      s.winner = foe; s.reason = 'hp';
      events.push({ t: 'gameover', winner: foe, reason: 'hp' });
      return true;
    }
    if (explode && aDef.type === 'boss') {
      s.winner = foe; s.reason = 'explode';
      events.push({ t: 'gameover', winner: foe, reason: 'explode' });
      return true;
    }

    if (escapeTo && (escapeTo.x !== to.x || escapeTo.y !== to.y) && s.board[to.y][to.x] === attacker) {
      s.board[to.y][to.x] = null;
      s.board[escapeTo.y][escapeTo.x] = attacker;
      events.push({ t: 'move', uid: attacker.uid, from: { ...to }, to: { ...escapeTo } });
    }

    return false;
  },
};
