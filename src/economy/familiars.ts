/** Pure familiar rules: hatching, levels, perches and their strike income. */
import { PET_RARITIES, PETS, SPECIES, SPECIES_ORDER, type PetRarity, type SpeciesId } from '../config/familiars';
import type { Cost } from '../config/economy';
import { isNight } from './daynight';
import { talentPerches } from './talents';
import type { GameState, Pet } from './state';

export function familiarsUnlocked(state: GameState): boolean {
  return state.zones.geyser || state.pets.length > 0;
}

export function rarityDef(r: PetRarity) {
  return PET_RARITIES.find((x) => x.id === r)!;
}

/** Strike power of a familiar (fraction of a pickaxe strike). */
export function petPower(state: GameState, p: Pet, petBonus = 0): number {
  let pw = rarityDef(p.rarity).power * (1 + PETS.perLevel * (p.level - 1)) * (1 + petBonus);
  if (p.species === 'owl' && isNight(state)) pw *= PETS.owlNight;
  return pw;
}

export function perchCount(state: GameState): number {
  return PETS.perches + state.extraPerches + talentPerches(state);
}

export function perched(state: GameState): Pet[] {
  return state.pets.filter((p) => p.perched && !p.away);
}

/** Pickaxe strikes per second worth of familiars (multiply by the click value). */
export function petStrikesPerSecond(state: GameState, petBonus = 0): number {
  let s = 0;
  for (const p of perched(state)) s += petPower(state, p, petBonus) / SPECIES[p.species].period;
  return s;
}

function scale(c: Cost, f: number): Cost {
  const o: Cost = {};
  if (c.shards) o.shards = Math.ceil(c.shards * f);
  if (c.lumen) o.lumen = Math.ceil(c.lumen * f);
  return o;
}

export function eggCost(state: GameState): Cost {
  return scale(PETS.eggCost, Math.pow(PETS.eggGrowth, state.eggsBought));
}

export function levelCost(p: Pet): Cost | null {
  if (p.level >= PETS.maxLevel) return null;
  const r = PET_RARITIES.findIndex((x) => x.id === p.rarity);
  return scale(PETS.levelCost, Math.pow(PETS.levelGrowth, p.level - 1) * (1 + r * 0.5));
}

function afford(state: GameState, c: Cost): boolean {
  return (c.shards ?? 0) <= state.shards + 1e-9 && (c.lumen ?? 0) <= state.lumen + 1e-9;
}
function pay(state: GameState, c: Cost): void {
  state.shards -= c.shards ?? 0;
  state.lumen -= c.lumen ?? 0;
}

export function canBuyEgg(state: GameState): boolean {
  return familiarsUnlocked(state) && state.pets.length + state.eggs < PETS.maxOwned && afford(state, eggCost(state));
}

export function buyEgg(state: GameState): boolean {
  if (!canBuyEgg(state)) return false;
  pay(state, eggCost(state));
  state.eggsBought += 1;
  state.eggs += 1;
  return true;
}

/** Rarity odds when hatching; luck nudges them a little (luck^0.35). */
export function hatchOdds(luck = 1): number[] {
  const k = Math.pow(Math.max(1, luck), 0.35);
  const w = PET_RARITIES.map((r, i) => r.weight * (i === 0 ? 1 : Math.pow(k, i)));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
}

/** Hatch one egg: a random species and rarity. The new familiar perches if a perch is free. */
export function hatch(state: GameState, luck = 1, rng: () => number = Math.random): Pet | null {
  if (state.eggs <= 0 || state.pets.length >= PETS.maxOwned) return null;
  state.eggs -= 1;
  const odds = hatchOdds(luck);
  let u = rng();
  let ri = 0;
  for (; ri < odds.length - 1; ri++) {
    if (u < odds[ri]) break;
    u -= odds[ri];
  }
  const species: SpeciesId = SPECIES_ORDER[Math.floor(rng() * SPECIES_ORDER.length) % SPECIES_ORDER.length];
  const pet: Pet = { id: ++state.petSerial, species, rarity: PET_RARITIES[ri].id, level: 1, perched: perched(state).length < perchCount(state), away: false };
  state.pets.push(pet);
  state.counters.eggs += 1;
  state.counters.pets = Math.max(state.counters.pets, state.pets.length);
  return pet;
}

export function levelUp(state: GameState, id: number): boolean {
  const p = state.pets.find((x) => x.id === id);
  if (!p) return false;
  const c = levelCost(p);
  if (!c || !afford(state, c)) return false;
  pay(state, c);
  p.level += 1;
  state.counters.petLevel = Math.max(state.counters.petLevel, p.level);
  return true;
}

/** Put a familiar on a perch (or take it down). */
export function setPerched(state: GameState, id: number, on: boolean): boolean {
  const p = state.pets.find((x) => x.id === id);
  if (!p || p.away) return false;
  if (on && !p.perched && perched(state).length >= perchCount(state)) return false;
  p.perched = on;
  return true;
}
