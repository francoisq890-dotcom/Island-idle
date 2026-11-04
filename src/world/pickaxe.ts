/**
 * Pickaxe models (one per upgrade tier) and the swing trail ribbon.
 *
 * Local frame of a pickaxe: the hand is at the origin, the handle runs down
 * along -Y, and the main blade points along +Z (the direction the head travels
 * during the overhead strike, see Player).
 */
import * as THREE from 'three';
import { PALETTE } from '../config/palette';
import { build, jitter, part, type Part } from './geom';

export interface PickTier {
  name: string;
  geometry: THREE.BufferGeometry;
  /** Trail ribbon colour (null = no trail). */
  trail: number | null;
  /** Spark colour at impact. */
  spark: number;
  /** Extra sparks / shake at impact. */
  power: number;
  /** Optional point light colour on the head (late tiers). */
  light: number | null;
  /** Orbiting decoration (rune rings, shards) spins with this mesh. */
  orbit?: THREE.BufferGeometry;
}

/** Number of visual tiers (index 0 = starter pick). */
export const PICK_TIERS = 7;
export const HEAD_Y = -0.62;

const handle = (color: number, len = 0.74, r = 0.028): Part => part(new THREE.CylinderGeometry(r, r * 1.1, len, 6), color, [0, 0.06 - len / 2, 0]);
const grip = (color: number): Part => part(new THREE.CylinderGeometry(0.036, 0.036, 0.14, 6), color, [0, -0.02, 0]);

/** Curved blade made of tapered segments, pointing +Z (main) or -Z (back). */
function blade(color: number, len: number, thick: number, dir: 1 | -1, curve: number, emit = 0, segs = 3): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const z0 = dir * len * t0;
    const z1 = dir * len * t1;
    const y0 = HEAD_Y + curve * t0 * t0;
    const y1 = HEAD_Y + curve * t1 * t1;
    const r0 = thick * (1 - t0 * 0.85);
    const r1 = thick * (1 - t1 * 0.85);
    const mid = new THREE.Vector3(0, (y0 + y1) / 2, (z0 + z1) / 2);
    const segLen = Math.hypot(z1 - z0, y1 - y0);
    // A Y-axis cylinder rotated by φ about X points along (0, cos φ, sin φ).
    const phi = Math.atan2(z1 - z0, y1 - y0);
    out.push(part(new THREE.CylinderGeometry(r1, r0, segLen, 4), color, [mid.x, mid.y, mid.z], { rot: [phi, 0, 0], emit, scale: [1.3, 1, 0.75] }));
  }
  return out;
}

function tier0(): PickTier {
  // Bois & fer: plain wooden handle, iron head.
  return {
    name: 'Pioche de bois',
    geometry: build([handle(PALETTE.wood), ...blade(0x9a98b0, 0.34, 0.06, 1, 0.08), ...blade(0x9a98b0, 0.18, 0.05, -1, 0.04), part(new THREE.BoxGeometry(0.09, 0.1, 0.1), 0x7a7890, [0, HEAD_Y, 0])]),
    trail: null,
    spark: 0xfff1c8,
    power: 0,
    light: null,
  };
}

function tier1(): PickTier {
  // Renforcée: copper bands, broader steel head.
  return {
    name: 'Pioche renforcée',
    geometry: build([
      handle(PALETTE.woodDark),
      grip(PALETTE.copper),
      part(new THREE.CylinderGeometry(0.036, 0.036, 0.05, 6), PALETTE.copper, [0, -0.36, 0]),
      ...blade(0xc9ccd8, 0.4, 0.075, 1, 0.1),
      ...blade(0xc9ccd8, 0.22, 0.06, -1, 0.05),
      part(new THREE.BoxGeometry(0.11, 0.13, 0.13), PALETTE.copper, [0, HEAD_Y, 0]),
    ]),
    trail: 0xfff0d8,
    spark: 0xffe2a8,
    power: 0.2,
    light: null,
  };
}

