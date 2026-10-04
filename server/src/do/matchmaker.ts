import type { MatchMode, BattlePlayer, ClientBattleMessage, RoomSeatView, ServerBattleMessage } from '../../../shared/battle';
import { SHADOW_WAIT_JITTER_MS, SHADOW_WAIT_MS } from '../../../shared/battle';
import type { Env } from '../env';
import { isMatchHour } from '../../../shared/match-hour';
import { loadPlayer, loadShadowOpponent, randomCode, send } from './common';

interface Attachment { userId: string }
interface QueueEntry { userId: string; joinedAt: number; shadowAt: number }
interface FriendRoom {
  code: string;
  hostId: string;
  guestId: string | null;
  hostReady: boolean;
  guestReady: boolean;
}

type MatchCreationResult =
  | { status: 'created' }
  | { status: 'invalid'; userIds: string[] }
  | { status: 'failed' };

export class Matchmaker {
  private queue: QueueEntry[] = [];
  private sockets = new Map<string, WebSocket>();
  /** フレンドルームの更新を直列化し、準備完了の二重開戦を防ぐ */
  private roomChain: Promise<void> = Promise.resolve();
  private startingRooms = new Set<string>();

  constructor(private state: DurableObjectState, private env: Env) {
    state.blockConcurrencyWhile(async () => {
      const stored = (await state.storage.get<(string | QueueEntry)[]>('queue')) ?? [];
      const now = Date.now();
      this.queue = stored.map(entry => {
        if (typeof entry === 'string') {
          return { userId: entry, joinedAt: now, shadowAt: now + this.shadowWaitMs() };
        }
        return {
          userId: entry.userId,
          joinedAt: entry.joinedAt,
          shadowAt: entry.shadowAt ?? entry.joinedAt + this.shadowWaitMs(),
        };
      });
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket required', { status: 426 });
    const userId = request.headers.get('X-User-Id');
    if (!userId) return new Response('Unauthorized', { status: 401 });

    const old = this.socketFor(userId);
    if (old) try { old.close(4001, 'new connection'); } catch { /* noop */ }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ userId } satisfies Attachment);
    this.state.acceptWebSocket(server);
    this.sockets.set(userId, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const { userId } = ws.deserializeAttachment() as Attachment;
    this.sockets.set(userId, ws);
    let msg: ClientBattleMessage;
    try { msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); }
    catch { send(ws, { t: 'error', code: 'VALIDATION', message: 'JSONが不正です' }); return; }

    if (msg.t === 'join_queue') {
      /* 既定はいつでもキュー可。緊急時のみ MATCH_HOUR_ENFORCE=1 で逢魔が時に閉じる */
      if (this.env.MATCH_HOUR_ENFORCE === '1' && !isMatchHour()) {
        send(ws, {
          t: 'error', code: 'MATCH_HOUR_CLOSED',
          message: 'ただいまメンテナンス中です。集まりやすい時間（毎日20:00〜22:00）に再度お試しください',
        });
        return;
      }
      if (!this.queue.some(entry => entry.userId === userId)) {
        const now = Date.now();
        this.queue.push({ userId, joinedAt: now, shadowAt: now + this.shadowWaitMs() });
        this.writeQueueMetric('queue_join', userId, 0, this.queue.length);
      }
      await this.persistQueue();
      send(ws, { t: 'queued', position: this.queue.findIndex(entry => entry.userId === userId) + 1 });
      await this.pairQueue();
      await this.convertDueShadows();
      await this.scheduleShadowAlarm();
      return;
    }
    if (msg.t === 'request_shadow') {
      if (this.env.MATCH_HOUR_ENFORCE === '1' && !isMatchHour()) {
        send(ws, {
          t: 'error', code: 'MATCH_HOUR_CLOSED',
          message: 'ただいまメンテナンス中です。集まりやすい時間（毎日20:00〜22:00）に再度お試しください',
        });
        return;
      }
      if (!this.queue.some(entry => entry.userId === userId)) {
        const now = Date.now();
        this.queue.push({ userId, joinedAt: now, shadowAt: now });
        this.writeQueueMetric('queue_join', userId, 0, this.queue.length);
      }
      await this.pairQueue();
      if (this.queue.some(entry => entry.userId === userId)) {
        await this.createShadowMatch(userId);
      }
      await this.persistQueue();
      await this.scheduleShadowAlarm();
      return;
    }
    if (msg.t === 'leave_queue') {
      this.removeFromQueue(userId, msg.reason === 'timeout' ? 'timeout' : 'cancel');
      await this.persistQueue();
      await this.scheduleShadowAlarm();
      return;
    }
    if (msg.t === 'create_room' || msg.t === 'join_room' || msg.t === 'rejoin_room'
      || msg.t === 'leave_room' || msg.t === 'room_ready' || msg.t === 'kick_guest' || msg.t === 'room_sync') {
      await this.enqueueRoom(() => this.onRoomMessage(ws, userId, msg));
      return;
    }
    send(ws, { t: 'error', code: 'VALIDATION', message: '待機中に使えない操作です' });
  }

