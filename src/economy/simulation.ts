/**
 * Automated player used to balance the economy (scripts/simulate.ts and
 * tests/balance.test.ts). It strikes the crystal at a fixed rate, greedily buys
 * whatever pays back fastest (machines, upgrades, zones, rune rolls), buys altar
 * upgrades with simple rules, collects most event rewards and unlocks
 * achievements along the way.
 */
import { MACHINES, MACHINE_ORDER, ZONES, ZONE_ORDER, type Cost, type MachineId, type ZoneId } from '../config/economy';
import { EVENTS } from '../config/events';
import { ALTAR_FAMILIES, FAMILIES, RARITIES, RARITY_INDEX, RUNES, type FamilyId } from '../config/runes';
import { GUARDIAN } from '../config/guardians';
import { defeatGuardian, guardiansUnlocked } from './guardians';
import { isNight } from './daynight';
import { buyEgg, eggCost, familiarsUnlocked, hatch, levelCost, levelUp } from './familiars';
import { PETS } from '../config/familiars';
import { MERCHANT, RIFT } from '../config/expeditions';
import { buyOffer, laterEventsUnlocked, merchantOffers, openSurge } from './events2';
import { claimExpedition, expeditionsUnlocked, freeSlots, isDone, startExpedition } from './expeditions';
import { checkAchievements } from './achievements';
import {
  addLumen,
  addShards,
  buyMachine,
  buyUpgrade,
  canAfford,
  canPrestige,
  canUnlockZone,
  computeRates,
  harvestEx,
  isMachineAvailable,
  nextMachineCost,
  tick,
  timeToAfford,
  unlockZone,
  visibleUpgrades,
  type Rates,
} from './economy';
import { OBJECTIVES } from './objectives';
import { altarUpgradeCost, autoRollAllowed, buyAltarUpgrade, bulkOf, canFuse, cooldownOf, doRoll, familyUnlocked, fuse, luckOf, rarityChances, rollCostOf, runeFor } from './runes';
import { createInitialState, type GameState } from './state';
import { mulberry32 } from '../core/noise';
import { canPlant, pickPath, plant } from './talents';
import { TALENT_BY_ID } from '../config/talents';

/**
 * Lucky profile: every loot draw u becomes u^LUCKY_POW. With 1.5, a 1-in-N rarity
 * comes about (1/N)^(1/1.5): roughly 10 times more often for legendaries, 100 times
 * for celestials — the luckiest plausible player (see BALANCE.md).
 */
export const LUCKY_POW = 1.5;

/** Talent priorities of the bot. */
export const ACTIVE_TALENTS = ['grip', 'clover', 'dreamer', 'streak', 'eye', 'grip', 'thrift', 'pathPick', 'founder', 'alchemy', 'patience', 'hunter', 'clover', 'eye', 'thrift', 'streak', 'founder', 'generous', 'foreman'];
export const IDLE_TALENTS = ['dreamer', 'clover', 'founder', 'thrift', 'foreman', 'pathAuto', 'clover', 'thrift', 'founder', 'alchemy', 'patience', 'grip', 'generous', 'eye', 'dreamer'];

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
  maxGap: number;
  maxGapAt: number;
  purchases: number;
  rolls: number;
  /** Longest stretch (s) during which nothing could be bought (rune rolls excluded). */
  maxBlocked: number;
  maxBlockedAt: number;
  guardians: number;
  fusions: number;
  pets: number;
  /** Share of production coming from rune + achievement bonuses at the end. */
  bonusProd: number;
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
  /** Disable runes (to measure their impact). */
  noRunes?: boolean;
  /** Disable familiars. */
  noPets?: boolean;
  /** Force favourable loot draws (runes, eggs, guardian drops). */
  lucky?: boolean;
  /** 'random': buys whatever is affordable, at random (a player who reads nothing). */
  strategy?: 'greedy' | 'random';
  /** Keep playing after the prestige becomes available (until maxSeconds). */
  noStop?: boolean;
  /** With noStop: stop after playing this share longer than the time to wake the Lighthouse. */
  stopAfterReady?: number;
  /** Talent planting priorities (default depends on the profile). */
  talentOrder?: string[];
  /** Share of event rewards the player actually grabs. */
  eventCatch?: number;
  seed?: number;
}

