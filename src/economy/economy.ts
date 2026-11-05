/**
 * Pure economy rules. No rendering, no DOM: everything here is unit-tested and
 * reused by the balancing simulation (scripts/simulate.ts).
 */
import {
  HARVEST,
  MACHINES,
  MACHINE_ORDER,
  MILESTONES,
  MILESTONE_MULT,
  PRESTIGE,
  REFINE,
  UPGRADES,
  ZONES,
  seedsForRun,
  type Cost,
  type MachineId,
  type UpgradeDef,
  type ZoneId,
} from '../config/economy';
import { createInitialState, emptyMachines, type GameState } from './state';
import { bonusTotals, type BonusTotals } from './bonuses';
import { hasSpecial, runesAfterPrestige } from './runes';
import { advanceClock } from './daynight';
import { CONSTELLATIONS, hasPerk } from '../config/constellations';

/** A critical strike multiplies the pickaxe gain by this. */
export const CRIT_MULT = 5;

export interface MachineRate {
  shards: number;
  lumen: number;
  /** Refinery only: shards actually processed per second. */
  processed: number;
  /** Refinery only: shards it could process if supply allowed. */
  capacity: number;
  /** Share of total shard production (0..1), for tooltips. */
  share: number;
}

export interface Rates {
  /** Shards/s produced by machines before refineries take their share. */
  shardsGross: number;
  /** Shards/s consumed by refineries. */
  refineProcessed: number;
  /** Net shards/s added to the stock. */
  shards: number;
  lumen: number;
  click: number;
  globalMult: number;
  prestigeMult: number;
  perMachine: Record<MachineId, MachineRate>;
  /** True when refineries could process more if there were more shards. */
  refineSupplyLimited: boolean;
  /** Runes + achievements. */
  bonus: BonusTotals;
  critChance: number;
  strikeSpeed: number;
  offlineMult: number;
  /** Multiplier on machine prices (≤ 1). */
  costMult: number;
  /** Mythic specials: echo strike (×0.5 a moment later), phoenix (crit → 3 crits). */
  echo: boolean;
  phoenix: boolean;
  /** Multiplier on fragments gained. */
  fragMult: number;
}

