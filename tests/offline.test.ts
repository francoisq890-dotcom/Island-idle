import { describe, expect, it } from 'vitest';
import { OFFLINE } from '../src/config/economy';
import { computeRates } from '../src/economy/economy';
import { applyOffline, shouldShowOfflineReport } from '../src/economy/offline';
import { createInitialState } from '../src/economy/state';

describe('offline progress', () => {
  it('credits rate × elapsed time', () => {
    const s = createInitialState(0);
    s.machines.drill = 10; // 5/s
    const r = applyOffline(s, 3600 * 1000);
    expect(r.creditedSeconds).toBe(3600);
    expect(r.shards).toBeCloseTo(5 * 3600 * OFFLINE.efficiency);
    expect(s.shards).toBeCloseTo(r.shards);
    expect(s.stats.runShards).toBeCloseTo(r.shards);
    expect(s.lastSeen).toBe(3600 * 1000);
    expect(shouldShowOfflineReport(r)).toBe(true);
  });
  it('is capped', () => {
    const s = createInitialState(0);
    s.machines.drill = 2;
    const r = applyOffline(s, (OFFLINE.maxSeconds + 5000) * 1000);
    expect(r.capped).toBe(true);
    expect(r.creditedSeconds).toBe(OFFLINE.maxSeconds);
  });
  it('includes refinery lumen and is exactly equal to ticking live', () => {
    const s = createInitialState(0);
    s.zones.forge = true;
    s.machines.drill = 30;
    s.machines.refinery = 2;
    const rates = computeRates(s);
    const r = applyOffline(s, 600 * 1000);
    expect(r.lumen).toBeCloseTo(rates.lumen * 600);
    expect(r.shards).toBeCloseTo(rates.shards * 600);
  });
  it('ignores clock going backwards and very short absences', () => {
    const s = createInitialState(10_000);
    s.machines.drill = 2;
    const r = applyOffline(s, 5_000);
    expect(r.shards).toBe(0);
    expect(shouldShowOfflineReport(applyOffline(s, 20_000))).toBe(false);
  });
});