  webSocketClose(ws: WebSocket): void {
    const { userId } = ws.deserializeAttachment() as Attachment;
    const current = this.sockets.get(userId);
    // 同一アカウントの新接続が既にある場合、古い接続のcloseで新接続をキューから消さない。
    if (current && current !== ws) return;
    if (current === ws) this.sockets.delete(userId);
    this.removeFromQueue(userId, 'disconnect');
    this.state.waitUntil(this.persistQueue()
      .then(() => this.scheduleShadowAlarm())
      .then(() => this.enqueueRoom(() => this.onRoomDisconnect(userId))));
  }

  webSocketError(ws: WebSocket): void { this.webSocketClose(ws); }

  async alarm(): Promise<void> {
    await this.pairQueue();
    await this.convertDueShadows();
    await this.scheduleShadowAlarm();
  }

  private async pairQueue(): Promise<void> {
    this.pruneDisconnected();
    while (this.queue.length >= 2) {
      const [p, e] = this.queue;
      const result = await this.createMatch(p.userId, e.userId, 'random');
      if (result.status === 'created') {
        this.removeFromQueue(p.userId, 'matched');
        this.removeFromQueue(e.userId, 'matched');
        this.pruneDisconnected();
        continue;
      }
      if (result.status === 'invalid') {
        for (const id of result.userIds) this.removeFromQueue(id, 'invalid');
        this.pruneDisconnected();
        continue;
      }
      // BattleRoomの一時障害では正常な待機者を失わせない。
      break;
    }
    await this.persistQueue();
  }

  private async convertDueShadows(): Promise<void> {
    const now = Date.now();
    const due = this.queue.filter(entry => entry.shadowAt <= now).map(entry => entry.userId);
    for (const userId of due) {
      if (!this.queue.some(entry => entry.userId === userId)) continue;
      await this.createShadowMatch(userId);
    }
    await this.persistQueue();
  }

  private async createShadowMatch(userId: string): Promise<void> {
    const pSocket = this.socketFor(userId);
    const p = await loadPlayer(this.env.DB, userId);
    if (!p || !pSocket) {
      this.removeFromQueue(userId, 'invalid');
      return;
    }
    const shadow = await loadShadowOpponent(this.env.DB, userId);
    const result = await this.startBattle(p, pSocket, shadow, 'shadow', true);
    if (result.status === 'created') this.removeFromQueue(userId, 'shadow');
  }

  private async createMatch(pId: string, eId: string, mode: MatchMode): Promise<MatchCreationResult> {
    const [p, e] = await Promise.all([loadPlayer(this.env.DB, pId), loadPlayer(this.env.DB, eId)]);
    const pSocket = this.socketFor(pId);
    const eSocket = this.socketFor(eId);
    if (!p || !e) return {
      status: 'invalid',
      userIds: [...(!p ? [pId] : []), ...(!e ? [eId] : [])],
    };
    if (!pSocket || !eSocket) return { status: 'invalid', userIds: [
      ...(!pSocket ? [pId] : []), ...(!eSocket ? [eId] : []),
    ] };
    return this.startBattle(p, pSocket, e, mode, false, eId, eSocket);
  }

