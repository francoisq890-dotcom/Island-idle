/**
 * Procedural floating islands (low-poly, flat shaded, vertex coloured) and the
 * ground queries used by the player controller (height + walkability).
 */
import * as THREE from 'three';
import { BRIDGES, ISLANDS, type BridgeLayout, type IslandLayout, type V2 } from '../config/world';
import { PALETTE, type GrassTheme } from '../config/palette';
import { angularNoise, fbm, mulberry32 } from '../core/noise';
import type { ZoneId } from '../config/economy';

export function islandRadiusAt(isl: IslandLayout, angle: number): number {
  return isl.radius * (1 + 0.1 * angularNoise(angle, isl.seed, 4) + 0.04 * angularNoise(angle, isl.seed + 5, 11));
}

export function islandTopHeight(isl: IslandLayout, x: number, z: number): number {
  const dx = x - isl.cx;
  const dz = z - isl.cz;
  const d = Math.hypot(dx, dz);
  const r = islandRadiusAt(isl, Math.atan2(dz, dx));
  const t = d / r;
  const bump = fbm(x * 0.085, z * 0.085, isl.seed, 3) * 0.45;
  // Keep the middle flat (machines), roll the edge down a bit.
  const centerFlat = THREE.MathUtils.smoothstep(t, 0.15, 0.55);
  const edge = THREE.MathUtils.smoothstep(t, 0.82, 1.02) * 0.45;
  return isl.y + bump * (0.25 + 0.75 * centerFlat) - edge;
}

/** Paths are drawn as sandy trails on the grass. */
export interface Trail {
  pts: V2[];
  width: number;
}

function distToSegment(px: number, pz: number, a: V2, b: V2): number {
  const vx = b[0] - a[0];
  const vz = b[1] - a[1];
  const l2 = vx * vx + vz * vz;
  let t = l2 > 0 ? ((px - a[0]) * vx + (pz - a[1]) * vz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + vx * t), pz - (a[1] + vz * t));
}

export function distToPolyline(px: number, pz: number, pts: V2[]): number {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distToSegment(px, pz, pts[i], pts[i + 1]));
  return d;
}

// ---------------------------------------------------------------------------
// Ground queries
// ---------------------------------------------------------------------------

export class Ground {
  unlocked: Record<ZoneId, boolean> = { home: true, forge: false, geyser: false, sky: false };
  /** Circular obstacles (machines, props). */
  obstacles: { x: number; z: number; r: number; zone: ZoneId; active: () => boolean }[] = [];

  islandAt(x: number, z: number, margin = 0): IslandLayout | null {
    for (const isl of ISLANDS) {
      const dx = x - isl.cx;
      const dz = z - isl.cz;
      const d = Math.hypot(dx, dz);
      if (d < islandRadiusAt(isl, Math.atan2(dz, dx)) - margin) return isl;
    }
    return null;
  }

  /** Bridge under (x,z) if any; returns the parameter along it. */
  bridgeAt(x: number, z: number): { b: BridgeLayout; t: number } | null {
    for (const b of BRIDGES) {
      if (!this.unlocked[b.zone]) continue;
      const ax = b.from[0];
      const az = b.from[1];
      const vx = b.to[0] - ax;
      const vz = b.to[1] - az;
      const l2 = vx * vx + vz * vz;
      const t = ((x - ax) * vx + (z - az) * vz) / l2;
      if (t < -0.02 || t > 1.02) continue;
      const px = ax + vx * t;
      const pz = az + vz * t;
      if (Math.hypot(x - px, z - pz) <= b.width / 2 - 0.25) return { b, t: Math.max(0, Math.min(1, t)) };
    }
    return null;
  }

  heightAt(x: number, z: number): number {
    const br = this.bridgeAt(x, z);
    if (br) {
      const h = bridgeHeight(br.b, br.t);
      // Blend into the island surface at both ends.
      const isl = this.islandAt(x, z, 0.6);
      if (isl) return Math.max(h, islandTopHeight(isl, x, z));
      return h;
    }
    const isl = this.islandAt(x, z);
    return isl ? islandTopHeight(isl, x, z) : -50;
  }

