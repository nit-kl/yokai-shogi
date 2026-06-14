import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { Game } from '../../shared/game';
import type { BattlePlayer, ServerBattleMessage } from '../../shared/battle';
import { bossId } from '../../server/src/do/common';

class Inbox {
  private queued: ServerBattleMessage[] = [];
  private waiting: ((message: ServerBattleMessage) => void)[] = [];

  constructor(readonly ws: WebSocket) {
    ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data)) as ServerBattleMessage;
      const resolve = this.waiting.shift();
      if (resolve) resolve(message);
      else this.queued.push(message);
    });
  }

  next(): Promise<ServerBattleMessage> {
    const queued = this.queued.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket message timeout')), 3000);
      this.waiting.push(message => { clearTimeout(timer); resolve(message); });
    });
  }

  async nextType<T extends ServerBattleMessage['t']>(type: T): Promise<Extract<ServerBattleMessage, { t: T }>> {
    for (;;) {
      const message = await this.next();
      if (message.t === type) return message as Extract<ServerBattleMessage, { t: T }>;
    }
  }
}

async function createPlayer(name: string): Promise<BattlePlayer> {
  const userId = crypto.randomUUID();
  const formation = [
    ['ittan', 'kooni', null, 'nekomata', 'nue'],
    ['tengu', 'kappa', 'kyubi', 'nurikabe', 'rokuro'],
  ];
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id) VALUES (?1)').bind(userId),
    env.DB.prepare('INSERT INTO user_profiles (user_id, name, formation) VALUES (?1, ?2, ?3)')
      .bind(userId, name, JSON.stringify(formation)),
  ]);
  return { userId, name, rating: 1500, bossId: bossId(formation), formation, reconnectToken: crypto.randomUUID() };
}

async function connect(stub: DurableObjectStub, player: BattlePlayer, matchId: string): Promise<Inbox> {
  const response = await stub.fetch(
    `https://battle/v1/battle?matchId=${matchId}&reconnectToken=${player.reconnectToken}`,
    { headers: { Upgrade: 'websocket', 'X-User-Id': player.userId } },
  );
  expect(response.status).toBe(101);
  const ws = response.webSocket!;
  const inbox = new Inbox(ws);
  ws.accept();
  return inbox;
}

async function connectMatchmaker(player: BattlePlayer): Promise<Inbox> {
  const stub = env.MATCHMAKER.get(env.MATCHMAKER.idFromName('global'));
  const response = await stub.fetch('https://matchmaker/v1/battle', {
    headers: { Upgrade: 'websocket', 'X-User-Id': player.userId },
  });
  expect(response.status).toBe(101);
  const ws = response.webSocket!;
  const inbox = new Inbox(ws);
  ws.accept();
  return inbox;
}

describe('BattleRoom DO', () => {
  it('不正着手を拒否し、合法手と終局をD1へ保存する', async () => {
    const p = await createPlayer('先手');
    const e = await createPlayer('後手');
    const matchId = crypto.randomUUID();
    const stub = env.BATTLE.get(env.BATTLE.idFromName(matchId));
    const init = await stub.fetch('https://battle/init', {
      method: 'POST',
      body: JSON.stringify({ matchId, mode: 'friend', players: { p, e } }),
    });
    expect(init.status).toBe(201);

    const pws = await connect(stub, p, matchId);
    const ews = await connect(stub, e, matchId);
    const pSnapshot = await pws.next();
    await ews.next();
    await pws.nextType('your_turn');
    expect(pSnapshot.t).toBe('snapshot');
    if (pSnapshot.t !== 'snapshot') throw new Error('snapshot expected');

    ews.ws.send(JSON.stringify({ t: 'action', action: { kind: 'move', from: { x: 0, y: 1 }, to: { x: 0, y: 2 } } }));
    const rejected = await ews.next();
    expect(rejected).toMatchObject({ t: 'error', code: 'NOT_YOUR_TURN' });

    const action = Game.getAllActions(pSnapshot.state, 'p')[0];
    pws.ws.send(JSON.stringify({ t: 'action', action }));
    expect((await pws.nextType('snapshot')).t).toBe('snapshot');
    expect((await pws.nextType('events')).t).toBe('events');

    ews.ws.send(JSON.stringify({ t: 'resign' }));
    const end = await pws.nextType('game_end');
    expect(end).toMatchObject({ t: 'game_end', winner: 'p', reason: 'resign' });
    const saved = await env.DB.prepare('SELECT winner, reason FROM matches WHERE id = ?1').bind(matchId)
      .first<{ winner: string; reason: string }>();
    expect(saved).toEqual({ winner: 'p', reason: 'resign' });
    const logs = await env.DB.prepare('SELECT COUNT(*) count FROM match_actions WHERE match_id = ?1').bind(matchId)
      .first<{ count: number }>();
    expect(logs?.count).toBe(1);
  });

  it('切断した対戦相手が復帰したことを通知する', async () => {
    const p = await createPlayer('先手');
    const e = await createPlayer('後手');
    const matchId = crypto.randomUUID();
    const stub = env.BATTLE.get(env.BATTLE.idFromName(matchId));
    await stub.fetch('https://battle/init', {
      method: 'POST',
      body: JSON.stringify({ matchId, mode: 'friend', players: { p, e } }),
    });

    const pws = await connect(stub, p, matchId);
    const ews = await connect(stub, e, matchId);
    await pws.nextType('snapshot');
    await ews.nextType('snapshot');

    ews.ws.close(1000, 'test disconnect');
    expect(await pws.nextType('opponent_disconnected')).toMatchObject({ t: 'opponent_disconnected' });

    await connect(stub, e, matchId);
    expect(await pws.nextType('opponent_reconnected')).toEqual({ t: 'opponent_reconnected' });
  });
});

