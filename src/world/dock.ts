/**
 * Late-game places and visitors:
 *  - Quai des dirigeables: a wooden pier at the edge of the Île Mère with two
 *    moored airships that fly off on expeditions and come back with loot;
 *  - Faille d'éther: a violet tear in the air to close with three strikes;
 *  - the travelling merchant's balloon, which lands for two minutes.
 */
import * as THREE from 'three';
import { PALETTE } from '../config/palette';
import { build, jitter, makeMaterial, part, type Part } from './geom';
import { setEmitBoost } from './landmarks';
import type { Particles } from './particles';

export const DOCK_POS: [number, number] = [9.6, 12.2];
/** Outward direction of the pier (towards the clouds). */
const OUT = new THREE.Vector2(0.6, 0.8).normalize();

function airshipGeo(accent: number): THREE.BufferGeometry {
  const cream = 0xf6ead6;
  const parts: Part[] = [
    part(new THREE.SphereGeometry(1.2, 12, 8), cream, [0, 1.6, 0], { scale: [1, 0.75, 1.9] }),
    part(new THREE.TorusGeometry(0.92, 0.06, 4, 16), PALETTE.copper, [0, 1.6, 0.9], { scale: [1, 0.75, 1] }),
    part(new THREE.TorusGeometry(0.92, 0.06, 4, 16), PALETTE.copper, [0, 1.6, -0.9], { scale: [1, 0.75, 1] }),
    part(new THREE.TorusGeometry(1.2, 0.05, 4, 20), accent, [0, 1.6, 0], { scale: [1, 0.75, 1] }),
    // Fins.
    part(new THREE.BoxGeometry(0.06, 0.8, 0.7), accent, [0, 2.3, -2.0]),
    part(new THREE.BoxGeometry(1.4, 0.06, 0.6), accent, [0, 1.6, -2.1]),
    // Gondola + ropes.
    part(new THREE.BoxGeometry(0.8, 0.45, 1.4), PALETTE.wood, [0, 0.25, 0]),
    part(new THREE.BoxGeometry(0.9, 0.08, 1.5), PALETTE.woodDark, [0, 0.5, 0]),
    part(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 3), 0x5a3a16, [0.35, 0.95, 0.5]),
    part(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 3), 0x5a3a16, [-0.35, 0.95, 0.5]),
    part(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 3), 0x5a3a16, [0.35, 0.95, -0.5]),
    part(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 3), 0x5a3a16, [-0.35, 0.95, -0.5]),
    part(new THREE.SphereGeometry(0.08, 5, 4), PALETTE.lumen, [0, 0.3, 0.72], { emit: 1.5 }),
    // Propeller hub.
    part(new THREE.CylinderGeometry(0.08, 0.12, 0.3, 6), PALETTE.slate, [0, 0.25, -0.85], { rot: [Math.PI / 2, 0, 0] }),
  ];
  return build(parts);
}

interface Ship {
  root: THREE.Group;
  prop: THREE.Mesh;
  home: THREE.Vector3;
  /** 0 = moored, 1 = gone. */
  away: number;
  target: number;
  ready: boolean;
}

export class Dock {
  readonly group = new THREE.Group();
  readonly position: THREE.Vector3;
  private ships: Ship[] = [];
  private mat = makeMaterial({ emissiveIntensity: 1.5, roughness: 0.7 });
  private time = 0;

