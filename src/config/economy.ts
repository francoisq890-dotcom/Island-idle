/**
 * SINGLE SOURCE OF TRUTH for every number of the game economy.
 * Costs, productions, upgrades, zones, prestige and offline rules all live here.
 * `npm run simulate` replays a full first run with these values and checks the pacing.
 */

export type ResourceId = 'shards' | 'lumen';
export type MachineId = 'drill' | 'excavator' | 'refinery' | 'geyser' | 'prism';
export type ZoneId = 'home' | 'forge' | 'geyser' | 'sky';

export interface Cost {
  shards?: number;
  lumen?: number;
}

export interface MachineDef {
  id: MachineId;
  name: string;
  plural: string;
  zone: ZoneId;
  /** One-line, player-facing explanation. */
  blurb: string;
  baseCost: Cost;
  /** Cost multiplier applied per unit already owned. */
  growth: number;
  /** Shards produced per second, per unit (before multipliers). */
  shardsPerSec?: number;
  /** Lumen produced per second, per unit (before multipliers). */
  lumenPerSec?: number;
  /** Converter: shards consumed per second, per unit (before multipliers). */
  refineInput?: number;
}

export const MACHINES: Record<MachineId, MachineDef> = {
  drill: {
    id: 'drill',
    name: 'Foreuse',
    plural: 'Foreuses',
    zone: 'home',
    blurb: 'Creuse la veine de cristal et envoie les éclats au Nexus.',
    baseCost: { shards: 10 },
    growth: 1.15,
    shardsPerSec: 0.5,
  },
  excavator: {
    id: 'excavator',
    name: 'Excavatrice',
    plural: 'Excavatrices',
    zone: 'home',
    blurb: 'Une grosse machine qui broie la roche cristalline. Lente à payer, mais costaude.',
    baseCost: { shards: 120 },
    growth: 1.15,
    shardsPerSec: 3,
  },
  refinery: {
    id: 'refinery',
    name: 'Raffinerie',
    plural: 'Raffineries',
    zone: 'forge',
    blurb: 'Fond 10 éclats en 1 Lumen doré. Le Lumen ouvre les ponts et les machines rares.',
    baseCost: { shards: 2500 },
    growth: 1.15,
    refineInput: 5,
  },
  geyser: {
    id: 'geyser',
    name: "Geyser d'éther",
    plural: "Geysers d'éther",
    zone: 'geyser',
    blurb: "Capte l'éther qui jaillit du cœur de l'îlot. Production massive d'éclats.",
    baseCost: { shards: 40000, lumen: 60 },
    growth: 1.15,
    shardsPerSec: 90,
  },
  prism: {
    id: 'prism',
    name: 'Prisme solaire',
    plural: 'Prismes solaires',
    zone: 'sky',
    blurb: 'Concentre la lumière du ciel : produit des éclats ET du Lumen.',
    baseCost: { shards: 4e6, lumen: 6000 },
    growth: 1.15,
    shardsPerSec: 2500,
    lumenPerSec: 10,
  },
};

export const MACHINE_ORDER: MachineId[] = ['drill', 'excavator', 'refinery', 'geyser', 'prism'];

/** Owning this many units of one machine doubles that machine's output (or throughput). */
export const MILESTONES = [25, 50, 100, 150, 200, 300, 400, 500];
export const MILESTONE_MULT = 2;

/** Refining rules. */
export const REFINE = {
  /** Lumen obtained per shard processed (before yield upgrades). */
  ratio: 0.1,
  /** Refineries never take more than this share of what your machines produce. */
  maxShareOfProduction: 0.5,
};

/** Manual harvesting. */
export const HARVEST = {
  baseValue: 1,
};

export type UpgradeEffect =
  | { type: 'click'; mult: number }
  | { type: 'clickPct'; pct: number }
  | { type: 'machine'; machine: MachineId; mult: number }
  | { type: 'global'; mult: number }
  | { type: 'refineThroughput'; mult: number }
  | { type: 'refineYield'; mult: number };

export interface UpgradeRequirement {
  machine?: [MachineId, number];
  zone?: ZoneId;
  upgrade?: string;
}

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  cost: Cost;
  effects: UpgradeEffect[];
  requires?: UpgradeRequirement;
  /** Visual family for the icon in the UI. */
  icon: 'pick' | 'drill' | 'excavator' | 'refinery' | 'geyser' | 'prism' | 'belt' | 'star';
}

