/**
 * Permanent bonuses from every source (runes + achievements), merged into one
 * table. Cached per state snapshot key so the UI can call it every frame.
 */
import { SOFT_CAP, STAT_CAP, type RuneStat } from '../config/runes';
import { achievementTotals } from './achievements';
import { emptyTotals, runeTotals } from './runes';
import { ascensionTotals } from './ascension';
import { talentTotals } from './talents';
import type { GameState } from './state';

export type BonusTotals = Record<RuneStat, number>;

let cacheKey = '';
let cacheVal: BonusTotals | null = null;

function keyOf(s: GameState): string {
  let k = '';
  for (const id in s.runes) k += id + s.runes[id];
  for (const id in s.achievements) k += id + s.achievements[id];
  k += '|';
  for (const id in s.talents) k += id + s.talents[id];
  k += '|' + s.ascension.crowns + (s.ascension.challenge ?? '') + Object.keys(s.ascension.done).join('');
  return k;
}

/** Logarithmic soft cap above k. */
export function softCap(x: number, k: number): number {
  return x <= k ? x : k * (1 + Math.log(x / k));
}

export function bonusTotals(state: GameState): BonusTotals {
  const key = keyOf(state);
  if (cacheVal && key === cacheKey) return cacheVal;
  // Autels scellés (challenge): runes sleep.
  const r = state.ascension.challenge === 'sealed' ? emptyTotals() : runeTotals(state);
  const a = achievementTotals(state);
  const t = { ...r };
  for (const k in a) t[k as RuneStat] += a[k as RuneStat];
  const tt = talentTotals(state);
  for (const k in tt) t[k as RuneStat] += tt[k as RuneStat]!;
  const at = ascensionTotals(state);
  for (const k in at) t[k as RuneStat] += at[k as RuneStat]!;
  for (const k in STAT_CAP) t[k as RuneStat] = Math.min(t[k as RuneStat], STAT_CAP[k as RuneStat]!);
  for (const k in SOFT_CAP) t[k as RuneStat] = softCap(t[k as RuneStat], SOFT_CAP[k as RuneStat]!);
  t.bulk = Math.floor(t.bulk);
  cacheKey = key;
  cacheVal = t;
  return t;
}
