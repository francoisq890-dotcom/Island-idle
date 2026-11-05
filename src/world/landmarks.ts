/** Nexus (resource sink), harvestable crystal, prestige Lighthouse and signposts. */
import * as THREE from 'three';
import { PALETTE } from '../config/palette';
import type { V2 } from '../config/world';
import { mulberry32 } from '../core/noise';
import { Ease, type Tweens } from '../core/tween';
import { build, jitter, makeMaterial, part, type Part } from './geom';

export function setEmitBoost(mat: THREE.Material, v: number): void {
  const sh = (mat as THREE.MeshStandardMaterial).userData.shader as { uniforms: Record<string, { value: number }> } | undefined;
  if (sh) sh.uniforms.uEmitBoost.value = v;
}

function crystalShard(h: number, r: number, color: number, emit: number, pos: [number, number, number], rot: [number, number, number]): Part[] {
  // Hexagonal prism with a pointed tip.
  const g = new THREE.CylinderGeometry(r, r * 0.92, h, 6);
  const tip = new THREE.ConeGeometry(r, r * 1.6, 6);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1));
  const local = (y: number) => new THREE.Vector3(0, y, 0).applyMatrix4(m);
  const p1 = local(h / 2);
  const p2 = local(h + r * 0.8);
  return [
    part(g, color, [p1.x, p1.y, p1.z], { rot, emit }),
    part(tip, color, [p2.x, p2.y, p2.z], { rot, emit: emit * 1.15 }),
  ];
}

// ---------------------------------------------------------------------------

export class HarvestCrystal {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  private mat = makeMaterial({ emissiveIntensity: 1.0, roughness: 0.3, shimmer: true });
  private squash = 0;
  private flash = 0;
  private light: THREE.PointLight;
  private orbit: THREE.Mesh;
  readonly position: THREE.Vector3;
  /** Points on the crystal where hits spawn particles. */
  readonly hitPoint: THREE.Vector3;

  constructor(at: V2, y: number, private tweens: Tweens) {
    this.position = new THREE.Vector3(at[0], y, at[1]);
    const r = mulberry32(5);
    const parts: Part[] = [
      part(jitter(new THREE.DodecahedronGeometry(1.4, 0), 0.4, 3), PALETTE.rock2, [0, 0.1, 0], { scale: [1.4, 0.55, 1.2] }),
      part(jitter(new THREE.DodecahedronGeometry(0.7, 0), 0.3, 4), PALETTE.rock1, [1.2, 0.2, 0.6], { scale: [1, 0.7, 1] }),
    ];
    parts.push(...crystalShard(2.6, 0.42, PALETTE.crystal, 0.75, [0, 0.3, 0], [0.05, 0.3, 0.08]));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r() * 0.5;
      const h = 0.9 + r() * 1.1;
      parts.push(...crystalShard(h, 0.22 + r() * 0.1, i % 2 ? PALETTE.crystal : 0x8ff7ff, 0.6, [Math.cos(a) * 0.55, 0.25, Math.sin(a) * 0.55], [Math.sin(a) * 0.5, a, -Math.cos(a) * 0.5]));
    }
    this.mesh = new THREE.Mesh(build(parts), this.mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    this.group.position.copy(this.position);
    this.hitPoint = this.position.clone().add(new THREE.Vector3(0, 1.4, 0));

    this.light = new THREE.PointLight(PALETTE.crystal, 4, 9, 1.6);
    this.light.position.set(0, 2, 0);
    this.group.add(this.light);

    // Small orbiting shards to draw the eye.
    this.orbit = new THREE.Mesh(
      build(
        [0, 1, 2, 3].map((i) =>
          part(new THREE.OctahedronGeometry(0.1, 0), PALETTE.crystal, [Math.cos((i / 4) * 6.28) * 1.6, Math.sin(i * 2) * 0.3, Math.sin((i / 4) * 6.28) * 1.6], { emit: 1.5, scale: [0.7, 1.4, 0.7] }),
        ),
      ),
      this.mat,
    );
    this.orbit.position.y = 1.6;
    this.group.add(this.orbit);
  }

  hit(): void {
    this.squash = 1;
    this.flash = 1;
  }

