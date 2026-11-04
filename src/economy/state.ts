import { MACHINE_ORDER, type MachineId, type ZoneId } from '../config/economy';

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
}

export const SAVE_VERSION = 1;

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
  };
}
