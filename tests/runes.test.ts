import { describe, expect, it } from 'vitest';
import { FAMILIES, RARITIES, RUNES, STAT_CAP } from '../src/config/runes';
import { computeRates, doPrestige, harvestEx, nextMachineCost } from '../src/economy/economy';
import { bulkOf, buyAltarUpgrade, cooldownOf, doRoll, luckOf, oddsLabel, rarityChances, rollRarity, runeTotals, runesAfterPrestige, stacked } from '../src/economy/runes';
import { checkAchievements } from '../src/economy/achievements';
import { mulberry32 } from '../src/core/noise';
import { createInitialState } from '../src/economy/state';
import { deserialize } from '../src/save/save';

describe('rune odds', () => {
  it('sum to 1 and follow the base table without luck', () => {
    const p = rarityChances(1);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    RARITIES.forEach((r, i) => i > 0 && expect(p[i]).toBeCloseTo(1 / r.oneIn));
    expect(p[RARITIES.length - 1]).toBeCloseTo(1e-6); // celestial ~ 1 in a million
  });
  it('luck pushes probability towards rare tiers, never above 1', () => {
    const a = rarityChances(1);
    const b = rarityChances(10);
    expect(b[3]).toBeGreaterThan(a[3]);
    expect(b[0]).toBeLessThan(a[0]);
    const huge = rarityChances(1e9);
    expect(huge.reduce((x, y) => x + y, 0)).toBeCloseTo(1);
    expect(huge[RARITIES.length - 1]).toBe(1);
  });
  it('sampling matches the table', () => {
    const rng = mulberry32(42);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 200_000; i++) {
      const r = rollRarity(1, rng);
      counts[r] = (counts[r] ?? 0) + 1;
    }
    expect(counts.uncommon / 200_000).toBeCloseTo(1 / 5, 2);
    expect(counts.rare / 200_000).toBeCloseTo(1 / 14, 2);
  });
  it('formats odds', () => {
    expect(oddsLabel(1 / 1_000_000)).toBe('1 sur 1.00M');
    expect(oddsLabel(1 / 90)).toBe('1 sur 90');
    expect(oddsLabel(0.5)).toBe('50 %');
  });
});

describe('rolling', () => {
  it('pays once and gives `bulk` runes of the altar family', () => {
    const s = createInitialState(0);
    s.shards = 10_000;
    s.altar.bulk = 3;
    const got = doRoll(s, 'stone', mulberry32(1));
    expect(got).toHaveLength(4);
    expect(got.every((r) => r.family === 'stone')).toBe(true);
    expect(s.shards).toBe(10_000 - FAMILIES.stone.rollCost.shards!);
    expect(s.runeStats.rolls).toBe(1);
  });
  it('cannot roll a locked family or without money', () => {
    const s = createInitialState(0);
    expect(doRoll(s, 'stone')).toHaveLength(0);
    s.lumen = 1e6;
    expect(doRoll(s, 'ember')).toHaveLength(0); // forge not unlocked
  });
  it('duplicates stack with diminishing returns and caps', () => {
    expect(stacked(0.01, 1)).toBeCloseTo(0.01);
    expect(stacked(0.01, 100)).toBeGreaterThan(stacked(0.01, 50));
    expect(stacked(0.01, 100)).toBeLessThan(1);
    const s = createInitialState(0);
    s.runes.em4 = 1e6; // cost reduction rune
    expect(runeTotals(s).cost).toBe(STAT_CAP.cost);
  });
  it('runes boost the economy', () => {
    const s = createInitialState(0);
    s.machines.drill = 10;
    const before = computeRates(s).shards;
    s.runes.st1 = 10;
    expect(computeRates(s).shards).toBeCloseTo(before * (1 + stacked(0.01, 10)));
    s.runes.em4 = 5;
    expect(nextMachineCost(s, 'drill').shards!).toBeLessThan(Math.ceil(10 * Math.pow(1.15, 10)));
  });
  it('critical strikes multiply the gain', () => {
    const s = createInitialState(0);
    s.runes.em5 = 50;
    const r = computeRates(s);
    expect(r.critChance).toBeGreaterThan(0);
    const h = harvestEx(s, r, () => 0);
    expect(h.crit).toBe(true);
    expect(h.value).toBeCloseTo(r.click * 5);
  });
  it('altar upgrades raise luck, bulk and speed', () => {
    const s = createInitialState(0);
    s.shards = 1e9;
    const l0 = luckOf(s);
    expect(buyAltarUpgrade(s, 'luck')).toBe(true);
    expect(luckOf(s)).toBeGreaterThan(l0);
    expect(buyAltarUpgrade(s, 'bulk')).toBe(true);
    expect(bulkOf(s)).toBe(2);
    const c0 = cooldownOf(s);
    buyAltarUpgrade(s, 'speed');
    expect(cooldownOf(s)).toBeLessThan(c0);
    expect(buyAltarUpgrade(s, 'auto')).toBe(false); // needs the forge
  });
});

describe('runes and prestige', () => {
  it('only epic and rarer runes survive', () => {
    const kept = runesAfterPrestige({ st1: 50, st3: 4, st4: 2, st7: 1 });
    expect(kept).toEqual({ st4: 2, st7: 1 });
  });
  it('doPrestige applies retention and keeps auto-roll', () => {
    const s = createInitialState(0);
    s.zones = { home: true, forge: true, geyser: true, sky: true };
    s.stats.runShards = 1e9;
    s.runes = { st1: 10, st5: 1 };
    s.altar = { luck: 5, bulk: 2, speed: 3, auto: true };
    doPrestige(s);
    expect(s.runes).toEqual({ st5: 1 });
    expect(s.altar).toEqual({ luck: 0, bulk: 0, speed: 0, auto: true });
    expect(s.lifetimeSeeds).toBe(s.seeds);
  });
});

describe('achievements', () => {
  it('unlock once and give permanent bonuses', () => {
    const s = createInitialState(0);
    s.stats.allTimeHarvests = 600;
    const got = checkAchievements(s).map((a) => a.id);
    expect(got).toContain('firstHit');
    expect(got).toContain('hits500');
    expect(checkAchievements(s)).toHaveLength(0);
    expect(computeRates(s).click).toBeGreaterThan(1);
  });
});

describe('save migration v1 → v2', () => {
  it('upgrades an old save without losing progress', () => {
    const v1 = { version: 1, shards: 1234, lumen: 5, seeds: 3, machines: { drill: 12 }, upgrades: { pick1: true }, zones: { forge: true }, objective: 4, flags: { nearCrystal: true }, stats: { runShards: 99 }, settings: {}, player: { x: 1, z: 2, yaw: 0 }, lastSeen: 0, islandSeed: 2 };
    const s = deserialize(JSON.stringify(v1), 0);
    expect(s.version).toBe(2);
    expect(s.shards).toBe(1234);
    expect(s.machines.drill).toBe(12);
    expect(s.upgrades.pick1).toBe(true);
    expect(s.runes).toEqual({});
    expect(s.altar.auto).toBe(false);
    expect(s.lifetimeSeeds).toBe(3);
    expect(s.flags.migratedV2).toBe(true);
  });
  it('keeps every rune id valid', () => {
    expect(new Set(RUNES.map((r) => r.id)).size).toBe(RUNES.length);
    expect(RUNES).toHaveLength(28);
  });
});
