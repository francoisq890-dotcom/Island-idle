/**
 * Machine models (authored in code) and construction sites.
 * Each site renders its machines with 2 InstancedMeshes (static body + moving
 * part), plus a holographic "ghost" showing where the next one will be built.
 */
import * as THREE from 'three';
import type { MachineId } from '../config/economy';
import { PALETTE } from '../config/palette';
import type { SiteLayout } from '../config/world';
import { Ease, type Tweens } from '../core/tween';
import { build, jitter, part, type Part } from './geom';

export interface MachineModel {
  base: THREE.BufferGeometry;
  moving: THREE.BufferGeometry;
  /** Local transform of the moving part at time t. */
  animate(t: number, o: THREE.Object3D): void;
  /** Collision radius. */
  radius: number;
  /** Local point where produced resources pop out. */
  outlet: THREE.Vector3;
  /** Local point for smoke / steam (optional). */
  vent?: THREE.Vector3;
  height: number;
}

const C = PALETTE;
const cyl = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);

function crystalsRing(n: number, r: number, y: number, size: number, seed: number): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed;
    out.push(
      part(new THREE.OctahedronGeometry(size, 0), C.crystal, [Math.cos(a) * r, y + size * 0.6, Math.sin(a) * r], {
        scale: [0.6, 1.6 + (i % 2) * 0.5, 0.6],
        rot: [Math.cos(a) * 0.4, a, Math.sin(a) * 0.4],
        emit: 0.9,
      }),
    );
  }
  return out;
}

function legBetween(a: THREE.Vector3, b: THREE.Vector3, r: number, color: number): Part {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  return part(cyl(r, r, len, 5), color, [mid.x, mid.y, mid.z], { rot: [e.x, e.y, e.z] });
}

