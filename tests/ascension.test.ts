import { describe, expect, it } from 'vitest';
import { ASCENSION } from '../src/config/ascension';
import { prestigeThreshold } from '../src/config/economy';
import { buyRelic, canAscend, crownGain, cycleSeeds, islandIndex } from '../src/economy/ascension';
import { checkChallenge, computeRates, doAscend, doPrestige, islandThreshold, isMachineAvailable, nextMachineCost, startChallenge } from '../src/economy/economy';
import { isNight } from '../src/economy/daynight';
import { canRoll } from '../src/economy/runes';
import { createInitialState, type GameState } from '../src/economy/state';
import { deserialize, serialize } from '../src/save/save';

const late = (): GameState => {
  const s = createInitialState(0);
  s.seeds = 1200;
  s.lifetimeSeeds = 1200;
  s.stats.prestiges = 9;
  s.talents = { grip: 3 };
  s.seedsPlanted = 10;
  s.runes = { st1: 50, st5: 3, st6: 1, mo7: 1 };
  s.fragments = 500;
  s.zones = { home: true, forge: true, geyser: true, sky: true };
  return s;
};

describe('Ascension', () => {
  it('needs enough seeds this cycle, gives crowns, resets the cycle', () => {
    const s = late();
    expect(canAscend(s)).toBe(true);
    const g = crownGain(s);
    expect(g).toBe(Math.floor(ASCENSION.crownFactor * Math.sqrt(1200 / ASCENSION.seeds)));
    expect(doAscend(s)).toBe(g);
    expect(s.seeds).toBe(0);
    expect(s.talents).toEqual({});
    expect(cycleSeeds(s)).toBe(0);
    expect(islandIndex(s)).toBe(0);
    expect(islandThreshold(s)).toBe(prestigeThreshold(0));
    expect(s.runes).toEqual({ st6: 1, mo7: 1 });
    expect(s.fragments).toBe(0);
    expect(s.lifetimeSeeds).toBe(1200);
    expect(canAscend(s)).toBe(false);
  });
  it('crowns make the next cycle stronger', () => {
    const a = createInitialState(0);
    a.machines.drill = 10;
    const b = createInitialState(0);
    b.machines.drill = 10;
    b.ascension.crowns = 3;
    expect(computeRates(b).shards).toBeGreaterThan(computeRates(a).shards * 1.25);
  });
  it('relics change rules: bridges already built', () => {
    const s = late();
    doAscend(s);
    expect(buyRelic(s, 'bridges')).toBe(true);
    s.zones = { home: true, forge: false, geyser: false, sky: true };
    s.stats.runShards = 1e14;
    doPrestige(s);
    expect(s.zones).toEqual({ home: true, forge: true, geyser: true, sky: true });
    expect(buyRelic(s, 'bridges')).toBe(false);
  });
});

describe('challenges', () => {
  it('only after an Ascension; constraints apply; waking the Lighthouse completes them', () => {
    const s = late();
    expect(startChallenge(s, 'noDrill')).toBe(false);
    doAscend(s);
    expect(startChallenge(s, 'noDrill')).toBe(true);
    expect(isMachineAvailable(s, 'drill')).toBe(false);
    s.stats.runShards = islandThreshold(s);
    expect(checkChallenge(s)).toBe('noDrill');
    expect(s.ascension.done.noDrill).toBe(true);
    expect(s.ascension.challenge).toBeNull();
    s.machines.drill = 10;
    const r = computeRates(s);
    expect(r.perMachine.drill.shards).toBeGreaterThan(0);
  });
  it('sealed altars, moonless night, dear costs', () => {
    const s = late();
    doAscend(s);
    s.shards = 1e9;
    s.lumen = 1e9;
    startChallenge(s, 'sealed');
    s.zones.forge = true;
    expect(canRoll(s, 'stone')).toBe(false);
    s.ascension.challenge = 'moonless';
    expect(isNight(s)).toBe(true);
    const cheap = nextMachineCost(s, 'drill').shards!;
    s.ascension.challenge = 'dear';
    expect(nextMachineCost(s, 'drill').shards!).toBeGreaterThanOrEqual(cheap * 3 - 1);
  });
  it('ascension state survives a save', () => {
    const s = late();
    doAscend(s);
    buyRelic(s, 'perch');
    startChallenge(s, 'tenth');
    const b = deserialize(serialize(s), 0);
    expect(b.ascension).toEqual(s.ascension);
  });
});
