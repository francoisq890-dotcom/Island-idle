/**
 * Versioned save system.
 *  - `serialize` / `deserialize` are pure and unit-tested.
 *  - `deserialize` runs migrations then merges onto a fresh default state, so
 *    any missing / corrupted field falls back to a sane value instead of crashing.
 *  - Export format: "ILES1." + base64(utf-8 JSON), safe to paste anywhere.
 */
import { MACHINE_ORDER, UPGRADES, ZONE_ORDER } from '../config/economy';
import { FAMILY_ORDER, RUNES, type FamilyId } from '../config/runes';
import { ACHIEVEMENTS } from '../config/achievements';
import { TALENTS } from '../config/talents';
import { CHALLENGES, RELICS, type ChallengeId } from '../config/ascension';
import { EXPEDITION, EXPEDITIONS } from '../config/expeditions';
import { PET_RARITIES, PETS, SPECIES_ORDER, type PetRarity, type SpeciesId } from '../config/familiars';
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
  /**
   * v2 → v3 (iteration 3): achievements become tiered (id → tier). Old
   * achievements grant the equivalent tier of the new ones; the rest is
   * recomputed from lifetime counters on load. The rune index starts from the
   * runes currently owned.
   */
  2: (raw) => {
    const old = obj(raw.achievements);
    const ach: Record<string, number> = {};
    for (const k of Object.keys(old)) {
      if (old[k] !== true) continue;
      const m = V2_ACHIEVEMENTS[k];
      if (m) ach[m[0]] = Math.max(ach[m[0]] ?? 0, m[1]);
    }
    const index: Record<string, true> = {};
    for (const k of Object.keys(obj(raw.runes))) index[k] = true;
    return { ...raw, version: 3, achievements: ach, runeIndex: index, flags: { ...obj(raw.flags), migratedV3: true } };
  },
  /**
   * v3 → v4 (familiars): a tutorial step "hatch your first familiar" was
   * inserted at index 13 (after the first geyser). Players already past it get
   * the free first egg and a one-time announcement.
   */
  3: (raw) => {
    const o = num(raw.objective, 0);
    const past = o >= 13;
    const hasPets = Array.isArray(raw.pets) && raw.pets.length > 0;
    return { ...raw, version: 4, objective: past ? o + 1 : o, eggs: past && !hasPets ? Math.max(1, num(raw.eggs, 0)) : num(raw.eggs, 0), flags: { ...obj(raw.flags), ...(past ? { migratedV4: true } : {}) } };
  },
};

