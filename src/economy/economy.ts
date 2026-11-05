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
  prestigeThreshold,
  type Cost,
  type MachineId,
  type UpgradeDef,
  type ZoneId,
} from '../config/economy';
import { createInitialState, emptyMachines, type GameState } from './state';
import { bonusTotals, type BonusTotals } from './bonuses';
import { hasSpecial, runesAfterPrestige } from './runes';
import { advanceClock } from './daynight';
import { pickPath, streakCap, tlv } from './talents';
import { perched, petStrikesPerSecond } from './familiars';
import { PETS, SPECIES } from '../config/familiars';
import { CONSTELLATIONS, hasPerk } from '../config/constellations';
import { canAscend, challengesUnlocked, crownGain, crownProdMult, cycleSeeds, hasRelic, inChallenge, islandIndex } from './ascension';
import type { ChallengeId } from '../config/ascension';
import { RARITY_INDEX, RUNE_BY_ID } from '../config/runes';

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
  /** Shards/s brought by familiars (included in `shards`). */
  pets: number;
  /** Familiar strikes per second, in pickaxe strikes. */
  petStrikes: number;
  /** Fragments per second found by drakes. */
  drakeFragments: number;
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
  /** Série ardente: max bonus from a strike streak (+1 % per chained strike). */
  streakCap: number;
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
  const k = (1 - bonusTotals(state).cost) * (inChallenge(state, 'dear') ? 3 : 1);
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
  return 1 + effectiveSeeds(seeds) * PRESTIGE.bonusPerSeed;
}

