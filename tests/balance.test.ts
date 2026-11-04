import { describe, expect, it } from 'vitest';
import { simulateRun } from '../src/economy/simulation';
import { createInitialState } from '../src/economy/state';

describe('balance (automated player)', () => {
  const run = simulateRun({ clicksPerSecond: 2, clickUntil: 600 });
  it('never blocks more than 3 minutes early on', () => {
    expect(run.maxEarlyGap).toBeLessThanOrEqual(180);
  });
  it('offers 30–45 minutes before the first prestige', () => {
    expect(run.prestigeReadyAt).not.toBeNull();
    expect(run.prestigeReadyAt!).toBeGreaterThanOrEqual(30 * 60);
    expect(run.prestigeReadyAt!).toBeLessThanOrEqual(45 * 60);
  });
  it('a second island is faster thanks to star seeds', () => {
    const start = createInitialState(0);
    start.seeds = 6;
    const second = simulateRun({ clicksPerSecond: 2, clickUntil: 600, startState: start });
    expect(second.prestigeReadyAt!).toBeLessThan(run.prestigeReadyAt!);
  });
});