  update(dt: number, time: number): void {
    this.squash = Math.max(0, this.squash - dt * 5);
    this.flash = Math.max(0, this.flash - dt * 4);
    const s = Math.sin(this.squash * Math.PI) * 0.09;
    this.mesh.scale.set(1 + s, 1 - s * 1.4, 1 + s);
    setEmitBoost(this.mat, 1.0 + Math.sin(time * 2) * 0.12 + this.flash * 1.6);
    this.light.intensity = 4 + this.flash * 10 + Math.sin(time * 2) * 0.5;
    this.orbit.rotation.y = time * 0.7;
    this.orbit.position.y = 1.6 + Math.sin(time * 1.3) * 0.15;
    void this.tweens;
  }
}

// ---------------------------------------------------------------------------

export class Nexus {
  readonly group = new THREE.Group();
  private core: THREE.Mesh;
  private ring1: THREE.Mesh;
  private ring2: THREE.Mesh;
  private ring3: THREE.Mesh;
  private mat = makeMaterial({ emissiveIntensity: 1.4, roughness: 0.4 });
  private coreMat = makeMaterial({ emissiveIntensity: 1.2, roughness: 0.2 });
  private pulse = 0;
  private light: THREE.PointLight;
  /** 0..1 how busy the island is — drives spin speed and glow. */
  activity = 0;
  hasLumen = false;
  readonly position: THREE.Vector3;

  constructor(at: V2, y: number) {
    this.position = new THREE.Vector3(at[0], y, at[1]);
    const pillars: Part[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      pillars.push(part(new THREE.CylinderGeometry(0.16, 0.2, 1.3, 6), PALETTE.cream, [Math.cos(a) * 1.75, 0.95, Math.sin(a) * 1.75]));
      pillars.push(part(new THREE.BoxGeometry(0.34, 0.14, 0.34), PALETTE.copper, [Math.cos(a) * 1.75, 1.65, Math.sin(a) * 1.75], { rot: [0, -a, 0] }));
      pillars.push(part(new THREE.OctahedronGeometry(0.1, 0), PALETTE.crystal, [Math.cos(a) * 1.75, 1.85, Math.sin(a) * 1.75], { emit: 1.4 }));
    }
    const base = new THREE.Mesh(
      build([
        part(new THREE.CylinderGeometry(2.2, 2.45, 0.35, 6), PALETTE.rock1, [0, 0.17, 0]),
        part(new THREE.CylinderGeometry(2.0, 2.0, 0.12, 6), PALETTE.cream, [0, 0.4, 0]),
        part(new THREE.TorusGeometry(1.25, 0.08, 4, 18), PALETTE.crystal, [0, 0.47, 0], { rot: [Math.PI / 2, 0, 0], emit: 1.1 }),
        part(new THREE.CylinderGeometry(0.9, 1.1, 0.25, 6), PALETTE.slate, [0, 0.55, 0]),
        ...pillars,
      ]),
      this.mat,
    );
    base.castShadow = true;
    base.receiveShadow = true;
    this.group.add(base);

    this.core = new THREE.Mesh(
      build([
        part(new THREE.OctahedronGeometry(0.75, 0), PALETTE.crystal, [0, 0, 0], { scale: [1, 1.55, 1], emit: 1 }),
        part(new THREE.OctahedronGeometry(0.4, 0), 0xd8fdff, [0, 0, 0], { scale: [1, 1.6, 1], emit: 1.3 }),
      ]),
      this.coreMat,
    );
    this.core.position.y = 2.6;
    this.core.castShadow = true;
    this.group.add(this.core);
    const ringGeo = (r: number, c: number) => build([part(new THREE.TorusGeometry(r, 0.055, 4, 28), c, [0, 0, 0], { emit: 1.1 })]);
    this.ring1 = new THREE.Mesh(ringGeo(1.25, PALETTE.crystal), this.mat);
    this.ring2 = new THREE.Mesh(ringGeo(1.5, PALETTE.copper), this.mat);
    this.ring3 = new THREE.Mesh(ringGeo(1.75, PALETTE.lumen), this.mat);
    for (const r of [this.ring1, this.ring2, this.ring3]) {
      r.position.y = 2.6;
      this.group.add(r);
    }
    this.light = new THREE.PointLight(PALETTE.crystal, 8, 12, 1.5);
    this.light.position.y = 2.8;
    this.group.add(this.light);
    this.group.position.copy(this.position);
  }

  /** A resource cube arrived. */
  absorb(): void {
    this.pulse = Math.min(1, this.pulse + 0.35);
  }

  get corePosition(): THREE.Vector3 {
    return this.core.getWorldPosition(new THREE.Vector3());
  }

