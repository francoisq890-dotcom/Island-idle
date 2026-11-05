import { describe, expect, it } from 'vitest';
import { DAY_NIGHT } from '../src/config/daynight';
import { advanceClock, isNight, nightAmount, secondsToNight } from '../src/economy/daynight';
import { computeRates } from '../src/economy/economy';
import { applyOffline } from '../src/economy/offline';
import { luckOf } from '../src/economy/runes';
import { createInitialState } from '../src/economy/state';

describe('day/night cycle', () => {
  it('starts in the day, first night after 6 minutes, counts nights', () => {
    const s = createInitialState(0);
    expect(isNight(s)).toBe(false);
    expect(secondsToNight(s)).toBe(DAY_NIGHT.cycle - DAY_NIGHT.night);
    for (let t = 0; t < DAY_NIGHT.cycle * 3; t += 0.5) advanceClock(s, 0.5);
    expect(s.counters.nights).toBe(3);
  });
  it('night boosts rune luck, never production', () => {
    const s = createInitialState(0);
    s.machines.drill = 10;
    const dayRates = computeRates(s);
    const dayLuck = luckOf(s);
    s.clock = DAY_NIGHT.cycle - 10;
    expect(isNight(s)).toBe(true);
    expect(nightAmount(s)).toBe(1);
    expect(luckOf(s)).toBeCloseTo(dayLuck * DAY_NIGHT.nightLuck);
    expect(computeRates(s).shards).toBeCloseTo(dayRates.shards);
  });
  it('twilight is smooth', () => {
    const s = createInitialState(0);
    s.clock = DAY_NIGHT.cycle - DAY_NIGHT.night - DAY_NIGHT.twilight / 2;
    const k = nightAmount(s);
    expect(k).toBeGreaterThan(0.2);
    expect(k).toBeLessThan(0.8);
  });
  it('the sky keeps turning offline without counting nights', () => {
    const s = createInitialState(0);
    applyOffline(s, 3600 * 1000);
    expect(s.clock).toBeCloseTo(3600);
    expect(s.counters.nights).toBe(0);
  });
});