  private async startBattle(
    p: BattlePlayer, pSocket: WebSocket, e: BattlePlayer,
    mode: MatchMode, shadow: boolean, eId?: string, eSocket?: WebSocket,
  ): Promise<MatchCreationResult> {
    const matchId = crypto.randomUUID();
    const stub = this.env.BATTLE.get(this.env.BATTLE.idFromName(matchId));
    const response = await stub.fetch('https://battle/init', {
      method: 'POST',
      body: JSON.stringify({ matchId, mode, players: { p, e } }),
    });
    if (!response.ok) {
      const error: ServerBattleMessage = { t: 'error', code: 'MATCH_FAILED', message: '対局を開始できませんでした' };
      send(pSocket, error);
      if (eSocket) send(eSocket, error);
      this.env.METRICS?.writeDataPoint({ blobs: ['match_failed', mode], doubles: [1] });
      return { status: 'failed' };
    }
    this.env.METRICS?.writeDataPoint({
      blobs: ['match_found', mode],
      doubles: [1],
      indexes: [matchId],
    });
    send(pSocket, {
      t: 'match_found', matchId, reconnectToken: p.reconnectToken, side: 'p', mode,
      opponent: { name: e.name, rating: e.rating, bossId: e.bossId },
      formations: { p: p.formation, e: e.formation },
      ...(shadow ? { shadow: true } : {}),
    });
    if (eSocket && eId) {
      send(eSocket, {
        t: 'match_found', matchId, reconnectToken: e.reconnectToken, side: 'e', mode,
        opponent: { name: p.name, rating: p.rating, bossId: p.bossId },
        formations: { p: p.formation, e: e.formation },
      });
    }
    return { status: 'created' };
  }

  private enqueueRoom(fn: () => Promise<void>): Promise<void> {
    const run = this.roomChain.then(fn, fn);
    this.roomChain = run.then(() => {}, () => {});
    return run;
  }

  private async onRoomMessage(ws: WebSocket, userId: string, msg: ClientBattleMessage): Promise<void> {
    if (msg.t === 'create_room') return this.createFriendRoom(userId);
    if (msg.t === 'join_room') return this.joinFriendRoom(ws, userId, String(msg.code || ''));
    if (msg.t === 'rejoin_room') return this.rejoinFriendRoom(ws, userId);
    if (msg.t === 'leave_room') return this.leaveFriendRoom(userId);
    if (msg.t === 'kick_guest') return this.kickGuest(ws, userId);
    if (msg.t === 'room_ready') return this.setRoomReady(ws, userId, !!msg.ready);
    if (msg.t === 'room_sync') {
      const room = await this.roomFor(userId);
      if (!room) {
        send(ws, { t: 'error', code: 'ROOM_NOT_FOUND', message: '参加できるルームがありません' });
        return;
      }
      await this.pushRoom(room);
    }
  }

  private async onRoomDisconnect(userId: string): Promise<void> {
    const room = await this.roomFor(userId);
    if (!room) return;
    if (room.hostId === userId) room.hostReady = false;
    else room.guestReady = false;
    await this.saveRoom(room);
    await this.pushRoom(room);
  }

  private async createFriendRoom(userId: string): Promise<void> {
    this.removeFromQueue(userId, 'cancel');
    const existing = await this.roomFor(userId);
    if (existing?.hostId === userId) {
      existing.hostReady = false;
      await this.saveRoom(existing);
      await this.pushRoom(existing);
      return;
    }
    if (existing?.guestId === userId) await this.clearGuest(existing, 'left', userId);
    const code = await this.uniqueRoomCode();
    const room: FriendRoom = { code, hostId: userId, guestId: null, hostReady: false, guestReady: false };
    await this.saveRoom(room);
    await this.state.storage.put(`userRoom:${userId}`, code);
    await this.pushRoom(room);
  }

  private async joinFriendRoom(ws: WebSocket, userId: string, rawCode: string): Promise<void> {
    const code = rawCode.trim().toUpperCase();
    const room = await this.loadRoom(code);
    if (!room) {
      send(ws, { t: 'error', code: 'ROOM_NOT_FOUND', message: '参加できるルームがありません' });
      return;
    }
    if (room.hostId === userId || room.guestId === userId) {
      await this.pushRoom(room);
      return;
    }
    if (room.guestId && this.socketFor(room.guestId)) {
      send(ws, { t: 'error', code: 'ROOM_FULL', message: 'このルームはもう一方が参加中です' });
      return;
    }
    this.removeFromQueue(userId, 'cancel');
    const previous = await this.roomFor(userId);
    if (previous && previous.code !== room.code) {
      if (previous.hostId === userId) await this.closeRoom(previous, 'left', userId);
      else await this.clearGuest(previous, 'left', userId);
    }
    if (room.guestId && room.guestId !== userId) {
      await this.state.storage.delete(`userRoom:${room.guestId}`);
    }
    room.guestId = userId;
    room.hostReady = false;
    room.guestReady = false;
    await this.saveRoom(room);
    await this.state.storage.put(`userRoom:${userId}`, room.code);
    await this.pushRoom(room);
  }

