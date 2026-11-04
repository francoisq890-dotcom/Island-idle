import { describe, expect, it } from 'vitest';
import { doPrestige } from '../src/economy/economy';
import { simulateRun } from '../src/economy/simulation';

describe('balance (automated player)', () => {
  const run = simulateRun({ clicksPerSecond: 2, clickUntil: 600 });
  it('never blocks more than ~2 minutes early on', () => {
    expect(run.maxEarlyGap).toBeLessThanOrEqual(130);
  });
  it('offers 30–45 minutes before the first prestige', () => {
    expect(run.prestigeReadyAt).not.toBeNull();
    expect(run.prestigeReadyAt!).toBeGreaterThanOrEqual(30 * 60);
    expect(run.prestigeReadyAt!).toBeLessThanOrEqual(45 * 60);
  });
  it('runes matter without breaking the curve', () => {
    const noRunes = simulateRun({ clicksPerSecond: 2, clickUntil: 600, noRunes: true });
    const speedup = noRunes.prestigeReadyAt! / run.prestigeReadyAt!;
    expect(speedup).toBeGreaterThan(1.08);
    expect(speedup).toBeLessThan(1.8);
  }, 60_000);
  it('the second island is clearly faster', () => {
    const s2 = run.final;
    doPrestige(s2);
    const second = simulateRun({ clicksPerSecond: 2, clickUntil: 600, startState: s2 });
    expect(second.prestigeReadyAt!).toBeLessThan(run.prestigeReadyAt! * 0.7);
  }, 60_000);
});
