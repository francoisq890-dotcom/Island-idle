/** Pure Ascension rules: crowns, relics, challenges. */
import { ASCENSION, CHALLENGES, RELICS, type ChallengeId, type RelicId } from '../config/ascension';
import type { RuneStat } from '../config/runes';
import type { GameState } from './state';

/** Island number within the current Ascension cycle (drives the Lighthouse threshold). */
export function islandIndex(s: GameState): number {
  return Math.max(0, s.stats.prestiges - s.ascension.islandBase);
}

/** Seeds earned during the current cycle (Constellations and Ascension read this). */
export function cycleSeeds(s: GameState): number {
  return Math.max(0, s.lifetimeSeeds - s.ascension.base);
}

export function ascensionUnlocked(s: GameState): boolean {
  return s.ascension.count > 0 || cycleSeeds(s) >= ASCENSION.seeds * 0.25;
}

export function crownGain(s: GameState): number {
  const c = cycleSeeds(s);
  return c < ASCENSION.seeds ? 0 : Math.floor(ASCENSION.crownFactor * Math.sqrt(c / ASCENSION.seeds));
}

export function canAscend(s: GameState): boolean {
  return crownGain(s) > 0 && !s.ascension.challenge;
}

export function hasRelic(s: GameState, id: RelicId): boolean {
  return !!s.ascension.relics[id];
}

export function crownsFree(s: GameState): number {
  return s.ascension.crowns - s.ascension.crownsSpent;
}

export function buyRelic(s: GameState, id: RelicId): boolean {
  const r = RELICS.find((x) => x.id === id);
  if (!r || hasRelic(s, id) || crownsFree(s) < r.cost) return false;
  s.ascension.crownsSpent += r.cost;
  s.ascension.relics[id] = true;
  s.counters.relics = Object.keys(s.ascension.relics).length;
  if (id === 'autoPrestige') s.ascension.autoPrestige = true;
  return true;
}

export function inChallenge(s: GameState, id: ChallengeId): boolean {
  return s.ascension.challenge === id;
}

export function challengesUnlocked(s: GameState): boolean {
  return s.ascension.count > 0;
}

/** Permanent bonuses: crowns and completed challenges. */
export function ascensionTotals(s: GameState): Partial<Record<RuneStat, number>> {
  const t: Partial<Record<RuneStat, number>> = {};
  if (s.ascension.crowns > 0) t.luck = ASCENSION.crownLuck * s.ascension.crowns;
  for (const c of CHALLENGES) if (s.ascension.done[c.id] && c.stat && c.value) t[c.stat] = (t[c.stat] ?? 0) + c.value;
  return t;
}

/** Production multiplier from crowns (outside the soft caps: it is the reward of the second layer). */
export function crownProdMult(s: GameState): number {
  return 1 + ASCENSION.crownProd * s.ascension.crowns;
}
