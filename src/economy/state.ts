import { MACHINE_ORDER, type MachineId, type ZoneId } from '../config/economy';
import type { FamilyId } from '../config/runes';

export interface GameStats {
  /** Shards earned since the island rose (reset on prestige). Drives prestige gain. */
  runShards: number;
  runLumen: number;
  allTimeShards: number;
  /** Lumen ever produced (since save v3). */
  allTimeLumen: number;
  /** Seconds spent on the current island (reset on prestige). */
  runSeconds: number;
  harvests: number;
  allTimeHarvests: number;
  playSeconds: number;
  prestiges: number;
}

export interface Settings {
  sfx: number;
  music: number;
  muted: boolean;
  /** 'auto' adapts resolution to keep 60 fps. */
  quality: 'auto' | 'high' | 'low';
  invertY: boolean;
}

export interface GameState {
  version: number;
  shards: number;
  lumen: number;
  /** Star seeds earned by prestige — never reset. */
  seeds: number;
  machines: Record<MachineId, number>;
  upgrades: Record<string, true>;
  zones: Record<ZoneId, boolean>;
  /** Index into OBJECTIVES; also the tutorial progress. */
  objective: number;
  /** Free-form gameplay flags set by the world (e.g. 'moved'). */
  flags: Record<string, true>;
  stats: GameStats;
  settings: Settings;
  player: { x: number; z: number; yaw: number };
  /** Epoch ms of the last save; used for offline progress. */
  lastSeen: number;
  /** Island variant seed, changes at each prestige so the new island looks different. */
  islandSeed: number;

  // --- Since save v2 -----------------------------------------------------------
  /** Rune id → copies owned. */
  runes: Record<string, number>;
  /** Shared altar upgrades. */
  altar: { luck: number; bulk: number; speed: number; auto: boolean };
  /** Family rolled automatically (null = auto-roll off). */
  runeAuto: FamilyId | null;
  runeStats: { rolls: number; runes: number; best: number };
  /** Rolls per family on this island (each roll makes the next one a bit dearer). */
  familyRolls: Record<FamilyId, number>;
  /** Achievement id → tier reached (1 = bronze, 2 = silver, 3 = gold). Permanent. Since save v3. */
  achievements: Record<string, number>;
  /** Lifetime counters (achievements, statistics). Every key is read defensively. */
  counters: Counters;
  /** Rune fragments (fusion currency): from guardians, expeditions, the merchant. Kept on prestige. Since save v3. */
  fragments: number;
  /** Rolls since the last epic+ / legendary+ (pity, account-wide). */
  pity: { epic: number; legendary: number };
  /** Ether familiars (kept on prestige). Since save v3. */
  pets: Pet[];
  /** Unhatched eggs. */
  eggs: number;
  /** Eggs bought with Lumen (drives the egg price). */
  eggsBought: number;
  petSerial: number;
  /** Extra perches from talents / relics. */
  extraPerches: number;
  /** Talent levels (Jardin d'étoiles). Since save v4. */
  talents: Record<string, number>;
  /** Seeds planted in talents (they still count for production). */
  seedsPlanted: number;
  /** Contremaître toggle. */
  autoBuy: boolean;
  /** Expeditions under way (real time). Since save v4. */
  expeditions: Expedition[];
  /** Temporary production buff (rift "Afflux"): multiplier until state.clock reaches `until`. */
  surge: { mult: number; until: number };
  /** Second prestige layer. Since save v4. */
  ascension: {
    count: number;
    /** Crowns earned in total, and spent on relics. */
    crowns: number;
    crownsSpent: number;
    relics: Partial<Record<import('../config/ascension').RelicId, true>>;
    /** lifetimeSeeds and stats.prestiges when the current cycle began. */
    base: number;
    islandBase: number;
    /** Challenge in progress (null = none). */
    challenge: import('../config/ascension').ChallengeId | null;
    done: Partial<Record<import('../config/ascension').ChallengeId, true>>;
    autoPrestige: boolean;
  };
  /** Game-time clock driving the day/night cycle (seconds). Since save v3. */
  clock: number;
  /** Every rune ever found (the index survives prestige). Since save v3. */
  runeIndex: Record<string, true>;
  /** Total star seeds ever earned (drives the Constellations long-term goal). */
  lifetimeSeeds: number;
}

