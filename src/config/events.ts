/** Random events: tuning in one place. Rewards are expressed in seconds of production. */
export const EVENTS = {
  meteor: {
    /** Seconds between two showers (random in range). First one comes sooner. */
    every: [220, 380] as [number, number],
    first: [110, 160] as [number, number],
    count: 7,
    perZone: 2,
    /** Each meteor is worth this many seconds of production (+ some clicks). */
    rewardSeconds: 35,
    rewardClicks: 12,
    life: 30,
    magnet: 3.6,
  },
  golden: {
    every: [300, 520] as [number, number],
    first: [200, 260] as [number, number],
    hits: 12,
    time: 25,
    /** Breaking it is worth this many seconds of production. */
    rewardSeconds: 240,
    /** Each hit gives this many clicks worth. */
    hitClicks: 3,
  },
};

export function between([a, b]: [number, number]): number {
  return a + Math.random() * (b - a);
}
