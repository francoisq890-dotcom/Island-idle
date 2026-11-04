import { describe, expect, it } from 'vitest';
import { MACHINES, PRESTIGE, ZONES } from '../src/config/economy';
import {
  buyMachine,
  buyUpgrade,
  canPrestige,
  computeRates,
  doPrestige,
  harvest,
  machineCost,
  milestoneMult,
  prestigeGain,
  tick,
  timeToAfford,
  unlockZone,
} from '../src/economy/economy';
import { formatDuration, formatNumber, formatRate } from '../src/economy/format';
import { createInitialState } from '../src/economy/state';

describe('costs', () => {
  it('grow exponentially with base × growth^n', () => {
    expect(machineCost('drill', 0).shards).toBe(MACHINES.drill.baseCost.shards);
    const c10 = machineCost('drill', 10).shards!;
    expect(c10).toBe(Math.ceil(MACHINES.drill.baseCost.shards! * Math.pow(MACHINES.drill.growth, 10)));
  });
  it('cannot buy without resources', () => {
    const s = createInitialState(0);
    expect(buyMachine(s, 'drill')).toBe(false);
    s.shards = 100;
    expect(buyMachine(s, 'drill')).toBe(true);
    expect(s.machines.drill).toBe(1);
    expect(s.shards).toBe(100 - MACHINES.drill.baseCost.shards!);
  });
  it('machines of locked zones cannot be bought', () => {
    const s = createInitialState(0);
    s.shards = 1e9;
    expect(buyMachine(s, 'refinery')).toBe(false);
    expect(unlockZone(s, 'geyser')).toBe(false); // must open forge first
    expect(unlockZone(s, 'forge')).toBe(true);
    expect(s.shards).toBe(1e9 - ZONES.forge.cost.shards!);
    expect(buyMachine(s, 'refinery')).toBe(true);
  });
});

describe('production', () => {
  it('sums machine output and applies upgrades', () => {
    const s = createInitialState(0);
    s.machines.drill = 4;
    expect(computeRates(s).shards).toBeCloseTo(4 * MACHINES.drill.shardsPerSec!);
    s.shards = 1e6;
    s.upgrades = {};
    expect(buyUpgrade(s, 'drill1')).toBe(true); // ×2 drills (requires 3 drills)
    expect(computeRates(s).shards).toBeCloseTo(8 * MACHINES.drill.shardsPerSec!);
  });
  it('milestones double output', () => {
    expect(milestoneMult(0)).toBe(1);
    expect(milestoneMult(25)).toBe(2);
    expect(milestoneMult(50)).toBe(4);
  });
  it('tick adds rate × dt and tracks run stats', () => {
    const s = createInitialState(0);
    s.machines.drill = 2;
    tick(s, 10);
    expect(s.shards).toBeCloseTo(10);
    expect(s.stats.runShards).toBeCloseTo(10);
  });
  it('harvest gives the click value', () => {
    const s = createInitialState(0);
    expect(harvest(s)).toBe(1);
    s.upgrades.pick1 = true;
    expect(harvest(s)).toBe(2);
    expect(s.stats.harvests).toBe(2);
  });
  it('refineries convert at most half of production into lumen', () => {
    const s = createInitialState(0);
    s.zones.forge = true;
    s.machines.refinery = 100; // huge capacity
    s.machines.drill = 10; // 5 shards/s
    const r = computeRates(s);
    expect(r.shardsGross).toBeCloseTo(5);
    expect(r.refineProcessed).toBeCloseTo(2.5);
    expect(r.shards).toBeCloseTo(2.5);
    expect(r.lumen).toBeCloseTo(0.25);
    expect(r.refineSupplyLimited).toBe(true);
  });
  it('timeToAfford is consistent with rates', () => {
    const s = createInitialState(0);
    s.machines.drill = 2; // 1/s
    const r = computeRates(s);
    expect(timeToAfford(s, r, { shards: 30 })).toBeCloseTo(30);
    expect(timeToAfford(s, r, { lumen: 1 })).toBe(Infinity);
  });
});

describe('prestige', () => {
  it('requires the sky island and enough run shards', () => {
    const s = createInitialState(0);
    s.stats.runShards = PRESTIGE.unlockAt * 10;
    expect(canPrestige(s)).toBe(false);
    s.zones = { home: true, forge: true, geyser: true, sky: true };
    expect(canPrestige(s)).toBe(true);
    expect(prestigeGain(s)).toBe(Math.floor(Math.sqrt((PRESTIGE.unlockAt * 10) / PRESTIGE.divisor)));
  });
  it('resets the run but keeps seeds and settings', () => {
    const s = createInitialState(0);
    s.zones = { home: true, forge: true, geyser: true, sky: true };
    s.stats.runShards = PRESTIGE.unlockAt;
    s.machines.drill = 50;
    s.upgrades.pick1 = true;
    s.settings.muted = true;
    const gain = doPrestige(s);
    expect(gain).toBeGreaterThan(0);
    expect(s.seeds).toBe(gain);
    // The "La Foreuse" constellation (5 lifetime seeds) gives 5 starting drills.
    expect(s.machines.drill).toBe(gain >= 5 ? 5 : 0);
    expect(s.upgrades).toEqual({});
    expect(s.zones.forge).toBe(false);
    expect(s.settings.muted).toBe(true);
    expect(s.stats.prestiges).toBe(1);
    // Seeds boost production
    s.machines.drill = 10;
    expect(computeRates(s).shards).toBeCloseTo(10 * 0.5 * (1 + gain * PRESTIGE.bonusPerSeed));
  });
});

describe('format', () => {
  it('formats numbers readably', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999.9)).toBe('999');
    expect(formatNumber(1234)).toBe('1.2K');
    expect(formatNumber(12345)).toBe('12.3K');
    expect(formatNumber(123456)).toBe('123K');
    expect(formatNumber(999999)).toBe('999K');
    expect(formatNumber(3.4e6)).toBe('3.4M');
    expect(formatNumber(2e9)).toBe('2B');
    expect(formatNumber(1.5e21)).toBe('1.50e21');
    expect(formatRate(0.5)).toBe('0.5');
    expect(formatRate(2)).toBe('2');
    expect(formatRate(12.34)).toBe('12.3');
  });
  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(192)).toBe('3 min 12 s');
    expect(formatDuration(7500)).toBe('2 h 05 min');
  });
});