const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
export function getUpgrade(id: string): UpgradeDef | undefined {
  return UPGRADE_BY_ID.get(id);
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------

export function scaleCost(cost: Cost, factor: number): Cost {
  const out: Cost = {};
  if (cost.shards) out.shards = Math.ceil(cost.shards * factor);
  if (cost.lumen) out.lumen = Math.ceil(cost.lumen * factor);
  return out;
}

export function machineCost(id: MachineId, owned: number): Cost {
  const def = MACHINES[id];
  return scaleCost(def.baseCost, Math.pow(def.growth, owned));
}

export function nextMachineCost(state: GameState, id: MachineId): Cost {
  return machineCostFor(state, id, state.machines[id]);
}

/** Price of the machine number `owned`+1 for this state (rune cost reduction applied). */
export function machineCostFor(state: GameState, id: MachineId, owned: number): Cost {
  const k = 1 - bonusTotals(state).cost;
  return scaleCost(machineCost(id, owned), k);
}

export function canAfford(state: GameState, cost: Cost): boolean {
  return (cost.shards ?? 0) <= state.shards + 1e-9 && (cost.lumen ?? 0) <= state.lumen + 1e-9;
}

function pay(state: GameState, cost: Cost): void {
  state.shards = Math.max(0, state.shards - (cost.shards ?? 0));
  state.lumen = Math.max(0, state.lumen - (cost.lumen ?? 0));
}

// ---------------------------------------------------------------------------
// Multipliers & rates
// ---------------------------------------------------------------------------

export function milestoneMult(count: number): number {
  let m = 1;
  for (const t of MILESTONES) if (count >= t) m *= MILESTONE_MULT;
  return m;
}

export function nextMilestone(count: number): number | null {
  for (const t of MILESTONES) if (count < t) return t;
  return null;
}

export function prestigeMult(seeds: number): number {
  return 1 + seeds * PRESTIGE.bonusPerSeed;
}

export function computeRates(state: GameState): Rates {
  let clickMult = 1;
  let clickPct = 0;
  let globalMult = 1;
  let refThroughput = 1;
  let refYield = 1;
  const machineMult: Record<MachineId, number> = { drill: 1, excavator: 1, refinery: 1, geyser: 1, prism: 1 };

  for (const id in state.upgrades) {
    const up = UPGRADE_BY_ID.get(id);
    if (!up) continue;
    for (const e of up.effects) {
      switch (e.type) {
        case 'click':
          clickMult *= e.mult;
          break;
        case 'clickPct':
          clickPct += e.pct;
          break;
        case 'global':
          globalMult *= e.mult;
          break;
        case 'machine':
          machineMult[e.machine] *= e.mult;
          break;
        case 'refineThroughput':
          refThroughput *= e.mult;
          break;
        case 'refineYield':
          refYield *= e.mult;
          break;
        case 'synergy':
          if (e.target === 'refinery') refThroughput *= 1 + e.per * state.machines[e.source];
          else machineMult[e.target] *= 1 + e.per * state.machines[e.source];
          break;
      }
    }
  }

  const bonus = bonusTotals(state);
  const perkMult = (hasPerk(state.lifetimeSeeds, 'prod2') ? 2 : 1) * (hasPerk(state.lifetimeSeeds, 'prod3') ? 3 : 1);
  const pMult = prestigeMult(state.seeds) * (1 + bonus.prod) * perkMult;
  const lumenMult = 1 + bonus.lumen;
  const perMachine = {} as Record<MachineId, MachineRate>;
  let shardsGross = 0;
  let lumen = 0;

  for (const id of MACHINE_ORDER) {
    const def = MACHINES[id];
    const n = state.machines[id];
    const mult = machineMult[id] * milestoneMult(n) * globalMult * pMult;
    const s = n * (def.shardsPerSec ?? 0) * mult;
    const l = n * (def.lumenPerSec ?? 0) * mult * lumenMult;
    perMachine[id] = { shards: s, lumen: l, processed: 0, capacity: 0, share: 0 };
    shardsGross += s;
    lumen += l;
  }

  // Refineries take a capped share of what the machines produce.
  const nRef = state.machines.refinery;
  const capacity = nRef * (MACHINES.refinery.refineInput ?? 0) * refThroughput * milestoneMult(nRef) * globalMult * pMult;
  const available = shardsGross * REFINE.maxShareOfProduction;
  const processed = Math.min(capacity, available);
  const refLumen = processed * REFINE.ratio * refYield * lumenMult;
  perMachine.refinery.processed = processed;
  perMachine.refinery.capacity = capacity;
  perMachine.refinery.lumen += refLumen;
  lumen += refLumen;

  for (const id of MACHINE_ORDER) {
    perMachine[id].share = shardsGross > 0 ? perMachine[id].shards / shardsGross : 0;
  }

  const net = shardsGross - processed;
  return {
    shardsGross,
    refineProcessed: processed,
    shards: net,
    lumen,
    click: (HARVEST.baseValue * clickMult * pMult + clickPct * shardsGross) * (1 + bonus.click),
    globalMult,
    prestigeMult: pMult,
    perMachine,
    refineSupplyLimited: nRef > 0 && capacity > available + 1e-9,
    bonus,
    critChance: bonus.crit,
    strikeSpeed: 1 + bonus.speed,
    offlineMult: 1 + bonus.offline,
    costMult: 1 - bonus.cost,
    echo: hasSpecial(state, 'echo'),
    phoenix: hasSpecial(state, 'phoenix'),
    fragMult: 1 + bonus.frag,
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function addShards(state: GameState, amount: number): void {
  state.shards += amount;
  state.stats.runShards += amount;
  state.stats.allTimeShards += amount;
}

export function addLumen(state: GameState, amount: number): void {
  state.lumen += amount;
  state.stats.runLumen += amount;
  state.stats.allTimeLumen += amount;
}

/** Advance the simulation by `dt` seconds. Rates are constant between purchases. */
export function tick(state: GameState, dt: number, rates = computeRates(state)): void {
  if (dt <= 0) return;
  addShards(state, rates.shards * dt);
  addLumen(state, rates.lumen * dt);
  state.stats.playSeconds += dt;
  state.stats.runSeconds += dt;
  advanceClock(state, dt);
  if (rates.shards > state.counters.bestRate) state.counters.bestRate = rates.shards;
}

/** One manual strike on a crystal, with a chance of a critical hit. */
export function harvestEx(state: GameState, rates = computeRates(state), rng: () => number = Math.random, opts: { forceCrit?: boolean; scale?: number; echo?: boolean } = {}): { value: number; crit: boolean } {
  const crit = !!opts.forceCrit || (rates.critChance > 0 && rng() < rates.critChance);
  const v = rates.click * (crit ? CRIT_MULT : 1) * (opts.scale ?? 1);
  addShards(state, v);
  if (!opts.echo) {
    state.stats.harvests += 1;
    state.stats.allTimeHarvests += 1;
  }
  if (crit) state.counters.crits += 1;
  if (v > state.counters.bestHit) state.counters.bestHit = v;
  return { value: v, crit };
}

/** One manual strike (no critical hits: deterministic, used by tests / bot). */
export function harvest(state: GameState, rates = computeRates(state)): number {
  return harvestEx(state, rates, () => 1).value;
}

export function isMachineAvailable(state: GameState, id: MachineId): boolean {
  return state.zones[MACHINES[id].zone];
}

export function buyMachine(state: GameState, id: MachineId): boolean {
  if (!isMachineAvailable(state, id)) return false;
  const cost = nextMachineCost(state, id);
  if (!canAfford(state, cost)) return false;
  pay(state, cost);
  state.machines[id] += 1;
  return true;
}

export function isUpgradeVisible(state: GameState, up: UpgradeDef): boolean {
  if (state.upgrades[up.id]) return false;
  const r = up.requires;
  if (!r) return true;
  if (r.machine && state.machines[r.machine[0]] < r.machine[1]) return false;
  if (r.zone && !state.zones[r.zone]) return false;
  if (r.upgrade && !state.upgrades[r.upgrade]) return false;
  return true;
}

export function visibleUpgrades(state: GameState): UpgradeDef[] {
  return UPGRADES.filter((u) => isUpgradeVisible(state, u));
}

export function buyUpgrade(state: GameState, id: string): boolean {
  const up = UPGRADE_BY_ID.get(id);
  if (!up || !isUpgradeVisible(state, up)) return false;
  if (!canAfford(state, up.cost)) return false;
  pay(state, up.cost);
  state.upgrades[id] = true;
  return true;
}

/** Zones must be opened in order. */
export function canUnlockZone(state: GameState, id: ZoneId): boolean {
  if (state.zones[id]) return false;
  const order: ZoneId[] = ['home', 'forge', 'geyser', 'sky'];
  const i = order.indexOf(id);
  return i > 0 && state.zones[order[i - 1]];
}

export function unlockZone(state: GameState, id: ZoneId): boolean {
  if (!canUnlockZone(state, id)) return false;
  const cost = ZONES[id].cost;
  if (!canAfford(state, cost)) return false;
  pay(state, cost);
  state.zones[id] = true;
  return true;
}

// ---------------------------------------------------------------------------
// Prestige
// ---------------------------------------------------------------------------

export function prestigeGain(state: GameState): number {
  const base = seedsForRun(state.stats.runShards, state.stats.prestiges);
  return base > 0 ? Math.floor(base * (1 + bonusTotals(state).seeds)) : 0;
}

export function canPrestige(state: GameState): boolean {
  return state.zones.sky && prestigeGain(state) > 0;
}

/**
 * Make the island descend: everything of the current run resets, star seeds
 * (and lifetime stats / settings / tutorial progress) are kept.
 */
export function doPrestige(state: GameState): number {
  if (!canPrestige(state)) return 0;
  const gain = prestigeGain(state);
  const fresh = createInitialState();
  const ct = state.counters;
  if (ct.bestIsland === 0 || state.stats.runSeconds < ct.bestIsland) ct.bestIsland = Math.max(1, state.stats.runSeconds);
  ct.bestGain = Math.max(ct.bestGain, gain);
  state.stats.runSeconds = 0;
  state.seeds += gain;
  state.lifetimeSeeds += gain;
  // Runes: epic and rarer survive, the rest crumble (see DECISIONS.md).
  state.runes = runesAfterPrestige(state.runes);
  // Altar upgrades reset, the automatic roll (quality of life) is kept.
  state.altar = { luck: 0, bulk: 0, speed: 0, auto: state.altar.auto };
  state.familyRolls = { ...fresh.familyRolls };
  state.shards = 0;
  state.lumen = 0;
  state.machines = emptyMachines();
  state.upgrades = {};
  state.zones = { ...fresh.zones };
  state.stats.runShards = 0;
  state.stats.runLumen = 0;
  state.stats.harvests = 0;
  state.stats.prestiges += 1;
  state.player = { ...fresh.player };
  state.islandSeed += 1;
  // Constellation perks: the new island starts stronger.
  const ls = state.lifetimeSeeds;
  ct.constellations = CONSTELLATIONS.filter((x) => ls >= x.seeds).length;
  if (hasPerk(ls, 'drills5')) state.machines.drill = 5;
  if (hasPerk(ls, 'bridgeForge')) state.zones.forge = true;
  if (hasPerk(ls, 'altarLuck')) state.altar.luck = 5;
  if (hasPerk(ls, 'picks')) {
    state.upgrades.pick1 = true;
    state.upgrades.pick2 = true;
  }
  return gain;
}

// ---------------------------------------------------------------------------
// Helpers for the UI
// ---------------------------------------------------------------------------

/** Seconds until `cost` is affordable at the current rates (0 if already affordable, Infinity if never). */
export function timeToAfford(state: GameState, rates: Rates, cost: Cost): number {
  let t = 0;
  const ns = (cost.shards ?? 0) - state.shards;
  if (ns > 0) t = Math.max(t, rates.shards > 0 ? ns / rates.shards : Infinity);
  const nl = (cost.lumen ?? 0) - state.lumen;
  if (nl > 0) t = Math.max(t, rates.lumen > 0 ? nl / rates.lumen : Infinity);
  return t;
}

/** 0..1 progress towards affording `cost` (min over resources). */
export function affordProgress(state: GameState, cost: Cost): number {
  let p = 1;
  if (cost.shards) p = Math.min(p, state.shards / cost.shards);
  if (cost.lumen) p = Math.min(p, state.lumen / cost.lumen);
  return Math.max(0, Math.min(1, p));
}
