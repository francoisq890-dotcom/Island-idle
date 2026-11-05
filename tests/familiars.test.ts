import { describe, expect, it } from 'vitest';
import { PETS, SPECIES } from '../src/config/familiars';
import { computeRates, unlockZone } from '../src/economy/economy';
import { buyEgg, eggCost, familiarsUnlocked, hatch, hatchOdds, levelCost, levelUp, perchCount, perched, setPerched } from '../src/economy/familiars';
import { OBJECTIVES } from '../src/economy/objectives';
import { createInitialState, SAVE_VERSION } from '../src/economy/state';
import { deserialize, serialize } from '../src/save/save';

const geyserState = () => {
  const s = createInitialState(0);
  s.zones = { home: true, forge: true, geyser: false, sky: false };
  s.shards = 1e9;
  s.lumen = 1e9;
  return s;
};

describe('familiars', () => {
  it('unlock with the Geysers island, which offers the first egg (once)', () => {
    const s = geyserState();
    expect(familiarsUnlocked(s)).toBe(false);
    expect(unlockZone(s, 'geyser')).toBe(true);
    expect(familiarsUnlocked(s)).toBe(true);
    expect(s.eggs).toBe(1);
  });
  it('hatch, perch automatically, and strike for a share of the strike value', () => {
    const s = geyserState();
    unlockZone(s, 'geyser');
    const before = computeRates(s);
    const pet = hatch(s, 1, () => 0)!;
    expect(pet.rarity).toBe('common');
    expect(pet.perched).toBe(true);
    const after = computeRates(s);
    expect(after.pets).toBeCloseTo((0.25 / SPECIES[pet.species].period) * after.click, 6);
    expect(after.shards).toBeGreaterThan(before.shards);
    expect(s.counters.pets).toBe(1);
  });
  it('perches are limited; extra familiars rest', () => {
    const s = geyserState();
    s.zones.geyser = true;
    s.eggs = PETS.perches + 1;
    for (let i = 0; i <= PETS.perches; i++) hatch(s, 1, () => 0.5);
    expect(perched(s)).toHaveLength(perchCount(s));
    const resting = s.pets.find((p) => !p.perched)!;
    expect(setPerched(s, resting.id, true)).toBe(false);
    setPerched(s, s.pets[0].id, false);
    expect(setPerched(s, resting.id, true)).toBe(true);
  });
  it('eggs get dearer, levels cost Lumen and cap', () => {
    const s = geyserState();
    s.zones.geyser = true;
    const c0 = eggCost(s).lumen!;
    expect(buyEgg(s)).toBe(true);
    expect(eggCost(s).lumen!).toBe(Math.ceil(c0 * PETS.eggGrowth));
    const p = hatch(s, 1, () => 0)!;
    expect(levelUp(s, p.id)).toBe(true);
    expect(p.level).toBe(2);
    p.level = PETS.maxLevel;
    expect(levelCost(p)).toBeNull();
    expect(levelUp(s, p.id)).toBe(false);
  });
  it('luck nudges hatch odds towards rarer familiars', () => {
    const a = hatchOdds(1);
    const b = hatchOdds(20);
    expect(a.reduce((x, y) => x + y, 0)).toBeCloseTo(1);
    expect(b[3]).toBeGreaterThan(a[3]);
    expect(b[0]).toBeLessThan(a[0]);
  });
  it('familiars survive a save', () => {
    const s = geyserState();
    s.zones.geyser = true;
    s.eggs = 2;
    hatch(s, 1, () => 0.99);
    const back = deserialize(serialize(s), 0);
    expect(back.pets).toEqual(s.pets);
    expect(back.eggs).toBe(1);
    expect(back.petSerial).toBe(s.petSerial);
  });
});

describe('save migration v3 → v4', () => {
  it('shifts the tutorial past the new familiar step and offers the egg', () => {
    const idx = OBJECTIVES.findIndex((o) => o.id === 'pet1');
    expect(idx).toBe(13);
    const s = deserialize(JSON.stringify({ version: 3, objective: 15, lastSeen: 0 }), 0);
    expect(s.version).toBe(SAVE_VERSION);
    expect(OBJECTIVES[s.objective].id).toBe(OBJECTIVES[16].id);
    expect(s.eggs).toBe(1);
    const early = deserialize(JSON.stringify({ version: 3, objective: 5, lastSeen: 0 }), 0);
    expect(early.objective).toBe(5);
    expect(early.eggs).toBe(0);
  });
});