/** Seeds that count for the production bonus: linear up to softSeeds, then seeds^softExp (soft cap). */
export function effectiveSeeds(seeds: number): number {
  const k = PRESTIGE.softSeeds;
  return seeds <= k ? seeds : k * Math.pow(seeds / k, PRESTIGE.softExp);
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
  const cs = cycleSeeds(state);
  const perkMult = (hasPerk(cs, 'prod2') ? 1.5 : 1) * (hasPerk(cs, 'prod3') ? 2 : 1) * crownProdMult(state) * (inChallenge(state, 'tenth') ? 0.1 : 1);
  const surge = state.surge.until > state.clock ? state.surge.mult : 1;
  const pMult = prestigeMult(state.seeds) * (1 + bonus.prod) * perkMult * surge;
  const lumenMult = (1 + bonus.lumen) * (inChallenge(state, 'moonless') ? 0.25 : 1);
  if (state.ascension.done.noDrill) machineMult.drill *= 3;
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
  const click = (HARVEST.baseValue * clickMult * pMult + clickPct * shardsGross) * (1 + bonus.click) * (pickPath(state) ? 2 : 1);
  // Familiars strike the crystal on their own: income = their strikes × the value of a strike.
  const petStrikes = petStrikesPerSecond(state, bonus.pet);
  let drakeStrikes = 0;
  for (const p of perched(state)) if (p.species === 'drake') drakeStrikes += 1 / SPECIES.drake.period;
  return {
    shardsGross,
    refineProcessed: processed,
    shards: net + petStrikes * click,
    pets: petStrikes * click,
    petStrikes,
    drakeFragments: drakeStrikes * PETS.drakeFragment * (1 + bonus.frag),
    lumen,
    click,
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
    streakCap: streakCap(state),
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
  if (rates.drakeFragments > 0) state.fragments += rates.drakeFragments * dt;
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
  if (id === 'drill' && inChallenge(state, 'noDrill')) return false;
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
  // The Geysers island hosts the Nid d'éther: the first egg is offered.
  if (id === 'geyser' && state.pets.length === 0 && state.eggs === 0 && state.eggsBought === 0) state.eggs = 1;
  return true;
}

// ---------------------------------------------------------------------------
// Prestige
// ---------------------------------------------------------------------------

export function prestigeGain(state: GameState): number {
  const base = seedsForRun(state.stats.runShards, islandIndex(state));
  return base > 0 ? Math.floor(base * (1 + bonusTotals(state).seeds)) : 0;
}

export function canPrestige(state: GameState): boolean {
  return state.zones.sky && prestigeGain(state) > 0 && !state.ascension.challenge;
}

/**
 * Make the island descend: everything of the current run resets, star seeds
 * (and lifetime stats / settings / tutorial progress) are kept.
 */
export function doPrestige(state: GameState): number {
  if (!canPrestige(state)) return 0;
  const gain = prestigeGain(state);
  const ct = state.counters;
  if (ct.bestIsland === 0 || state.stats.runSeconds < ct.bestIsland) ct.bestIsland = Math.max(1, state.stats.runSeconds);
  ct.bestGain = Math.max(ct.bestGain, gain);
  state.seeds += gain;
  state.lifetimeSeeds += gain;
  state.stats.prestiges += 1;
  resetIsland(state, 'prestige');
  return gain;
}

/**
 * A new island grows: everything of the run resets, then the permanent perks
 * (constellations, talents, relics) give it a head start.
 *  - 'prestige': runes below legendary crumble;
 *  - 'challenge': same island count, nothing gained (entering a challenge);
 *  - 'ascension': runes below mythic crumble too (handled by doAscend).
 */
export function resetIsland(state: GameState, why: 'prestige' | 'challenge' | 'ascension'): void {
  const fresh = createInitialState();
  const prevMachines = { ...state.machines };
  state.stats.runSeconds = 0;
  if (why !== 'challenge') state.runes = runesAfterPrestige(state.runes);
  // Altar upgrades reset (unless the Autel fidèle relic), the automatic roll is kept.
  if (!hasRelic(state, 'keepAltar') || why === 'ascension') state.altar = { luck: 0, bulk: 0, speed: 0, auto: state.altar.auto };
  state.familyRolls = { ...fresh.familyRolls };
  state.shards = 0;
  state.lumen = 0;
  state.machines = emptyMachines();
  state.upgrades = {};
  state.zones = { ...fresh.zones };
  state.stats.runShards = 0;
  state.stats.runLumen = 0;
  state.stats.harvests = 0;
  state.surge = { mult: 1, until: 0 };
  state.player = { ...fresh.player };
  state.islandSeed += 1;
  // Constellation perks (seeds of the current Ascension cycle).
  const ls = cycleSeeds(state);
  state.counters.constellations = Math.max(state.counters.constellations, CONSTELLATIONS.filter((x) => ls >= x.seeds).length);
  if (hasPerk(ls, 'drills5')) state.machines.drill = 5;
  if (hasPerk(ls, 'bridgeForge')) state.zones.forge = true;
  if (hasPerk(ls, 'altarLuck')) state.altar.luck = Math.max(state.altar.luck, 5);
  const f = tlv(state, 'founder');
  if (f > 0) {
    state.machines.drill += 10 * f;
    state.machines.excavator += 5 * f;
  }
  if (hasPerk(ls, 'picks')) {
    state.upgrades.pick1 = true;
    state.upgrades.pick2 = true;
  }
  // Relics.
  if (hasRelic(state, 'bridges')) state.zones = { home: true, forge: true, geyser: true, sky: true };
  if (hasRelic(state, 'heritage') && why === 'prestige') for (const id of MACHINE_ORDER) state.machines[id] = Math.max(state.machines[id], Math.floor(prevMachines[id] * 0.1));
  if (inChallenge(state, 'noDrill')) state.machines.drill = 0;
}

/** Enter a challenge: the current island restarts (nothing gained) under a constraint. */
export function startChallenge(state: GameState, id: ChallengeId): boolean {
  if (!challengesUnlocked(state) || state.ascension.challenge || state.ascension.done[id]) return false;
  state.ascension.challenge = id;
  resetIsland(state, 'challenge');
  return true;
}

export function abandonChallenge(state: GameState): boolean {
  if (!state.ascension.challenge) return false;
  state.ascension.challenge = null;
  return true;
}

/** A challenge is won by waking the Lighthouse under its constraint. Returns the challenge completed. */
export function checkChallenge(state: GameState): ChallengeId | null {
  const c = state.ascension.challenge;
  if (!c || state.stats.runShards < islandThreshold(state)) return null;
  state.ascension.done[c] = true;
  state.ascension.challenge = null;
  state.counters.challenges = Object.keys(state.ascension.done).length;
  return c;
}

/** Ascension: the archipelago rises above the clouds. Returns the crowns gained. */
export function doAscend(state: GameState): number {
  if (!canAscend(state)) return 0;
  const gain = crownGain(state);
  const a = state.ascension;
  a.count += 1;
  a.crowns += gain;
  state.counters.ascensions = a.count;
  // A new cycle: seeds, talents, constellations start over.
  state.seeds = 0;
  state.seedsPlanted = 0;
  state.talents = {};
  state.autoBuy = false;
  a.base = state.lifetimeSeeds;
  a.islandBase = state.stats.prestiges;
  // Only mythic and celestial runes survive; altar upgrades and fragments are lost.
  const kept: Record<string, number> = {};
  for (const id in state.runes) {
    const d = RUNE_BY_ID.get(id);
    if (d && RARITY_INDEX[d.rarity] >= RARITY_INDEX.mythic) kept[id] = state.runes[id];
  }
  state.runes = kept;
  state.fragments = 0;
  state.pity = { epic: 0, legendary: 0 };
  resetIsland(state, 'ascension');
  state.altar = { luck: 0, bulk: 0, speed: 0, auto: state.altar.auto };
  return gain;
}

/** Lighthouse threshold of the current island (resets with each Ascension cycle). */
export function islandThreshold(state: GameState): number {
  return prestigeThreshold(islandIndex(state));
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
