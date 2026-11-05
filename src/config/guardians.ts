/** Crystal guardians: a golem to break with the pickaxe in limited time. */
export const GUARDIAN = {
  /** First appearance: this many seconds after the Forges bridge opens (random in range). */
  first: [90, 140] as [number, number],
  /** Then every… (seconds of game time). */
  every: [240, 420] as [number, number],
  /** At night guardians come this much more often. */
  nightRate: 1.3,
  hp: 30,
  time: 35,
  /** The golem slams the ground every N hits taken. */
  stompEvery: 8,
  /** Wind-up before the slam (seconds), shockwave speed (m/s) and reach (m). */
  windup: 0.8,
  waveSpeed: 7,
  waveReach: 10,
  /** Stun when the wave catches a grounded player (seconds). */
  stun: 1.2,
  // Loot.
  fragBase: 8,
  fragPerPrestige: 2,
  runes: [2, 4] as [number, number],
  /** Seconds of production (+ strikes worth) on top. */
  rewardSeconds: 45,
  rewardClicks: 20,
  /** Each hit also gives this many strikes worth of shards. */
  hitClicks: 1,
};
