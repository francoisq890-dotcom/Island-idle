/**
 * Pure rune logic: odds with luck, rolling, stacking bonuses, altar upgrades,
 * prestige retention. Unit-tested and used by the balancing bot.
 */
import type { Cost } from '../config/economy';
import {
  ALTAR_UPGRADES,
  FAMILIES,
  RARITIES,
  RARITY_INDEX,
  ROLL,
  RUNES,
  RUNE_BY_ID,
  STACK_EXP,
  STAT_CAP,
  type AltarUpgradeDef,
  type FamilyId,
  type RarityId,
  type RuneDef,
  type RuneStat,
} from '../config/runes';
import type { GameState } from './state';
import { bonusTotals } from './bonuses';

export type RuneTotals = Record<RuneStat, number>;

export function emptyTotals(): RuneTotals {
  return { prod: 0, click: 0, speed: 0, luck: 0, offline: 0, cost: 0, lumen: 0, crit: 0, seeds: 0, bulk: 0 };
}

/** Bonus of `count` copies of a rune worth `value` each. */
export function stacked(value: number, count: number): number {
  return count <= 0 ? 0 : value * Math.pow(count, STACK_EXP);
}

/** Sum of every owned rune's bonus, with caps applied. Achievements add on top (see economy). */
export function runeTotals(state: GameState): RuneTotals {
  const t = emptyTotals();
  for (const id in state.runes) {
    const def = RUNE_BY_ID.get(id);
    const n = state.runes[id];
    if (!def || n <= 0) continue;
    t[def.stat] += stacked(def.value, n);
    if (def.stat2 && def.value2) t[def.stat2] += stacked(def.value2, n);
  }
  for (const k in STAT_CAP) {
    const key = k as RuneStat;
    t[key] = Math.min(t[key], STAT_CAP[key]!);
  }
  t.bulk = Math.floor(t.bulk);
  return t;
}

export function luckOf(state: GameState, totals: { luck: number } = bonusTotals(state), extraLuck = 0): number {
  return (1 + state.altar.luck * ROLL.luckPerLevel + totals.luck + extraLuck) * (1 + state.seeds * ROLL.luckPerSeed);
}

export function bulkOf(state: GameState, totals: { bulk: number } = bonusTotals(state)): number {
  return 1 + state.altar.bulk + totals.bulk;
}

export function cooldownOf(state: GameState): number {
  return Math.max(ROLL.minCooldown, ROLL.baseCooldown * Math.pow(ROLL.speedFactor, state.altar.speed));
}

/**
 * Effective probability of each rarity for a given luck. Luck divides the odds
 * ("1 in N" becomes "L in N"), allocated from the rarest tier down; the common
 * tier keeps what is left (at least 0).
 */
export function rarityChances(luck: number): number[] {
  const p = new Array(RARITIES.length).fill(0);
  let left = 1;
  for (let i = RARITIES.length - 1; i >= 1; i--) {
    const c = Math.min(left, luck / RARITIES[i].oneIn);
    p[i] = c;
    left -= c;
  }
  p[0] = Math.max(0, left);
  return p;
}

export function rollRarity(luck: number, rng: () => number): RarityId {
  const p = rarityChances(luck);
  let u = rng();
  for (let i = RARITIES.length - 1; i >= 0; i--) {
    if (u < p[i]) return RARITIES[i].id;
    u -= p[i];
  }
  return 'common';
}

export function runesOf(family: FamilyId): RuneDef[] {
  return RUNES.filter((r) => r.family === family);
}

export function runeFor(family: FamilyId, rarity: RarityId): RuneDef {
  return RUNES.find((r) => r.family === family && r.rarity === rarity)!;
}

export function familyUnlocked(state: GameState, family: FamilyId): boolean {
  return state.zones[FAMILIES[family].zone];
}

function affordable(state: GameState, c: Cost): boolean {
  return (c.shards ?? 0) <= state.shards + 1e-9 && (c.lumen ?? 0) <= state.lumen + 1e-9;
}

export function canRoll(state: GameState, family: FamilyId): boolean {
  return familyUnlocked(state, family) && affordable(state, FAMILIES[family].rollCost);
}

/** Pay once, get `bulk` runes. Returns the runes obtained (empty if impossible). */
export function doRoll(state: GameState, family: FamilyId, rng: () => number = Math.random): RuneDef[] {
  if (!canRoll(state, family)) return [];
  const cost = FAMILIES[family].rollCost;
  state.shards -= cost.shards ?? 0;
  state.lumen -= cost.lumen ?? 0;
  const totals = bonusTotals(state);
  const luck = luckOf(state, totals);
  const n = bulkOf(state, totals);
  const out: RuneDef[] = [];
  for (let i = 0; i < n; i++) {
    const def = runeFor(family, rollRarity(luck, rng));
    state.runes[def.id] = (state.runes[def.id] ?? 0) + 1;
    out.push(def);
    const ri = RARITY_INDEX[def.rarity];
    if (ri > state.runeStats.best) state.runeStats.best = ri;
  }
  state.runeStats.rolls += 1;
  state.runeStats.runes += n;
  return out;
}

// --- Altar upgrades -----------------------------------------------------------

export function altarUpgrade(id: AltarUpgradeDef['id']): AltarUpgradeDef {
  return ALTAR_UPGRADES.find((u) => u.id === id)!;
}

export function altarLevel(state: GameState, id: AltarUpgradeDef['id']): number {
  return id === 'auto' ? (state.altar.auto ? 1 : 0) : state.altar[id];
}

export function altarUpgradeCost(state: GameState, id: AltarUpgradeDef['id']): Cost | null {
  const u = altarUpgrade(id);
  const lvl = altarLevel(state, id);
  if (lvl >= u.max) return null;
  const f = Math.pow(u.growth, lvl);
  const c: Cost = {};
  if (u.base.shards) c.shards = Math.ceil(u.base.shards * f);
  if (u.base.lumen) c.lumen = Math.ceil(u.base.lumen * f);
  return c;
}

export function buyAltarUpgrade(state: GameState, id: AltarUpgradeDef['id']): boolean {
  const c = altarUpgradeCost(state, id);
  if (!c || !affordable(state, c)) return false;
  if (id === 'auto' && !state.zones.forge) return false;
  state.shards -= c.shards ?? 0;
  state.lumen -= c.lumen ?? 0;
  if (id === 'auto') state.altar.auto = true;
  else state.altar[id] += 1;
  return true;
}

// --- Prestige -------------------------------------------------------------------

/** Runes of epic rarity and above survive a prestige; the others are lost. */
export function runesAfterPrestige(runes: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id in runes) {
    const def = RUNE_BY_ID.get(id);
    if (def && RARITIES[RARITY_INDEX[def.rarity]].keptOnPrestige && runes[id] > 0) out[id] = runes[id];
  }
  return out;
}

/** "1 sur 1,2K" style label for a probability. */
export function oddsLabel(p: number): string {
  if (p <= 0) return '—';
  if (p >= 0.995) return '100 %';
  if (p >= 0.1) return `${(p * 100).toFixed(p >= 0.2 ? 0 : 1)} %`;
  const n = 1 / p;
  if (n < 1000) return `1 sur ${Math.round(n)}`;
  if (n < 1e6) return `1 sur ${(n / 1000).toFixed(n < 1e4 ? 1 : 0)}K`;
  return `1 sur ${(n / 1e6).toFixed(n < 1e7 ? 2 : 1)}M`;
}