function tier2(): PickTier {
  // Quartz: rose-white crystal head, faint glow.
  const q = 0xffd6ec;
  return {
    name: 'Pioche de quartz',
    geometry: build([
      handle(0xe9dccb),
      grip(0xb47ac9),
      part(new THREE.OctahedronGeometry(0.11, 0), q, [0, HEAD_Y, 0], { emit: 0.35, scale: [0.9, 1.1, 0.9] }),
      ...blade(q, 0.42, 0.08, 1, 0.12, 0.3),
      ...blade(q, 0.24, 0.065, -1, 0.06, 0.3),
      part(new THREE.OctahedronGeometry(0.05, 0), 0xffffff, [0, HEAD_Y + 0.12, 0], { emit: 0.8 }),
    ]),
    trail: 0xffb8e0,
    spark: 0xffd6ec,
    power: 0.4,
    light: null,
  };
}

function tier3(): PickTier {
  // Résonante: ether-cyan crystal head, strong glow.
  return {
    name: 'Pioche résonante',
    geometry: build([
      handle(PALETTE.slate),
      grip(PALETTE.crystal),
      part(new THREE.TorusGeometry(0.045, 0.012, 4, 10), PALETTE.crystal, [0, -0.3, 0], { rot: [Math.PI / 2, 0, 0], emit: 0.65 }),
      part(new THREE.OctahedronGeometry(0.13, 0), PALETTE.crystal, [0, HEAD_Y, 0], { emit: 0.72 }),
      ...blade(PALETTE.crystal, 0.46, 0.085, 1, 0.14, 0.52, 4),
      ...blade(0x8ff7ff, 0.3, 0.07, -1, 0.08, 0.52),
    ]),
    trail: PALETTE.crystal,
    spark: PALETTE.crystal,
    power: 0.6,
    light: PALETTE.crystal,
  };
}

function tier4(): PickTier {
  // Étoile: gold head with a star core.
  return {
    name: 'Pioche d’étoile',
    geometry: build([
      handle(0x3a2a52),
      grip(PALETTE.lumen),
      part(new THREE.CylinderGeometry(0.034, 0.034, 0.04, 6), PALETTE.lumen, [0, -0.25, 0], { emit: 0.39 }),
      part(new THREE.CylinderGeometry(0.034, 0.034, 0.04, 6), PALETTE.lumen, [0, -0.45, 0], { emit: 0.39 }),
      part(new THREE.DodecahedronGeometry(0.13, 0), PALETTE.lumen, [0, HEAD_Y, 0], { emit: 0.59 }),
      part(new THREE.OctahedronGeometry(0.09, 0), 0xffffff, [0, HEAD_Y, -0.1], { emit: 1.04 }),
      ...blade(PALETTE.lumen, 0.5, 0.09, 1, 0.16, 0.45, 4),
      ...blade(PALETTE.lumen, 0.34, 0.075, -1, 0.1, 0.45, 3),
    ]),
    trail: PALETTE.lumen,
    spark: PALETTE.lumen,
    power: 0.85,
    light: PALETTE.lumen,
  };
}

function tier5(): PickTier {
  // Marées: double obsidian blades, violet core, floating rune rings.
  const obs = 0x2a1f3d;
  return {
    name: 'Pioche des marées',
    geometry: build([
      handle(0x1d1530, 0.8, 0.03),
      grip(PALETTE.seed),
      part(jitter(new THREE.OctahedronGeometry(0.16, 0), 0.02, 3), PALETTE.seed, [0, HEAD_Y, 0], { emit: 0.85 }),
      ...blade(obs, 0.56, 0.11, 1, 0.2, 0.0, 4),
      ...blade(PALETTE.seed, 0.5, 0.05, 1, 0.21, 0.72, 4),
      ...blade(obs, 0.5, 0.1, -1, 0.18, 0.0, 4),
      ...blade(PALETTE.seed, 0.44, 0.045, -1, 0.19, 0.72, 4),
    ]),
    orbit: build([
      part(new THREE.TorusGeometry(0.22, 0.012, 4, 20), PALETTE.seed, [0, 0, 0], { rot: [Math.PI / 2, 0, 0], emit: 0.91 }),
      part(new THREE.TorusGeometry(0.17, 0.01, 4, 16), 0xe7d6ff, [0, 0, 0], { rot: [0.4, 0, 0.5], emit: 0.91 }),
    ]),
    trail: PALETTE.seed,
    spark: PALETTE.seed,
    power: 1.1,
    light: PALETTE.seed,
  };
}

