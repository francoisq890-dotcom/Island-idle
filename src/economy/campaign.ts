/**
 * Full campaign of the balancing bot: island after island until the Ascension
 * (or a time budget), for several player profiles. Used by `npm run simulate`
 * and by tests/balance.test.ts, so every balance target is an automated check.
 */
import { doPrestige, prestigeGain, computeRates } from './economy';
import { canAscend, crownGain, cycleSeeds } from './ascension';
import { simulateRun, type SimOptions } from './simulation';
import type { GameState } from './state';

export interface Profile {
  id: string;
  name: string;
  opts: SimOptions;
  /** After the Lighthouse wakes, keep playing this share of the island time before descending. */
  linger: number;
}

/** The five player profiles of the global balance pass (see BALANCE.md). */
export const PROFILES: Profile[] = [
  { id: 'optimal', name: 'Actif optimal (3 coups/s, décisions instantanées)', opts: { clicksPerSecond: 3, eventCatch: 0.95 }, linger: 0.15 },
  { id: 'average', name: 'Moyen (2 coups/s les 10 premières min de chaque île)', opts: { clicksPerSecond: 2, clickUntil: 600, eventCatch: 0.75 }, linger: 0.25 },
  { id: 'idle', name: 'Surtout idle (1 coup/s les 3 premières min)', opts: { clicksPerSecond: 1, clickUntil: 180, eventCatch: 0.3 }, linger: 0.4 },
  { id: 'lucky', name: 'Chanceux (moyen + tirages favorables forcés)', opts: { clicksPerSecond: 2, clickUntil: 600, eventCatch: 0.75, lucky: true }, linger: 0.25 },
  { id: 'random', name: 'Ne lit rien (achats au hasard, 1,5 coup/s 5 min)', opts: { clicksPerSecond: 1.5, clickUntil: 300, eventCatch: 0.5, strategy: 'random' }, linger: 0.25 },
];

export interface IslandReport {
  index: number;
  /** Seconds until the Lighthouse woke up. */
  ready: number;
  /** Seconds spent on the island (ready + linger). */
  spent: number;
  gain: number;
  cycleSeeds: number;
  /** Production multipliers at the end (to spot runaway loops). */
  prestigeMult: number;
  bonusProd: number;
  luck: number;
  maxGap: number;
  /** Longest stretch with nothing affordable (rune rolls excluded). */
  maxBlocked: number;
  zoneTimes: number[];
}

export interface CampaignReport {
  profile: Profile;
  islands: IslandReport[];
  /** Total seconds when the Ascension became possible (null = not within the budget). */
  ascensionAt: number | null;
  crowns: number;
  total: number;
  final: GameState;
}

export function runCampaign(profile: Profile, opts: { maxHours?: number; maxIslands?: number; dt?: number } = {}): CampaignReport {
  const budget = (opts.maxHours ?? 8) * 3600;
  const maxIslands = opts.maxIslands ?? 30;
  const islands: IslandReport[] = [];
  let state: GameState | undefined;
  let total = 0;
  let ascensionAt: number | null = null;
  let crowns = 0;
  for (let i = 0; i < maxIslands && total < budget; i++) {
    const r = simulateRun({ ...profile.opts, startState: state, maxSeconds: Math.min(4 * 3600, budget - total), dt: opts.dt ?? 0.5, noStop: true, stopAfterReady: profile.linger, seed: 7 + i });
    const st = r.final;
    if (r.prestigeReadyAt === null) {
      total += st.stats.runSeconds;
      state = st;
      break;
    }
    const rates = computeRates(st);
    const gain = prestigeGain(st);
    islands.push({
      index: i + 1,
      ready: r.prestigeReadyAt,
      spent: st.stats.runSeconds,
      gain,
      cycleSeeds: cycleSeeds(st) + gain,
      prestigeMult: rates.prestigeMult,
      bonusProd: rates.bonus.prod,
      luck: rates.bonus.luck,
      maxGap: r.maxGap,
      maxBlocked: r.maxBlocked,
      zoneTimes: Object.values(r.zoneTimes) as number[],
    });
    total += st.stats.runSeconds;
    doPrestige(st);
    state = st;
    if (canAscend(st)) {
      ascensionAt = total;
      crowns = crownGain(st);
      break;
    }
  }
  return { profile, islands, ascensionAt, crowns, total, final: state! };
}
