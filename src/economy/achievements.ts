import { ACHIEVEMENTS, type AchievementDef } from '../config/achievements';
import type { RuneStat } from '../config/runes';
import type { GameState } from './state';

export function achievementTotals(state: GameState): Record<RuneStat, number> {
  const t: Record<RuneStat, number> = { prod: 0, click: 0, speed: 0, luck: 0, offline: 0, cost: 0, lumen: 0, crit: 0, seeds: 0, bulk: 0 };
  for (const a of ACHIEVEMENTS) if (state.achievements[a.id]) t[a.stat] += a.value;
  return t;
}

/** Unlock every achievement whose condition is met. Returns the new ones. */
export function checkAchievements(state: GameState): AchievementDef[] {
  const out: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id]) continue;
    const [c, g] = a.progress(state);
    if (c >= g) {
      state.achievements[a.id] = true;
      out.push(a);
    }
  }
  return out;
}
