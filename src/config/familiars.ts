/**
 * Ether familiars: small creatures that strike the crystal on their own.
 * Their power is a fraction of the value of a pickaxe strike, so they stay
 * relevant without running away. Unlocked with the Geysers island.
 */
import type { Cost } from './economy';

export type SpeciesId = 'firefly' | 'manta' | 'owl' | 'drake';
export type PetRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  /** Trait shown to the player. */
  trait: string;
  color: number;
  css: string;
  /** Seconds between two strikes. */
  period: number;
}

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  firefly: { id: 'firefly', name: 'Luciole d’éther', trait: 'Frappe plus souvent (toutes les 1,6 s).', color: 0xbaf26a, css: '#5e8f1f', period: 1.6 },
  manta: { id: 'manta', name: 'Raie des nuées', trait: 'Rapporte 25 % de butin en plus en expédition.', color: 0x7fd6ff, css: '#1d7fa6', period: 2 },
  owl: { id: 'owl', name: 'Chouette de quartz', trait: 'Frappe 50 % plus fort la nuit.', color: 0xd9b8ff, css: '#7a4fc0', period: 2 },
  drake: { id: 'drake', name: 'Dragonnet de braise', trait: 'Trouve parfois un fragment de rune en frappant.', color: 0xff9a5a, css: '#c4521e', period: 2 },
};
export const SPECIES_ORDER: SpeciesId[] = ['firefly', 'manta', 'owl', 'drake'];

export interface PetRarityDef {
  id: PetRarity;
  name: string;
  /** Fraction of a strike's value per familiar strike, at level 1. */
  power: number;
  /** Base hatch weight. */
  weight: number;
  css: string;
}

export const PET_RARITIES: PetRarityDef[] = [
  { id: 'common', name: 'Commun', power: 0.25, weight: 60, css: '#8c8178' },
  { id: 'rare', name: 'Rare', power: 0.45, weight: 28, css: '#2a6fbd' },
  { id: 'epic', name: 'Épique', power: 0.7, weight: 10, css: '#7a3fc7' },
  { id: 'legendary', name: 'Légendaire', power: 1, weight: 2, css: '#c08510' },
];

export const PETS = {
  /** Familiars striking at the same time (perches). */
  perches: 3,
  /** Familiars you can keep at most. */
  maxOwned: 12,
  maxLevel: 25,
  /** +6 % power per level above 1. */
  perLevel: 0.06,
  levelCost: { lumen: 30 } as Cost,
  levelGrowth: 2.1,
  /** Egg price in Lumen: base × growth^(eggs bought). The first egg is offered. */
  eggCost: { lumen: 200 } as Cost,
  eggGrowth: 6,
  /** Drake: chance per strike to find a fragment. */
  drakeFragment: 0.01,
  owlNight: 1.5,
  /** Chance that a guardian drops an egg. */
  guardianEgg: 0.1,
};
