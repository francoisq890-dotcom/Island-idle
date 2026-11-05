/** Pure day/night helpers (shared by the game, the 3D world and the bot). */
import { DAY_NIGHT } from '../config/daynight';
import type { GameState } from './state';

/** Night length for this state (talents / runes can lengthen it). */
export function nightLength(state: GameState): number {
  let mult = 1;
  // Éclipse (mythic Moon rune): the night lasts twice as long.
  if ((state.runes.mo6 ?? 0) > 0) mult *= 2;
  return Math.min(DAY_NIGHT.cycle * 0.6, DAY_NIGHT.night * mult);
}

/** Seconds of the current cycle when the night starts. */
export function nightStart(state: GameState): number {
  return DAY_NIGHT.cycle - nightLength(state);
}

export function isNight(state: GameState): boolean {
  return (state.clock % DAY_NIGHT.cycle) >= nightStart(state);
}

/** 0 = full day … 1 = full night, with smooth dusk and dawn. */
export function nightAmount(state: GameState): number {
  const t = state.clock % DAY_NIGHT.cycle;
  const ns = nightStart(state);
  const tw = DAY_NIGHT.twilight;
  if (t < ns - tw) {
    // Dawn: the first `tw` seconds of the cycle fade the previous night out.
    return t < tw ? 1 - smooth(t / tw) : 0;
  }
  if (t < ns) return smooth((t - (ns - tw)) / tw);
  return 1;
}

function smooth(x: number): number {
  const k = Math.max(0, Math.min(1, x));
  return k * k * (3 - 2 * k);
}

/** Seconds until the next night starts (0 if it is night). */
export function secondsToNight(state: GameState): number {
  const t = state.clock % DAY_NIGHT.cycle;
  const ns = nightStart(state);
  return t >= ns ? 0 : ns - t;
}

/** Seconds until dawn (0 during the day). */
export function secondsToDawn(state: GameState): number {
  const t = state.clock % DAY_NIGHT.cycle;
  return t >= nightStart(state) ? DAY_NIGHT.cycle - t : 0;
}

/** Advance the clock; counts the nights that begin. */
export function advanceClock(state: GameState, dt: number): void {
  const before = isNight(state);
  state.clock += dt;
  if (!before && isNight(state)) state.counters.nights += 1;
}

export function nightLuckMult(state: GameState): number {
  return isNight(state) ? DAY_NIGHT.nightLuck : 1;
}
