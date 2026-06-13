import type { MatchMode, BattlePlayer, ClientBattleMessage, ServerBattleMessage } from '../../../shared/battle';
import type { Env } from '../env';
import { loadPlayer, randomCode, send } from './common';

interface Attachment { userId: string }

export class Matchmaker {
  private queue: string[] = [];
  private sockets = new Map<string, WebSocket>();

  constructor(private state: DurableObjectState, private env: Env) {
    state.blockConcurrencyWhile(async () => {
      this.queue = (await state.storage.get<string[]>('queue')) ?? [];
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
      if (!this.queue.includes(userId)) this.queue.push(userId);
      await this.persistQueue();
      send(ws, { t: 'queued', position: this.queue.indexOf(userId) + 1 });
      await this.pairQueue();
      return;
    }
    if (msg.t === 'leave_queue') {
      this.queue = this.queue.filter(id => id !== userId);
      await this.persistQueue();
      return;
    }
    if (msg.t === 'create_room') {
      const code = await this.uniqueRoomCode();
      await this.state.storage.put(`room:${code}`, userId);
      send(ws, { t: 'room_created', code });
      return;
    }
    if (msg.t === 'join_room') {
      const code = String(msg.code || '').trim().toUpperCase();
      const hostId = await this.state.storage.get<string>(`room:${code}`);
      if (!hostId || hostId === userId || !this.socketFor(hostId)) {
        send(ws, { t: 'error', code: 'ROOM_NOT_FOUND', message: '参加できるルームがありません' });
        return;
      }
      await this.state.storage.delete(`room:${code}`);
      await this.createMatch(hostId, userId, 'friend');
      return;
    }
    send(ws, { t: 'error', code: 'VALIDATION', message: '待機中に使えない操作です' });
  }

  webSocketClose(ws: WebSocket): void {
    const { userId } = ws.deserializeAttachment() as Attachment;
    if (this.sockets.get(userId) === ws) this.sockets.delete(userId);
    this.queue = this.queue.filter(id => id !== userId);
    this.state.waitUntil(this.persistQueue());
  }

  webSocketError(ws: WebSocket): void { this.webSocketClose(ws); }

  private async pairQueue(): Promise<void> {
    while (this.queue.length >= 2) {
      const p = this.queue.shift()!;
      const e = this.queue.shift()!;
      if (!this.socketFor(p) || !this.socketFor(e) || p === e) continue;
      await this.createMatch(p, e, 'random');
    }
    await this.persistQueue();
  }

  private async createMatch(pId: string, eId: string, mode: MatchMode): Promise<void> {
    const [p, e] = await Promise.all([loadPlayer(this.env.DB, pId), loadPlayer(this.env.DB, eId)]);
    const pSocket = this.socketFor(pId);
    const eSocket = this.socketFor(eId);
    if (!p || !e || !pSocket || !eSocket) return;
    const matchId = crypto.randomUUID();
    const stub = this.env.BATTLE.get(this.env.BATTLE.idFromName(matchId));
    const response = await stub.fetch('https://battle/init', {
      method: 'POST',
      body: JSON.stringify({ matchId, mode, players: { p, e } }),
    });
    if (!response.ok) {
      const error: ServerBattleMessage = { t: 'error', code: 'MATCH_FAILED', message: '対局を開始できませんでした' };
      send(pSocket, error); send(eSocket, error);
      return;
    }
    this.env.METRICS?.writeDataPoint({
      blobs: ['match_found', mode],
      doubles: [1],
      indexes: [matchId],
    });
    send(pSocket, {
      t: 'match_found', matchId, reconnectToken: p.reconnectToken, side: 'p',
      opponent: { name: e.name, rating: e.rating, bossId: e.bossId },
      formations: { p: p.formation, e: e.formation },
    });
    send(eSocket, {
      t: 'match_found', matchId, reconnectToken: e.reconnectToken, side: 'e',
      opponent: { name: p.name, rating: p.rating, bossId: p.bossId },
      formations: { p: p.formation, e: e.formation },
    });
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
}
