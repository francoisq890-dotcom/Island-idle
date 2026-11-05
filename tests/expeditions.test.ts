import { describe, expect, it } from 'vitest';
import { EXPEDITION, RIFT } from '../src/config/expeditions';
import { computeRates } from '../src/economy/economy';
import { buyOffer, merchantOffers, openSurge, surgeLeft } from '../src/economy/events2';
import { claimExpedition, expeditionsUnlocked, freeSlots, startExpedition } from '../src/economy/expeditions';
import { hatch } from '../src/economy/familiars';
import { applyOffline } from '../src/economy/offline';
import { createInitialState } from '../src/economy/state';
import { deserialize, serialize } from '../src/save/save';

const ready = () => {
  const s = createInitialState(0);
  s.zones = { home: true, forge: true, geyser: true, sky: false };
  s.stats.prestiges = 1;
  s.machines.drill = 30;
  s.machines.refinery = 5;
  s.eggs = 3;
  for (let i = 0; i < 3; i++) hatch(s, 1, () => 0.1);
  return s;
};

describe('expeditions', () => {
  it('unlock after the first descent with a familiar', () => {
    expect(expeditionsUnlocked(createInitialState(0))).toBe(false);
    expect(expeditionsUnlocked(ready())).toBe(true);
  });
  it('the familiar leaves its perch, comes back with loot after the trip (real time)', () => {
    const s = ready();
    const r = computeRates(s);
    const pet = s.pets[0];
    expect(startExpedition(s, r, pet.id, 'short', 1000)).toBe(true);
    expect(pet.away && !pet.perched).toBe(true);
    expect(computeRates(s).pets).toBeLessThan(r.pets);
    expect(claimExpedition(s, 0, 1000 + 599_000)).toBeNull();
    const shards = s.stats.allTimeShards;
    const res = claimExpedition(s, 0, 1000 + 600_000, () => 0.99)!;
    expect(res.loot.fragments).toBeGreaterThan(0);
    expect(s.stats.allTimeShards).toBeGreaterThan(shards);
    expect(pet.away).toBe(false);
    expect(s.counters.expeditions).toBe(1);
  });
  it('slots are limited and trips survive a save', () => {
    const s = ready();
    const r = computeRates(s);
    for (let i = 0; i < EXPEDITION.slots; i++) expect(startExpedition(s, r, s.pets[i].id, 'trip', 0)).toBe(true);
    expect(freeSlots(s)).toBe(0);
    expect(startExpedition(s, r, s.pets[2].id, 'trip', 0)).toBe(false);
    const b = deserialize(serialize(s), 0);
    expect(b.expeditions).toHaveLength(EXPEDITION.slots);
    expect(b.pets.filter((p) => p.away)).toHaveLength(EXPEDITION.slots);
  });
});

describe('rift and merchant', () => {
  it('a closed rift multiplies production for a while, never offline', () => {
    const s = ready();
    const base = computeRates(s).shards;
    openSurge(s);
    expect(computeRates(s).shards).toBeCloseTo(base * RIFT.surgeMult, 3);
    expect(surgeLeft(s)).toBe(RIFT.surgeSeconds);
    applyOffline(s, 3600 * 1000);
    expect(surgeLeft(s)).toBe(0);
  });
  it('the merchant sells eggs, fragments and a guaranteed rare+ rune for Lumen', () => {
    const s = ready();
    s.lumen = 1e9;
    const r = computeRates(s);
    expect(merchantOffers(s, r)).toHaveLength(3);
    expect(buyOffer(s, r, 'frags')).toBe(true);
    expect(s.fragments).toBe(20);
    const rune = buyOffer(s, r, 'rune', () => 0.999);
    expect(rune && rune !== true && ['rare', 'epic', 'legendary', 'mythic', 'celestial'].includes(rune.rarity)).toBe(true);
    expect(s.counters.merchant).toBe(2);
  });
});
