/** Events added after the first descent: ether rift ("Afflux") and the travelling merchant. Pure rules. */
import { MERCHANT, RIFT } from '../config/expeditions';
import { PETS } from '../config/familiars';
import { ALTAR_FAMILIES, RARITIES, RARITY_INDEX, type RuneDef } from '../config/runes';
import type { Cost } from '../config/economy';
import type { Rates } from './economy';
import { eggCost, familiarsUnlocked } from './familiars';
import { drawRunes, familyUnlocked, luckOf, runeFor } from './runes';
import type { GameState } from './state';

export function laterEventsUnlocked(state: GameState): boolean {
  return state.stats.prestiges > 0;
}

/** Closing a rift: production ×RIFT.surgeMult for RIFT.surgeSeconds of game time. */
export function openSurge(state: GameState): void {
  state.surge = { mult: RIFT.surgeMult, until: state.clock + RIFT.surgeSeconds };
  state.counters.rifts += 1;
}

export function surgeLeft(state: GameState): number {
  return Math.max(0, state.surge.until - state.clock);
}

export type OfferId = 'egg' | 'frags' | 'rune';

export interface Offer {
  id: OfferId;
  name: string;
  desc: string;
  cost: Cost;
  available: boolean;
}

export function merchantOffers(state: GameState, rates: Rates): Offer[] {
  const egg = eggCost(state);
  return [
    { id: 'egg', name: 'Œuf de familier', desc: 'Un œuf, moins cher qu’au nid (le prix du nid ne bouge pas).', cost: { lumen: Math.ceil((egg.lumen ?? 0) * MERCHANT.eggPriceFactor) }, available: familiarsUnlocked(state) && state.pets.length + state.eggs < PETS.maxOwned },
    { id: 'frags', name: `${MERCHANT.fragmentsPack} fragments de rune`, desc: 'De quoi fusionner au Creuset.', cost: { lumen: Math.ceil(Math.max(MERCHANT.fragmentsMinLumen, rates.lumen * MERCHANT.fragmentsSeconds)) }, available: true },
    { id: 'rune', name: 'Rune garantie', desc: 'Une rune rare ou mieux, de la famille la plus lointaine que tu as atteinte.', cost: { lumen: Math.ceil(Math.max(MERCHANT.runeMinLumen, rates.lumen * MERCHANT.runeSeconds)) }, available: true },
  ];
}

/** Buy an offer. Returns the rune for 'rune' offers, true otherwise, null when impossible. */
export function buyOffer(state: GameState, rates: Rates, id: OfferId, rng: () => number = Math.random): RuneDef | true | null {
  const o = merchantOffers(state, rates).find((x) => x.id === id);
  if (!o || !o.available || (o.cost.lumen ?? 0) > state.lumen + 1e-9) return null;
  state.lumen -= o.cost.lumen ?? 0;
  state.counters.merchant += 1;
  if (id === 'egg') {
    state.eggs += 1;
    return true;
  }
  if (id === 'frags') {
    state.fragments += MERCHANT.fragmentsPack;
    return true;
  }
  const fam = [...ALTAR_FAMILIES].reverse().find((f) => familyUnlocked(state, f) && f !== 'moon') ?? 'stone';
  const got = drawRunes(state, fam, 1, luckOf(state), rng, false)[0];
  if (RARITY_INDEX[got.rarity] >= RARITY_INDEX.rare) return got;
  // Upgrade to rare: give back the drawn rune's copy and add a rare one.
  state.runes[got.id] -= 1;
  if (state.runes[got.id] <= 0) delete state.runes[got.id];
  const rare = runeFor(fam, RARITIES[RARITY_INDEX.rare].id);
  state.runes[rare.id] = (state.runes[rare.id] ?? 0) + 1;
  state.runeIndex[rare.id] = true;
  return rare;
}
