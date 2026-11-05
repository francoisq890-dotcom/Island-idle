/**
 * Pure rune logic: odds with luck, rolling, stacking bonuses, altar upgrades,
 * prestige retention. Unit-tested and used by the balancing bot.
 */
import type { Cost } from '../config/economy';
import {
  ALTAR_UPGRADES,
  FAMILIES,
  FAMILY_ORDER,
  FUSE,
  PITY,
  RUNE_SETS,
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
  type RuneSetDef,
  type RuneSpecial,
  type RuneStat,
} from '../config/runes';
import type { GameState } from './state';
import { bonusTotals } from './bonuses';
import { isNight, nightLuckMult } from './daynight';
import { autoShare, fuseMult, pityMult } from './talents';

export type RuneTotals = Record<RuneStat, number>;

export function emptyTotals(): RuneTotals {
  return { prod: 0, click: 0, speed: 0, luck: 0, offline: 0, cost: 0, lumen: 0, crit: 0, seeds: 0, bulk: 0, frag: 0, pet: 0 };
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
  for (const set of RUNE_SETS) if (setComplete(state, set)) t[set.stat] += set.value;
  for (const k in STAT_CAP) {
    const key = k as RuneStat;
    t[key] = Math.min(t[key], STAT_CAP[key]!);
  }
  t.bulk = Math.floor(t.bulk);
  return t;
}