type Candidate =
  | { kind: 'machine'; id: MachineId; cost: Cost }
  | { kind: 'upgrade'; id: string; cost: Cost }
  | { kind: 'zone'; id: ZoneId; cost: Cost }
  | { kind: 'roll'; id: FamilyId; cost: Cost }
  | { kind: 'egg'; id: 'egg'; cost: Cost }
  | { kind: 'pet'; id: number; cost: Cost };

/** How many shards one lumen is "worth" to the bot when comparing options. */
function lumenValue(state: GameState): number {
  return state.zones.forge ? 25 : 0;
}

function score(r: Rates, lv: number, clickRate: number): number {
  return r.shards + r.lumen * lv + r.click * (1 + r.critChance * 4) * clickRate * Math.min(1.6, r.strikeSpeed);
}

function costInShards(c: Cost, lv: number): number {
  return (c.shards ?? 0) + (c.lumen ?? 0) * Math.max(lv, 25);
}

function clone(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s));
}

function candidates(state: GameState, noRunes: boolean, rollReady: boolean, noPets = false): Candidate[] {
  const out: Candidate[] = [];
  for (const id of MACHINE_ORDER) if (isMachineAvailable(state, id)) out.push({ kind: 'machine', id, cost: nextMachineCost(state, id) });
  for (const u of visibleUpgrades(state)) out.push({ kind: 'upgrade', id: u.id, cost: u.cost });
  for (const z of ZONE_ORDER) if (canUnlockZone(state, z)) out.push({ kind: 'zone', id: z, cost: ZONES[z].cost });
  if (!noPets && familiarsUnlocked(state)) {
    if (state.pets.length + state.eggs < PETS.maxOwned) out.push({ kind: 'egg', id: 'egg', cost: eggCost(state) });
    for (const p of state.pets) {
      const c = levelCost(p);
      if (c && p.perched) out.push({ kind: 'pet', id: p.id, cost: c });
    }
  }
  if (!noRunes && rollReady) for (const f of ALTAR_FAMILIES) if (familyUnlocked(state, f) && (!FAMILIES[f].nightOnly || isNight(state))) out.push({ kind: 'roll', id: f, cost: rollCostOf(state, f) });
  return out;
}

/** State after the candidate, for valuation. Rune rolls add their expected copies. */
function preview(state: GameState, c: Candidate): GameState {
  const s2 = clone(state);
  s2.shards = 1e300;
  s2.lumen = 1e300;
  if (c.kind === 'machine') buyMachine(s2, c.id);
  else if (c.kind === 'upgrade') buyUpgrade(s2, c.id);
  else if (c.kind === 'zone') unlockZone(s2, c.id);
  else if (c.kind === 'egg') {
    buyEgg(s2);
    hatch(s2, 1, () => 0.3);
  } else if (c.kind === 'pet') levelUp(s2, c.id);
  else {
    const p = rarityChances(luckOf(state));
    const bulk = bulkOf(state);
    RARITIES.forEach((r, i) => {
      const def = runeFor(c.id, r.id);
      s2.runes[def.id] = (s2.runes[def.id] ?? 0) + bulk * p[i];
    });
  }
  return s2;
}

