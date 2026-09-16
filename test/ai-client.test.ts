import { afterEach, expect, test, vi } from 'vitest';
import { chooseCPUAction } from '../client/src/ai-client';
import { AI } from '../client/src/ai';
import { Game } from '../shared/game';

class TestWorker {
  static latest: TestWorker;
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { TestWorker.latest = this; }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test('CPU calculation runs in a worker and releases it when finished', async () => {
  vi.stubGlobal('Worker', TestWorker);
  const state = Game.newState();
  state.turn = 'e';
  const action = Game.getAllActions(state, 'e')[0];
  const search = vi.spyOn(AI, 'chooseAction');
  const pending = chooseCPUAction(state, 'hard');
  const worker = TestWorker.latest;
  expect(worker.postMessage).toHaveBeenCalledWith({ state, difficulty: 'hard' });
  expect(search).not.toHaveBeenCalled();
  worker.onmessage!({ data: action });
  expect(await pending).toEqual(action);
  expect(worker.terminate).toHaveBeenCalledOnce();
});

test.each(['error', 'timeout', 'unsupported'])('CPU recovers from worker %s', async failure => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', failure === 'unsupported' ? undefined : TestWorker);
  const state = Game.newState();
  state.turn = 'e';
  const action = Game.getAllActions(state, 'e')[0];
  const search = vi.spyOn(AI, 'chooseAction').mockReturnValue(action);
  const pending = chooseCPUAction(state, 'hard');
  if (failure === 'error') TestWorker.latest.onerror!();
  if (failure === 'timeout') await vi.advanceTimersByTimeAsync(1000);
  expect(await pending).toEqual(action);
  expect(search).toHaveBeenCalledOnce();
  if (failure !== 'unsupported') expect(TestWorker.latest.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