  private async rejoinFriendRoom(ws: WebSocket, userId: string): Promise<void> {
    const room = await this.roomFor(userId);
    if (!room) {
      send(ws, { t: 'error', code: 'ROOM_NOT_FOUND', message: '参加できるルームがありません' });
      return;
    }
    if (room.hostId === userId) room.hostReady = false;
    else room.guestReady = false;
    await this.saveRoom(room);
    await this.pushRoom(room);
  }

  private async leaveFriendRoom(userId: string): Promise<void> {
    const room = await this.roomFor(userId);
    if (!room) {
      const ws = this.socketFor(userId);
      if (ws) send(ws, { t: 'room_closed', reason: 'left' });
      return;
    }
    if (room.hostId === userId) await this.closeRoom(room, 'left');
    else await this.clearGuest(room, 'left');
  }

  private async kickGuest(ws: WebSocket, userId: string): Promise<void> {
    const room = await this.roomFor(userId);
    if (!room || room.hostId !== userId) {
      send(ws, { t: 'error', code: 'VALIDATION', message: '席を空けられるのはホストだけです' });
      return;
    }
    if (!room.guestId) return;
    await this.clearGuest(room, 'kicked');
  }

  private async setRoomReady(ws: WebSocket, userId: string, ready: boolean): Promise<void> {
    const room = await this.roomFor(userId);
    if (!room) {
      send(ws, { t: 'error', code: 'ROOM_NOT_FOUND', message: '参加できるルームがありません' });
      return;
    }
    const isHost = room.hostId === userId;
    if (!isHost && room.guestId !== userId) return;
    if (ready && !room.guestId) {
      send(ws, { t: 'error', code: 'VALIDATION', message: '相手の参加を待っています' });
      return;
    }
    if (ready && isHost && !this.socketFor(room.hostId)) return;
    if (ready && !isHost && room.guestId && !this.socketFor(room.guestId)) return;
    if (isHost) room.hostReady = ready;
    else room.guestReady = ready;
    await this.saveRoom(room);
    if (!(room.hostReady && room.guestReady && room.guestId) || this.startingRooms.has(room.code)) {
      await this.pushRoom(room);
      return;
    }
    this.startingRooms.add(room.code);
    const guestId = room.guestId;
    room.hostReady = false;
    room.guestReady = false;
    try {
      await this.saveRoom(room);
      const result = await this.createMatch(room.hostId, guestId, 'friend');
      if (result.status !== 'created') await this.pushRoom(room);
    } finally {
      this.startingRooms.delete(room.code);
    }
  }

  private async closeRoom(room: FriendRoom, reason: 'left' | 'kicked', silentUserId?: string): Promise<void> {
    await this.state.storage.delete(`room:${room.code}`);
    await this.state.storage.delete(`userRoom:${room.hostId}`);
    if (room.guestId) await this.state.storage.delete(`userRoom:${room.guestId}`);
    const message: ServerBattleMessage = { t: 'room_closed', reason };
    if (room.hostId !== silentUserId) {
      const hostWs = this.socketFor(room.hostId);
      if (hostWs) send(hostWs, message);
    }
    if (room.guestId && room.guestId !== silentUserId) {
      const guestWs = this.socketFor(room.guestId);
      if (guestWs) send(guestWs, message);
    }
  }

  private async clearGuest(room: FriendRoom, reason: 'left' | 'kicked', silentUserId?: string): Promise<void> {
    const guestId = room.guestId;
    room.guestId = null;
    room.guestReady = false;
    room.hostReady = false;
    await this.saveRoom(room);
    if (guestId) {
      await this.state.storage.delete(`userRoom:${guestId}`);
      if (guestId !== silentUserId) {
        const guestWs = this.socketFor(guestId);
        if (guestWs) send(guestWs, { t: 'room_closed', reason });
      }
    }
    await this.pushRoom(room);
  }

