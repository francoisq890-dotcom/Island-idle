/** Pure talent rules (Jardin d'étoiles). */
import { TALENT, TALENT_BY_ID, TALENTS, type TalentDef } from '../config/talents';
import type { RuneStat } from '../config/runes';
import { MACHINE_ORDER, MACHINES, type MachineId } from '../config/economy';
import type { GameState } from './state';

export function talentsUnlocked(state: GameState): boolean {
  return state.stats.prestiges > 0 || state.seeds > 0;
}

export function tlv(state: GameState, id: string): number {
  return state.talents[id] ?? 0;
}

export function seedsFree(state: GameState): number {
  return Math.max(0, state.seeds - state.seedsPlanted);
}

/** Seeds for the next level of a talent (null at max). */
export function talentCost(state: GameState, def: TalentDef): number | null {
  const l = tlv(state, def.id);
  if (l >= def.max) return null;
  return Math.ceil(def.cost * Math.pow(def.growth, l));
}

export function pathChosen(state: GameState): TalentDef | null {
  return TALENTS.find((t) => t.path && tlv(state, t.id) > 0) ?? null;
}

/** Why a talent cannot be planted right now (null = it can, given the seeds). */
export function talentLock(state: GameState, def: TalentDef): string | null {
  if (def.prestiges && state.stats.prestiges < def.prestiges) return `après ${def.prestiges} descentes`;
  if (def.requires && tlv(state, def.requires) === 0) return `requiert « ${TALENT_BY_ID.get(def.requires)!.name} »`;
  if (def.path) {
    const p = pathChosen(state);
    if (p && p.id !== def.id) return `voie déjà choisie : ${p.name}`;
  }
  return null;
}

export function canPlant(state: GameState, def: TalentDef): boolean {
  const c = talentCost(state, def);
  return c !== null && !talentLock(state, def) && seedsFree(state) >= c;
}

export function plant(state: GameState, id: string): boolean {
  const def = TALENT_BY_ID.get(id);
  if (!def || !canPlant(state, def)) return false;
  state.seedsPlanted += talentCost(state, def)!;
  state.talents[id] = tlv(state, id) + 1;
  state.counters.talents = Math.max(state.counters.talents, Object.values(state.talents).reduce((a, b) => a + b, 0));
  return true;
}

/** Re-planting is free, but only at the start of an island. */
export function canRespec(state: GameState): boolean {
  return state.stats.runSeconds <= TALENT.respecWindow && state.seedsPlanted > 0;
}

export function respec(state: GameState): boolean {
  if (!canRespec(state)) return false;
  state.talents = {};
  state.seedsPlanted = 0;
  state.autoBuy = false;
  return true;
}

/** Plain stat bonuses from talents (merged into bonusTotals). */
export function talentTotals(state: GameState): Partial<Record<RuneStat, number>> {
  const t: Partial<Record<RuneStat, number>> = {};
  for (const def of TALENTS) {
    const l = tlv(state, def.id);
    if (l > 0 && def.stat && def.per) t[def.stat] = (t[def.stat] ?? 0) + def.per * l;
  }
  if (tlv(state, 'hunter')) t.frag = (t.frag ?? 0) + 0.5;
  if (tlv(state, 'pathAuto')) t.pet = (t.pet ?? 0) + 0.5;
  return t;
}

// --- Special effects ------------------------------------------------------------

export const streakCap = (s: GameState) => 0.2 * tlv(s, 'streak');
export const pickPath = (s: GameState) => tlv(s, 'pathPick') > 0;
export const oraclePath = (s: GameState) => tlv(s, 'pathOracle') > 0;
export const guardianBonusTime = (s: GameState) => (tlv(s, 'hunter') ? 10 : 0);
export const offlineExtraHours = (s: GameState) => 2 * tlv(s, 'dreamer');
export const fuseMult = (s: GameState) => 1 - 0.2 * tlv(s, 'alchemy');
export const pityMult = (s: GameState) => 1 - 0.25 * tlv(s, 'patience');
export const autoShare = (s: GameState) => (tlv(s, 'generous') ? 0.15 : 0.1);
export const talentPerches = (s: GameState) => (tlv(s, 'pathAuto') ? 1 : 0);

/**
 * Contremaître: buy the machine with the best production per cost among those
 * already placed once, as long as it costs at most `share` of the stock.
 * Returns the machine bought (or null).
 */
export function autoBuyStep(state: GameState, gainOf: (id: MachineId) => number, costOf: (id: MachineId) => number, buy: (id: MachineId) => boolean, share = 0.5): MachineId | null {
  if (!state.autoBuy || tlv(state, 'foreman') === 0) return null;
  let best: MachineId | null = null;
  let bestV = 0;
  for (const id of MACHINE_ORDER) {
    if (state.machines[id] === 0 || !state.zones[MACHINES[id].zone]) continue;
    const c = costOf(id);
    if (!(c > 0) || c > state.shards * share) continue;
    const v = gainOf(id) / c;
    if (v > bestV) {
      bestV = v;
      best = id;
    }
  }
  return best && buy(best) ? best : null;
}