describe('Matchmaker DO', () => {
  it('6桁コードでフレンドマッチを成立させる', async () => {
    const host = await createPlayer('ホスト');
    const guest = await createPlayer('ゲスト');
    const hostSocket = await connectMatchmaker(host);
    const guestSocket = await connectMatchmaker(guest);

    hostSocket.ws.send(JSON.stringify({ t: 'create_room' }));
    const room = await hostSocket.nextType('room_created');
    expect(room.code).toMatch(/^[A-Z2-9]{6}$/);

    guestSocket.ws.send(JSON.stringify({ t: 'join_room', code: room.code }));
    const [hostFound, guestFound] = await Promise.all([
      hostSocket.nextType('match_found'),
      guestSocket.nextType('match_found'),
    ]);
    expect(hostFound.side).toBe('p');
    expect(guestFound.side).toBe('e');
    expect(hostFound.matchId).toBe(guestFound.matchId);
  });

  it('ランダムマッチを成立させる', async () => {
    const p = await createPlayer('待機A');
    const e = await createPlayer('待機B');
    const pSocket = await connectMatchmaker(p);
    const eSocket = await connectMatchmaker(e);

    pSocket.ws.send(JSON.stringify({ t: 'join_queue' }));
    eSocket.ws.send(JSON.stringify({ t: 'join_queue' }));
    const [pFound, eFound] = await Promise.all([
      pSocket.nextType('match_found'),
      eSocket.nextType('match_found'),
    ]);
    expect(pFound.matchId).toBe(eFound.matchId);
    expect(new Set([pFound.side, eFound.side])).toEqual(new Set(['p', 'e']));
  });
});

describe('オンライン報酬', () => {
  it('ランダムマッチ勝利でチケットを付与し、フレンドマッチでは付与しない', async () => {
    async function playResign(mode: 'random' | 'friend', resignSide: 'p' | 'e') {
      const p = await createPlayer('先手');
      const e = await createPlayer('後手');
      const matchId = crypto.randomUUID();
      const stub = env.BATTLE.get(env.BATTLE.idFromName(matchId));
      const init = await stub.fetch('https://battle/init', {
        method: 'POST',
        body: JSON.stringify({ matchId, mode, players: { p, e } }),
      });
      expect(init.status).toBe(201);
      const pws = await connect(stub, p, matchId);
      const ews = await connect(stub, e, matchId);
      await pws.nextType('snapshot');
      await ews.nextType('snapshot');
      await pws.nextType('your_turn');
      const resigner = resignSide === 'p' ? pws : ews;
      const winner = resignSide === 'p' ? ews : pws;
      resigner.ws.send(JSON.stringify({ t: 'resign' }));
      const end = await winner.nextType('game_end');
      return { p, e, end, matchId };
    }

    const random = await playResign('random', 'e');
    expect(random.end).toMatchObject({ t: 'game_end', winner: 'p', reward: { tickets: 1 } });
    const randomProfile = await env.DB.prepare(
      'SELECT tickets, online_win_reward_count FROM user_profiles WHERE user_id = ?1',
    ).bind(random.p.userId).first<{ tickets: number; online_win_reward_count: number }>();
    expect(randomProfile).toEqual({ tickets: 1, online_win_reward_count: 1 });

    const friend = await playResign('friend', 'e');
    expect(friend.end).toMatchObject({ t: 'game_end', winner: 'p', reward: { tickets: 0 } });
    const friendProfile = await env.DB.prepare(
      'SELECT tickets FROM user_profiles WHERE user_id = ?1',
    ).bind(friend.p.userId).first<{ tickets: number }>();
    expect(friendProfile?.tickets).toBe(0);
  });
});