  update(dt: number, time: number): void {
    this.pulse = Math.max(0, this.pulse - dt * 2.5);
    const spin = 0.5 + this.activity * 2.5;
    this.core.rotation.y += dt * spin;
    this.core.position.y = 2.6 + Math.sin(time * 1.5) * 0.12;
    const s = 1 + this.pulse * 0.15;
    this.core.scale.setScalar(s);
    this.ring1.rotation.set(Math.PI / 2 + Math.sin(time * 0.7) * 0.3, time * spin * 0.6, 0);
    this.ring2.rotation.set(Math.PI / 2.4, time * spin * -0.4, Math.cos(time * 0.5) * 0.4);
    this.ring3.visible = this.hasLumen;
    this.ring3.rotation.set(Math.PI / 1.7 + Math.sin(time * 0.4) * 0.5, time * spin * 0.3, 0.3);
    this.ring2.visible = this.activity > 0.05;
    setEmitBoost(this.coreMat, 1.0 + this.activity * 0.9 + this.pulse * 1.4);
    this.light.intensity = 5 + this.activity * 6 + this.pulse * 6;
  }
}

// ---------------------------------------------------------------------------

export class Lighthouse {
  readonly group = new THREE.Group();
  private lantern: THREE.Mesh;
  private beam: THREE.Mesh;
  private beamMat: THREE.MeshBasicMaterial;
  private lanternMat = makeMaterial({ emissiveIntensity: 1, roughness: 0.3 });
  private light: THREE.PointLight;
  /** 0 = dormant, 1 = awake (prestige available). */
  awake = 0;
  private awakeTarget = 0;
  readonly position: THREE.Vector3;
  readonly topPosition: THREE.Vector3;
  /** One star per constellation, orbiting the lantern; lit ones glow. */
  private stars: THREE.InstancedMesh;
  private litStars = 0;
  private starCol = new THREE.Color();
  private starObj = new THREE.Object3D();