function tier6(): PickTier {
  // Aube: prismatic, three-coloured, orbiting shards.
  const shards: Part[] = [];
  const cols = [PALETTE.crystal, PALETTE.lumen, PALETTE.seed];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    shards.push(part(new THREE.OctahedronGeometry(0.045, 0), cols[i % 3], [Math.cos(a) * 0.26, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.26], { emit: 1.04, scale: [0.7, 1.5, 0.7] }));
  }
  return {
    name: 'Pioche de l’Aube',
    geometry: build([
      handle(0xf4ecff, 0.84, 0.032),
      grip(PALETTE.lumen),
      part(new THREE.TorusGeometry(0.04, 0.012, 4, 10), PALETTE.crystal, [0, -0.2, 0], { rot: [Math.PI / 2, 0, 0], emit: 0.78 }),
      part(new THREE.TorusGeometry(0.04, 0.012, 4, 10), PALETTE.seed, [0, -0.42, 0], { rot: [Math.PI / 2, 0, 0], emit: 0.78 }),
      part(new THREE.IcosahedronGeometry(0.15, 0), 0xffffff, [0, HEAD_Y, 0], { emit: 1.17 }),
      ...blade(PALETTE.crystal, 0.62, 0.1, 1, 0.22, 0.78, 5),
      ...blade(PALETTE.lumen, 0.56, 0.05, 1, 0.24, 0.98, 5),
      ...blade(PALETTE.seed, 0.5, 0.095, -1, 0.2, 0.78, 4),
    ]),
    orbit: build(shards),
    trail: 0xffffff,
    spark: 0xffffff,
    power: 1.5,
    light: 0xfff2d6,
  };
}

export function makePickTier(tier: number): PickTier {
  return [tier0, tier1, tier2, tier3, tier4, tier5, tier6][Math.max(0, Math.min(PICK_TIERS - 1, tier))]();
}

/** Tier-6 trail cycles through the three resource colours. */
export function trailColorAt(tier: PickTier, t: number, out: THREE.Color): THREE.Color {
  if (tier.trail === 0xffffff) {
    const cols = [PALETTE.crystal, PALETTE.lumen, PALETTE.seed];
    const k = (t * 3) % 3;
    const i = Math.floor(k);
    return out.set(cols[i]).lerp(new THREE.Color(cols[(i + 1) % 3]), k - i);
  }
  return out.set(tier.trail ?? 0xffffff);
}

/**
 * Ribbon trail following the pick head in world space: two points per sample
 * (head and a point down the handle), additive, fading with age.
 */
export class SwingTrail {
  readonly mesh: THREE.Mesh;
  private max = 18;
  private samples: { a: THREE.Vector3; b: THREE.Vector3; age: number; col: THREE.Color }[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private geo = new THREE.BufferGeometry();
  life = 0.16;

  constructor() {
    this.pos = new Float32Array(this.max * 2 * 3);
    this.col = new Float32Array(this.max * 2 * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const idx: number[] = [];
    for (let i = 0; i < this.max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }

  push(a: THREE.Vector3, b: THREE.Vector3, color: THREE.Color): void {
    this.samples.unshift({ a: a.clone(), b: b.clone(), age: 0, col: color.clone() });
    if (this.samples.length > this.max) this.samples.pop();
  }

  update(dt: number): void {
    for (const s of this.samples) s.age += dt;
    while (this.samples.length && this.samples[this.samples.length - 1].age > this.life) this.samples.pop();
    const n = this.samples.length;
    this.mesh.visible = n >= 2;
    for (let i = 0; i < this.max; i++) {
      const s = this.samples[Math.min(i, n - 1)];
      if (!s) break;
      const k = i < n ? Math.max(0, 1 - s.age / this.life) * (1 - i / this.max) : 0;
      this.pos.set([s.a.x, s.a.y, s.a.z], i * 6);
      this.pos.set([s.b.x, s.b.y, s.b.z], i * 6 + 3);
      this.col.set([s.col.r * k * 1.6, s.col.g * k * 1.6, s.col.b * k * 1.6], i * 6);
      this.col.set([s.col.r * k * 0.15, s.col.g * k * 0.15, s.col.b * k * 0.15], i * 6 + 3);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.setDrawRange(0, Math.max(0, n - 1) * 6);
  }
}