/** v2 achievement id → [v3 achievement id, tier]. */
const V2_ACHIEVEMENTS: Record<string, [string, number]> = {
  hits500: ['hits', 1],
  hits5000: ['hits', 2],
  crits25: ['crits', 1],
  drill50: ['drill', 1],
  drill100: ['drill', 2],
  exc25: ['excavator', 1],
  ref25: ['refinery', 1],
  gey10: ['geyser', 1],
  pri10: ['prism', 1],
  zones: ['zones', 3],
  shard1m: ['shards', 1],
  shard1b: ['shards', 2],
  shard1t: ['shards', 3],
  roll500: ['rolls', 2],
  distinct10: ['distinct', 1],
  gotRare: ['best', 1],
  gotEpic: ['best', 2],
  gotLeg: ['best', 3],
  gotMyth: ['mythic', 1],
  gotCel: ['celestial', 1],
  meteor25: ['meteors', 1],
  golden1: ['golden', 1],
  golden10: ['golden', 2],
  pick6: ['pick', 3],
  prest1: ['prestiges', 1],
  prest5: ['prestiges', 2],
  seeds100: ['lseeds', 1],
  index: ['index', 1],
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
  const fr = obj(raw.familyRolls);
  for (const f of FAMILY_ORDER) s.familyRolls[f] = Math.floor(num(fr[f], 0));
  const ach = obj(raw.achievements);
  for (const a of ACHIEVEMENTS) {
    const t = Math.floor(num(ach[a.id], 0));
    if (t > 0) s.achievements[a.id] = Math.min(t, a.goals.length);
  }
  const idx = obj(raw.runeIndex);
  for (const r of RUNES) if (idx[r.id] === true || s.runes[r.id]) s.runeIndex[r.id] = true;
  const ct = obj(raw.counters);
  for (const k of Object.keys(s.counters) as (keyof GameState['counters'])[]) s.counters[k] = num(ct[k], 0);
  s.lifetimeSeeds = num(raw.lifetimeSeeds, s.seeds);
  s.clock = num(raw.clock, 0);
  s.fragments = num(raw.fragments, 0);
  if (Array.isArray(raw.pets)) {
    for (const x of raw.pets.slice(0, PETS.maxOwned)) {
      const o = obj(x);
      const species = SPECIES_ORDER.includes(o.species as SpeciesId) ? (o.species as SpeciesId) : null;
      const rarity = PET_RARITIES.some((r) => r.id === o.rarity) ? (o.rarity as PetRarity) : null;
      if (!species || !rarity) continue;
      s.pets.push({ id: Math.floor(num(o.id, s.pets.length + 1, 1)), species, rarity, level: Math.min(PETS.maxLevel, Math.max(1, Math.floor(num(o.level, 1, 1)))), perched: o.perched === true, away: o.away === true });
    }
  }
  s.eggs = Math.min(PETS.maxOwned, Math.floor(num(raw.eggs, 0)));
  s.eggsBought = Math.floor(num(raw.eggsBought, 0));
  s.petSerial = Math.max(Math.floor(num(raw.petSerial, 0)), ...s.pets.map((p) => p.id), 0);
  s.extraPerches = Math.floor(num(raw.extraPerches, 0));
  const tal = obj(raw.talents);
  for (const t of TALENTS) {
    const l = Math.min(t.max, Math.floor(num(tal[t.id], 0)));
    if (l > 0) s.talents[t.id] = l;
  }
  s.seedsPlanted = Math.min(s.seeds, Math.floor(num(raw.seedsPlanted, 0)));
  s.autoBuy = raw.autoBuy === true;
  if (Array.isArray(raw.expeditions)) {
    for (const x of raw.expeditions.slice(0, EXPEDITION.slots)) {
      const o = obj(x);
      const l = obj(o.loot);
      const pet = s.pets.find((p) => p.id === o.petId);
      if (!pet || !EXPEDITIONS.some((d) => d.id === o.duration)) continue;
      pet.away = true;
      pet.perched = false;
      s.expeditions.push({ petId: pet.id, duration: o.duration as string, start: num(o.start, now), end: num(o.end, now), loot: { shards: num(l.shards, 0), lumen: num(l.lumen, 0), fragments: Math.floor(num(l.fragments, 0)), eggChance: Math.min(1, num(l.eggChance, 0)), runes: Math.min(30, Math.floor(num(l.runes, 0))) } });
    }
  }
  // A familiar marked away without an expedition comes home.
  for (const p of s.pets) if (p.away && !s.expeditions.some((e) => e.petId === p.id)) p.away = false;
  const sg = obj(raw.surge);
  s.surge = { mult: Math.min(10, num(sg.mult, 1, 1)), until: num(sg.until, 0) };
  const asc = obj(raw.ascension);
  const a = s.ascension;
  a.count = Math.floor(num(asc.count, 0));
  a.crowns = Math.floor(num(asc.crowns, 0));
  a.crownsSpent = Math.min(a.crowns, Math.floor(num(asc.crownsSpent, 0)));
  const rel = obj(asc.relics);
  for (const r of RELICS) if (rel[r.id] === true) a.relics[r.id] = true;
  a.base = Math.min(s.lifetimeSeeds, num(asc.base, 0));
  a.islandBase = Math.min(s.stats.prestiges, Math.floor(num(asc.islandBase, 0)));
  a.challenge = CHALLENGES.some((c) => c.id === asc.challenge) ? (asc.challenge as ChallengeId) : null;
  const dn = obj(asc.done);
  for (const c of CHALLENGES) if (dn[c.id] === true) a.done[c.id] = true;
  a.autoPrestige = asc.autoPrestige === true && !!a.relics.autoPrestige;
  const pity = obj(raw.pity);
  s.pity = { epic: Math.floor(num(pity.epic, 0)), legendary: Math.floor(num(pity.legendary, 0)) };

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
