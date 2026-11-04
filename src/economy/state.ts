import { MACHINE_ORDER, type MachineId, type ZoneId } from '../config/economy';
import type { FamilyId } from '../config/runes';

export interface GameStats {
  /** Shards earned since the island rose (reset on prestige). Drives prestige gain. */
  runShards: number;
  runLumen: number;
  allTimeShards: number;
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
  /** Achievement id → unlocked (permanent). */
  achievements: Record<string, true>;
  /** Counters for achievements / events (lifetime). */
  counters: { crits: number; meteors: number; golden: number; eventsSeen: number };
  /** Golden-island long-term goal: total seeds ever earned. */
  lifetimeSeeds: number;
}

export const SAVE_VERSION = 2;

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
    familyRolls: { stone: 0, ember: 0, mist: 0, star: 0 },
    achievements: {},
    counters: { crits: 0, meteors: 0, golden: 0, eventsSeen: 0 },
    lifetimeSeeds: 0,
  };
}