  walkable(x: number, z: number): boolean {
    const isl = this.islandAt(x, z, 0.9);
    const onIsland = !!isl && this.unlocked[isl.zone];
    if (!onIsland && !this.bridgeAt(x, z)) return false;
    for (const o of this.obstacles) {
      if (!o.active()) continue;
      const dx = x - o.x;
      const dz = z - o.z;
      if (dx * dx + dz * dz < o.r * o.r) return false;
    }
    return true;
  }
}

export function bridgeHeight(b: BridgeLayout, t: number): number {
  const base = b.from[2] + (b.to[2] - b.from[2]) * t;
  if (b.style === 'rope') return base - Math.sin(t * Math.PI) * 0.55; // gentle sag
  if (b.style === 'stairs') {
    // Ease in/out so the stairs land flat on both islands.
    const e = t * t * (3 - 2 * t);
    return b.from[2] + (b.to[2] - b.from[2]) * e + 0.12;
  }
  return base + Math.sin(t * Math.PI) * 0.35; // slight arch
}

// ---------------------------------------------------------------------------
// Island mesh generation
// ---------------------------------------------------------------------------

const tmpC = new THREE.Color();

export interface IslandBuildOptions {
  theme: GrassTheme;
  trails: Trail[];
  /** Volcanic / misty variations. */
  rock?: [number, number, number];
}