export function luckOf(state: GameState, totals: { luck: number } = bonusTotals(state), extraLuck = 0): number {
  return (1 + state.altar.luck * ROLL.luckPerLevel + totals.luck + extraLuck) * (1 + ROLL.seedLuck * Math.log2(1 + state.seeds / ROLL.seedLuckScale)) * nightLuckMult(state);
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

/** Price of the next roll at this family's altar (grows with each roll on this island). */
export function rollCostOf(state: GameState, family: FamilyId): Cost {
  const base = FAMILIES[family].rollCost;
  const f = Math.pow(ROLL.costGrowth, state.familyRolls[family] ?? 0);
  const c: Cost = {};
  if (base.shards) c.shards = Math.ceil(base.shards * f);
  if (base.lumen) c.lumen = Math.ceil(base.lumen * f);
  return c;
}

/**
 * Auto-roll budget: one roll may cost at most 10 % of what the island earns
 * during one cooldown, so automatic rolling never eats more than a tenth of
 * the income (and never the savings).
 */
export const AUTO_SHARE = 0.1;
export function autoRollAllowed(state: GameState, family: FamilyId, rates: { shards: number; lumen: number }): boolean {
  const c = rollCostOf(state, family);
  const cd = cooldownOf(state);
  const share = autoShare(state);
  return (c.shards ?? 0) <= rates.shards * cd * share && (c.lumen ?? 0) <= rates.lumen * cd * share && canRoll(state, family);
}

export function canRoll(state: GameState, family: FamilyId): boolean {
  const f = FAMILIES[family];
  if (!f.altar) return false;
  if (f.nightOnly && !isNight(state)) return false;
  if (state.ascension.challenge === 'sealed') return false;
  return familyUnlocked(state, family) && affordable(state, rollCostOf(state, family));
}

/** Pay once, get `bulk` runes. Returns the runes obtained (empty if impossible). */
export function doRoll(state: GameState, family: FamilyId, rng: () => number = Math.random): RuneDef[] {
  if (!canRoll(state, family)) return [];
  const cost = rollCostOf(state, family);
  state.familyRolls[family] = (state.familyRolls[family] ?? 0) + 1;
  state.shards -= cost.shards ?? 0;
  state.lumen -= cost.lumen ?? 0;
  const totals = bonusTotals(state);
  const luck = luckOf(state, totals);
  const n = bulkOf(state, totals);
  const out = drawRunes(state, family, n, luck, rng, true);
  state.runeStats.rolls += 1;
  state.runeStats.runes += n;
  if (isNight(state)) state.counters.nightRolls += 1;
  return out;
}

/**
 * Draw `n` runes of a family into the collection. With `pity`, the first rune
 * is upgraded when the pity counters say so, and the counters advance.
 */
export function drawRunes(state: GameState, family: FamilyId, n: number, luck: number, rng: () => number, pity: boolean): RuneDef[] {
  const out: RuneDef[] = [];
  let best = -1;
  for (let i = 0; i < n; i++) {
    let ri = RARITY_INDEX[rollRarity(luck, rng)];
    if (pity && i === 0) {
      const pm = pityMult(state);
      const want = state.pity.legendary + 1 >= PITY.legendary * pm ? RARITY_INDEX.legendary : state.pity.epic + 1 >= PITY.epic * pm ? RARITY_INDEX.epic : -1;
      if (want > ri) {
        ri = want;
        state.counters.pity += 1;
      }
    }
    best = Math.max(best, ri);
    out.push(addRune(state, runeFor(family, RARITIES[ri].id)));
  }
  if (pity) {
    state.pity.epic = best >= RARITY_INDEX.epic ? 0 : state.pity.epic + 1;
    state.pity.legendary = best >= RARITY_INDEX.legendary ? 0 : state.pity.legendary + 1;
  }
  return out;
}

function addRune(state: GameState, def: RuneDef): RuneDef {
  state.runes[def.id] = (state.runes[def.id] ?? 0) + 1;
  state.runeIndex[def.id] = true;
  const ri = RARITY_INDEX[def.rarity];
  if (ri > state.runeStats.best) state.runeStats.best = ri;
  return def;
}

// --- Fusion -------------------------------------------------------------------

/** Fragments needed to fuse a rune (null: this rarity cannot be fused). */
export function fuseCost(def: RuneDef, fragMult = 1): number | null {
  // fragMult: Alchimiste talent (fuseMult).
  const ri = RARITY_INDEX[def.rarity];
  const f = FUSE.fragments[ri];
  return f === undefined ? null : Math.ceil(f * fragMult);
}

/** The rune a fusion of `def` gives. */
export function fuseResult(def: RuneDef): RuneDef | null {
  const ri = RARITY_INDEX[def.rarity];
  if (FUSE.fragments[ri] === undefined) return null;
  return runeFor(def.family, RARITIES[ri + 1].id);
}

export function canFuse(state: GameState, def: RuneDef, fragMult = fuseMult(state)): boolean {
  const c = fuseCost(def, fragMult);
  return c !== null && (state.runes[def.id] ?? 0) >= FUSE.copies && state.fragments >= c - 1e-9;
}

/** Fuse FUSE.copies copies of `def` (+ fragments) into one rune of the next rarity. */
export function fuse(state: GameState, def: RuneDef, fragMult = fuseMult(state)): RuneDef | null {
  if (!canFuse(state, def, fragMult)) return null;
  const out = fuseResult(def)!;
  state.fragments -= fuseCost(def, fragMult)!;
  state.runes[def.id] -= FUSE.copies;
  if (state.runes[def.id] <= 0) delete state.runes[def.id];
  addRune(state, out);
  state.counters.fusions += 1;
  return out;
}

// --- Sets ---------------------------------------------------------------------

function hasPiece(state: GameState, p: RuneSetDef['pieces'][number]): boolean {
  if (p.rune) return (state.runes[p.rune] ?? 0) > 0;
  const min = RARITY_INDEX[p.minRarity ?? 'common'];
  return RUNES.some((r) => r.family === p.family && RARITY_INDEX[r.rarity] >= min && (state.runes[r.id] ?? 0) > 0);
}

export function setComplete(state: GameState, set: RuneSetDef): boolean {
  return set.pieces.every((p) => hasPiece(state, p));
}

export function setProgress(state: GameState, set: RuneSetDef): [number, number] {
  return [set.pieces.filter((p) => hasPiece(state, p)).length, set.pieces.length];
}

export function activeSets(state: GameState): RuneSetDef[] {
  return RUNE_SETS.filter((x) => setComplete(state, x));
}

/** Families whose runes from common to legendary have all been found. */
export function completeFamilies(state: GameState): number {
  return FAMILY_ORDER.filter((f) => RUNES.every((r) => r.family !== f || RARITY_INDEX[r.rarity] > RARITY_INDEX.legendary || state.runeIndex[r.id])).length;
}

// --- Mythic specials ------------------------------------------------------------

export function hasSpecial(state: GameState, sp: RuneSpecial): boolean {
  for (const id in state.runes) if ((state.runes[id] ?? 0) > 0 && RUNE_BY_ID.get(id)?.special === sp) return true;
  return false;
}

// --- Guardian loot --------------------------------------------------------------

/** Warden runes dropped by a guardian (rolled with the current luck, no pity). */
export function dropWardenRunes(state: GameState, n: number, rng: () => number = Math.random): RuneDef[] {
  return drawRunes(state, 'warden', n, luckOf(state), rng, false);
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
