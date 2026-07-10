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
export type GameOverReason = 'boss' | 'hp' | 'explode' | 'nomoves' | 'resign';

export interface AwakenState { gauge: number; used: boolean }

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
}

/* 覚醒(SSR必殺技): 駒の取り合いで両陣営に+1、満タンで手番を消費して自軍SSRを覚醒できる */
export const AWAKEN_MAX = 6;   // ゲージ満タンに必要な取り合い回数
export const AWAKEN_SPAN = 6;  // 発動から6手(自分の手番3回)有効
export const AWAKEN_ATK = 1.5; // 覚醒中のATK倍率

/* 月齢(moonスキル): 1夜=2手(両者1手ずつ)、4夜周期の4夜目が満月 */
export const MOON_CYCLE = 4;

export type Action =
  | { kind: 'move'; from: Pos; to: Pos }
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
}

export type GameEvent =
  | { t: 'move'; uid: number; from: Pos; to: Pos }
  | { t: 'drop'; uid: number; id: string; owner: Side; to: Pos }
  | { t: 'promote'; uid: number; to: Pos; id: string; owner: Side }
  | { t: 'awaken'; uid: number; id: string; owner: Side; to: Pos; name: string; until: number }
  | CaptureEvent
  | { t: 'gameover'; winner: Side; reason: GameOverReason };

export interface ApplyOptions {
  /** false で確率スキルを期待値計算(AI読み用)。既定 true */
  rng?: boolean;
  /** 乱数の注入(サーバーは対局シード由来のPRNG、クライアントは既定の Math.random) */
  rand?: () => number;
}

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
    };
  },

  /* 旧スナップショット(plies/awaken導入前)を正規化。復元された進行中対局との互換用 */
  ensureMeta(s: GameState): void {
    if (typeof s.plies !== 'number') s.plies = 0;
    if (!s.awaken) s.awaken = { p: { gauge: 0, used: false }, e: { gauge: 0, used: false } };
  },

  /* ---------- 月齢(moonスキル) ---------- */
  /* ply(適用前の手数)が属する夜の月齢インデックス(0..MOON_CYCLE-1、最終値=満月) */
  moonPhaseOfPly(ply: number): number { return Math.floor(ply / 2) % MOON_CYCLE; },
  /* 次に指す手の月齢(HUD表示用) */
  moonPhase(s: GameState): number { return this.moonPhaseOfPly(s.plies ?? 0); },
  isFullMoonPly(ply: number): boolean { return this.moonPhaseOfPly(ply) === MOON_CYCLE - 1; },
  /* 満月まであと何夜か(0=今が満月) */
  nightsUntilFullMoon(s: GameState): number {
    return (MOON_CYCLE - 1) - this.moonPhase(s);
  },

  /* ---------- 覚醒(SSR必殺技) ---------- */
  awakenReady(s: GameState, side: Side): boolean {
    const st = s.awaken?.[side];
    return !!st && !st.used && st.gauge >= AWAKEN_MAX;
  },
  isAwakened(pc: Piece, ply: number): boolean {
    return pc.awakenUntil !== undefined && ply <= pc.awakenUntil;
  },
  /* side の覚醒対象(盤上の自軍SSR)一覧 */
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
  /* side の盤上で id の共鳴相方が生きていれば、その共鳴定義を返す */
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
  /* 盤上から相方の駒を探す(foxBondの激怒付与用) */
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
    if (this.awakenReady(s, side)) {
      for (const t of this.awakenTargets(s, side)) acts.push({ kind: 'awaken', to: t });
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
    this.ensureMeta(s);
    const ply = s.plies; // この手の手数(月齢・覚醒期限の基準)
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
    } else {
      const { from, to } = action;
      const pc = s.board[from.y][from.x]!;
      const victim = s.board[to.y][to.x];
      s.board[to.y][to.x] = pc;
      s.board[from.y][from.x] = null;
      events.push({ t: 'move', uid: pc.uid, from: { ...from }, to: { ...to } });

      if (victim) {
        const ended = this._resolveCapture(s, pc, victim, from, to, side, foe, ply, rng, rand, events);
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
    side: Side, foe: Side, ply: number, rng: boolean, rand: () => number, events: GameEvent[],
  ): boolean {
    const vDef = YOKAI[victim.id];
    const aDef = YOKAI[attacker.id];
    const procs: SkillProc[] = [];
    const effects: SkillEffect[] = [];

    /* --- ダメージ計算 --- */
    let base = this.atkOf(attacker);
    /* 覚醒中はATK1.5倍 */
    if (this.isAwakened(attacker, ply)) {
      base = Math.round(base * AWAKEN_ATK);
      procs.push({
        name: aDef.awakenName || '覚醒', owner: side, img: aDef.img,
        text: `覚醒の力 ATK×${AWAKEN_ATK}!`,
      });
    }
    let mult = 1, bonus = 0;
    const sk = aDef.skill;
    /* 妨(jam): 砂かけ婆がいる側への攻撃は会心系スキル(crit/moon/heads)が封じられる */
    const jammed = this.hasSkill(s, foe, 'jam');
    if (jammed && (sk.kind === 'crit' || sk.kind === 'moon' || sk.kind === 'heads')) {
      effects.push(...this.activeSkillEffects(s, foe, ['jam']));
    }
    /* foxBond(妖狐相伝): 激怒中は次の会心が確定(この攻撃で消費) */
    const enraged = attacker.enraged === true;
    if (attacker.enraged) delete attacker.enraged;

    if (sk.kind === 'crit' && !jammed) {
      /* oniFeast(鬼の宴): 相方が盤上にいる間、会心率+15% */
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
        mult *= enraged ? sk.mult : 1 + chance * (sk.mult - 1); // 期待値
      }
    } else if (sk.kind === 'moon' && !jammed) {
      /* 満月の夜(または激怒中)は会心確定。それ以外は不発 — 運でなく読みで出す */
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
      /* 撃破数だけ首が目覚めて成長(jamで封じられるが撃破数は貯まる) */
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
      /* 盤上の味方数(自身を除く)で与ダメ加算。妨害不能だが軍勢を削られると弱る */
      let allies = -1; // 自身を除く
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
    /* 妨(chill): 雪女がいる側へのコンボ倍率は無効 */
    if (cMult > 1 && this.hasSkill(s, foe, 'chill')) {
      cMult = 1;
      effects.push(...this.activeSkillEffects(s, foe, ['chill']));
    }
    const defMult = this.defenseMult(s, foe);
    if (defMult < 1) effects.push(...this.activeSkillEffects(s, foe, ['aura', 'weaken']));
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

    /* --- 覚醒ゲージ: 駒の取り合いで両陣営に+1(使用済みの側は溜まらない) --- */
    for (const sd of ['p', 'e'] as const) {
      const st = s.awaken[sd];
      if (!st.used) st.gauge = Math.min(AWAKEN_MAX, st.gauge + 1);
    }

    /* --- foxBond(妖狐相伝): 相方を取られた狐が激怒し、次の攻撃が確定会心 --- */
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

    events.push({
      t: 'capture',
      attacker: { uid: attacker.uid, id: attacker.id, owner: side, promoted: attacker.promoted },
      victim: { uid: victim.uid, id: victim.id, owner: foe, promoted: victim.promoted },
      at: { ...to },
      damage, procs, effects, counter, decoy, explode, heal,
      combo: s.combo[side], comboMult: cMult,
      hp: hpAfterAttack,
      enrage,
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