  constructor(y: number, private particles: Particles) {
    this.position = new THREE.Vector3(DOCK_POS[0], y, DOCK_POS[1]);
    const yaw = Math.atan2(OUT.x, OUT.y);
    const parts: Part[] = [];
    // Pier deck going out over the clouds.
    for (let i = 0; i < 9; i++) parts.push(part(jitter(new THREE.BoxGeometry(2.6, 0.12, 0.5), 0.02, i), i % 2 ? PALETTE.wood : PALETTE.woodDark, [0, 0.35, 0.3 + i * 0.55]));
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) parts.push(part(new THREE.CylinderGeometry(0.1, 0.12, 1.6 + i * 0.4, 5), PALETTE.woodDark, [side * 1.25, 0.2 - i * 0.2, 0.5 + i * 2], {}));
      parts.push(part(new THREE.BoxGeometry(0.06, 0.06, 4.8), PALETTE.wood, [side * 1.25, 1.0, 2.6]));
    }
    // Mooring mast with lanterns.
    parts.push(part(new THREE.CylinderGeometry(0.12, 0.16, 3.4, 6), PALETTE.slate, [-1.6, 1.7, 0.2]));
    parts.push(part(new THREE.BoxGeometry(1.2, 0.08, 0.08), PALETTE.copper, [-1.1, 3.3, 0.2]));
    parts.push(part(new THREE.OctahedronGeometry(0.16, 0), PALETTE.lumen, [-0.55, 3.05, 0.2], { emit: 1.6, scale: [1, 1.4, 1] }));
    // Sign board.
    parts.push(part(new THREE.BoxGeometry(0.9, 0.5, 0.06), PALETTE.cream, [1.6, 1.2, -0.2]));
    parts.push(part(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 4), PALETTE.woodDark, [1.6, 0.6, -0.25]));
    const pier = new THREE.Mesh(build(parts), makeMaterial({ roughness: 0.85, emissiveIntensity: 1.2 }));
    pier.castShadow = true;
    pier.receiveShadow = true;
    const pierGroup = new THREE.Group();
    pierGroup.add(pier);
    pierGroup.rotation.y = yaw;
    pierGroup.position.copy(this.position);
    this.group.add(pierGroup);

    const geoA = airshipGeo(0x6f45b8);
    const geoB = airshipGeo(0x138aa6);
    const propGeo = build([part(new THREE.BoxGeometry(0.9, 0.08, 0.04), PALETTE.slate, [0, 0, 0])]);
    [geoA, geoB].forEach((g, i) => {
      const root = new THREE.Group();
      const hull = new THREE.Mesh(g, this.mat);
      hull.castShadow = true;
      const prop = new THREE.Mesh(propGeo, this.mat);
      prop.position.set(0, 0.25, -1.02);
      root.add(hull, prop);
      const side = i === 0 ? -1 : 1;
      const home = this.position.clone().add(new THREE.Vector3(OUT.x * 3.4 + -OUT.y * side * 2.2, 1.6, OUT.y * 3.4 + OUT.x * side * 2.2));
      root.position.copy(home);
      root.rotation.y = yaw + Math.PI / 2;
      this.group.add(root);
      this.ships.push({ root, prop, home, away: 0, target: 0, ready: false });
    });
  }

  /** Slot `i`: 'docked' (free), 'away' (on an expedition), 'ready' (back with loot). */
  setShip(i: number, st: 'docked' | 'away' | 'ready'): void {
    const sh = this.ships[i];
    if (!sh) return;
    const t = st === 'away' ? 1 : 0;
    if (t === 1 && sh.target === 0) this.particles.smoke(sh.home.clone(), { count: 14, color: 0xffffff, speed: 2, life: 1, size: 0.4, grow: 2 });
    if (t === 0 && sh.target === 1) this.particles.sparks(sh.home.clone().setY(sh.home.y + 1.5), { count: 40, color: PALETTE.lumen, speed: 4, life: 1, size: 0.09, up: 2 });
    sh.target = t;
    sh.ready = st === 'ready';
  }

  /** Snap a ship to its state without animation (on load). */
  snapShip(i: number, st: 'docked' | 'away' | 'ready'): void {
    const sh = this.ships[i];
    if (!sh) return;
    sh.target = st === 'away' ? 1 : 0;
    sh.away = sh.target;
    sh.ready = st === 'ready';
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    this.ships.forEach((sh, i) => {
      sh.away += (sh.target - sh.away) * Math.min(1, dt * 0.35);
      const a = sh.away;
      // Fly out over the clouds and up, then vanish.
      const out = a * a * 60;
      sh.root.position.set(sh.home.x + OUT.x * out, sh.home.y + Math.sin(t * 1.1 + i) * 0.18 + a * 18, sh.home.z + OUT.y * out);
      sh.root.visible = a < 0.97;
      sh.root.rotation.z = Math.sin(t * 0.8 + i) * 0.04;
      sh.prop.rotation.z += dt * (6 + a * 30);
      if (sh.ready && Math.random() < dt * 4) this.particles.sparks(sh.root.position.clone().setY(sh.root.position.y + 0.6), { count: 1, color: PALETTE.lumen, speed: 1, up: 1.5, life: 0.8, size: 0.08 });
    });
    setEmitBoost(this.mat, 1.2 + Math.sin(t * 3) * 0.3 * (this.ships.some((s) => s.ready) ? 1 : 0));
  }
}