/** Build the top + underside of an island as one flat-shaded mesh. */
export function buildIslandMesh(isl: IslandLayout, opts: IslandBuildOptions): THREE.Mesh {
  const SEG = 64;
  const RINGS = 12;
  const rand = mulberry32(isl.seed * 977);
  const rockCols = opts.rock ?? [PALETTE.rock1, PALETTE.rock2, PALETTE.rock3];

  // Precompute rim radii.
  const rim: number[] = [];
  for (let s = 0; s < SEG; s++) rim.push(islandRadiusAt(isl, (s / SEG) * Math.PI * 2));

  // Grid of top vertices: rings[r][s] (r=0 is the center point).
  type P = [number, number, number];
  const top: P[][] = [];
  for (let r = 0; r <= RINGS; r++) {
    const row: P[] = [];
    const count = r === 0 ? 1 : SEG;
    for (let s = 0; s < count; s++) {
      const a = (s / SEG) * Math.PI * 2 + (r % 2 ? Math.PI / SEG : 0);
      const R = islandRadiusAt(isl, a);
      let f = r / RINGS;
      if (r > 0 && r < RINGS) f += (rand() - 0.5) * 0.04;
      let ang = a;
      if (r > 0 && r < RINGS) ang += (rand() - 0.5) * (0.6 / SEG) * Math.PI * 2;
      const x = isl.cx + Math.cos(ang) * R * f;
      const z = isl.cz + Math.sin(ang) * R * f;
      row.push([x, islandTopHeight(isl, x, z), z]);
    }
    top.push(row);
  }

  const pos: number[] = [];
  const col: number[] = [];

  const pushTri = (a: P, b: P, c: P, color: THREE.Color) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) col.push(color.r, color.g, color.b);
  };

  const grassColor = (x: number, z: number, y: number): THREE.Color => {
    const n = fbm(x * 0.12 + 3, z * 0.12 - 7, isl.seed + 3, 2);
    const fine = (rand() - 0.5) * 0.06;
    tmpC.setHex(opts.theme.grass);
    if (n > 0.18) tmpC.lerp(new THREE.Color(opts.theme.grassLight), Math.min(1, (n - 0.18) * 2.5));
    else if (n < -0.2) tmpC.lerp(new THREE.Color(opts.theme.grassDark), Math.min(1, (-n - 0.2) * 2.5));
    // Sandy trails.
    let trail = 0;
    for (const tr of opts.trails) {
      const d = distToPolyline(x, z, tr.pts);
      trail = Math.max(trail, 1 - THREE.MathUtils.smoothstep(d, tr.width * 0.55, tr.width));
    }
    if (trail > 0) tmpC.lerp(new THREE.Color(0xd2b07c), trail * 0.8);
    // Slightly darker on the rolled edge.
    const dh = isl.y - y;
    if (dh > 0.1) tmpC.multiplyScalar(1 - Math.min(0.12, dh * 0.25));
    tmpC.offsetHSL(0, 0, fine);
    return tmpC.clone();
  };

  const cen = (a: P, b: P, c: P): P => [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];

  // Center fan.
  for (let s = 0; s < SEG; s++) {
    const a = top[0][0];
    const b = top[1][s];
    const c = top[1][(s + 1) % SEG];
    const m = cen(a, b, c);
    pushTri(a, c, b, grassColor(m[0], m[2], m[1]));
  }
  // Rings.
  for (let r = 1; r < RINGS; r++) {
    const inner = top[r];
    const outer = top[r + 1];
    const odd = r % 2 === 1; // inner ring offset by half a segment when odd
    for (let s = 0; s < SEG; s++) {
      const i0 = inner[s];
      const i1 = inner[(s + 1) % SEG];
      const o0 = outer[s];
      const o1 = outer[(s + 1) % SEG];
      if (odd) {
        let m = cen(i0, o1, o0);
        pushTri(i0, o1, o0, grassColor(m[0], m[2], m[1]));
        m = cen(i0, i1, o1);
        pushTri(i0, i1, o1, grassColor(m[0], m[2], m[1]));
      } else {
        let m = cen(i0, i1, o0);
        pushTri(i0, i1, o0, grassColor(m[0], m[2], m[1]));
        m = cen(i1, o1, o0);
        pushTri(i1, o1, o0, grassColor(m[0], m[2], m[1]));
      }
    }
  }

  // --- Rim & underside -------------------------------------------------------
  const edge = top[RINGS];
  const lipOut: P[] = [];
  const cliff: P[] = [];
  for (let s = 0; s < SEG; s++) {
    const a = (s / SEG) * Math.PI * 2;
    const R = rim[s];
    lipOut.push([isl.cx + Math.cos(a) * (R + 0.35), edge[s][1] - 0.45, isl.cz + Math.sin(a) * (R + 0.35)]);
    const jag = 0.2 + rand() * 0.25;
    cliff.push([isl.cx + Math.cos(a) * (R + jag), isl.y - 1.5 - rand() * 0.4, isl.cz + Math.sin(a) * (R + jag)]);
  }
  const grassDark = new THREE.Color(opts.theme.grassDark);
  const dirt = new THREE.Color(PALETTE.dirt);
  const ringQuad = (A: P[], B: P[], colorFn: (y: number, s: number) => THREE.Color) => {
    for (let s = 0; s < SEG; s++) {
      const a0 = A[s];
      const a1 = A[(s + 1) % SEG];
      const b0 = B[s];
      const b1 = B[(s + 1) % SEG];
      const y = (a0[1] + b1[1]) / 2;
      pushTri(a0, a1, b0, colorFn(y, s));
      pushTri(a1, b1, b0, colorFn(y - 0.01, s));
    }
  };
  ringQuad(edge, lipOut, () => grassDark.clone().offsetHSL(0, 0, (rand() - 0.5) * 0.04));
  ringQuad(lipOut, cliff, () => dirt.clone().offsetHSL(0, 0, (rand() - 0.5) * 0.05));

  const K = 7;
  let prev = cliff;
  const strata = rockCols.map((c) => new THREE.Color(c));
  for (let k = 1; k <= K; k++) {
    const f = k / K;
    const ring: P[] = [];
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2 + (k % 2 ? 0.5 / SEG : 0);
      const shrink = Math.pow(1 - f, 1.15) * (1 + angularNoise(a, isl.seed + k * 7, 6) * 0.22);
      const R = rim[s] * Math.max(0.02, shrink);
      const y = isl.y - 1.5 - isl.depth * Math.pow(f, 1.25) + (rand() - 0.5) * 0.9;
      ring.push([isl.cx + Math.cos(a) * R, y, isl.cz + Math.sin(a) * R]);
    }
    ringQuad(prev, ring, (y) => {
      const d = (isl.y - y) / isl.depth;
      const band = Math.floor(d * 6 + fbm(y * 0.5, k, isl.seed, 1) * 1.5);
      const c = strata[Math.min(2, Math.max(0, Math.floor(band / 2)))].clone();
      if (band % 2 === 1) c.multiplyScalar(0.9);
      c.offsetHSL(0, 0, (rand() - 0.5) * 0.04 - d * 0.06);
      return c;
    });
    prev = ring;
  }
  // Close the bottom.
  const tip: P = [isl.cx + (rand() - 0.5) * 2, isl.y - 1.5 - isl.depth - 2.5, isl.cz + (rand() - 0.5) * 2];
  for (let s = 0; s < SEG; s++) {
    pushTri(prev[s], prev[(s + 1) % SEG], tip, strata[2].clone().multiplyScalar(0.85));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}