function choose(state: GameState, clickRate: number, noRunes: boolean, rollReady: boolean, noPets = false, random: (() => number) | null = null): Candidate | null {
  const rates = computeRates(state);
  if (random) {
    // A player who reads nothing: buys any affordable option at random (bridges included).
    const ok = candidates(state, noRunes, rollReady, noPets).filter((c) => canAfford(state, c.cost));
    return ok.length ? ok[Math.floor(random() * ok.length) % ok.length] : null;
  }
  const lv = lumenValue(state);
  const base = score(rates, lv, clickRate);
  let best: Candidate | null = null;
  let bestT = Infinity;
  const eff: Rates = { ...rates, shards: rates.shards + rates.click * clickRate };
  for (const c of candidates(state, noRunes, rollReady, noPets)) {
    const wait = timeToAfford(state, eff, c.cost);
    if (!isFinite(wait)) continue;
    let t: number;
    if (c.kind === 'zone') {
      t = wait < 120 ? wait : Infinity;
    } else {
      const gain = score(computeRates(preview(state, c)), lv, clickRate) - base;
      if (gain <= 0) continue;
      t = wait + costInShards(c.cost, lv) / gain;
      // A roll only happens once per cooldown: never wait for one.
      if (c.kind === 'roll' && wait > 0) continue;
    }
    if (t < bestT) {
      bestT = t;
      best = c;
    }
  }
  return best;
}

/** Simple rules for altar upgrades: buy when cheap compared to income. */
function buyAltar(state: GameState, income: number): string | null {
  if (!state.altar.auto && state.zones.forge && canAfford(state, altarUpgradeCost(state, 'auto')!)) {
    buyAltarUpgrade(state, 'auto');
    return 'auto';
  }
  if (state.runeStats.rolls < 10) return null;
  for (const id of ['bulk', 'luck', 'speed'] as const) {
    const c = altarUpgradeCost(state, id);
    if (!c) continue;
    if ((c.shards ?? 0) <= income * 60 && canAfford(state, c)) {
      buyAltarUpgrade(state, id);
      return id;
    }
  }
  return null;
}



