/** Expeditions (after the first descent): send a familiar away on the airship; it comes back with loot. */
export interface ExpeditionDef {
  id: string;
  name: string;
  seconds: number;
}

export const EXPEDITIONS: ExpeditionDef[] = [
  { id: 'short', name: 'Survol', seconds: 600 },
  { id: 'trip', name: 'Traversée', seconds: 3600 },
  { id: 'voyage', name: 'Grand voyage', seconds: 4 * 3600 },
  { id: 'odyssey', name: 'Odyssée', seconds: 8 * 3600 },
];

export const EXPEDITION = {
  /** Expeditions at the same time (airships at the dock). */
  slots: 2,
  /** Shards & Lumen: this share of the production during the trip (at departure rates). */
  productionShare: 0.3,
  /** Fragments: base + per 10 minutes. */
  fragBase: 2,
  fragPer10min: 1.2,
  /** Egg chance: base + up to `eggLong` for an 8 h trip. */
  eggBase: 0.05,
  eggLong: 0.35,
  /** One rune per 20 minutes (+1). */
  runeEvery: 1200,
  /** Loot multiplier by familiar rarity (common → legendary). */
  rarityMult: [1, 1.8, 2.8, 4],
  mantaBonus: 0.25,
};

/** Random events added after the first descent. */
export const RIFT = {
  every: [360, 600] as [number, number],
  first: [150, 240] as [number, number],
  hits: 3,
  life: 30,
  /** "Afflux": production multiplier and duration (game seconds). */
  surgeMult: 3,
  surgeSeconds: 45,
};

export const MERCHANT = {
  every: [480, 840] as [number, number],
  first: [240, 360] as [number, number],
  stay: 120,
  /** Prices in seconds of Lumen production (min values for a slow economy). */
  eggPriceFactor: 0.6,
  fragmentsPack: 20,
  fragmentsSeconds: 60,
  fragmentsMinLumen: 400,
  runeSeconds: 45,
  runeMinLumen: 300,
};
