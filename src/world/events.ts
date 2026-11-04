/**
 * Event visuals: falling crystal meteors you collect by walking over them, and
 * the golden crystal you must strike quickly.
 */
import * as THREE from 'three';
import { PALETTE } from '../config/palette';
import { build, makeMaterial, part } from './geom';
import { setEmitBoost } from './landmarks';
import type { Particles } from './particles';

interface Meteor {
  mesh: THREE.Mesh;
  target: THREE.Vector3;
  from: THREE.Vector3;
  t: number;
  fall: number;
  landed: boolean;
  life: number;
  collected: boolean;
  fly: number;
}

export class MeteorField {
  readonly group = new THREE.Group();
  private geo = build([
    part(new THREE.OctahedronGeometry(0.32, 0), PALETTE.crystal, [0, 0.3, 0], { scale: [0.8, 1.5, 0.8], emit: 1 }),
    part(new THREE.OctahedronGeometry(0.2, 0), 0xc4fbff, [0.22, 0.18, 0.08], { scale: [0.7, 1.3, 0.7], rot: [0, 0, -0.5], emit: 1.1 }),
    part(new THREE.DodecahedronGeometry(0.28, 0), PALETTE.rock3, [0, 0.05, 0], { scale: [1.2, 0.5, 1.2] }),
  ]);
  private mat = makeMaterial({ emissiveIntensity: 1.6 });
  private trailGeo = new THREE.CylinderGeometry(0.02, 0.35, 6, 6, 1, true);
  private trailMat = new THREE.MeshBasicMaterial({ color: 0xbffaff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  private list: (Meteor & { trail: THREE.Mesh })[] = [];
  onLand?: (p: THREE.Vector3) => void;
  onCollect?: (p: THREE.Vector3) => void;

  constructor(private particles: Particles) {
    this.trailGeo.translate(0, 3, 0);
  }

  get active(): number {
    return this.list.filter((m) => !m.collected).length;
  }

  spawn(targets: THREE.Vector3[], life: number): void {
    targets.forEach((t, i) => {
      const mesh = new THREE.Mesh(this.geo, this.mat);
      mesh.castShadow = true;
      const from = t.clone().add(new THREE.Vector3(-18 + Math.random() * 6, 32 + Math.random() * 8, 10 + Math.random() * 6));
      mesh.position.copy(from);
      const trail = new THREE.Mesh(this.trailGeo, this.trailMat);
      this.group.add(mesh, trail);
      this.list.push({ mesh, trail, target: t.clone(), from, t: -i * 0.35 - Math.random() * 0.3, fall: 1.1, landed: false, life, collected: false, fly: 0 });
    });
  }

  update(dt: number, time: number, player: THREE.Vector3, magnet: number): void {
    setEmitBoost(this.mat, 1.4 + Math.sin(time * 5) * 0.4);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      m.t += dt;
      if (!m.landed) {
        if (m.t < 0) {
          m.mesh.visible = m.trail.visible = false;
          continue;
        }
        m.mesh.visible = m.trail.visible = true;
        const k = Math.min(1, m.t / m.fall);
        m.mesh.position.lerpVectors(m.from, m.target, k * k);
        m.mesh.rotation.set(time * 6, time * 4, 0);
        const dir = m.from.clone().sub(m.target).normalize();
        m.trail.position.copy(m.mesh.position);
        m.trail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        if (k >= 1) {
          m.landed = true;
          m.trail.visible = false;
          m.mesh.rotation.set(0, Math.random() * 6, 0.15);
          this.particles.sparks(m.target.clone().setY(m.target.y + 0.3), { count: 22, color: PALETTE.crystal, speed: 6, life: 0.8, size: 0.09, up: 3 });
          this.particles.smoke(m.target.clone().setY(m.target.y + 0.2), { count: 8, color: 0xf6e8d6, speed: 3, life: 0.8, size: 0.25, up: 0.5 });
          this.onLand?.(m.target);
        }
        continue;
      }
      if (m.collected) {
        // Fly into the player, then disappear.
        m.fly += dt * 3;
        m.mesh.position.lerp(player.clone().setY(player.y + 1.1), Math.min(1, m.fly));
        m.mesh.scale.setScalar(Math.max(0.01, 1 - m.fly));
        if (m.fly >= 1) this.remove(i);
        continue;
      }
      m.life -= dt;
      m.mesh.position.y = m.target.y + Math.sin(time * 3 + i) * 0.08 + 0.05;
      m.mesh.rotation.y += dt;
      if (m.life < 4) m.mesh.visible = Math.sin(time * 20) > -0.3; // blink before vanishing
      if (m.life <= 0) {
        this.particles.smoke(m.mesh.position, { count: 5, color: 0xd8f6ff, speed: 1, life: 0.6, size: 0.2 });
        this.remove(i);
        continue;
      }
      const d = Math.hypot(player.x - m.mesh.position.x, player.z - m.mesh.position.z);
      if (d < magnet) {
        m.collected = true;
        this.onCollect?.(m.mesh.position.clone());
      }
    }
  }

  private remove(i: number): void {
    const m = this.list[i];
    this.group.remove(m.mesh, m.trail);
    this.list.splice(i, 1);
  }

  clear(): void {
    for (let i = this.list.length - 1; i >= 0; i--) this.remove(i);
  }
}

export class GoldenCrystal {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh;
  private mat = makeMaterial({ emissiveIntensity: 1.4, roughness: 0.25 });
  private ring: THREE.Mesh;
  private ringMat = new THREE.MeshBasicMaterial({ color: PALETTE.lumen, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  private light = new THREE.PointLight(PALETTE.lumen, 6, 9, 1.5);
  active = false;
  hits = 0;
  maxHits = 12;
  timeLeft = 0;
  total = 25;
  readonly position = new THREE.Vector3();
  private squash = 0;
  private ringK = 1;

  constructor(private particles: Particles) {
    const parts = [
      part(new THREE.CylinderGeometry(0.34, 0.3, 1.8, 6), PALETTE.lumen, [0, 1.0, 0], { emit: 0.8 }),
      part(new THREE.ConeGeometry(0.34, 0.6, 6), 0xfff0b8, [0, 2.2, 0], { emit: 1 }),
      part(new THREE.CylinderGeometry(0.2, 0.18, 1.1, 6), PALETTE.lumen, [0.45, 0.6, 0.1], { rot: [0, 0, -0.4], emit: 0.8 }),
      part(new THREE.CylinderGeometry(0.18, 0.16, 0.9, 6), 0xffd56b, [-0.4, 0.5, -0.15], { rot: [0.2, 0, 0.45], emit: 0.8 }),
      part(new THREE.DodecahedronGeometry(0.7, 0), PALETTE.rock2, [0, 0.1, 0], { scale: [1.3, 0.4, 1.3] }),
    ];
    this.mesh = new THREE.Mesh(build(parts), this.mat);
    this.mesh.castShadow = true;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.45, 48, 1, 0, Math.PI * 2), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.08;
    this.light.position.y = 1.6;
    this.group.add(this.mesh, this.ring, this.light);
    this.group.visible = false;
  }

  spawn(at: THREE.Vector3, hits: number, time: number): void {
    this.position.copy(at);
    this.group.position.copy(at);
    this.group.visible = true;
    this.active = true;
    this.hits = 0;
    this.maxHits = hits;
    this.total = this.timeLeft = time;
    this.group.scale.setScalar(0.01);
    this.particles.sparks(at.clone().setY(at.y + 1), { count: 40, color: PALETTE.lumen, speed: 6, life: 1, size: 0.1, up: 3 });
  }

  /** Returns true when the crystal breaks. */
  hit(): boolean {
    if (!this.active) return false;
    this.hits++;
    this.squash = 1;
    const at = this.position.clone().setY(this.position.y + 1.2);
    this.particles.sparks(at, { count: 16, color: PALETTE.lumen, speed: 6, life: 0.6, size: 0.08, up: 2 });
    if (this.hits >= this.maxHits) {
      this.particles.sparks(at, { count: 120, color: PALETTE.lumen, speed: 11, life: 1.4, size: 0.12, up: 5, gravity: 6 });
      this.particles.smoke(at, { count: 14, color: 0xffe9b0, speed: 4, life: 1, size: 0.3, grow: 2 });
      this.despawn();
      return true;
    }
    return false;
  }

  despawn(): void {
    this.active = false;
    this.group.visible = false;
  }

  update(dt: number, time: number): boolean {
    if (!this.active) return false;
    this.timeLeft -= dt;
    const grow = Math.min(1, this.group.scale.x + dt * 3);
    this.squash = Math.max(0, this.squash - dt * 5);
    const s = Math.sin(this.squash * Math.PI) * 0.12;
    this.group.scale.set(grow * (1 + s), grow * (1 - s), grow * (1 + s));
    this.mesh.rotation.y += dt * 0.6;
    setEmitBoost(this.mat, 1.3 + Math.sin(time * 6) * 0.3 + this.squash);
    // Timer ring shrinks with the remaining time.
    const k = Math.max(0, this.timeLeft / this.total);
    if (Math.abs(k - this.ringK) > 0.01) {
      this.ringK = k;
      this.ring.geometry.dispose();
      this.ring.geometry = new THREE.RingGeometry(1.25, 1.45, 48, 1, Math.PI / 2, Math.PI * 2 * k);
    }
    this.ringMat.color.set(k < 0.3 ? 0xff6a4a : PALETTE.lumen);
    this.light.intensity = 5 + Math.sin(time * 6) * 1.5;
    if (this.timeLeft <= 0) {
      this.particles.smoke(this.position.clone().setY(this.position.y + 1), { count: 10, color: 0xc9b48a, speed: 2, life: 1, size: 0.3 });
      this.despawn();
      return true; // expired
    }
    return false;
  }
}