// ---------------------------------------------------------------------------

export class Rift {
  readonly group = new THREE.Group();
  private ring: THREE.Mesh;
  private core: THREE.Mesh;
  private coreMat = new THREE.MeshBasicMaterial({ color: 0x2a1450, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  private ringMat = makeMaterial({ emissiveIntensity: 2.4, roughness: 0.3 });
  private light = new THREE.PointLight(0xb070ff, 0, 10, 1.4);
  active = false;
  hits = 0;
  maxHits = 3;
  timeLeft = 0;
  private scale = 0;
  private flinch = 0;
  readonly position = new THREE.Vector3();

  constructor(private particles: Particles) {
    this.ring = new THREE.Mesh(build([part(new THREE.TorusGeometry(1, 0.09, 6, 32), 0xc59bff, [0, 0, 0], { emit: 1.5 })]), this.ringMat);
    this.core = new THREE.Mesh(new THREE.CircleGeometry(0.95, 32), this.coreMat);
    this.group.add(this.ring, this.core, this.light);
    this.group.visible = false;
  }

  spawn(at: THREE.Vector3, hits: number, life: number): void {
    this.position.copy(at);
    this.group.position.copy(at).setY(at.y + 1.6);
    this.active = true;
    this.hits = 0;
    this.maxHits = hits;
    this.timeLeft = life;
    this.scale = 0;
    this.group.visible = true;
  }

  /** One strike; returns true when the rift closes. */
  hit(): boolean {
    if (!this.active) return false;
    this.hits++;
    this.flinch = 1;
    this.particles.sparks(this.group.position.clone(), { count: 30, color: 0xc59bff, speed: 6, life: 0.8, size: 0.1 });
    if (this.hits >= this.maxHits) {
      this.active = false;
      this.particles.sparks(this.group.position.clone(), { count: 120, color: 0xc59bff, speed: 10, life: 1.4, size: 0.12, up: 3 });
      this.particles.sparks(this.group.position.clone(), { count: 50, color: 0xffffff, speed: 7, life: 1, size: 0.08 });
      return true;
    }
    return false;
  }

  /** Returns true when the rift faded away (time out). */
  update(dt: number, time: number, camera: THREE.Camera): boolean {
    let faded = false;
    if (this.active) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.active = false;
        faded = true;
      }
    }
    const target = this.active ? 1 - this.hits / (this.maxHits + 1) * 0.5 : 0;
    this.scale += (target - this.scale) * Math.min(1, dt * 4);
    this.flinch = Math.max(0, this.flinch - dt * 4);
    if (this.scale < 0.01 && !this.active) {
      this.group.visible = false;
      return faded;
    }
    this.group.quaternion.copy(camera.quaternion);
    const wob = 1 + Math.sin(time * 6) * 0.05 + this.flinch * 0.2;
    this.group.scale.set(this.scale * wob * 0.8, this.scale * wob * 1.25, 1);
    this.ring.rotation.z = time * 0.8;
    setEmitBoost(this.ringMat, 2 + Math.sin(time * 5) * 0.6 + this.flinch * 3);
    this.light.intensity = this.scale * 6 + this.flinch * 10;
    if (Math.random() < dt * 20 * this.scale) {
      const a = Math.random() * Math.PI * 2;
      const p = this.group.position.clone().add(new THREE.Vector3(Math.cos(a) * 2.2, Math.sin(a) * 2.5, 0).applyQuaternion(camera.quaternion));
      const v = this.group.position.clone().sub(p).multiplyScalar(1.6);
      this.particles.sparks(p, { count: 1, color: 0xd9b8ff, speed: 0, dir: v, life: 0.6, size: 0.07, gravity: 0, drag: 0 });
    }
    return faded;
  }
}