export const MODELS: Record<MachineId, () => MachineModel> = {
  drill: () => {
    const legs: Part[] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      legs.push(legBetween(new THREE.Vector3(Math.cos(a) * 0.72, 0.15, Math.sin(a) * 0.72), new THREE.Vector3(Math.cos(a) * 0.24, 1.85, Math.sin(a) * 0.24), 0.055, C.copper));
    }
    return {
      base: build([
        ...crystalsRing(4, 0.55, 0, 0.14, 0.3),
        part(cyl(0.78, 0.86, 0.18, 8), C.slate, [0, 0.09, 0]),
        ...legs,
        part(box(0.72, 0.56, 0.72), C.cream, [0, 2.06, 0]),
        part(box(0.78, 0.08, 0.78), C.copper, [0, 1.8, 0]),
        part(new THREE.ConeGeometry(0.62, 0.42, 4), C.slate, [0, 2.55, 0], { rot: [0, Math.PI / 4, 0] }),
        part(new THREE.IcosahedronGeometry(0.09, 0), C.crystal, [0, 2.82, 0], { emit: 1.4 }),
        part(box(0.3, 0.2, 0.05), C.crystal, [0, 2.1, -0.37], { emit: 0.7 }),
        part(cyl(0.16, 0.16, 0.2, 6), C.steel, [0, 1.7, 0]),
      ]),
      moving: build([
        part(cyl(0.06, 0.06, 1.35, 6), C.steel, [0, 1.0, 0]),
        part(new THREE.TorusGeometry(0.13, 0.04, 4, 8), C.copper, [0, 1.25, 0], { rot: [Math.PI / 2, 0, 0] }),
        part(new THREE.ConeGeometry(0.2, 0.55, 6), C.steel, [0, 0.42, 0], { rot: [Math.PI, 0, 0] }),
        part(box(0.42, 0.05, 0.06), C.copper, [0, 0.55, 0], { rot: [0, 0, 0.3] }),
        part(box(0.06, 0.05, 0.36), C.copper, [0, 0.4, 0], { rot: [0.3, 0, 0] }),
      ]),
      animate(t, o) {
        o.position.set(0, Math.sin(t * 3.2) * 0.1, 0);
        o.rotation.set(0, t * 11, 0);
      },
      radius: 0.85,
      outlet: new THREE.Vector3(0, 0.4, 0),
      height: 2.9,
    };
  },

  excavator: () => {
    const wheels: Part[] = [];
    for (const x of [-0.78, 0.78]) for (const z of [-0.8, 0, 0.8]) wheels.push(part(cyl(0.2, 0.2, 0.56, 8), C.copper, [x, 0.28, z], { rot: [0, 0, Math.PI / 2] }));
    return {
      base: build([
        part(box(0.52, 0.5, 2.3), C.slate, [-0.78, 0.3, 0]),
        part(box(0.52, 0.5, 2.3), C.slate, [0.78, 0.3, 0]),
        ...wheels,
        part(box(1.5, 0.85, 1.7), C.cream, [0, 0.98, 0.1]),
        part(box(1.56, 0.1, 1.76), C.copper, [0, 0.58, 0.1]),
        part(box(0.86, 0.66, 0.8), C.cream, [-0.25, 1.73, 0.25]),
        part(box(0.7, 0.32, 0.05), C.lumen, [-0.25, 1.8, -0.16], { emit: 0.55 }),
        part(box(0.95, 0.1, 0.9), C.slate, [-0.25, 2.1, 0.25]),
        part(cyl(0.09, 0.11, 0.8, 6), C.slate, [0.5, 1.75, 0.65]),
        part(cyl(0.13, 0.13, 0.08, 6), C.copper, [0.5, 2.17, 0.65]),
        part(box(0.62, 0.42, 0.62), C.copper, [0.38, 1.55, -0.2]),
        ...crystalsRing(3, 0.12, 1.7, 0.13, 1.1).map((p) => ({ ...p, pos: [p.pos![0] + 0.38, p.pos![1], p.pos![2] - 0.2] as [number, number, number] })),
        part(box(0.2, 0.5, 0.5), C.slate, [-0.72, 0.85, -0.95]),
        part(box(0.2, 0.5, 0.5), C.slate, [0.72, 0.85, -0.95]),
      ]),
      moving: build([
        part(cyl(0.42, 0.42, 1.3, 8), C.steel, [0, 0, 0], { rot: [0, 0, Math.PI / 2] }),
        ...[0, 1, 2, 3, 4, 5].map((i) =>
          part(box(1.32, 0.16, 0.16), C.slate, [0, Math.cos((i / 6) * Math.PI * 2) * 0.44, Math.sin((i / 6) * Math.PI * 2) * 0.44], { rot: [(i / 6) * Math.PI * 2, 0, 0] }),
        ),
      ]),
      animate(t, o) {
        o.position.set(0, 0.62, -1.12);
        o.rotation.set(-t * 4, 0, 0);
      },
      radius: 1.45,
      outlet: new THREE.Vector3(0.38, 1.9, -0.2),
      vent: new THREE.Vector3(0.5, 2.25, 0.65),
      height: 2.3,
    };
  },

  refinery: () => {
    const teeth: Part[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      teeth.push(part(box(0.14, 0.14, 0.14), C.copper, [0, Math.cos(a) * 0.42, Math.sin(a) * 0.42], { rot: [a, 0, 0] }));
    }
    return {
      base: build([
        part(cyl(1.25, 1.35, 0.3, 8), C.slate, [0, 0.15, 0]),
        part(cyl(0.95, 1.0, 1.8, 8), C.cream, [0, 1.2, 0]),
        part(cyl(1.02, 1.02, 0.12, 8), C.copper, [0, 0.6, 0]),
        part(cyl(1.02, 1.02, 0.12, 8), C.copper, [0, 1.85, 0]),
        part(new THREE.SphereGeometry(0.92, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), C.copper, [0, 2.1, 0]),
        part(cyl(0.17, 0.2, 1.5, 6), C.slate, [0.45, 2.8, 0.3]),
        part(cyl(0.24, 0.24, 0.12, 6), C.copper, [0.45, 3.55, 0.3]),
        part(box(0.62, 0.48, 0.12), C.lumen, [0, 1.15, -0.96], { emit: 1.1 }),
        part(box(0.78, 0.1, 0.16), C.slate, [0, 1.44, -0.98]),
        part(new THREE.ConeGeometry(0.42, 0.6, 6), C.steel, [-0.7, 2.35, -0.35], { rot: [Math.PI, 0, 0] }),
        ...crystalsRing(3, 0.16, 2.5, 0.12, 0.2).map((p) => ({ ...p, pos: [p.pos![0] - 0.7, p.pos![1], p.pos![2] - 0.35] as [number, number, number] })),
      ]),
      moving: build([part(cyl(0.38, 0.38, 0.12, 10), C.copper, [0, 0, 0], { rot: [0, 0, Math.PI / 2] }), ...teeth, part(cyl(0.1, 0.1, 0.2, 6), C.slate, [0, 0, 0], { rot: [0, 0, Math.PI / 2] })]),
      animate(t, o) {
        o.position.set(-1.02, 1.25, 0.2);
        o.rotation.set(t * 2.5, 0, 0);
      },
      radius: 1.45,
      outlet: new THREE.Vector3(0, 1.15, -1.1),
      vent: new THREE.Vector3(0.45, 3.7, 0.3),
      height: 3.6,
    };
  },

  geyser: () => {
    const legs: Part[] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.3;
      legs.push(legBetween(new THREE.Vector3(Math.cos(a) * 1.05, 0.3, Math.sin(a) * 1.05), new THREE.Vector3(Math.cos(a) * 0.62, 2.55, Math.sin(a) * 0.62), 0.07, C.copper));
    }
    return {
      base: build([
        part(jitter(new THREE.TorusGeometry(1.0, 0.34, 5, 10), 0.12, 3), C.rock2, [0, 0.18, 0], { rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.7] }),
        part(cyl(0.85, 0.85, 0.08, 10), C.crystal, [0, 0.24, 0], { emit: 0.8 }),
        ...legs,
        part(new THREE.ConeGeometry(0.85, 0.7, 8, 1, true), C.copper, [0, 2.85, 0], { rot: [Math.PI, 0, 0] }),
        part(cyl(0.88, 0.88, 0.12, 8), C.slate, [0, 2.55, 0]),
        part(cyl(0.22, 0.22, 0.5, 6), C.steel, [0, 3.35, 0]),
        part(new THREE.TorusGeometry(0.72, 0.05, 4, 12), C.crystal, [0, 2.48, 0], { rot: [Math.PI / 2, 0, 0], emit: 1.2 }),
        ...crystalsRing(5, 1.25, 0.05, 0.12, 0.6),
      ]),
      moving: build([part(cyl(0.3, 0.42, 2.2, 8), 0xbaf6ff, [0, 1.35, 0], { emit: 0.55 }), part(cyl(0.2, 0.3, 2.3, 6), 0xffffff, [0, 1.35, 0], { emit: 0.6 })]),
      animate(t, o) {
        const p = 1 + Math.sin(t * 5) * 0.12;
        o.position.set(0, 0, 0);
        o.rotation.set(0, t * 1.5, 0);
        o.scale.set(p, 0.9 + Math.sin(t * 3.1) * 0.1, p);
      },
      radius: 1.45,
      outlet: new THREE.Vector3(0, 3.6, 0),
      vent: new THREE.Vector3(0, 3.65, 0),
      height: 3.6,
    };
  },

  prism: () => ({
    base: build([
      part(cyl(1.0, 1.15, 0.45, 6), 0xefe7f7, [0, 0.22, 0]),
      part(cyl(0.95, 0.95, 0.1, 6), C.lumen, [0, 0.48, 0], { emit: 0.35 }),
      part(cyl(0.32, 0.45, 1.6, 6), 0xefe7f7, [0, 1.3, 0]),
      part(cyl(0.62, 0.42, 0.25, 6), 0xd9cdf0, [0, 2.2, 0]),
      part(new THREE.TorusGeometry(0.7, 0.05, 4, 16), C.lumen, [0, 2.35, 0], { rot: [Math.PI / 2, 0, 0], emit: 1 }),
      ...crystalsRing(6, 0.85, 0.45, 0.1, 0),
    ]),
    moving: build([
      part(new THREE.OctahedronGeometry(0.62, 0), 0xfff2c4, [0, 0, 0], { scale: [0.75, 1.5, 0.75], emit: 0.9 }),
      part(new THREE.OctahedronGeometry(0.28, 0), C.crystal, [0, 0, 0], { scale: [1, 1.8, 1], emit: 1.4 }),
    ]),
    animate(t, o) {
      o.position.set(0, 3.25 + Math.sin(t * 1.4) * 0.18, 0);
      o.rotation.set(0, t * 0.9, 0);
    },
    radius: 1.2,
    outlet: new THREE.Vector3(0, 3.2, 0),
    height: 4.3,
  }),
};

