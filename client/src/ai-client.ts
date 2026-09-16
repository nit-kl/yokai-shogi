import { AI } from './ai';
import type { AIDifficulty } from './ai';
import type { Action, GameState } from '../../shared/game';

/** Keep animation and input responsive while the CPU searches. */
export function chooseCPUAction(state: GameState, difficulty: AIDifficulty): Promise<Action | null> {
  return new Promise(resolve => {
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (action: Action | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker?.terminate();
      resolve(action);
    };
    const fallback = () => {
      if (!settled) finish(AI.chooseAction(state, 'normal'));
    };
    try {
      worker = new Worker(new URL('./ai-worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<Action | null>) => finish(event.data);
      worker.onerror = fallback;
      worker.onmessageerror = fallback;
      // Also recover if a worker fails to start without emitting an error.
      timer = setTimeout(fallback, 1000);
      worker.postMessage({ state, difficulty });
    } catch {
      fallback();
    }
  });
}
