import type { MatchMode, BattlePlayer, ClientBattleMessage, ServerBattleMessage } from '../../../shared/battle';
import type { Env } from '../env';
import { isMatchHour } from '../../../shared/match-hour';
import { loadPlayer, randomCode, send } from './common';

interface Attachment { userId: string }
interface QueueEntry { userId: string; joinedAt: number }

type MatchCreationResult =
  | { status: 'created' }
  | { status: 'invalid'; userIds: string[] }
  | { status: 'failed' };

export class Matchmaker {
  private queue: QueueEntry[] = [];
  private sockets = new Map<string, WebSocket>();

  constructor(private state: DurableObjectState, private env: Env) {
    state.blockConcurrencyWhile(async () => {
      const stored = (await state.storage.get<(string | QueueEntry)[]>('queue')) ?? [];
      const now = Date.now();
      this.queue = stored.map(entry => typeof entry === 'string'
        ? { userId: entry, joinedAt: now }
        : entry);
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
        this.queue.push({ userId, joinedAt: Date.now() });
        this.writeQueueMetric('queue_join', userId, 0, this.queue.length);
      }
      await this.persistQueue();
      send(ws, { t: 'queued', position: this.queue.findIndex(entry => entry.userId === userId) + 1 });
      await this.pairQueue();
      return;
    }
    if (msg.t === 'leave_queue') {
      this.removeFromQueue(userId, msg.reason === 'timeout' ? 'timeout' : 'cancel');
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
    const current = this.sockets.get(userId);
    // 同一アカウントの新接続が既にある場合、古い接続のcloseで新接続をキューから消さない。
    if (current && current !== ws) return;
    if (current === ws) this.sockets.delete(userId);
    this.removeFromQueue(userId, 'disconnect');
    this.state.waitUntil(this.persistQueue());
  }

  webSocketError(ws: WebSocket): void { this.webSocketClose(ws); }

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
    const matchId = crypto.randomUUID();
    const stub = this.env.BATTLE.get(this.env.BATTLE.idFromName(matchId));
    const response = await stub.fetch('https://battle/init', {
      method: 'POST',
      body: JSON.stringify({ matchId, mode, players: { p, e } }),
    });
    if (!response.ok) {
      const error: ServerBattleMessage = { t: 'error', code: 'MATCH_FAILED', message: '対局を開始できませんでした' };
      send(pSocket, error); send(eSocket, error);
      this.env.METRICS?.writeDataPoint({ blobs: ['match_failed', mode], doubles: [1] });
      return { status: 'failed' };
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
    return { status: 'created' };
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
