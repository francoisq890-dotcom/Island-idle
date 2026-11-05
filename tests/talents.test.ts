import { describe, expect, it } from 'vitest';
import { TALENT, TALENTS } from '../src/config/talents';
import { DAY_NIGHT } from '../src/config/daynight';
import { nightLength } from '../src/economy/daynight';
import { computeRates, doPrestige, prestigeMult } from '../src/economy/economy';
import { perchCount } from '../src/economy/familiars';
import { applyOffline } from '../src/economy/offline';
import { createInitialState } from '../src/economy/state';
import { autoBuyStep, canRespec, plant, respec, seedsFree, talentCost, talentLock } from '../src/economy/talents';
import { deserialize, serialize } from '../src/save/save';

const seeded = (n: number) => {
  const s = createInitialState(0);
  s.seeds = n;
  s.lifetimeSeeds = n;
  s.stats.prestiges = 3;
  return s;
};

describe('talents (Jardin d’étoiles)', () => {
  it('planted seeds keep counting for production', () => {
    const s = seeded(50);
    const before = prestigeMult(s.seeds);
    expect(plant(s, 'grip')).toBe(true);
    expect(seedsFree(s)).toBe(50 - 3);
    expect(prestigeMult(s.seeds)).toBe(before);
    expect(computeRates(s).bonus.click).toBeGreaterThanOrEqual(0.25);
  });
  it('costs grow per level; requirements and prestige gates apply', () => {
    const s = seeded(500);
    const grip = TALENTS.find((t) => t.id === 'grip')!;
    plant(s, 'grip');
    expect(talentCost(s, grip)).toBe(Math.ceil(3 * 1.6));
    expect(talentLock(s, TALENTS.find((t) => t.id === 'hunter')!)).toMatch(/requiert/);
    const f = seeded(500);
    f.stats.prestiges = 1;
    expect(plant(f, 'foreman')).toBe(false);
  });
  it('only one path can be chosen', () => {
    const s = seeded(1000);
    for (const id of ['grip', 'streak', 'pathPick', 'dreamer', 'founder']) expect(plant(s, id)).toBe(true);
    expect(plant(s, 'pathAuto')).toBe(false);
  });
  it('paths change the game: more perches, longer nights', () => {
    const s = seeded(1000);
    const p = perchCount(s);
    for (const id of ['dreamer', 'founder', 'pathAuto']) plant(s, id);
    expect(perchCount(s)).toBe(p + 1);
    const o = seeded(1000);
    for (const id of ['clover', 'patience', 'pathOracle']) plant(o, id);
    expect(nightLength(o)).toBe(DAY_NIGHT.cycle * 0.5);
  });
  it('re-planting is free but only at the start of an island', () => {
    const s = seeded(100);
    plant(s, 'grip');
    expect(canRespec(s)).toBe(true);
    s.stats.runSeconds = TALENT.respecWindow + 1;
    expect(respec(s)).toBe(false);
    s.stats.runSeconds = 0;
    expect(respec(s)).toBe(true);
    expect(seedsFree(s)).toBe(100);
  });
  it('Rêveur raises the offline cap, Fondations seeds new islands', () => {
    const s = seeded(100);
    s.machines.drill = 10;
    plant(s, 'dreamer');
    const r = applyOffline(s, 20 * 3600 * 1000);
    expect(r.creditedSeconds).toBe(10 * 3600);
    const p = seeded(100);
    plant(p, 'dreamer');
    plant(p, 'founder');
    p.zones = { home: true, forge: true, geyser: true, sky: true };
    p.stats.runShards = 1e15;
    doPrestige(p);
    expect(p.machines.excavator).toBe(5);
  });
  it('the Contremaître buys the best machine with at most half the stock', () => {
    const s = seeded(100);
    plant(s, 'foreman');
    s.autoBuy = true;
    s.machines.drill = 1;
    s.shards = 1e6;
    const got = autoBuyStep(s, () => 1, () => 100, () => true);
    expect(got).toBe('drill');
    s.shards = 150;
    expect(autoBuyStep(s, () => 1, () => 100, () => true)).toBeNull();
  });
  it('talents survive a save', () => {
    const s = seeded(100);
    plant(s, 'grip');
    plant(s, 'grip');
    const b = deserialize(serialize(s), 0);
    expect(b.talents).toEqual({ grip: 2 });
    expect(b.seedsPlanted).toBe(s.seedsPlanted);
  });
});
