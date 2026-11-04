/**
 * Physical layout of the archipelago: islands, construction sites, bridges and
 * conveyor routes. Units are metres; the player is ~1.3 m tall.
 */
import type { MachineId, ZoneId } from './economy';

export interface IslandLayout {
  zone: ZoneId;
  cx: number;
  cz: number;
  /** Height of the walkable top surface. */
  y: number;
  radius: number;
  /** Depth of the rocky underside. */
  depth: number;
  seed: number;
}

export const ISLANDS: IslandLayout[] = [
  { zone: 'home', cx: 0, cz: 0, y: 0, radius: 17, depth: 19, seed: 11 },
  { zone: 'forge', cx: 41, cz: -6, y: 0.6, radius: 11, depth: 13, seed: 23 },
  { zone: 'geyser', cx: -41, cz: -10, y: -0.4, radius: 11.5, depth: 13, seed: 37 },
  { zone: 'sky', cx: 5, cz: -47, y: 7, radius: 11, depth: 10, seed: 51 },
];

export type V2 = [number, number];

export interface SiteLayout {
  machine: MachineId;
  /** Center of the construction site (where the sign stands). */
  center: V2;
  /** Position of each visible machine. */
  slots: V2[];
  /** Where the sign / terminal stands. */
  sign: V2;
  /** Conveyor route from the site to the Nexus (site → nexus). */
  route: V2[];
  /** Radius used for proximity tooltips. */
  radius: number;
}

function grid(cx: number, cz: number, cols: number, rows: number, dx: number, dz: number): V2[] {
  const out: V2[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) out.push([cx + (c - (cols - 1) / 2) * dx, cz + (r - (rows - 1) / 2) * dz]);
  return out;
}

function ring(cx: number, cz: number, n: number, r: number, start = 0): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

export const NEXUS: V2 = [0, 0];
export const NEXUS_RADIUS = 2.2;
export const MAIN_CRYSTAL: V2 = [-8, 5];
export const SPAWN: { x: number; z: number; yaw: number } = { x: 0, z: 10.5, yaw: 0 };

export const SITES: Record<MachineId, SiteLayout> = {
  drill: {
    machine: 'drill',
    center: [8.5, 6],
    // Ordered so that the first drills are closest to the sign.
    slots: grid(8.5, 6, 4, 3, 2.4, 2.5).sort((a, b) => Math.hypot(a[0] - 5.5, a[1] - 9) - Math.hypot(b[0] - 5.5, b[1] - 9)),
    sign: [4.6, 9.4],
    route: [[8.5, 6], [3.2, 2.2], [1.6, 1.1]],
    radius: 6.5,
  },
  excavator: {
    machine: 'excavator',
    center: [-3, -9.5],
    slots: grid(-3, -9.5, 3, 2, 3.6, 3.6),
    sign: [-7.6, -6.4],
    route: [[-3, -9.5], [-1.2, -3.6], [-0.8, -1.7]],
    radius: 7,
  },
  refinery: {
    machine: 'refinery',
    center: [42, -6],
    slots: ring(42, -6, 6, 5.6, Math.PI * 0.95),
    sign: [34.5, -2.6],
    route: [[42, -6], [30.5, -4.9], [16.6, -2.6], [2.1, -0.4]],
    radius: 9,
  },
  geyser: {
    machine: 'geyser',
    center: [-42, -10],
    slots: ring(-42, -10, 5, 5.6, -Math.PI * 0.1),
    sign: [-34.5, -5.6],
    route: [[-42, -10], [-30.8, -8.4], [-16.4, -4.6], [-2.1, -0.6]],
    radius: 9,
  },
  prism: {
    machine: 'prism',
    center: [5, -47],
    slots: ring(5, -47, 5, 6.2, Math.PI * 0.5),
    sign: [8.6, -38.6],
    route: [[5, -47], [4.2, -37], [2.6, -16.4], [0.5, -2.1]],
    radius: 9,
  },
};

export interface BridgeLayout {
  zone: ZoneId;
  /** Start (on the parent island) and end (on the new island), XZ + height. */
  from: [number, number, number];
  to: [number, number, number];
  width: number;
  /** Visual style. */
  style: 'planks' | 'rope' | 'stairs';
  /** Where the construction sign stands. */
  sign: V2;
}

export const BRIDGES: BridgeLayout[] = [
  { zone: 'forge', from: [15.4, -2.4, 0], to: [31.0, -4.6, 0.6], width: 3.2, style: 'planks', sign: [13.4, 0.6] },
  { zone: 'geyser', from: [-15.4, -4.2, 0], to: [-30.4, -8.0, -0.4], width: 3.2, style: 'rope', sign: [-13.0, -1.4] },
  { zone: 'sky', from: [2.6, -15.6, 0], to: [4.6, -36.6, 7], width: 3.4, style: 'stairs', sign: [6.0, -13.8] },
];

/** The prestige Lighthouse, on the sky island. */
export const LIGHTHOUSE: V2 = [5, -47];

/** Interaction ranges. */
export const RANGES = {
  harvest: 3.6,
  /** Clicking a crystal from further than this says "too far". */
  harvestClick: 9,
  site: 4.2,
  bridge: 4,
  lighthouse: 5,
};