export interface Pet {
  id: number;
  species: import('../config/familiars').SpeciesId;
  rarity: import('../config/familiars').PetRarity;
  level: number;
  /** Striking the crystal (on a perch). */
  perched: boolean;
  /** On an expedition. */
  away: boolean;
}

export interface Expedition {
  petId: number;
  duration: string;
  /** Epoch ms. */
  start: number;
  end: number;
  /** Loot fixed at departure. */
  loot: { shards: number; lumen: number; fragments: number; eggChance: number; runes: number };
}

export interface Counters {
  crits: number;
  meteors: number;
  golden: number;
  eventsSeen: number;
  /** Records. */
  bestCombo: number;
  bestHit: number;
  bestRate: number;
  /** Fastest island (seconds from rise to prestige), 0 = none yet. */
  bestIsland: number;
  bestGain: number;
  /** Exploration. */
  jumps: number;
  distance: number;
  nights: number;
  nightRolls: number;
  /** Systems added in iteration 3. */
  guardians: number;
  /** Fastest guardian kill (seconds), 0 = none yet. */
  guardFast: number;
  dodges: number;
  fusions: number;
  pity: number;
  eggs: number;
  expeditions: number;
  longExpeditions: number;
  merchant: number;
  rifts: number;
  /** Records mirrored from later systems (talents, familiars, ascension). */
  talents: number;
  pets: number;
  petLevel: number;
  ascensions: number;
  challenges: number;
  relics: number;
  sets: number;
  families: number;
  constellations: number;
}

export function emptyCounters(): Counters {
  return { crits: 0, meteors: 0, golden: 0, eventsSeen: 0, bestCombo: 0, bestHit: 0, bestRate: 0, bestIsland: 0, bestGain: 0, jumps: 0, distance: 0, nights: 0, nightRolls: 0, guardians: 0, guardFast: 0, dodges: 0, fusions: 0, pity: 0, eggs: 0, expeditions: 0, longExpeditions: 0, merchant: 0, rifts: 0, talents: 0, pets: 0, petLevel: 0, ascensions: 0, challenges: 0, relics: 0, sets: 0, families: 0, constellations: 0 };
}

export const SAVE_VERSION = 4;

export function emptyMachines(): Record<MachineId, number> {
  const m = {} as Record<MachineId, number>;
  for (const id of MACHINE_ORDER) m[id] = 0;
  return m;
}

export function createInitialState(now = Date.now()): GameState {
  return {
    version: SAVE_VERSION,
    shards: 0,
    lumen: 0,
    seeds: 0,
    machines: emptyMachines(),
    upgrades: {},
    zones: { home: true, forge: false, geyser: false, sky: false },
    objective: 0,
    flags: {},
    stats: {
      runShards: 0,
      runLumen: 0,
      allTimeShards: 0,
      allTimeLumen: 0,
      runSeconds: 0,
      harvests: 0,
      allTimeHarvests: 0,
      playSeconds: 0,
      prestiges: 0,
    },
    settings: { sfx: 0.8, music: 0.5, muted: false, quality: 'auto', invertY: false },
    player: { x: 0, z: 9, yaw: 0 },
    lastSeen: now,
    islandSeed: 1,
    runes: {},
    altar: { luck: 0, bulk: 0, speed: 0, auto: false },
    runeAuto: null,
    runeStats: { rolls: 0, runes: 0, best: -1 },
    familyRolls: { stone: 0, ember: 0, mist: 0, star: 0, moon: 0, warden: 0 },
    fragments: 0,
    pity: { epic: 0, legendary: 0 },
    achievements: {},
    counters: emptyCounters(),
    lifetimeSeeds: 0,
    runeIndex: {},
    clock: 0,
    pets: [],
    eggs: 0,
    eggsBought: 0,
    petSerial: 0,
    extraPerches: 0,
    talents: {},
    seedsPlanted: 0,
    autoBuy: false,
    expeditions: [],
    surge: { mult: 1, until: 0 },
    ascension: { count: 0, crowns: 0, crownsSpent: 0, relics: {}, base: 0, islandBase: 0, challenge: null, done: {}, autoPrestige: false },
  };
}
