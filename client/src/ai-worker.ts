import { AI } from './ai';
import type { AIDifficulty } from './ai';
import type { GameState } from '../../shared/game';

self.onmessage = (event: MessageEvent<{ state: GameState; difficulty: AIDifficulty }>) => {
  self.postMessage(AI.chooseAction(event.data.state, event.data.difficulty));
};
