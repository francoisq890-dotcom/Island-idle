/**
 * Permanent bonuses from every source (runes + achievements), merged into one
 * table. Cached per state snapshot key so the UI can call it every frame.
 */
import { STAT_CAP, type RuneStat } from '../config/runes';
import { achievementTotals } from './achievements';
import { runeTotals } from './runes';
import type { GameState } from './state';

export type BonusTotals = Record<RuneStat, number>;

let cacheKey = '';
let cacheVal: BonusTotals | null = null;

function keyOf(s: GameState): string {
  let k = '';
  for (const id in s.runes) k += id + s.runes[id];
  for (const id in s.achievements) k += id + s.achievements[id];
  return k;
}

export function bonusTotals(state: GameState): BonusTotals {
  const key = keyOf(state);
  if (cacheVal && key === cacheKey) return cacheVal;
  const r = runeTotals(state);
  const a = achievementTotals(state);
  const t = { ...r };
  for (const k in a) t[k as RuneStat] += a[k as RuneStat];
  for (const k in STAT_CAP) t[k as RuneStat] = Math.min(t[k as RuneStat], STAT_CAP[k as RuneStat]!);
  t.bulk = Math.floor(t.bulk);
  cacheKey = key;
  cacheVal = t;
  return t;
}
