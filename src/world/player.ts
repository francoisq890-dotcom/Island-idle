/**
 * The player: a small low-poly explorer built from primitives, with procedural
 * walk / idle / harvest animations and a collision-aware controller.
 */
import * as THREE from 'three';
import { PALETTE } from '../config/palette';
import { damp, dampAngle } from '../core/tween';
import { build, makeMaterial, part } from './geom';
import type { Ground } from './terrain';

const SPEED = 6.4;
const GRAVITY = 26;
const JUMP = 8.2;

export class Player {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private head: THREE.Mesh;
  private armL: THREE.Group;
  private armR: THREE.Group;
  private legL: THREE.Group;
  private legR: THREE.Group;
  private scarfTail: THREE.Mesh;
  private antennaTip: THREE.Mesh;
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  facing = 0;
  private walkPhase = 0;
  private swing = 0;
  private swingTarget: THREE.Vector3 | null = null;
  private vy = 0;
  grounded = true;
  /** Distance walked (for tutorial / footstep sounds). */
  distance = 0;
  onStep?: (pos: THREE.Vector3) => void;
  onLand?: (pos: THREE.Vector3) => void;
  private stepAcc = 0;
  private mat = makeMaterial({ roughness: 0.7, emissiveIntensity: 1.8 });

  constructor() {
    const cream = PALETTE.cream;
    const slate = PALETTE.slate;
    const copper = PALETTE.copper;

    // Torso + backpack (one mesh).
    const torso = new THREE.Mesh(
      build([
        part(new THREE.CylinderGeometry(0.27, 0.33, 0.52, 8), cream, [0, 0.62, 0]),
        part(new THREE.CylinderGeometry(0.335, 0.335, 0.09, 8), copper, [0, 0.42, 0]),
        part(new THREE.TorusGeometry(0.22, 0.07, 5, 10), copper, [0, 0.9, 0], { rot: [Math.PI / 2, 0, 0] }),
        part(new THREE.BoxGeometry(0.42, 0.44, 0.22), slate, [0, 0.66, 0.3]),
        part(new THREE.BoxGeometry(0.34, 0.08, 0.24), copper, [0, 0.9, 0.3]),
        part(new THREE.OctahedronGeometry(0.13, 0), PALETTE.crystal, [0, 1.02, 0.3], { scale: [0.8, 1.4, 0.8], emit: 1 }),
      ]),
      this.mat,
    );
    torso.castShadow = true;
    this.body.add(torso);

    this.head = new THREE.Mesh(
      build([
        part(new THREE.IcosahedronGeometry(0.34, 1), cream, [0, 0, 0]),
        part(new THREE.IcosahedronGeometry(0.26, 1), slate, [0, -0.01, -0.16], { scale: [1.12, 0.72, 0.62] }),
        part(new THREE.SphereGeometry(0.05, 6, 4), PALETTE.crystal, [-0.1, 0.02, -0.33], { emit: 1.2, scale: [1, 1.3, 0.6] }),
        part(new THREE.SphereGeometry(0.05, 6, 4), PALETTE.crystal, [0.1, 0.02, -0.33], { emit: 1.2, scale: [1, 1.3, 0.6] }),
        part(new THREE.CylinderGeometry(0.015, 0.02, 0.32, 4), slate, [0.12, 0.42, 0.05], { rot: [0.2, 0, -0.25] }),
        part(new THREE.CylinderGeometry(0.36, 0.38, 0.06, 10), copper, [0, 0.16, 0], { rot: [0.12, 0, 0] }),
      ]),
      this.mat,
    );
    this.head.position.set(0, 1.18, 0);
    this.head.castShadow = true;
    this.body.add(this.head);
    this.antennaTip = new THREE.Mesh(build([part(new THREE.IcosahedronGeometry(0.055, 0), PALETTE.lumen, [0, 0, 0], { emit: 1.5 })]), this.mat);
    this.antennaTip.position.set(0.16, 0.58, 0.08);
    this.head.add(this.antennaTip);

    this.scarfTail = new THREE.Mesh(build([part(new THREE.BoxGeometry(0.1, 0.32, 0.04), copper, [0, -0.16, 0])]), this.mat);
    this.scarfTail.position.set(0.12, 0.92, 0.2);
    this.body.add(this.scarfTail);

    const limb = (len: number, r: number, color: number, tip: number) =>
      build([
        part(new THREE.CylinderGeometry(r, r * 0.9, len, 6), color, [0, -len / 2, 0]),
        part(new THREE.IcosahedronGeometry(r * 1.25, 0), tip, [0, -len, 0]),
      ]);
    this.armL = new THREE.Group();
    this.armL.position.set(-0.36, 0.84, 0);
    this.armL.add(new THREE.Mesh(limb(0.36, 0.075, cream, slate), this.mat));
    this.armR = new THREE.Group();
    this.armR.position.set(0.36, 0.84, 0);
    this.armR.add(new THREE.Mesh(limb(0.36, 0.075, cream, slate), this.mat));
    // Pickaxe in the right hand.
    const pick = new THREE.Mesh(
      build([
        part(new THREE.CylinderGeometry(0.025, 0.03, 0.62, 5), PALETTE.wood, [0, 0, 0]),
        part(new THREE.ConeGeometry(0.05, 0.42, 4), PALETTE.steel, [0.14, 0.28, 0], { rot: [0, 0, -Math.PI / 2 - 0.25] }),
        part(new THREE.ConeGeometry(0.04, 0.22, 4), PALETTE.steel, [-0.1, 0.29, 0], { rot: [0, 0, Math.PI / 2 + 0.2] }),
        part(new THREE.BoxGeometry(0.08, 0.08, 0.08), PALETTE.copper, [0, 0.29, 0]),
      ]),
      this.mat,
    );
    pick.position.set(0, -0.42, -0.08);
    pick.rotation.set(-Math.PI / 2, 0, 0);
    this.armR.add(pick);
    this.legL = new THREE.Group();
    this.legL.position.set(-0.14, 0.4, 0);
    this.legL.add(new THREE.Mesh(limb(0.3, 0.09, slate, slate), this.mat));
    this.legR = new THREE.Group();
    this.legR.position.set(0.14, 0.4, 0);
    this.legR.add(new THREE.Mesh(limb(0.3, 0.09, slate, slate), this.mat));
    for (const g of [this.armL, this.armR, this.legL, this.legR]) g.traverse((o) => (o.castShadow = true));
    this.body.add(this.armL, this.armR, this.legL, this.legR);
    this.root.add(this.body);

    // Blob shadow keeps the player grounded visually even when shadows are off.
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.03;
    this.root.add(blob);
  }