  private async roomFor(userId: string): Promise<FriendRoom | null> {
    const code = await this.state.storage.get<string>(`userRoom:${userId}`);
    if (!code) return null;
    const room = await this.loadRoom(code);
    if (!room || (room.hostId !== userId && room.guestId !== userId)) {
      await this.state.storage.delete(`userRoom:${userId}`);
      return null;
    }
    return room;
  }

  private async loadRoom(code: string): Promise<FriendRoom | null> {
    const raw = await this.state.storage.get<FriendRoom | string>(`room:${code}`);
    if (!raw || typeof raw !== 'object' || !raw.code || !raw.hostId) {
      if (raw) await this.state.storage.delete(`room:${code}`);
      return null;
    }
    return raw;
  }

  private saveRoom(room: FriendRoom): Promise<void> {
    return this.state.storage.put(`room:${room.code}`, room);
  }

  private async seatView(userId: string, ready: boolean): Promise<RoomSeatView | null> {
    const player = await loadPlayer(this.env.DB, userId);
    if (!player) return null;
    return {
      name: player.name,
      ready,
      connected: !!this.socketFor(userId),
    };
  }

  private async pushRoom(room: FriendRoom): Promise<void> {
    const host = await this.seatView(room.hostId, room.hostReady);
    if (!host) return;
    const guest = room.guestId ? await this.seatView(room.guestId, room.guestReady) : null;
    const hostWs = this.socketFor(room.hostId);
    if (hostWs) send(hostWs, { t: 'room_state', code: room.code, role: 'host', host, guest });
    if (room.guestId && guest) {
      const guestWs = this.socketFor(room.guestId);
      if (guestWs) send(guestWs, { t: 'room_state', code: room.code, role: 'guest', host, guest });
    }
  }

  private async uniqueRoomCode(): Promise<string> {
    for (;;) {
      const code = randomCode();
      if (!(await this.state.storage.get(`room:${code}`))) return code;
    }
  }

  private socketFor(userId: string): WebSocket | undefined {
    const cached = this.sockets.get(userId);
    if (cached) return cached;
    const found = this.state.getWebSockets().find(ws =>
      (ws.deserializeAttachment() as Attachment | null)?.userId === userId);
    if (found) this.sockets.set(userId, found);
    return found;
  }

  private persistQueue(): Promise<void> {
    return this.state.storage.put('queue', this.queue);
  }

  private async scheduleShadowAlarm(): Promise<void> {
    const next = this.queue.reduce((min, entry) => Math.min(min, entry.shadowAt), Number.POSITIVE_INFINITY);
    if (!Number.isFinite(next)) {
      try { await this.state.storage.deleteAlarm(); } catch { /* アラーム未設定 */ }
      return;
    }
    await this.state.storage.setAlarm(next);
  }

  private shadowWaitMs(): number {
    const base = Number(this.env.SHADOW_WAIT_MS);
    const wait = Number.isFinite(base) && base >= 0 ? base : SHADOW_WAIT_MS;
    const jitterCap = Number(this.env.SHADOW_WAIT_JITTER_MS);
    const jitterMax = Number.isFinite(jitterCap) && jitterCap >= 0 ? jitterCap : SHADOW_WAIT_JITTER_MS;
    const jitter = jitterMax > 0 ? Math.floor(Math.random() * (jitterMax + 1)) : 0;
    return wait + jitter;
  }

  private pruneDisconnected(): void {
    const seen = new Set<string>();
    for (const entry of [...this.queue]) {
      if (seen.has(entry.userId) || !this.socketFor(entry.userId)) {
        this.removeFromQueue(entry.userId, 'disconnect');
      } else {
        seen.add(entry.userId);
      }
    }
  }

  private removeFromQueue(userId: string, reason: string): void {
    const entry = this.queue.find(item => item.userId === userId);
    if (!entry) return;
    this.queue = this.queue.filter(item => item.userId !== userId);
    this.writeQueueMetric('queue_exit', userId, Math.max(0, Date.now() - entry.joinedAt), this.queue.length, reason);
  }

  private writeQueueMetric(
    event: 'queue_join' | 'queue_exit', userId: string, waitMs: number, queueSize: number, reason = '',
  ): void {
    this.env.METRICS?.writeDataPoint({
      blobs: [event, reason],
      doubles: [waitMs, queueSize],
      indexes: [userId],
    });
  }
}
