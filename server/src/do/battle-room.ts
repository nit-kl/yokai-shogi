import { Game } from '../../../shared/game';
import type { Action, GameEvent, GameState } from '../../../shared/game';
import type { Side } from '../../../shared/data';
import type {
  BattleEndReason, BattlePlayer, ClientBattleMessage, ClockPhase, MatchMode, ServerBattleMessage,
} from '../../../shared/battle';
import type { Env } from '../env';
import {
  BYOYOMI_MS, DISCONNECT_GRACE_MS, RULE_VERSION, TURN_MS, isLegalAction, newOnlineState, other, send,
} from './common';
import {
  EVENT_YOKAI_ID, PARTICIPATION_MIN_ACTIONS, isEventDay, jstDateString, participationTicketsFor,
} from '../../../shared/match-hour';

interface Meta {
  matchId: string;
  mode: MatchMode;
  players: Record<Side, BattlePlayer>;
  rngSeed: string;
  startedAt: string;
}
interface Timers {
  turnDeadline: number;
  phase: ClockPhase;
  disconnected: Partial<Record<Side, number>>;
}
interface Attachment { side: Side; userId: string }
interface ActionLog { side: Side; action: Action; events: GameEvent[] }
interface Runtime {
  game: GameState;
  timers: Timers;
  seq: number;
  rngState: number;
  actions: ActionLog[];
}

export class BattleRoom {
  private meta: Meta | null = null;
  private game: GameState | null = null;
  private timers: Timers | null = null;
  private seq = 0;
  private rngState = 1;
  private actions: ActionLog[] = [];

