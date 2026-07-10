import { COLS, ROWS } from '../../shared/data';
import type { Side } from '../../shared/data';
import type { Action, GameEvent, GameState, Pos } from '../../shared/game';
import type { ServerBattleMessage } from '../../shared/battle';

const flipSide = (side: Side): Side => side === 'p' ? 'e' : 'p';
const flipPos = (pos: Pos): Pos => ({ x: COLS - 1 - pos.x, y: ROWS - 1 - pos.y });

export function actionToServer(action: Action, side: Side): Action {
  if (side === 'p') return action;
  switch (action.kind) {
    case 'move': return { kind: 'move', from: flipPos(action.from), to: flipPos(action.to) };
    case 'drop': return { kind: 'drop', id: action.id, to: flipPos(action.to) };
    case 'awaken': return { kind: 'awaken', to: flipPos(action.to) };
  }
}

export function stateForView(state: GameState, side: Side): GameState {
  if (side === 'p') return structuredClone(state);
  return {
    ...structuredClone(state),
    board: state.board.slice().reverse().map(row => row.slice().reverse().map(piece =>
      piece ? { ...piece, owner: flipSide(piece.owner) } : null)),
    hp: { p: state.hp.e, e: state.hp.p },
    hands: { p: { ...state.hands.e }, e: { ...state.hands.p } },
    turn: flipSide(state.turn),
    combo: { p: state.combo.e, e: state.combo.p },
    winner: state.winner ? flipSide(state.winner) : null,
    lastMove: state.lastMove ? { to: flipPos(state.lastMove.to) } : null,
    awaken: state.awaken
      ? { p: { ...state.awaken.e }, e: { ...state.awaken.p } }
      : { p: { gauge: 0, used: false }, e: { gauge: 0, used: false } },
  };
}

export function eventsForView(events: GameEvent[], side: Side): GameEvent[] {
  if (side === 'p') return structuredClone(events);
  return events.map(event => {
    switch (event.t) {
      case 'move': return { ...event, from: flipPos(event.from), to: flipPos(event.to) };
      case 'drop': return { ...event, owner: flipSide(event.owner), to: flipPos(event.to) };
      case 'promote': return { ...event, owner: flipSide(event.owner), to: flipPos(event.to) };
      case 'awaken': return { ...event, owner: flipSide(event.owner), to: flipPos(event.to) };
      case 'gameover': return { ...event, winner: flipSide(event.winner) };
      case 'capture':
        return {
          ...event,
          attacker: { ...event.attacker, owner: flipSide(event.attacker.owner) },
          victim: { ...event.victim, owner: flipSide(event.victim.owner) },
          at: flipPos(event.at),
          procs: event.procs.map(p => ({ ...p, owner: flipSide(p.owner) })),
          effects: event.effects?.map(p => ({ ...p, owner: flipSide(p.owner) })),
          counter: event.counter ? {
            ...event.counter, owner: flipSide(event.counter.owner),
            hp: { p: event.counter.hp.e, e: event.counter.hp.p },
          } : null,
          hp: { p: event.hp.e, e: event.hp.p },
          enrage: event.enrage ? { ...event.enrage, owner: flipSide(event.enrage.owner) } : event.enrage,
        };
    }
  });
}

export class OnlineConnection {
  private ws: WebSocket | null = null;
  private pending: string[] = [];
  private handling = Promise.resolve();
  onMessage: (message: ServerBattleMessage) => void | Promise<void> = () => {};
  onState: (state: 'connected' | 'disconnected' | 'error') => void = () => {};

  constructor(private baseUrl: string) {}

  connect(extra: Record<string, string> = {}): void {
    this.close();
    const url = new URL(this.baseUrl);
    for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      for (const message of this.pending.splice(0)) ws.send(message);
      this.onState('connected');
    };
    ws.onmessage = event => {
      try {
        const message = JSON.parse(String(event.data)) as ServerBattleMessage;
        this.handling = this.handling.then(() => this.onMessage(message)).catch(() => {});
      } catch { /* ignore */ }
    };
    ws.onerror = () => this.onState('error');
    ws.onclose = () => { if (this.ws === ws) this.onState('disconnected'); };
  }

  send(message: unknown): void {
    const json = JSON.stringify(message);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(json);
    else this.pending.push(json);
  }
  close(): void {
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState < WebSocket.CLOSING) ws.close();
  }
}