export function simulateRun(opts: SimOptions = {}): SimResult {
  const cps = opts.clicksPerSecond ?? 3;
  const clickUntil = opts.clickUntil ?? Infinity;
  const maxSeconds = opts.maxSeconds ?? 3 * 3600;
  const earlyWindow = opts.earlyWindow ?? 600;
  const dt = opts.dt ?? 0.25;
  const noRunes = !!opts.noRunes;
  const noPets = !!opts.noPets;
  const catchRate = opts.eventCatch ?? 0.75;
  const rng = mulberry32(opts.seed ?? 7);
  // "Lucky" profile: every loot draw is pushed towards the rarest outcomes.
  const lootRng = opts.lucky ? () => Math.pow(rng(), LUCKY_POW) : rng;
  const hatchRng = opts.lucky ? () => 1 - Math.pow(rng(), LUCKY_POW) : rng;
  const randomBuyer = opts.strategy === 'random';
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
  let objective = state.objective;
  let rollTimer = 0;
  let nextMeteor = (EVENTS.meteor.first[0] + EVENTS.meteor.first[1]) / 2;
  let nextGolden = (EVENTS.golden.first[0] + EVENTS.golden.first[1]) / 2;
  let nextGuardian = -1;
  let guardians = 0;
  let fusions = 0;
  let pets = 0;
  let strikes = 0;
  let blocked = 0;
  let maxBlocked = 0;
  let maxBlockedAt = 0;
  let nextRift = (RIFT.first[0] + RIFT.first[1]) / 2;
  let nextMerchant = (MERCHANT.first[0] + MERCHANT.first[1]) / 2;
  const plantTalents = () => {
    // Fixed priorities per play style: the bot plants the first plantable talent of its list.
    const order = opts.talentOrder ?? (clickUntil > 1200 ? ACTIVE_TALENTS : IDLE_TALENTS);
    for (let guard = 0; guard < 60; guard++) {
      const id = order.find((t) => canPlant(state, TALENT_BY_ID.get(t)!));
      if (!id || !plant(state, id)) break;
    }
  };
  plantTalents();
  state.autoBuy = true;
  let rolls = 0;

  const note = (t: number, what: string) => {
    events.push({ t, what });
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
    purchases++;
  };

  let t = 0;
  let target: Candidate | null = null;
  let tickN = 0;
  while (t < maxSeconds) {
    const rates = computeRates(state);
    tick(state, dt, rates);
    const clicking = t < clickUntil;
    if (clicking) {
      clickAcc += cps * Math.min(1.6, rates.strikeSpeed) * dt;
      while (clickAcc >= 1) {
        harvestEx(state, rates, rng, { scale: 1 + rates.streakCap });
        clickAcc -= 1;
        strikes++;
        if (strikes % 25 === 0 && pickPath(state)) addShards(state, rates.click * 10);
      }
    }
    t += dt;
    tickN++;
    rollTimer -= dt;

    // Random events (expected rewards, the player grabs most of them).
    nextMeteor -= dt;
    nextGolden -= dt;
    if (nextMeteor <= 0) {
      nextMeteor = (EVENTS.meteor.every[0] + EVENTS.meteor.every[1]) / 2;
      const zones = Object.values(state.zones).filter(Boolean).length;
      const n = Math.round((EVENTS.meteor.count + zones * EVENTS.meteor.perZone) * catchRate);
      addShards(state, n * Math.max(10, rates.shards * EVENTS.meteor.rewardSeconds + rates.click * EVENTS.meteor.rewardClicks));
      state.counters.meteors += n;
    }
    if (nextGolden <= 0 && state.stats.harvests >= 10) {
      nextGolden = (EVENTS.golden.every[0] + EVENTS.golden.every[1]) / 2;
      if (clicking && rng() < catchRate) {
        addShards(state, Math.max(100, rates.shards * EVENTS.golden.rewardSeconds + rates.click * 40) + EVENTS.golden.hits * rates.click * EVENTS.golden.hitClicks);
        addLumen(state, rates.lumen * EVENTS.golden.rewardSeconds * 0.5);
        state.counters.golden++;
      }
    }

    // Crystal guardians: an active player breaks most of them, an idle one misses them.
    if (!noRunes && guardiansUnlocked(state)) {
      if (nextGuardian < 0) nextGuardian = (state.counters.guardians === 0 ? (GUARDIAN.first[0] + GUARDIAN.first[1]) / 2 : (GUARDIAN.every[0] + GUARDIAN.every[1]) / 2);
      nextGuardian -= dt * (isNight(state) ? GUARDIAN.nightRate : 1);
      if (nextGuardian <= 0) {
        nextGuardian = (GUARDIAN.every[0] + GUARDIAN.every[1]) / 2;
        const strikes = cps * Math.min(1.6, rates.strikeSpeed);
        const fight = GUARDIAN.hp / Math.max(0.1, strikes * (1 + rates.critChance)) + 3;
        if (clicking && fight < GUARDIAN.time && rng() < catchRate) {
          defeatGuardian(state, rates, fight, lootRng);
          guardians++;
        }
      }
    }

    // After the first descent: rifts (an active player closes them), merchant, expeditions.
    if (laterEventsUnlocked(state)) {
      nextRift -= dt;
      nextMerchant -= dt;
      if (nextRift <= 0) {
        nextRift = (RIFT.every[0] + RIFT.every[1]) / 2;
        if (clicking && rng() < catchRate) openSurge(state);
      }
      if (nextMerchant <= 0) {
        nextMerchant = (MERCHANT.every[0] + MERCHANT.every[1]) / 2;
        for (const o of merchantOffers(state, rates)) if (o.id !== 'rune' && o.available && (o.cost.lumen ?? 0) * 3 < state.lumen) buyOffer(state, rates, o.id, lootRng);
      }
    }
    if (!noPets && expeditionsUnlocked(state)) {
      const now = t * 1000;
      for (let i = state.expeditions.length - 1; i >= 0; i--) if (isDone(state.expeditions[i], now)) claimExpedition(state, i, now, lootRng);
      const resting = state.pets.find((p) => !p.perched && !p.away);
      if (resting && freeSlots(state) > 0) startExpedition(state, rates, resting.id, 'voyage', now);
    }

    // Eggs hatch as soon as they are laid.
    while (!noPets && state.eggs > 0 && hatch(state, luckOf(state), hatchRng)) pets++;

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
    state.objective = objective;

    const everySecond = tickN % Math.round(1 / dt) === 0;
    if (everySecond) {
      // Honest "blocked" metric: nothing at all can be bought (rune rolls excluded).
      const any = candidates(state, noRunes, false, noPets).some((c) => c.kind !== 'roll' && canAfford(state, c.cost));
      blocked = any ? 0 : blocked + 1;
      if (blocked > maxBlocked) {
        maxBlocked = blocked;
        maxBlockedAt = t;
      }
      // Fusion: always fuse the rarest duplicates first.
      if (!noRunes && state.fragments > 0) {
        for (const def of [...RUNES].sort((a, b) => RARITY_INDEX[b.rarity] - RARITY_INDEX[a.rarity])) {
          while (canFuse(state, def)) {
            fuse(state, def);
            fusions++;
          }
        }
      }
      checkAchievements(state);
      if (!noRunes) {
        const a = buyAltar(state, rates.shards + rates.click * cps);
        if (a) note(t, `Autel : ${a}`);
      }
    }
    // Auto-roll (when unlocked): the best family, with the reserve rule.
    if (!noRunes && state.altar.auto && rollTimer <= 0) {
      const fam = [...ALTAR_FAMILIES].reverse().find((f) => familyUnlocked(state, f) && autoRollAllowed(state, f, rates));
      if (fam && doRoll(state, fam, lootRng).length) {
        rolls++;
        rollTimer = cooldownOf(state);
      }
    }

    if (!target || everySecond) target = choose(state, clicking ? cps : 0, noRunes, rollTimer <= 0, noPets, randomBuyer ? rng : null);
    let bought = 0;
    while (target && canAfford(state, target.cost) && bought < 50) {
      let ok = false;
      if (target.kind === 'machine') ok = buyMachine(state, target.id);
      else if (target.kind === 'upgrade') ok = buyUpgrade(state, target.id);
      else if (target.kind === 'zone') ok = unlockZone(state, target.id);
      else if (target.kind === 'egg') ok = buyEgg(state);
      else if (target.kind === 'pet') ok = levelUp(state, target.id);
      else if (rollTimer <= 0) {
        ok = doRoll(state, target.id, lootRng).length > 0;
        if (ok) {
          rolls++;
          rollTimer = cooldownOf(state);
        }
      }
      if (!ok) break;
      bought++;
      const label =
        target.kind === 'machine'
          ? `${MACHINES[target.id].name} #${state.machines[target.id]}`
          : target.kind === 'zone'
            ? `ZONE ${ZONES[target.id].name}`
            : target.kind === 'egg'
              ? 'Œuf de familier'
              : target.kind === 'pet'
                ? `Familier #${target.id} niv. ${state.pets.find((p) => p.id === target!.id)?.level}`
            : target.kind === 'roll'
              ? `Tirage ${target.id}`
              : `Amélioration ${target.id}`;
      // Rune rolls are not "purchases" for the pacing metric (they are always available).
      if (target.kind === 'roll') events.push({ t, what: label });
      else note(t, label);
      if (target.kind === 'zone') zoneTimes[target.id] = t;
      if (target.kind === 'machine' && firstMachineTimes[target.id] === undefined) firstMachineTimes[target.id] = t;
      target = choose(state, clicking ? cps : 0, noRunes, rollTimer <= 0, noPets, randomBuyer ? rng : null);
    }

    if (prestigeReadyAt === null && canPrestige(state)) {
      prestigeReadyAt = t;
      events.push({ t, what: 'PRESTIGE DISPONIBLE' });
      if (!opts.noStop) break;
    }
    // With noStop, keep playing for this share of the time it took to wake the Lighthouse, then stop.
    if (prestigeReadyAt !== null && opts.noStop && opts.stopAfterReady !== undefined && t >= prestigeReadyAt * (1 + opts.stopAfterReady)) {
      break;
    }
  }

  const fr = computeRates(state);
  return {
    events,
    zoneTimes,
    firstMachineTimes,
    prestigeReadyAt,
    maxEarlyGap,
    maxEarlyGapAt,
    maxGap,
    maxGapAt,
    purchases,
    rolls,
    maxBlocked,
    maxBlockedAt,
    guardians,
    fusions,
    pets,
    bonusProd: fr.bonus.prod,
    final: state,
  };
}
