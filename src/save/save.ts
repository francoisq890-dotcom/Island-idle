/**
 * Versioned save system.
 *  - `serialize` / `deserialize` are pure and unit-tested.
 *  - `deserialize` runs migrations then merges onto a fresh default state, so
 *    any missing / corrupted field falls back to a sane value instead of crashing.
 *  - Export format: "ILES1." + base64(utf-8 JSON), safe to paste anywhere.
 */
import { MACHINE_ORDER, UPGRADES, ZONE_ORDER } from '../config/economy';
import { FAMILY_ORDER, RUNES, type FamilyId } from '../config/runes';
import { createInitialState, SAVE_VERSION, type GameState } from '../economy/state';

export const STORAGE_KEY = 'iles-ether.save';
const EXPORT_PREFIX = 'ILES1.'; // format of the text wrapper, independent of SAVE_VERSION

type Json = Record<string, unknown>;

/** Migrations from version N to N+1. Add an entry whenever SAVE_VERSION is bumped. */
const MIGRATIONS: Record<number, (raw: Json) => Json> = {
  /**
   * v1 → v2 (iteration 2): runes, altar, achievements, counters.
   * Older players get the pickaxe tiers from the upgrades they already own and
   * a small welcome gift so the new altar is usable right away.
   */
  1: (raw) => ({
    ...raw,
    version: 2,
    runes: {},
    altar: { luck: 0, bulk: 0, speed: 0, auto: false },
    runeAuto: null,
    runeStats: { rolls: 0, runes: 0, best: -1 },
    achievements: {},
    counters: { crits: 0, meteors: 0, golden: 0, eventsSeen: 0 },
    lifetimeSeeds: num((raw as Json).seeds, 0),
    // A rune tutorial step was inserted at index 6: players already past it skip it
    // (they get a one-time announcement instead).
    objective: num((raw as Json).objective, 0) >= 6 ? num((raw as Json).objective, 0) + 1 : num((raw as Json).objective, 0),
    flags: { ...obj((raw as Json).flags), migratedV2: true },
  }),
};

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

function num(v: unknown, fallback: number, min = 0): number {
  return typeof v === 'number' && isFinite(v) && v >= min ? v : fallback;
}

function obj(v: unknown): Json {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}

export class SaveError extends Error {}

export function deserialize(text: string, now = Date.now()): GameState {
  let raw: Json;
  try {
    raw = obj(JSON.parse(text));
  } catch {
    throw new SaveError('Sauvegarde illisible (JSON invalide).');
  }
  let version = num(raw.version, 0);
  if (version < 1) throw new SaveError('Ce texte ne ressemble pas à une sauvegarde des Îles d’Éther.');
  if (version > SAVE_VERSION) throw new SaveError('Sauvegarde créée par une version plus récente du jeu.');
  while (version < SAVE_VERSION) {
    const m = MIGRATIONS[version];
    if (!m) throw new SaveError(`Aucune migration depuis la version ${version}.`);
    raw = m(raw);
    version = num(raw.version, version + 1);
  }

  const s = createInitialState(now);
  s.shards = num(raw.shards, 0);
  s.lumen = num(raw.lumen, 0);
  s.seeds = Math.floor(num(raw.seeds, 0));
  s.objective = Math.floor(num(raw.objective, 0));
  s.lastSeen = num(raw.lastSeen, now);
  s.islandSeed = Math.floor(num(raw.islandSeed, 1, 1));

  const machines = obj(raw.machines);
  for (const id of MACHINE_ORDER) s.machines[id] = Math.floor(num(machines[id], 0));

  const ups = obj(raw.upgrades);
  for (const u of UPGRADES) if (ups[u.id] === true) s.upgrades[u.id] = true;

  const zones = obj(raw.zones);
  for (const z of ZONE_ORDER) if (z !== 'home') s.zones[z] = zones[z] === true;

  const flags = obj(raw.flags);
  for (const k of Object.keys(flags)) if (flags[k] === true) s.flags[k] = true;

  const st = obj(raw.stats);
  for (const k of Object.keys(s.stats) as (keyof GameState['stats'])[]) s.stats[k] = num(st[k], s.stats[k]);

  const set = obj(raw.settings);
  s.settings.sfx = Math.min(1, num(set.sfx, s.settings.sfx));
  s.settings.music = Math.min(1, num(set.music, s.settings.music));
  s.settings.muted = set.muted === true;
  s.settings.invertY = set.invertY === true;
  if (set.quality === 'high' || set.quality === 'low' || set.quality === 'auto') s.settings.quality = set.quality;

  // v2 fields.
  const runes = obj(raw.runes);
  for (const r of RUNES) {
    const n = Math.floor(num(runes[r.id], 0));
    if (n > 0) s.runes[r.id] = n;
  }
  const al = obj(raw.altar);
  s.altar.luck = Math.floor(num(al.luck, 0));
  s.altar.bulk = Math.floor(num(al.bulk, 0));
  s.altar.speed = Math.floor(num(al.speed, 0));
  s.altar.auto = al.auto === true;
  s.runeAuto = FAMILY_ORDER.includes(raw.runeAuto as FamilyId) ? (raw.runeAuto as FamilyId) : null;
  const rs = obj(raw.runeStats);
  s.runeStats = { rolls: Math.floor(num(rs.rolls, 0)), runes: Math.floor(num(rs.runes, 0)), best: Math.floor(num(rs.best, -1, -1)) };
  const ach = obj(raw.achievements);
  for (const k of Object.keys(ach)) if (ach[k] === true) s.achievements[k] = true;
  const ct = obj(raw.counters);
  for (const k of Object.keys(s.counters) as (keyof GameState['counters'])[]) s.counters[k] = num(ct[k], 0);
  s.lifetimeSeeds = num(raw.lifetimeSeeds, s.seeds);

  const p = obj(raw.player);
  s.player.x = typeof p.x === 'number' && isFinite(p.x) ? p.x : s.player.x;
  s.player.z = typeof p.z === 'number' && isFinite(p.z) ? p.z : s.player.z;
  s.player.yaw = typeof p.yaw === 'number' && isFinite(p.yaw) ? p.yaw : s.player.yaw;
  return s;
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function exportSave(state: GameState): string {
  return EXPORT_PREFIX + toBase64(serialize(state));
}

export function importSave(text: string, now = Date.now()): GameState {
  const t = text.trim().replace(/\s+/g, '');
  if (!t.startsWith(EXPORT_PREFIX)) {
    // Also accept raw JSON for convenience.
    if (t.startsWith('{')) return deserialize(t, now);
    throw new SaveError('Code de sauvegarde invalide (il doit commencer par « ILES1. »).');
  }
  let json: string;
  try {
    json = fromBase64(t.slice(EXPORT_PREFIX.length));
  } catch {
    throw new SaveError('Code de sauvegarde corrompu.');
  }
  return deserialize(json, now);
}

// --- Browser storage --------------------------------------------------------

export function saveToStorage(state: GameState, now = Date.now()): void {
  state.lastSeen = now;
  try {
    localStorage.setItem(STORAGE_KEY, serialize(state));
  } catch {
    // Storage full or disabled (private mode): the game keeps running.
  }
}

export function loadFromStorage(): GameState | null {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    if (!t) return null;
    return deserialize(t);
  } catch {
    return null;
  }
}

export function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
