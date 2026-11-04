import { OFFLINE } from '../config/economy';
import { addLumen, addShards, computeRates } from './economy';
import type { GameState } from './state';

export interface OfflineReport {
  /** Real time away, in seconds. */
  awaySeconds: number;
  /** Time actually credited (capped). */
  creditedSeconds: number;
  shards: number;
  lumen: number;
  capped: boolean;
}

/**
 * Credit production for the time the game was closed.
 * Rates only change when the player buys something, so production while away
 * is exactly `rate × time` (the refinery share is proportional to production).
 */
export function applyOffline(state: GameState, now = Date.now()): OfflineReport {
  const awaySeconds = Math.max(0, (now - state.lastSeen) / 1000);
  const creditedSeconds = Math.min(awaySeconds, OFFLINE.maxSeconds);
  const rates = computeRates(state);
  const shards = Math.max(0, rates.shards) * creditedSeconds * OFFLINE.efficiency;
  const lumen = Math.max(0, rates.lumen) * creditedSeconds * OFFLINE.efficiency;
  addShards(state, shards);
  addLumen(state, lumen);
  state.lastSeen = now;
  return { awaySeconds, creditedSeconds, shards, lumen, capped: awaySeconds > OFFLINE.maxSeconds };
}

export function shouldShowOfflineReport(r: OfflineReport): boolean {
  return r.creditedSeconds >= OFFLINE.minSecondsForReport && (r.shards > 0 || r.lumen > 0);
}
