import { describe, expect, it } from 'vitest';
import { Game } from '../shared/game';
import { actionToServer, eventsForView, stateForView } from '../client/src/online';

describe('オンライン対戦の後手視点変換', () => {
  it('盤面・手番・HPを180度反転して自軍をpにする', () => {
    const state = Game.newState();
    state.hp = { p: 2800, e: 2100 };
    state.turn = 'e';
    const view = stateForView(state, 'e');
    expect(view.turn).toBe('p');
    expect(view.hp).toEqual({ p: 2100, e: 2800 });
    expect(view.board[5][2]?.owner).toBe('p');
    expect(view.board[5][2]?.id).toBe('shuten');
  });

  it('後手の着手座標とイベントを相互変換する', () => {
    const action = { kind: 'move' as const, from: { x: 1, y: 4 }, to: { x: 1, y: 3 } };
    expect(actionToServer(action, 'e')).toEqual({
      kind: 'move', from: { x: 3, y: 1 }, to: { x: 3, y: 2 },
    });
    expect(eventsForView([{ t: 'move', uid: 1, from: { x: 3, y: 1 }, to: { x: 3, y: 2 } }], 'e'))
      .toEqual([{ t: 'move', uid: 1, from: { x: 1, y: 4 }, to: { x: 1, y: 3 } }]);
  });
});
