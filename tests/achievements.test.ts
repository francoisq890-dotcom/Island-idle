import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, ACH_CATEGORIES, tierFor, TOTAL_TIERS } from '../src/config/achievements';
import { achievementTotals, checkAchievements } from '../src/economy/achievements';
import { createInitialState } from '../src/economy/state';
import { deserialize } from '../src/save/save';

describe('achievements v2', () => {
  it('has at least 60 achievements in 6 categories, mostly tiered, some hidden', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const c of ACH_CATEGORIES) expect(ACHIEVEMENTS.some((a) => a.cat === c.id)).toBe(true);
    expect(ACHIEVEMENTS.filter((a) => a.goals.length === 3).length).toBeGreaterThanOrEqual(45);
    expect(ACHIEVEMENTS.filter((a) => a.secret).length).toBeGreaterThanOrEqual(5);
    expect(TOTAL_TIERS).toBeGreaterThan(150);
    for (const a of ACHIEVEMENTS) {
      expect(a.values.length).toBe(a.goals.length);
      for (const v of a.values) expect(v).toBeGreaterThan(0);
      // Goals are strictly ordered (ascending, or descending for records where lower is better).
      for (let i = 1; i < a.goals.length; i++) expect(a.lower ? a.goals[i] < a.goals[i - 1] : a.goals[i] > a.goals[i - 1]).toBe(true);
    }
  });
  it('records where lower is better ignore the empty record', () => {
    const def = ACHIEVEMENTS.find((a) => a.id === 'fastIsland')!;
    expect(tierFor(def, 0)).toBe(0);
    expect(tierFor(def, 1000)).toBe(1);
    expect(tierFor(def, 200)).toBe(3);
  });
  it('every tier adds its reward', () => {
    const s = createInitialState(0);
    s.counters.golden = 60;
    checkAchievements(s);
    expect(s.achievements.golden).toBe(3);
    expect(achievementTotals(s).click).toBeCloseTo(0.05 + 0.08 + 0.1);
  });
  it('a fresh state unlocks nothing', () => {
    expect(checkAchievements(createInitialState(0))).toHaveLength(0);
  });
});

describe('save migration v2 → v3', () => {
  it('maps old achievements to tiers and builds the rune index', () => {
    const v2 = { version: 2, shards: 10, machines: { drill: 3 }, achievements: { hits5000: true, gotEpic: true, prest1: true, unknown: true }, runes: { st1: 4, em5: 1 }, stats: { allTimeHarvests: 6000, prestiges: 1 }, lastSeen: 0, islandSeed: 1 };
    const s = deserialize(JSON.stringify(v2), 0);
    expect(s.version).toBe(3);
    expect(s.achievements.hits).toBe(2);
    expect(s.achievements.best).toBe(2);
    expect(s.achievements.prestiges).toBe(1);
    expect(s.achievements.unknown).toBeUndefined();
    expect(s.runeIndex).toEqual({ st1: true, em5: true });
    expect(s.flags.migratedV3).toBe(true);
  });
  it('rejects nonsense tiers', () => {
    const v3 = { version: 3, achievements: { hits: 99, golden: -2, drill: 'x' }, lastSeen: 0 };
    const s = deserialize(JSON.stringify(v3), 0);
    expect(s.achievements.hits).toBe(3);
    expect(s.achievements.golden).toBeUndefined();
    expect(s.achievements.drill).toBeUndefined();
  });
});