export const UPGRADES: UpgradeDef[] = [
  // --- Manual harvest -------------------------------------------------------
  { id: 'pick1', name: 'Pioche renforcée', icon: 'pick', desc: 'Chaque coup de pioche rapporte 2× plus.', cost: { shards: 20 }, effects: [{ type: 'click', mult: 2 }] },
  { id: 'pick2', name: 'Pioche de quartz', icon: 'pick', desc: 'Chaque coup de pioche rapporte 2× plus.', cost: { shards: 350 }, effects: [{ type: 'click', mult: 2 }], requires: { machine: ['drill', 5] } },
  { id: 'pick3', name: 'Pioche résonante', icon: 'pick', desc: 'Chaque coup rapporte en plus 5 % de ta production par seconde.', cost: { shards: 2500 }, effects: [{ type: 'clickPct', pct: 0.05 }], requires: { machine: ['excavator', 5] } },
  { id: 'pick4', name: "Pioche d'étoile", icon: 'pick', desc: 'Coups ×3 et +5 % supplémentaires de ta production par seconde.', cost: { shards: 60000, lumen: 60 }, effects: [{ type: 'click', mult: 3 }, { type: 'clickPct', pct: 0.05 }], requires: { zone: 'geyser' } },

  // --- Drills ---------------------------------------------------------------
  { id: 'drill1', name: 'Mèches trempées', icon: 'drill', desc: 'Les foreuses produisent 2× plus.', cost: { shards: 100 }, effects: [{ type: 'machine', machine: 'drill', mult: 2 }], requires: { machine: ['drill', 3] } },
  { id: 'drill2', name: 'Mèches en diamant', icon: 'drill', desc: 'Les foreuses produisent 2× plus.', cost: { shards: 1600 }, effects: [{ type: 'machine', machine: 'drill', mult: 2 }], requires: { machine: ['drill', 15] } },
  { id: 'drill3', name: 'Forage profond', icon: 'drill', desc: 'Les foreuses produisent 3× plus.', cost: { shards: 45000, lumen: 40 }, effects: [{ type: 'machine', machine: 'drill', mult: 3 }], requires: { machine: ['drill', 30] } },

  // --- Excavators -----------------------------------------------------------
  { id: 'exc1', name: 'Godets élargis', icon: 'excavator', desc: 'Les excavatrices produisent 2× plus.', cost: { shards: 1100 }, effects: [{ type: 'machine', machine: 'excavator', mult: 2 }], requires: { machine: ['excavator', 5] } },
  { id: 'exc2', name: "Chenilles d'éther", icon: 'excavator', desc: 'Les excavatrices produisent 2× plus.', cost: { shards: 16000 }, effects: [{ type: 'machine', machine: 'excavator', mult: 2 }], requires: { machine: ['excavator', 15] } },
  { id: 'exc3', name: 'Broyeurs titans', icon: 'excavator', desc: 'Les excavatrices produisent 3× plus.', cost: { shards: 250000, lumen: 250 }, effects: [{ type: 'machine', machine: 'excavator', mult: 3 }], requires: { machine: ['excavator', 30] } },

  // --- Refineries -----------------------------------------------------------
  { id: 'ref1', name: 'Creusets brûlants', icon: 'refinery', desc: 'Les raffineries traitent 2× plus d’éclats.', cost: { shards: 3500 }, effects: [{ type: 'refineThroughput', mult: 2 }], requires: { machine: ['refinery', 2] } },
  { id: 'ref2', name: 'Alambics dorés', icon: 'refinery', desc: 'Chaque éclat raffiné donne 1,5× plus de Lumen.', cost: { shards: 8000, lumen: 25 }, effects: [{ type: 'refineYield', mult: 1.5 }], requires: { machine: ['refinery', 5] } },
  { id: 'ref3', name: 'Cœur de forge', icon: 'refinery', desc: 'Raffineries : 2× plus de débit et 1,5× plus de Lumen.', cost: { shards: 120000, lumen: 300 }, effects: [{ type: 'refineThroughput', mult: 2 }, { type: 'refineYield', mult: 1.5 }], requires: { machine: ['refinery', 12] } },

  // --- Geysers --------------------------------------------------------------
  { id: 'gey1', name: 'Vannes de pression', icon: 'geyser', desc: 'Les geysers produisent 2× plus.', cost: { shards: 70000, lumen: 120 }, effects: [{ type: 'machine', machine: 'geyser', mult: 2 }], requires: { machine: ['geyser', 3] } },
  { id: 'gey2', name: 'Cheminées chantantes', icon: 'geyser', desc: 'Les geysers produisent 2× plus.', cost: { shards: 600000, lumen: 900 }, effects: [{ type: 'machine', machine: 'geyser', mult: 2 }], requires: { machine: ['geyser', 10] } },

  // --- Prisms ---------------------------------------------------------------
  { id: 'pri1', name: 'Lentilles polies', icon: 'prism', desc: 'Les prismes produisent 2× plus.', cost: { shards: 1500000, lumen: 2500 }, effects: [{ type: 'machine', machine: 'prism', mult: 2 }], requires: { machine: ['prism', 3] } },

  // --- Conveyors / global ---------------------------------------------------
  { id: 'belt1', name: 'Convoyeurs huilés', icon: 'belt', desc: 'Toute la production +25 %. Les tapis roulent plus vite.', cost: { shards: 300 }, effects: [{ type: 'global', mult: 1.25 }], requires: { machine: ['drill', 8] } },
  { id: 'belt2', name: 'Convoyeurs magnétiques', icon: 'belt', desc: 'Toute la production +30 %. Les tapis roulent plus vite.', cost: { shards: 7000 }, effects: [{ type: 'global', mult: 1.3 }], requires: { zone: 'forge' } },
  { id: 'belt3', name: "Convoyeurs d'éther", icon: 'belt', desc: 'Toute la production +50 %. Les tapis roulent plus vite.', cost: { shards: 150000, lumen: 400 }, effects: [{ type: 'global', mult: 1.5 }], requires: { zone: 'geyser' } },
  { id: 'nexus1', name: 'Nexus harmonisé', icon: 'star', desc: 'Toute la production ×2.', cost: { shards: 2000000, lumen: 4000 }, effects: [{ type: 'global', mult: 2 }], requires: { zone: 'sky' } },
];