  constructor(private state: DurableObjectState, private env: Env) {
    state.blockConcurrencyWhile(() => this.restore());
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/init') return this.init(request);
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket required', { status: 426 });
    await this.ensureLoaded();
    const userId = request.headers.get('X-User-Id');
    const token = url.searchParams.get('reconnectToken');
    const side = this.sideFor(userId, token);
    if (!side) return new Response('Unauthorized', { status: 401 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    for (const old of this.state.getWebSockets(side)) try { old.close(4001, 'new connection'); } catch { /* noop */ }
    server.serializeAttachment({ side, userId: userId! } satisfies Attachment);
    this.state.acceptWebSocket(server, [side]);
    if (this.timers) {
      const wasDisconnected = this.timers.disconnected[side] !== undefined;
      delete this.timers.disconnected[side];
      await this.persistTimers();
      if (wasDisconnected) {
        for (const socket of this.state.getWebSockets(other(side))) {
          send(socket, { t: 'opponent_reconnected' });
        }
      }
    }
    send(server, {
      t: 'snapshot', state: this.game!, remainMs: this.remainMs(), phase: this.clockPhase(), seq: this.seq,
    });
    this.sendTurn();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.ensureLoaded();
    const { side } = ws.deserializeAttachment() as Attachment;
    let msg: ClientBattleMessage;
    try { msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); }
    catch { send(ws, { t: 'error', code: 'VALIDATION', message: 'JSONが不正です' }); return; }
    if (!this.game || this.game.winner || !this.timers) {
      send(ws, { t: 'error', code: 'GAME_ENDED', message: '対局は終了しています' }); return;
    }
    if (msg.t === 'resign') { await this.finish(other(side), 'resign'); return; }
    if (msg.t !== 'action') {
      send(ws, { t: 'error', code: 'VALIDATION', message: '対局中に使えない操作です' }); return;
    }
    if (await this.enforceClock()) return;
    if (this.game.turn !== side) {
      send(ws, { t: 'error', code: 'NOT_YOUR_TURN', message: 'あなたの手番ではありません' }); return;
    }
    if (!isLegalAction(this.game, side, msg.action)) {
      send(ws, { t: 'error', code: 'ILLEGAL_ACTION', message: '合法手ではありません' }); return;
    }

    const events = Game.applyAction(this.game, msg.action, { rand: () => this.nextRandom() });
    this.seq++;
    this.actions.push({ side, action: msg.action, events });
    this.timers.turnDeadline = Date.now() + TURN_MS;
    this.timers.phase = 'main';
    await this.persistRuntime();
    await this.scheduleAlarm();
    this.broadcast({
      t: 'snapshot', state: this.game, remainMs: this.remainMs(), phase: this.clockPhase(), seq: this.seq,
    });
    this.broadcast({ t: 'events', seq: this.seq, events });
    if (this.game.reason === 'draw' || (this.game.reason === 'hunger' && !this.game.winner)) {
      await this.finish('draw', 'draw');
      return;
    }
    if (this.game.winner) {
      const reason = this.game.reason === 'hunger' ? 'hp' : this.game.reason!;
      await this.finish(this.game.winner, reason);
      return;
    }
    if (this.seq >= 300) { await this.finish('draw', 'draw'); return; }
    this.sendTurn();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.markDisconnected(ws);
  }
  async webSocketError(ws: WebSocket): Promise<void> {
    await this.markDisconnected(ws);
  }

  async alarm(): Promise<void> {
    await this.ensureLoaded();
    if (!this.game || this.game.winner || !this.timers) return;
    const now = Date.now();
    const expired = (['p', 'e'] as const).filter(side => (this.timers!.disconnected[side] ?? Infinity) <= now);
    if (expired.length === 2) { await this.finish('draw', 'draw'); return; }
    if (expired.length === 1) { await this.finish(other(expired[0]), 'disconnect'); return; }
    if (this.timers.turnDeadline <= now) {
      if (await this.enforceClock()) return;
    }
    await this.scheduleAlarm();
  }

  private async init(request: Request): Promise<Response> {
    if (await this.state.storage.get('meta')) return new Response(null, { status: 204 });
    const input = await request.json<{ matchId: string; mode: MatchMode; players: Record<Side, BattlePlayer> }>();
    this.meta = {
      matchId: input.matchId, mode: input.mode, players: input.players,
      rngSeed: crypto.randomUUID(), startedAt: new Date().toISOString(),
    };
    this.rngState = this.seedNumber(this.meta.rngSeed);
    this.game = newOnlineState(input.players.p.formation, input.players.e.formation);
    this.timers = { turnDeadline: Date.now() + TURN_MS, phase: 'main', disconnected: {} };
    await this.state.storage.put({
      meta: this.meta,
      runtime: this.runtime(),
      flushed: false,
    });
    await this.scheduleAlarm();
    return new Response(null, { status: 201 });
  }

  private async restore(): Promise<void> {
    const data = await this.state.storage.get(['meta', 'runtime']);
    this.meta = (data.get('meta') as Meta | undefined) ?? null;
    const runtime = data.get('runtime') as Runtime | undefined;
    this.game = runtime?.game ?? null;
    this.timers = runtime?.timers ?? null;
    if (this.timers && this.timers.phase !== 'byoyomi') this.timers.phase = 'main';
    this.seq = runtime?.seq ?? 0;
    this.rngState = runtime?.rngState ?? 1;
    this.actions = runtime?.actions ?? [];
  }
  private async ensureLoaded(): Promise<void> { if (!this.meta) await this.restore(); }

  private sideFor(userId: string | null, token: string | null): Side | null {
    if (!this.meta || !userId || !token) return null;
    for (const side of ['p', 'e'] as const) {
      const p = this.meta.players[side];
      if (p.userId === userId && p.reconnectToken === token) return side;
    }
    return null;
  }

  private seedNumber(seed: string): number {
    let value = 2166136261;
    for (const ch of seed) value = Math.imul(value ^ ch.charCodeAt(0), 16777619);
    return value >>> 0 || 1;
  }
  private nextRandom(): number {
    let x = this.rngState;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.rngState = x >>> 0;
    return this.rngState / 0x1_0000_0000;
  }

  private broadcast(message: ServerBattleMessage): void {
    for (const ws of this.state.getWebSockets()) send(ws, message);
  }
  private sendTurn(): void {
    if (!this.game || this.game.winner) return;
    for (const ws of this.state.getWebSockets(this.game.turn)) {
      send(ws, { t: 'your_turn', remainMs: this.remainMs(), phase: this.clockPhase() });
    }
  }
  private remainMs(): number { return Math.max(0, (this.timers?.turnDeadline ?? Date.now()) - Date.now()); }
  private clockPhase(): ClockPhase { return this.timers?.phase === 'byoyomi' ? 'byoyomi' : 'main'; }

  /** 時計を進め、終局なら true。本時間切れは秒読みへ遷移し false(対局継続) */
  private async enforceClock(): Promise<boolean> {
    if (!this.game || this.game.winner || !this.timers) return true;
    const now = Date.now();
    if (now < this.timers.turnDeadline) return false;
    if (this.timers.phase === 'main') {
      this.timers.phase = 'byoyomi';
      this.timers.turnDeadline += BYOYOMI_MS;
      if (now >= this.timers.turnDeadline) {
        await this.finish(other(this.game.turn), 'timeout');
        return true;
      }
      await this.persistRuntime();
      await this.scheduleAlarm();
      this.broadcast({ t: 'clock', remainMs: this.remainMs(), phase: 'byoyomi' });
      this.sendTurn();
      return false;
    }
    await this.finish(other(this.game.turn), 'timeout');
    return true;
  }

  private async markDisconnected(ws: WebSocket): Promise<void> {
    await this.ensureLoaded();
    if (!this.timers || !this.game || this.game.winner) return;
    const { side } = ws.deserializeAttachment() as Attachment;
    if (this.state.getWebSockets(side).some(socket => socket !== ws)) return;
    this.timers.disconnected[side] = Date.now() + DISCONNECT_GRACE_MS;
    await this.persistTimers();
    for (const socket of this.state.getWebSockets(other(side))) {
      send(socket, { t: 'opponent_disconnected', graceMs: DISCONNECT_GRACE_MS });
    }
  }

  private async persistTimers(): Promise<void> {
    await this.persistRuntime();
    await this.scheduleAlarm();
  }
  private runtime(): Runtime {
    return {
      game: this.game!,
      timers: this.timers!,
      seq: this.seq,
      rngState: this.rngState,
      actions: this.actions,
    };
  }
  private persistRuntime(): Promise<void> {
    return this.state.storage.put('runtime', this.runtime());
  }
  private async scheduleAlarm(): Promise<void> {
    if (!this.timers) return;
    const deadlines = [this.timers.turnDeadline, ...Object.values(this.timers.disconnected)];
    await this.state.storage.setAlarm(Math.min(...deadlines));
  }

  private async finish(winner: Side | 'draw', reason: BattleEndReason): Promise<void> {
    if (!this.meta || !this.game) return;
    if (winner !== 'draw') {
      this.game.winner = winner;
      if (reason === 'boss' || reason === 'hp' || reason === 'explode' || reason === 'nomoves' || reason === 'resign') {
        this.game.reason = reason;
      }
    }
    await this.persistRuntime();
    const rewards = await this.flush(winner, reason);
    const participation = await this.grantParticipation();
    this.env.METRICS?.writeDataPoint({
      blobs: ['match_end', this.meta.mode, reason, winner],
      doubles: [Date.now() - Date.parse(this.meta.startedAt), this.seq],
      indexes: [this.meta.matchId],
    });
    for (const side of ['p', 'e'] as const) {
      const player = this.meta.players[side];
      const reward = winner === side ? rewards[side] : 0;
      const message: ServerBattleMessage = {
        t: 'game_end', winner, reason,
        reward: {
          tickets: reward,
          participation: participation[side].tickets,
          eventYokai: participation[side].yokaiId,
        },
        rating: { before: player.rating, after: player.rating },
      };
      for (const ws of this.state.getWebSockets(side)) send(ws, message);
    }
  }

  /* 逢魔が時のランダムマッチ完走報酬(勝敗不問・1日1回)+土曜対戦会の限定妖怪(doc 18)。
     1日1回は participation_logs の PK(user_id, date) で担保する:
     プレーンINSERTを含むbatchが衝突で丸ごと失敗 = 本日付与済み(冪等) */
  private async grantParticipation(): Promise<Record<Side, { tickets: number; yokaiId: string | null }>> {
    const result: Record<Side, { tickets: number; yokaiId: string | null }> = {
      p: { tickets: 0, yokaiId: null }, e: { tickets: 0, yokaiId: null },
    };
    if (!this.meta || this.meta.mode !== 'random') return result;
    const minActions = Number(this.env.PARTICIPATION_MIN_ACTIONS ?? '') || PARTICIPATION_MIN_ACTIONS;
    if (this.seq < minActions) return result;
    const startedAt = new Date(Date.parse(this.meta.startedAt));
    const date = jstDateString(startedAt);
    const tickets = participationTicketsFor(startedAt);
    const eventYokai = isEventDay(startedAt) ? EVENT_YOKAI_ID : null;
    for (const side of ['p', 'e'] as const) {
      const userId = this.meta.players[side].userId;
      try {
        const profile = await this.env.DB.prepare('SELECT tickets FROM user_profiles WHERE user_id = ?1')
          .bind(userId).first<{ tickets: number }>();
        if (!profile) continue;
        const grant = Math.min(tickets, Math.max(0, 999 - profile.tickets));
        const owned = eventYokai
          ? await this.env.DB.prepare('SELECT 1 AS x FROM user_yokai WHERE user_id = ?1 AND yokai_id = ?2')
            .bind(userId, eventYokai).first()
          : null;
        const isNew = !!eventYokai && !owned;
        const stmts = [
          this.env.DB.prepare(
            'INSERT INTO participation_logs (user_id, date, tickets, yokai_id, yokai_new, match_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
          ).bind(userId, date, grant, eventYokai, isNew ? 1 : 0, this.meta.matchId),
        ];
        if (grant > 0) {
          stmts.push(
            this.env.DB.prepare('UPDATE user_profiles SET tickets = tickets + ?2 WHERE user_id = ?1')
              .bind(userId, grant),
            this.env.DB.prepare(
              "INSERT INTO currency_logs (user_id, currency, delta, balance, reason, ref_id) VALUES (?1, 'tickets', ?2, ?3, 'event_participation', ?4)",
            ).bind(userId, grant, profile.tickets + grant, this.meta.matchId),
          );
        }
        if (isNew) {
          stmts.push(
            this.env.DB.prepare('INSERT INTO user_yokai (user_id, yokai_id) VALUES (?1, ?2)').bind(userId, eventYokai),
          );
        }
        await this.env.DB.batch(stmts);
        result[side] = { tickets: grant, yokaiId: isNew ? eventYokai : null };
      } catch {
        /* PK(user_id, date)衝突 = 本日付与済み。何も付与しない */
      }
    }
    return result;
  }

  private async flush(winner: Side | 'draw', reason: BattleEndReason): Promise<Record<Side, number>> {
    const rewards: Record<Side, number> = { p: 0, e: 0 };
    if (!this.meta) return rewards;
    if (await this.state.storage.get<boolean>('flushed')) return rewards;
    const existing = await this.env.DB.prepare('SELECT id FROM matches WHERE id = ?1').bind(this.meta.matchId).first();
    if (existing) { await this.state.storage.put('flushed', true); return rewards; }
    const stmts = [
      this.env.DB.prepare(
        `INSERT INTO matches
         (id, mode, p_user_id, e_user_id, p_formation, e_formation, winner, reason, rng_seed, rule_version, started_at, ended_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
      ).bind(
        this.meta.matchId, this.meta.mode, this.meta.players.p.userId, this.meta.players.e.userId,
        JSON.stringify(this.meta.players.p.formation), JSON.stringify(this.meta.players.e.formation),
        winner, reason, this.meta.rngSeed, RULE_VERSION, this.meta.startedAt, new Date().toISOString(),
      ),
    ];
    for (const [index, log] of this.actions.entries()) {
      const seq = index + 1;
      stmts.push(this.env.DB.prepare(
        'INSERT INTO match_actions (match_id, seq, side, action, events) VALUES (?1, ?2, ?3, ?4, ?5)',
      ).bind(this.meta.matchId, seq, log.side, JSON.stringify(log.action), JSON.stringify(log.events)));
    }
    if (winner !== 'draw') {
      const loser = other(winner);
      stmts.push(
        this.env.DB.prepare('UPDATE user_profiles SET wins = wins + 1 WHERE user_id = ?1').bind(this.meta.players[winner].userId),
        this.env.DB.prepare('UPDATE user_profiles SET losses = losses + 1 WHERE user_id = ?1').bind(this.meta.players[loser].userId),
      );
      if (this.meta.mode === 'random' && !['disconnect', 'timeout'].includes(reason)) {
        const profile = await this.env.DB.prepare(
          'SELECT tickets, online_win_reward_count FROM user_profiles WHERE user_id = ?1',
        ).bind(this.meta.players[winner].userId).first<{ tickets: number; online_win_reward_count: number }>();
        if (profile && profile.online_win_reward_count < 5 && profile.tickets < 999) {
          rewards[winner] = 1;
          stmts.push(
            this.env.DB.prepare(
              'UPDATE user_profiles SET tickets = tickets + 1, online_win_reward_count = online_win_reward_count + 1 WHERE user_id = ?1',
            ).bind(this.meta.players[winner].userId),
            this.env.DB.prepare(
              "INSERT INTO currency_logs (user_id, currency, delta, balance, reason, ref_id) VALUES (?1, 'tickets', 1, ?2, 'win_reward', ?3)",
            ).bind(this.meta.players[winner].userId, profile.tickets + 1, this.meta.matchId),
          );
        }
      }
    }
    await this.env.DB.batch(stmts);
    await this.state.storage.put('flushed', true);
    return rewards;
  }
}
