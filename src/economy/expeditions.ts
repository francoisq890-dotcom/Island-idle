/** Pure expedition rules. Times are real epoch milliseconds, so trips go on while the game is closed. */
import { EXPEDITION, EXPEDITIONS } from '../config/expeditions';
import { PET_RARITIES } from '../config/familiars';
import { ALTAR_FAMILIES, FAMILIES, type RuneDef } from '../config/runes';
import { addLumen, addShards, type Rates } from './economy';
import { PETS } from '../config/familiars';
import { drawRunes, familyUnlocked, luckOf } from './runes';
import { perchCount } from './familiars';
import type { Expedition, GameState } from './state';

export function expeditionsUnlocked(state: GameState): boolean {
  return state.stats.prestiges > 0 && state.pets.length > 0;
}

export function freeSlots(state: GameState): number {
  return EXPEDITION.slots - state.expeditions.length;
}

/** Loot multiplier of a familiar (rarity, level, manta trait). */
export function petLootMult(state: GameState, petId: number): number {
  const p = state.pets.find((x) => x.id === petId);
  if (!p) return 1;
  const ri = PET_RARITIES.findIndex((r) => r.id === p.rarity);
  return EXPEDITION.rarityMult[ri] * (1 + PETS.perLevel * (p.level - 1)) * (p.species === 'manta' ? 1 + EXPEDITION.mantaBonus : 1);
}

export interface ExpeditionLoot {
  shards: number;
  lumen: number;
  fragments: number;
  eggChance: number;
  runes: number;
}

/** Expected loot of a trip (fixed at departure). */
export function previewLoot(state: GameState, rates: Rates, petId: number, seconds: number): ExpeditionLoot {
  const m = petLootMult(state, petId);
  const share = EXPEDITION.productionShare * Math.min(2, Math.sqrt(m));
  return {
    shards: Math.max(0, rates.shards - rates.pets) * seconds * share,
    lumen: rates.lumen * seconds * share,
    fragments: Math.round((EXPEDITION.fragBase + (seconds / 600) * EXPEDITION.fragPer10min) * m * rates.fragMult),
    eggChance: Math.min(0.9, (EXPEDITION.eggBase + EXPEDITION.eggLong * Math.min(1, seconds / (8 * 3600))) * Math.sqrt(m)),
    runes: 1 + Math.floor(seconds / EXPEDITION.runeEvery),
  };
}

export function startExpedition(state: GameState, rates: Rates, petId: number, durationId: string, now = Date.now()): boolean {
  const d = EXPEDITIONS.find((x) => x.id === durationId);
  const p = state.pets.find((x) => x.id === petId);
  if (!d || !p || p.away || freeSlots(state) <= 0 || !expeditionsUnlocked(state)) return false;
  const loot = previewLoot(state, rates, petId, d.seconds);
  p.away = true;
  p.perched = false;
  state.expeditions.push({ petId, duration: d.id, start: now, end: now + d.seconds * 1000, loot });
  return true;
}

export function isDone(e: Expedition, now = Date.now()): boolean {
  return now >= e.end;
}

export interface ClaimResult {
  loot: ExpeditionLoot;
  egg: boolean;
  runes: RuneDef[];
}

/** Bring a finished expedition home: pay the loot, the familiar perches again if there is room. */
export function claimExpedition(state: GameState, index: number, now = Date.now(), rng: () => number = Math.random): ClaimResult | null {
  const e = state.expeditions[index];
  if (!e || !isDone(e, now)) return null;
  state.expeditions.splice(index, 1);
  const L = e.loot;
  addShards(state, L.shards);
  addLumen(state, L.lumen);
  state.fragments += L.fragments;
  const egg = state.pets.length + state.eggs < PETS.maxOwned && rng() < L.eggChance;
  if (egg) state.eggs += 1;
  const fams = ALTAR_FAMILIES.filter((f) => familyUnlocked(state, f) || FAMILIES[f].zone === 'home');
  const runes: RuneDef[] = [];
  const luck = luckOf(state);
  for (let i = 0; i < L.runes; i++) runes.push(...drawRunes(state, fams[Math.floor(rng() * fams.length) % fams.length], 1, luck, rng, false));
  const p = state.pets.find((x) => x.id === e.petId);
  if (p) {
    p.away = false;
    const perchedN = state.pets.filter((x) => x.perched && !x.away).length;
    p.perched = perchedN < perchCount(state);
  }
  state.counters.expeditions += 1;
  if (e.duration === 'odyssey') state.counters.longExpeditions += 1;
  return { loot: L, egg, runes };
}
