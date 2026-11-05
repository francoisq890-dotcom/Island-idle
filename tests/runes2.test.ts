import { describe, expect, it } from 'vitest';
import { DAY_NIGHT } from '../src/config/daynight';
import { GUARDIAN } from '../src/config/guardians';
import { FAMILY_ORDER, FUSE, PITY, RUNE_BY_ID, RUNE_SETS, RUNES } from '../src/config/runes';
import { nightLength } from '../src/economy/daynight';
import { computeRates, harvestEx } from '../src/economy/economy';
import { defeatGuardian, guardiansUnlocked } from '../src/economy/guardians';
import { activeSets, canFuse, canRoll, doRoll, fuse, fuseResult, runeTotals } from '../src/economy/runes';
import { createInitialState, type GameState } from '../src/economy/state';
import { deserialize, serialize } from '../src/save/save';

const rich = (): GameState => {
  const s = createInitialState(0);
  s.shards = 1e12;
  s.lumen = 1e12;
  s.zones = { home: true, forge: true, geyser: true, sky: true };
  return s;
};

describe('runes v2: families', () => {
  it('has 6 families of 7 runes, unique ids', () => {
    expect(FAMILY_ORDER).toHaveLength(6);
    expect(RUNES).toHaveLength(42);
    expect(new Set(RUNES.map((r) => r.id)).size).toBe(42);
  });
  it('the Moon altar only rolls at night; warden runes never roll at an altar', () => {
    const s = rich();
    expect(canRoll(s, 'moon')).toBe(false);
    s.clock = DAY_NIGHT.cycle - 5;
    expect(canRoll(s, 'moon')).toBe(true);
    expect(doRoll(s, 'moon', () => 0.99)).toHaveLength(1);
    expect(canRoll(s, 'warden')).toBe(false);
  });
});

describe('runes v2: fusion', () => {
  it('5 copies + fragments give one rune of the next rarity', () => {
    const s = rich();
    s.runes.st1 = 7;
    s.fragments = 10;
    const st1 = RUNE_BY_ID.get('st1')!;
    expect(fuseResult(st1)!.id).toBe('st2');
    const out = fuse(s, st1);
    expect(out!.id).toBe('st2');
    expect(s.runes.st1).toBe(7 - FUSE.copies);
    expect(s.runes.st2).toBe(1);
    expect(s.fragments).toBe(10 - FUSE.fragments[0]);
    expect(s.runeIndex.st2).toBe(true);
    expect(s.counters.fusions).toBe(1);
  });
  it('needs enough copies and fragments, stops at legendary', () => {
    const s = rich();
    s.runes.st4 = 5;
    s.fragments = FUSE.fragments[3] - 1;
    expect(canFuse(s, RUNE_BY_ID.get('st4')!)).toBe(false);
    s.fragments += 1;
    expect(fuse(s, RUNE_BY_ID.get('st4')!)!.id).toBe('st5');
    s.runes.st5 = 10;
    s.fragments = 1e6;
    expect(fuseResult(RUNE_BY_ID.get('st5')!)).toBeNull();
    expect(canFuse(s, RUNE_BY_ID.get('st5')!)).toBe(false);
  });
});

describe('runes v2: sets', () => {
  it('a complete set adds its bonus', () => {
    const s = createInitialState(0);
    const quarry = RUNE_SETS.find((x) => x.id === 'quarry')!;
    s.runes = { st1: 1, st2: 1, st3: 1 };
    const before = runeTotals(s).click;
    expect(activeSets(s)).toHaveLength(0);
    s.runes.st4 = 1;
    expect(activeSets(s).map((x) => x.id)).toContain('quarry');
    expect(runeTotals(s).click - before).toBeCloseTo(quarry.value, 5);
  });
  it('family pieces accept any rune of that rarity or better', () => {
    const s = createInitialState(0);
    s.runes = { st5: 1, em3: 1, mi4: 1, sa3: 1 };
    expect(activeSets(s).map((x) => x.id)).toContain('elements');
  });
});

describe('runes v2: pity', () => {
  it('guarantees an epic after a long unlucky streak', () => {
    const s = rich();
    for (let i = 0; i < PITY.epic - 1; i++) doRoll(s, 'stone', () => 0.999);
    expect(s.runes.st4 ?? 0).toBe(0);
    expect(s.pity.epic).toBe(PITY.epic - 1);
    doRoll(s, 'stone', () => 0.999);
    expect(s.runes.st4).toBe(1);
    expect(s.pity.epic).toBe(0);
    expect(s.counters.pity).toBe(1);
  });
  it('pity survives a save', () => {
    const s = createInitialState(0);
    s.pity = { epic: 42, legendary: 420 };
    s.fragments = 33;
    const back = deserialize(serialize(s), 0);
    expect(back.pity).toEqual({ epic: 42, legendary: 420 });
    expect(back.fragments).toBe(33);
  });
});

describe('runes v2: mythic specials', () => {
  it('Écho and Phénix show up in the rates, Éclipse doubles the night', () => {
    const s = createInitialState(0);
    expect(computeRates(s).echo).toBe(false);
    s.runes.st6 = 1;
    s.runes.em6 = 1;
    const r = computeRates(s);
    expect(r.echo).toBe(true);
    expect(r.phoenix).toBe(true);
    const n = nightLength(s);
    s.runes.mo6 = 1;
    expect(nightLength(s)).toBeCloseTo(n * 2);
  });
  it('a forced crit (Phénix) multiplies the strike; an echo does not count as a strike', () => {
    const s = createInitialState(0);
    const r = computeRates(s);
    const a = harvestEx(s, r, () => 0.99, { forceCrit: true });
    expect(a.crit).toBe(true);
    const h = s.stats.harvests;
    harvestEx(s, r, () => 0.99, { scale: 0.5, echo: true });
    expect(s.stats.harvests).toBe(h);
  });
});

describe('crystal guardians', () => {
  it('appear once the Forges are open and drop fragments, warden runes and shards', () => {
    const s = createInitialState(0);
    expect(guardiansUnlocked(s)).toBe(false);
    s.zones.forge = true;
    s.machines.drill = 20;
    const r = computeRates(s);
    const shards = s.stats.allTimeShards;
    const loot = defeatGuardian(s, r, 9.5, () => 0.5);
    expect(loot.fragments).toBe(GUARDIAN.fragBase);
    expect(s.fragments).toBe(GUARDIAN.fragBase);
    expect(loot.runes.length).toBeGreaterThanOrEqual(GUARDIAN.runes[0]);
    expect(loot.runes.every((x) => x.family === 'warden')).toBe(true);
    expect(s.stats.allTimeShards).toBeGreaterThan(shards);
    expect(s.counters.guardians).toBe(1);
    expect(s.counters.guardFast).toBe(9.5);
  });
});
