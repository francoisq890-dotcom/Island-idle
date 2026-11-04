/** Tiny tween engine (no allocations per frame once a tween is created). */

export type Easing = (t: number) => number;

export const Ease = {
  linear: (t: number) => t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inQuad: (t: number) => t * t,
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  outBounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

interface Tween {
  t: number;
  duration: number;
  delay: number;
  ease: Easing;
  update: (v: number) => void;
  done?: () => void;
}

export class Tweens {
  private list: Tween[] = [];

  add(duration: number, update: (v: number) => void, opts: { ease?: Easing; delay?: number; done?: () => void } = {}): void {
    this.list.push({ t: 0, duration: Math.max(1e-4, duration), delay: opts.delay ?? 0, ease: opts.ease ?? Ease.outCubic, update, done: opts.done });
    if ((opts.delay ?? 0) <= 0) update(0);
  }

  /** Resolves after `seconds` (driven by the game clock). */
  wait(seconds: number): Promise<void> {
    return new Promise((resolve) => this.add(seconds, () => {}, { done: resolve, ease: Ease.linear }));
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      if (tw.delay > 0) {
        tw.delay -= dt;
        if (tw.delay > 0) continue;
      }
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.duration);
      tw.update(tw.ease(k));
      if (k >= 1) {
        this.list.splice(i, 1);
        tw.done?.();
      }
    }
  }
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + d * (1 - Math.exp(-lambda * dt));
}