  constructor(at: V2, y: number) {
    this.position = new THREE.Vector3(at[0], y, at[1]);
    const stone = 0xf1ebf7;
    const lav = 0xb7a2e8;
    const steps: Part[] = [];
    for (let i = 0; i < 3; i++) steps.push(part(new THREE.CylinderGeometry(2.6 - i * 0.5, 2.8 - i * 0.5, 0.3, 8), i % 2 ? lav : stone, [0, 0.15 + i * 0.3, 0]));
    const body = new THREE.Mesh(
      build([
        ...steps,
        part(new THREE.CylinderGeometry(0.85, 1.25, 6.5, 8), stone, [0, 4.15, 0]),
        part(new THREE.CylinderGeometry(1.0, 1.0, 0.35, 8), lav, [0, 2.6, 0]),
        part(new THREE.CylinderGeometry(0.92, 0.92, 0.35, 8), lav, [0, 4.8, 0]),
        part(new THREE.CylinderGeometry(1.35, 1.0, 0.4, 8), PALETTE.copper, [0, 7.55, 0]),
        part(new THREE.CylinderGeometry(1.1, 1.1, 0.12, 8), PALETTE.slate, [0, 9.3, 0]),
        part(new THREE.ConeGeometry(1.25, 1.3, 8), lav, [0, 10.0, 0]),
        part(new THREE.IcosahedronGeometry(0.2, 0), PALETTE.lumen, [0, 10.8, 0], { emit: 1.2 }),
        part(new THREE.BoxGeometry(0.5, 0.9, 0.12), PALETTE.slate, [0, 1.5, -1.12]),
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
          part(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 4), PALETTE.copper, [Math.cos((i / 8) * 6.28) * 1.0, 8.5, Math.sin((i / 8) * 6.28) * 1.0]),
        ),
      ]),
      makeMaterial({ roughness: 0.7 }),
    );
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);
    this.lantern = new THREE.Mesh(build([part(new THREE.OctahedronGeometry(0.55, 0), PALETTE.seed, [0, 0, 0], { emit: 1, scale: [1, 1.4, 1] })]), this.lanternMat);
    this.lantern.position.y = 8.5;
    this.group.add(this.lantern);
    this.beamMat = new THREE.MeshBasicMaterial({ color: PALETTE.seed, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beamGeo = new THREE.ConeGeometry(2.4, 26, 12, 1, true);
    beamGeo.translate(0, -13, 0);
    beamGeo.rotateZ(Math.PI / 2);
    this.beam = new THREE.Mesh(beamGeo, this.beamMat);
    this.beam.position.y = 8.5;
    this.group.add(this.beam);
    this.light = new THREE.PointLight(PALETTE.seed, 0, 18, 1.4);
    this.light.position.y = 8.5;
    this.group.add(this.light);
    this.group.position.copy(this.position);
    this.topPosition = this.position.clone().add(new THREE.Vector3(0, 8.5, 0));
    const starGeo = build([part(new THREE.OctahedronGeometry(0.22, 0), 0xffffff, [0, 0, 0], { emit: 1, scale: [0.8, 1.4, 0.8] })]);
    this.stars = new THREE.InstancedMesh(starGeo, makeMaterial({ emissiveIntensity: 1.6 }), 7);
    this.stars.frustumCulled = false;
    for (let i = 0; i < 7; i++) this.stars.setColorAt(i, this.starCol.set(0x5c5470));
    this.group.add(this.stars);
  }

  /** Star-flowers of the Jardin d'étoiles: one per talent level, around the base. */
  private flowers: THREE.InstancedMesh | null = null;
  private flowerN = 0;
  private flowerGrow: number[] = [];
  private gardenReady = false;

  setGarden(n: number): void {
    const MAX = 40;
    if (!this.flowers) {
      const geo = build([
        part(new THREE.CylinderGeometry(0.03, 0.04, 0.5, 4), 0x7fb36a, [0, 0.25, 0]),
        part(new THREE.ConeGeometry(0.08, 0.14, 4), 0x7fb36a, [0.08, 0.2, 0], { rot: [0, 0, -1] }),
        part(new THREE.OctahedronGeometry(0.13, 0), PALETTE.seed, [0, 0.58, 0], { emit: 1.4, scale: [1, 0.7, 1] }),
        part(new THREE.OctahedronGeometry(0.06, 0), 0xfff4d6, [0, 0.62, 0.05], { emit: 2 }),
      ]);
      this.flowers = new THREE.InstancedMesh(geo, makeMaterial({ emissiveIntensity: 1.4 }), MAX);
      this.flowers.count = 0;
      this.flowers.frustumCulled = false;
      this.group.add(this.flowers);
    }
    n = Math.min(MAX, n);
    // Flowers present at load are already grown; new ones sprout.
    while (this.flowerGrow.length < n) this.flowerGrow.push(this.gardenReady ? 0 : 1);
    this.gardenReady = true;
    this.flowerGrow.length = n;
    this.flowerN = n;
    this.flowers.count = n;
  }

  private updateGarden(dt: number, time: number): void {
    if (!this.flowers) return;
    for (let i = 0; i < this.flowerN; i++) {
      this.flowerGrow[i] = Math.min(1, this.flowerGrow[i] + dt * 1.5);
      const g = this.flowerGrow[i];
      const pop = g < 1 ? Math.sin(g * Math.PI * 0.5) * (1 + Math.sin(g * Math.PI) * 0.4) : 1;
      // Golden-angle spiral between the steps and the prisms.
      const a = i * 2.39996;
      const r = 3.15 + (i % 5) * 0.28;
      this.starObj.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r);
      this.starObj.rotation.set(Math.sin(time + i) * 0.08, time * 0.3 + i, 0);
      this.starObj.scale.setScalar(0.001 + pop * (0.9 + (i % 3) * 0.12));
      this.starObj.updateMatrix();
      this.flowers.setMatrixAt(i, this.starObj.matrix);
    }
    this.flowers.instanceMatrix.needsUpdate = true;
  }

  /** Light the first `n` constellation stars. */
  setStars(n: number): void {
    if (n === this.litStars) return;
    this.litStars = n;
    for (let i = 0; i < 7; i++) this.stars.setColorAt(i, this.starCol.set(i < n ? PALETTE.seed : 0x5c5470));
    if (this.stars.instanceColor) this.stars.instanceColor.needsUpdate = true;
  }

  setAwake(v: boolean): void {
    this.awakeTarget = v ? 1 : 0;
  }

  update(dt: number, time: number): void {
    this.updateGarden(dt, time);
    this.awake += (this.awakeTarget - this.awake) * Math.min(1, dt * 1.5);
    const a = this.awake;
    this.lantern.rotation.y = time * (0.4 + a * 1.5);
    this.lantern.position.y = 8.5 + Math.sin(time * 1.2) * 0.08;
    setEmitBoost(this.lanternMat, 0.6 + a * 3 + Math.sin(time * 3) * 0.3 * a);
    this.beam.rotation.y = time * 0.8;
    this.beamMat.opacity = a * (0.13 + Math.sin(time * 2) * 0.03);
    this.beam.visible = a > 0.02;
    this.light.intensity = a * 12;
    const o = this.starObj;
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2 + time * 0.25;
      const lit = i < this.litStars;
      o.position.set(Math.cos(ang) * 2.4, 9.6 + Math.sin(time * 1.3 + i) * 0.25, Math.sin(ang) * 2.4);
      o.rotation.set(0, time * 2 + i, 0);
      o.scale.setScalar(lit ? 1 + Math.sin(time * 4 + i * 2) * 0.15 : 0.7);
      o.updateMatrix();
      this.stars.setMatrixAt(i, o.matrix);
    }
    this.stars.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------

