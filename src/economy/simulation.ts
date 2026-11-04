/**
 * Automated player used to balance the economy (see scripts/simulate.ts and
 * tests/balance.test.ts). It clicks at a fixed rate and greedily buys whatever
 * pays for itself the fastest, opening new zones as soon as it can.
 */
import { MACHINES, MACHINE_ORDER, ZONES, ZONE_ORDER, type Cost, type MachineId, type ZoneId } from '../config/economy';
import {
  buyMachine,
  buyUpgrade,
  canAfford,
  canPrestige,
  canUnlockZone,
  computeRates,
  harvest,
  isMachineAvailable,
  nextMachineCost,
  tick,
  timeToAfford,
  unlockZone,
  visibleUpgrades,
  type Rates,
} from './economy';
import { OBJECTIVES } from './objectives';
import { createInitialState, type GameState } from './state';

export interface SimEvent {
  t: number;
  what: string;
}

export interface SimResult {
  events: SimEvent[];
  zoneTimes: Partial<Record<ZoneId, number>>;
  firstMachineTimes: Partial<Record<MachineId, number>>;
  prestigeReadyAt: number | null;
  /** Longest wait between two purchases, during the first `earlyWindow` seconds. */
  maxEarlyGap: number;
  maxEarlyGapAt: number;
  /** Longest wait between two purchases over the whole run. */
  maxGap: number;
  maxGapAt: number;
  purchases: number;
  final: GameState;
}

export interface SimOptions {
  clicksPerSecond?: number;
  /** Clicking stops after this many seconds (players get lazier). */
  clickUntil?: number;
  maxSeconds?: number;
  earlyWindow?: number;
  dt?: number;
  startState?: GameState;
}

type Candidate =
  | { kind: 'machine'; id: MachineId; cost: Cost }
  | { kind: 'upgrade'; id: string; cost: Cost }
  | { kind: 'zone'; id: ZoneId; cost: Cost };

/** How many shards one lumen is "worth" to the bot when comparing options. */
function lumenValue(state: GameState): number {
  // Lumen is scarce and gates zones: value it highly once refineries exist.
  return state.zones.forge ? 25 : 0;
}

function score(r: Rates, lv: number): number {
  return r.shards + r.lumen * lv;
}

function costInShards(c: Cost, lv: number): number {
  return (c.shards ?? 0) + (c.lumen ?? 0) * Math.max(lv, 25);
}

function candidates(state: GameState): Candidate[] {
  const out: Candidate[] = [];
  for (const id of MACHINE_ORDER) if (isMachineAvailable(state, id)) out.push({ kind: 'machine', id, cost: nextMachineCost(state, id) });
  for (const u of visibleUpgrades(state)) out.push({ kind: 'upgrade', id: u.id, cost: u.cost });
  for (const z of ZONE_ORDER) if (canUnlockZone(state, z)) out.push({ kind: 'zone', id: z, cost: ZONES[z].cost });
  return out;
}

function apply(state: GameState, c: Candidate): boolean {
  if (c.kind === 'machine') return buyMachine(state, c.id);
  if (c.kind === 'upgrade') return buyUpgrade(state, c.id);
  return unlockZone(state, c.id);
}

function clone(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s));
}

/** Pick the candidate that minimises (time to afford + payback time). */
function choose(state: GameState, clickRate: number): Candidate | null {
  const rates = computeRates(state);
  const lv = lumenValue(state);
  const base = score(rates, lv) + rates.click * clickRate;
  let best: Candidate | null = null;
  let bestT = Infinity;
  for (const c of candidates(state)) {
    // Effective income including clicks, to estimate the wait.
    const eff: Rates = { ...rates, shards: rates.shards + rates.click * clickRate };
    const wait = timeToAfford(state, eff, c.cost);
    if (!isFinite(wait)) continue;
    let t: number;
    if (c.kind === 'zone') {
      // Zones gate content: buy them as soon as reasonable.
      t = wait < 120 ? wait : Infinity;
    } else {
      const s2 = clone(state);
      s2.shards = 1e300;
      s2.lumen = 1e300;
      apply(s2, c);
      const r2 = computeRates(s2);
      const gain = score(r2, lv) + r2.click * clickRate - base;
      if (gain <= 0) continue;
      t = wait + costInShards(c.cost, lv) / gain;
    }
    if (t < bestT) {
      bestT = t;
      best = c;
    }
  }
  return best;
}

export function simulateRun(opts: SimOptions = {}): SimResult {
  const cps = opts.clicksPerSecond ?? 3;
  const clickUntil = opts.clickUntil ?? Infinity;
  const maxSeconds = opts.maxSeconds ?? 3 * 3600;
  const earlyWindow = opts.earlyWindow ?? 600;
  const dt = opts.dt ?? 0.25;
  const state = opts.startState ? clone(opts.startState) : createInitialState(0);

  const events: SimEvent[] = [];
  const zoneTimes: SimResult['zoneTimes'] = {};
  const firstMachineTimes: SimResult['firstMachineTimes'] = {};
  let prestigeReadyAt: number | null = null;
  let lastBuy = 0;
  let maxEarlyGap = 0;
  let maxEarlyGapAt = 0;
  let maxGap = 0;
  let maxGapAt = 0;
  let purchases = 0;
  let clickAcc = 0;
  let objective = 0;

  let t = 0;
  let target: Candidate | null = null;
  while (t < maxSeconds) {
    const rates = computeRates(state);
    tick(state, dt, rates);
    if (t < clickUntil) {
      clickAcc += cps * dt;
      while (clickAcc >= 1) {
        harvest(state, rates);
        clickAcc -= 1;
      }
    }
    t += dt;

    // Tutorial rewards (the bot "walks" instantly).
    state.flags.nearCrystal = true;
    while (objective < OBJECTIVES.length) {
      const o = OBJECTIVES[objective];
      const [c, g] = o.progress(state, computeRates(state));
      if (c < g) break;
      if (o.reward?.shards) state.shards += o.reward.shards;
      if (o.reward?.lumen) state.lumen += o.reward.lumen;
      objective++;
    }

    // Re-evaluate the target every second or after buying.
    if (!target || Math.floor(t / dt) % Math.round(1 / dt) === 0) target = choose(state, t < clickUntil ? cps : 0);
    let bought = 0;
    while (target && canAfford(state, target.cost) && bought < 50) {
      if (!apply(state, target)) break;
      bought++;
      purchases++;
      const label =
        target.kind === 'machine'
          ? `${MACHINES[target.id].name} #${state.machines[target.id]}`
          : target.kind === 'zone'
            ? `ZONE ${ZONES[target.id].name}`
            : `Amélioration ${target.id}`;
      events.push({ t, what: label });
      if (target.kind === 'zone') zoneTimes[target.id] = t;
      if (target.kind === 'machine' && firstMachineTimes[target.id] === undefined) firstMachineTimes[target.id] = t;
      const gap = t - lastBuy;
      if (t <= earlyWindow && gap > maxEarlyGap) {
        maxEarlyGap = gap;
        maxEarlyGapAt = t;
      }
      if (gap > maxGap) {
        maxGap = gap;
        maxGapAt = t;
      }
      lastBuy = t;
      target = choose(state, t < clickUntil ? cps : 0);
    }

    if (prestigeReadyAt === null && canPrestige(state)) {
      prestigeReadyAt = t;
      events.push({ t, what: 'PRESTIGE DISPONIBLE' });
      break;
    }
  }

  return { events, zoneTimes, firstMachineTimes, prestigeReadyAt, maxEarlyGap, maxEarlyGapAt, maxGap, maxGapAt, purchases, final: state };
}