const TIER_TINT = [0xffffff, 0xe3ebff, 0xffe6a8, 0xf0d2ff, 0xc8fff4, 0xffd0d0];

interface SlotState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  phase: number;
  squash: number;
}

export class MachineSite {
  readonly group = new THREE.Group();
  readonly model: MachineModel;
  private base: THREE.InstancedMesh;
  private moving: THREE.InstancedMesh;
  private ghost: THREE.Mesh;
  private ghostMat: THREE.MeshBasicMaterial;
  readonly slots: SlotState[];
  visible = 0;
  count = 0;
  tier = 0;
  open = false;
  private m = new THREE.Matrix4();
  private m2 = new THREE.Matrix4();
  private o = new THREE.Object3D();
  private col = new THREE.Color();

  constructor(
    readonly id: MachineId,
    readonly layout: SiteLayout,
    heightAt: (x: number, z: number) => number,
    material: THREE.Material,
    private tweens: Tweens,
  ) {
    this.model = MODELS[id]();
    const n = layout.slots.length;
    this.base = new THREE.InstancedMesh(this.model.base, material, n);
    this.moving = new THREE.InstancedMesh(this.model.moving, material, n);
    for (const im of [this.base, this.moving]) {
      im.castShadow = true;
      im.receiveShadow = true;
      im.count = 0;
      im.frustumCulled = false;
    }
    this.group.add(this.base, this.moving);
    for (let i = 0; i < n; i++) this.base.setColorAt(i, this.col.set(0xffffff));

    const [cx, cz] = layout.center;
    this.slots = layout.slots.map(([x, z], i) => {
      // Machines face the conveyor / site center, slightly varied.
      const yaw = Math.atan2(-(cx - x), -(cz - z)) + (id === 'drill' ? i * 0.7 : 0);
      return { x, y: heightAt(x, z) - 0.02, z, yaw: isFinite(yaw) ? yaw : 0, scale: 0, phase: i * 1.37, squash: 0 };
    });

    // Ghost hologram for the next slot.
    const ghostGeo = build([part(this.model.base, 0xffffff), part(this.model.moving, 0xffffff)]);
    this.ghostMat = new THREE.MeshBasicMaterial({ color: PALETTE.crystal, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending });
    this.ghost = new THREE.Mesh(ghostGeo, this.ghostMat);
    this.ghost.visible = false;
    // Ground ring under the ghost.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(this.model.radius * 0.95, this.model.radius * 1.15, 24),
      new THREE.MeshBasicMaterial({ color: PALETTE.crystal, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    this.ghost.add(ring);
    this.group.add(this.ghost);
  }

  slotPosition(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    const s = this.slots[Math.min(i, this.slots.length - 1)];
    return out.set(s.x, s.y, s.z);
  }

  /** World position of the outlet of machine i. */
  outletOf(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    const s = this.slots[i];
    out.copy(this.model.outlet).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
    return out.add(new THREE.Vector3(s.x, s.y, s.z));
  }

  ventOf(i: number, out = new THREE.Vector3()): THREE.Vector3 | null {
    if (!this.model.vent) return null;
    const s = this.slots[i];
    out.copy(this.model.vent).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
    return out.add(new THREE.Vector3(s.x, s.y, s.z));
  }

  /** Sync with the economy. Returns the indexes of newly spawned machines. */
  setCount(n: number, tier: number, animate: boolean): number[] {
    const spawned: number[] = [];
    this.count = n;
    const want = Math.min(n, this.slots.length);
    while (this.visible < want) {
      const i = this.visible++;
      spawned.push(i);
      const s = this.slots[i];
      if (animate) {
        s.scale = 0.001;
        this.tweens.add(0.7, (v) => (s.scale = v), { ease: Ease.outBack });
      } else s.scale = 1;
    }
    if (this.visible > want) {
      this.visible = want;
    }
    if (tier !== this.tier) {
      this.tier = tier;
      this.col.set(TIER_TINT[Math.min(tier, TIER_TINT.length - 1)]);
      for (let i = 0; i < this.slots.length; i++) this.base.setColorAt(i, this.col);
      if (this.base.instanceColor) this.base.instanceColor.needsUpdate = true;
    }
    this.base.count = this.moving.count = this.visible;
    return spawned;
  }

  /** Bounce every machine (used when buying beyond the visible slots). */
  pulseAll(): void {
    for (let i = 0; i < this.visible; i++) {
      const s = this.slots[i];
      this.tweens.add(0.5, (v) => (s.squash = Math.sin(v * Math.PI) * 0.18), { delay: i * 0.03, ease: Ease.linear });
    }
  }

  pulse(i: number): void {
    const s = this.slots[i];
    if (!s) return;
    this.tweens.add(0.35, (v) => (s.squash = Math.sin(v * Math.PI) * 0.12), { ease: Ease.linear });
  }

  get nextGhostIndex(): number {
    return this.visible < this.slots.length ? this.visible : -1;
  }

  update(time: number, speed: number): void {
    const tierScale = 1 + Math.min(this.tier, 5) * 0.05;
    for (let i = 0; i < this.visible; i++) {
      const s = this.slots[i];
      const sq = s.squash;
      this.o.position.set(s.x, s.y, s.z);
      this.o.rotation.set(0, s.yaw, 0);
      this.o.scale.set(s.scale * tierScale * (1 + sq), s.scale * tierScale * (1 - sq * 0.8), s.scale * tierScale * (1 + sq));
      this.o.updateMatrix();
      this.base.setMatrixAt(i, this.o.matrix);
      this.m.copy(this.o.matrix);
      const lo = this.o;
      const savedPos = lo.position.clone();
      const savedRot = lo.rotation.clone();
      const savedScale = lo.scale.clone();
      lo.position.set(0, 0, 0);
      lo.rotation.set(0, 0, 0);
      lo.scale.set(1, 1, 1);
      this.model.animate(time * speed + s.phase, lo);
      lo.updateMatrix();
      this.m2.multiplyMatrices(this.m, lo.matrix);
      this.moving.setMatrixAt(i, this.m2);
      lo.position.copy(savedPos);
      lo.rotation.copy(savedRot);
      lo.scale.copy(savedScale);
    }
    this.base.instanceMatrix.needsUpdate = true;
    this.moving.instanceMatrix.needsUpdate = true;

    const g = this.nextGhostIndex;
    this.ghost.visible = this.open && g >= 0;
    if (this.ghost.visible) {
      const s = this.slots[g];
      this.ghost.position.set(s.x, s.y + 0.02, s.z);
      this.ghost.rotation.y = s.yaw;
      this.ghostMat.opacity = 0.16 + Math.sin(time * 3) * 0.07;
    }
  }
}