export interface ZoneDef {
  id: ZoneId;
  name: string;
  /** Name of the structure that gives access to the zone. */
  bridgeName: string;
  blurb: string;
  cost: Cost;
}

export const ZONES: Record<ZoneId, ZoneDef> = {
  home: { id: 'home', name: 'Île Mère', bridgeName: '', blurb: '', cost: {} },
  forge: {
    id: 'forge',
    name: 'Îlot des Forges',
    bridgeName: 'Pont des Forges',
    blurb: 'Un îlot volcanique où l’on fond les éclats en Lumen.',
    cost: { shards: 4000 },
  },
  geyser: {
    id: 'geyser',
    name: 'Îlot des Geysers',
    bridgeName: 'Pont des Brumes',
    blurb: 'Des sources d’éther pur jaillissent de la roche.',
    cost: { shards: 150000, lumen: 300 },
  },
  sky: {
    id: 'sky',
    name: 'Île Céleste',
    bridgeName: 'Escalier céleste',
    blurb: 'Tout là-haut, le Phare des étoiles attend.',
    cost: { shards: 8e6, lumen: 12000 },
  },
};

export const ZONE_ORDER: ZoneId[] = ['home', 'forge', 'geyser', 'sky'];

/** Prestige: "faire descendre l'île". */
export const PRESTIGE = {
  /** Total shards harvested during the current island needed before the Lighthouse wakes up. */
  unlockAt: 4e8,
  /** Star seeds = floor(sqrt(runShards / divisor)). */
  divisor: 1e7,
  /** Each star seed gives this much bonus production (additive). */
  bonusPerSeed: 0.1,
};

/** Offline production. */
export const OFFLINE = {
  /** Offline earnings are capped to this duration. */
  maxSeconds: 8 * 3600,
  /** Fraction of the normal production earned while away. */
  efficiency: 1,
  /** Absences shorter than this are silently credited (no popup). */
  minSecondsForReport: 60,
};

export function seedsForRun(runShards: number): number {
  if (runShards < PRESTIGE.unlockAt) return 0;
  return Math.floor(Math.sqrt(runShards / PRESTIGE.divisor));
}
