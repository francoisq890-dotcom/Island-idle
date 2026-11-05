/** Pure guardian loot (used by the game and the balancing bot). */
import { GUARDIAN } from '../config/guardians';
import type { RuneDef } from '../config/runes';
import { addShards, type Rates } from './economy';
import { dropWardenRunes } from './runes';
import type { GameState } from './state';

export interface GuardianLoot {
  fragments: number;
  shards: number;
  runes: RuneDef[];
}

export function guardiansUnlocked(state: GameState): boolean {
  return state.zones.forge;
}

/** Fragments one guardian drops right now. */
export function guardianFragments(state: GameState, rates: Rates): number {
  return Math.round((GUARDIAN.fragBase + GUARDIAN.fragPerPrestige * state.stats.prestiges) * rates.fragMult);
}

/** Apply the reward of a defeated guardian. `seconds` = fight duration (records). */
export function defeatGuardian(state: GameState, rates: Rates, seconds: number, rng: () => number = Math.random): GuardianLoot {
  const fragments = guardianFragments(state, rates);
  const shards = Math.max(50, rates.shards * GUARDIAN.rewardSeconds + rates.click * GUARDIAN.rewardClicks);
  const [a, b] = GUARDIAN.runes;
  const n = a + Math.floor(rng() * (b - a + 1));
  state.fragments += fragments;
  addShards(state, shards);
  const runes = dropWardenRunes(state, n, rng);
  state.counters.guardians += 1;
  if (state.counters.guardFast === 0 || seconds < state.counters.guardFast) state.counters.guardFast = Math.max(0.5, seconds);
  return { fragments, shards, runes };
}