export interface SignDef {
  at: V2;
  y: number;
  /** Emblem color. */
  color: number;
  /** Rotation around Y so the board faces the player path. */
  yaw: number;
}

/** All signposts merged into one static mesh. */
export function buildSigns(defs: SignDef[]): THREE.Mesh {
  const parts: Part[] = [];
  for (const d of defs) {
    const rot = (x: number, z: number): [number, number] => [d.at[0] + x * Math.cos(d.yaw) + z * Math.sin(d.yaw), d.at[1] - x * Math.sin(d.yaw) + z * Math.cos(d.yaw)];
    const [px, pz] = rot(0, 0);
    parts.push(part(new THREE.CylinderGeometry(0.08, 0.1, 1.9, 5), PALETTE.woodDark, [px, d.y + 0.95, pz]));
    parts.push(part(new THREE.BoxGeometry(1.25, 0.75, 0.1), PALETTE.wood, [px, d.y + 1.65, pz], { rot: [0, d.yaw, 0] }));
    parts.push(part(new THREE.BoxGeometry(1.35, 0.1, 0.14), PALETTE.woodDark, [px, d.y + 2.05, pz], { rot: [0, d.yaw, 0] }));
    const [ex, ez] = rot(0, -0.07);
    parts.push(part(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 8), d.color, [ex, d.y + 1.65, ez], { rot: [Math.PI / 2, d.yaw, 0], emit: 1.2 }));
  }
  const m = new THREE.Mesh(build(parts), makeMaterial({ roughness: 0.8 }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Floating world-space beacon used by objectives ("go here"). */
export class Beacon {
  readonly group = new THREE.Group();
  private ring: THREE.Mesh;
  private arrow: THREE.Mesh;
  private mat = new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  private arrowMat = new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.95, depthWrite: false });
  private shown = 0;
  private target = new THREE.Vector3();
  private visibleTarget = false;

  constructor(private tweens: Tweens) {
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 32), this.mat);
    this.ring.rotation.x = -Math.PI / 2;
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 4), this.arrowMat);
    this.arrow.rotation.x = Math.PI;
    this.group.add(this.ring, this.arrow);
    this.group.visible = false;
    this.group.renderOrder = 5;
  }

  show(pos: THREE.Vector3 | null, arrowHeight = 3): void {
    if (pos) {
      this.target.copy(pos);
      this.arrow.userData.h = arrowHeight;
    }
    const want = !!pos;
    if (want !== this.visibleTarget) {
      this.visibleTarget = want;
      const from = this.shown;
      this.tweens.add(0.4, (v) => (this.shown = from + ((want ? 1 : 0) - from) * v), { ease: Ease.outCubic });
    }
  }

  get worldTarget(): THREE.Vector3 | null {
    return this.visibleTarget ? this.target : null;
  }

  update(time: number): void {
    this.group.visible = this.shown > 0.01;
    if (!this.group.visible) return;
    this.group.position.copy(this.target);
    const h = (this.arrow.userData.h as number) ?? 3;
    this.arrow.position.y = h + Math.sin(time * 4) * 0.25;
    this.arrow.rotation.y = time * 2;
    const s = 1 + ((time * 0.8) % 1) * 0.6;
    this.ring.scale.setScalar(s * this.shown);
    this.ring.position.y = 0.08;
    this.mat.opacity = 0.85 * this.shown * (1 - ((time * 0.8) % 1) * 0.6);
    this.arrow.scale.setScalar(this.shown);
    this.arrowMat.opacity = 0.95 * this.shown;
  }
}
