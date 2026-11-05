/**
 * Day/night cycle tuning. The cycle runs on game time (state.clock) and never
 * changes production, so offline gains stay exact: night only boosts rune luck,
 * lights the Moon altar and makes the world glow.
 */
export const DAY_NIGHT = {
  /** Full cycle length (seconds of game time). */
  cycle: 480,
  /** Night length within a cycle (seconds). The night is centred on the end of the cycle. */
  night: 120,
  /** Dusk / dawn transition (seconds on each side of the night). */
  twilight: 22,
  /** Rune luck multiplier at night. */
  nightLuck: 1.5,
};