  setGlow(color: THREE.ColorRepresentation): void {
    const geo = this.antennaTip.geometry as THREE.BufferGeometry;
    const c = new THREE.Color(color);
    const col = geo.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < col.count; i++) col.setXYZ(i, c.r, c.g, c.b);
    col.needsUpdate = true;
  }

  teleport(x: number, z: number, yaw: number, ground: Ground): void {
    this.position.set(x, ground.heightAt(x, z), z);
    this.facing = yaw;
    this.velocity.set(0, 0, 0);
    this.root.position.copy(this.position);
    this.root.rotation.y = yaw;
  }

  /** Trigger the pickaxe swing towards a world point. */
  strike(target: THREE.Vector3): void {
    this.swing = 1;
    this.swingTarget = target.clone();
  }

  jump(): void {
    if (this.grounded) {
      this.vy = JUMP;
      this.grounded = false;
    }
  }

  update(dt: number, move: { x: number; y: number }, camYaw: number, ground: Ground, time: number): void {
    // Desired velocity, relative to camera.
    const fx = -Math.sin(camYaw);
    const fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw);
    const rz = -Math.sin(camYaw);
    const wantX = (fx * move.y + rx * move.x) * SPEED;
    const wantZ = (fz * move.y + rz * move.x) * SPEED;
    const accel = Math.hypot(move.x, move.y) > 0.01 ? 12 : 9;
    this.velocity.x = damp(this.velocity.x, wantX, accel, dt);
    this.velocity.z = damp(this.velocity.z, wantZ, accel, dt);

    // Move with sliding collisions.
    const nx = this.position.x + this.velocity.x * dt;
    const nz = this.position.z + this.velocity.z * dt;
    const before = this.position.clone();
    if (ground.walkable(nx, nz)) {
      this.position.x = nx;
      this.position.z = nz;
    } else if (ground.walkable(nx, this.position.z)) {
      this.position.x = nx;
      this.velocity.z *= 0.5;
    } else if (ground.walkable(this.position.x, nz)) {
      this.position.z = nz;
      this.velocity.x *= 0.5;
    } else {
      this.velocity.x *= 0.2;
      this.velocity.z *= 0.2;
    }
    const moved = Math.hypot(this.position.x - before.x, this.position.z - before.z);
    this.distance += moved;

    // Vertical: follow the ground, with jumps.
    const gy = ground.heightAt(this.position.x, this.position.z);
    if (!this.grounded) {
      this.vy -= GRAVITY * dt;
      this.position.y += this.vy * dt;
      if (this.position.y <= gy) {
        this.position.y = gy;
        this.grounded = true;
        this.vy = 0;
        this.onLand?.(this.position);
      }
    } else {
      this.position.y = gy > this.position.y ? damp(this.position.y, gy, 30, dt) : damp(this.position.y, gy, 20, dt);
      if (Math.abs(this.position.y - gy) > 0.6) this.position.y = gy;
    }

    // Facing.
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.swing > 0 && this.swingTarget) {
      const a = Math.atan2(-(this.swingTarget.x - this.position.x), -(this.swingTarget.z - this.position.z));
      this.facing = dampAngle(this.facing, a, 18, dt);
    } else if (speed > 0.4) {
      const a = Math.atan2(-this.velocity.x, -this.velocity.z);
      this.facing = dampAngle(this.facing, a, 14, dt);
    }

    // --- Animation -----------------------------------------------------------
    const k = Math.min(1, speed / SPEED);
    this.walkPhase += dt * (4 + 7 * k) * (k > 0.05 ? 1 : 0);
    const sw = Math.sin(this.walkPhase);
    this.legL.rotation.x = sw * 0.75 * k;
    this.legR.rotation.x = -sw * 0.75 * k;
    this.armL.rotation.x = -sw * 0.6 * k;
    const breathe = Math.sin(time * 2.2) * 0.015;
    this.body.position.y = Math.abs(Math.cos(this.walkPhase)) * 0.09 * k + breathe;
    this.body.rotation.x = -0.12 * k;
    this.body.rotation.z = Math.sin(this.walkPhase) * 0.04 * k;
    this.head.rotation.z = Math.sin(time * 1.3) * 0.04 * (1 - k);
    this.scarfTail.rotation.x = 0.4 + k * 0.7 + Math.sin(time * 9 + this.walkPhase) * (0.1 + 0.2 * k);

    if (this.swing > 0) {
      // 0..1 → raise then strike.
      const p = 1 - this.swing;
      const raise = p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65;
      this.armR.rotation.x = -2.6 * Math.max(0, raise) + (p > 0.35 ? 0.5 * Math.sin(((p - 0.35) / 0.65) * Math.PI) : 0);
      this.body.rotation.x = 0.15 * Math.sin(p * Math.PI);
      this.swing = Math.max(0, this.swing - dt * 4.2);
      if (this.swing === 0) this.swingTarget = null;
    } else {
      this.armR.rotation.x = sw * 0.6 * k;
    }
    if (!this.grounded) {
      this.legL.rotation.x = 0.5;
      this.legR.rotation.x = -0.3;
      this.armL.rotation.x = -0.9;
    }

    // Footsteps.
    if (this.grounded && k > 0.3) {
      this.stepAcc += moved;
      if (this.stepAcc > 1.05) {
        this.stepAcc = 0;
        this.onStep?.(this.position);
      }
    }

    this.root.position.copy(this.position);
    this.root.rotation.y = this.facing;
  }
}