// ---------------------------------------------------------------------------

export class MerchantBalloon {
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3();
  private mat = makeMaterial({ emissiveIntensity: 1.5, roughness: 0.7 });
  private h = 1;
  private target = 1;
  active = false;
  timeLeft = 0;

  constructor() {
    const stripes: Part[] = [];
    const cols = [0xe0607e, 0xf6ead6, 0xffbe3b, 0xf6ead6];
    for (let i = 0; i < 8; i++) {
      stripes.push(part(new THREE.SphereGeometry(1.5, 12, 10, (i / 8) * Math.PI * 2, Math.PI / 4), cols[i % 4], [0, 4.2, 0], { scale: [1, 1.15, 1] }));
    }
    const parts: Part[] = [
      ...stripes,
      part(new THREE.CylinderGeometry(0.5, 0.25, 0.7, 8), 0xe0607e, [0, 2.55, 0]),
      // Basket and ropes.
      part(new THREE.CylinderGeometry(0.75, 0.6, 0.7, 8), PALETTE.wood, [0, 0.35, 0]),
      part(new THREE.TorusGeometry(0.75, 0.07, 4, 12), PALETTE.woodDark, [0, 0.7, 0], { rot: [Math.PI / 2, 0, 0] }),
      ...[0, 1, 2, 3].map((k) => part(new THREE.CylinderGeometry(0.02, 0.02, 1.9, 3), 0x5a3a16, [Math.cos(k * 1.57) * 0.55, 1.6, Math.sin(k * 1.57) * 0.55])),
      // Goods: crates, a crystal, an egg.
      part(new THREE.BoxGeometry(0.5, 0.4, 0.5), PALETTE.woodDark, [1.3, 0.2, 0.3]),
      part(new THREE.BoxGeometry(0.4, 0.35, 0.4), PALETTE.wood, [1.25, 0.55, 0.25], { rot: [0, 0.5, 0] }),
      part(new THREE.OctahedronGeometry(0.22, 0), 0xf08cb0, [1.25, 0.95, 0.25], { emit: 1.4, scale: [1, 1.5, 1] }),
      part(new THREE.SphereGeometry(0.2, 8, 6), 0xfff3d6, [-1.2, 0.25, 0.4], { scale: [0.85, 1.1, 0.85], emit: 0.4 }),
      part(new THREE.BoxGeometry(1.2, 0.06, 0.7), 0xe0607e, [-1.1, 0.02, 0.1]),
      // Lantern.
      part(new THREE.OctahedronGeometry(0.12, 0), PALETTE.lumen, [0, 1.15, 0.8], { emit: 2 }),
    ];
    const m = new THREE.Mesh(build(parts), this.mat);
    m.castShadow = true;
    this.group.add(m);
    this.group.visible = false;
  }

  land(at: THREE.Vector3, stay: number): void {
    this.position.copy(at);
    this.active = true;
    this.timeLeft = stay;
    this.h = 1;
    this.target = 0;
    this.group.visible = true;
  }

  leave(): void {
    this.active = false;
    this.target = 1;
  }

  /** Returns true when it just left (time out). */
  update(dt: number, time: number): boolean {
    let left = false;
    if (this.active) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.leave();
        left = true;
      }
    }
    this.h += (this.target - this.h) * Math.min(1, dt * (this.target ? 0.6 : 1.2));
    this.group.position.set(this.position.x + Math.sin(time * 0.5) * 0.1 * this.h, this.position.y + this.h * this.h * 30 + Math.sin(time * 1.2) * 0.06, this.position.z);
    this.group.rotation.y = time * 0.05;
    if (!this.active && this.h > 0.98) this.group.visible = false;
    setEmitBoost(this.mat, 1.4 + Math.sin(time * 2) * 0.2);
    return left;
  }
}
