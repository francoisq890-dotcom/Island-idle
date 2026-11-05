import { ACHIEVEMENTS, tierFor, type AchievementDef } from '../config/achievements';
import type { RuneStat } from '../config/runes';
import { emptyTotals } from './runes';
import type { GameState } from './state';

export function achievementTotals(state: GameState): Record<RuneStat, number> {
  const t = emptyTotals();
  for (const a of ACHIEVEMENTS) {
    const tier = state.achievements[a.id] ?? 0;
    for (let i = 0; i < tier && i < a.values.length; i++) t[a.stat] += a.values[i];
  }
  return t;
}

/** Tiers unlocked in total. */
export function tiersUnlocked(state: GameState): number {
  let n = 0;
  for (const a of ACHIEVEMENTS) n += state.achievements[a.id] ?? 0;
  return n;
}

export interface AchievementUnlock {
  def: AchievementDef;
  tier: number;
}

/** Unlock every tier whose condition is met (tiers never go down). Returns the new tiers. */
export function checkAchievements(state: GameState): AchievementUnlock[] {
  const out: AchievementUnlock[] = [];
  for (const a of ACHIEVEMENTS) {
    const have = state.achievements[a.id] ?? 0;
    if (have >= a.goals.length) continue;
    const t = tierFor(a, a.value(state));
    if (t > have) {
      state.achievements[a.id] = t;
      for (let k = have + 1; k <= t; k++) out.push({ def: a, tier: k });
    }
  }
  return out;
}
