/**
 * The player: a small low-poly explorer built from primitives, with procedural
 * walk / idle / harvest animations and a collision-aware controller.
 */
import * as THREE from 'three';
import { PALETTE } from '../config/palette';
import { damp, dampAngle } from '../core/tween';
import { build, makeMaterial, part } from './geom';
import { HEAD_Y, makePickTier, SwingTrail, trailColorAt, type PickTier } from './pickaxe';
import type { Ground } from './terrain';

const SPEED = 6.4;
const GRAVITY = 26;
const JUMP = 8.2;

/** Arm angle (rotation.x of the shoulder) at rest; see strike phases below. */
const REST = 0.25;
/**
 * Overhead strike. Arm angle θ: 0 = hanging down, π/2 = pointing forward,
 * π = straight up, >π = behind the head. The pick blade travels along the arc.
 */
const STRIKE = {
  windup: { dur: 0.13, to: 3.5 }, // lift the pick up and over the shoulder
  antic: { dur: 0.06, to: 3.78 }, // short anticipation, a touch further back
  strike: { dur: 0.075, to: 1.02 }, // fast arc over the top, down onto the crystal
  hitstop: { dur: 0.055 }, // freeze on impact (≈3 frames)
  recoil: { dur: 0.09, to: 1.38 }, // small bounce off the crystal
  recover: { dur: 0.2, to: REST }, // back to rest
};
type StrikePhase = 'idle' | 'windup' | 'antic' | 'strike' | 'hitstop' | 'recoil' | 'recover';
interface StrikeReq {
  target: THREE.Vector3;
  onImpact: () => void;
  /** Distance from the target centre at which the blade lands. */
  reach: number;
}
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

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
  // Pickaxe & strike state.
  private pickHolder = new THREE.Group();
  private pickMesh: THREE.Mesh | null = null;
  private pickOrbit: THREE.Mesh | null = null;
  private pick!: PickTier;
  pickTierIndex = 0;
  private headMarker = new THREE.Object3D();
  private handleMarker = new THREE.Object3D();
  private pickLight = new THREE.PointLight(0xffffff, 0, 3, 2);
  readonly trail = new SwingTrail();
  private strikePhase: StrikePhase = 'idle';
  private phaseT = 0;
  private phaseFrom = REST;
  private armAngle = REST;
  private current: StrikeReq | null = null;
  private pendingStrike: StrikeReq | null = null;
  private ground: Ground | null = null;
  private hitStop = 0;
  private present = 0;
  /** Squash & stretch: >0 stretched (take-off), <0 squashed (landing). Springs back to 0. */
  private squash = 0;
  private squashV = 0;
  /** Little celebration (arms up, hop) after big moments. */
  private cheerT = 0;
  /** Multiplier on strike animation speed (runes / upgrades). */
  strikeSpeed = 1;
  /** Called when the downswing starts (swoosh sound). */
  onSwing?: () => void;
  /** Called when the reveal pose reaches its peak (for FX). */
  onPresentPeak?: (headPos: THREE.Vector3) => void;
  private presentPeakDone = false;
  private trailCol = new THREE.Color();
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
    // Pickaxe in the right hand (swappable per upgrade tier).
    this.pickHolder.position.set(0, -0.4, 0);
    this.pickHolder.scale.setScalar(1.35);
    this.armR.add(this.pickHolder);
    this.headMarker.position.set(0, HEAD_Y + 0.06, 0.38);
    this.handleMarker.position.set(0, HEAD_Y + 0.3, 0.05);
    this.pickHolder.add(this.headMarker, this.handleMarker, this.pickLight);
    this.pickLight.position.set(0, HEAD_Y, 0.1);
    this.setPickTier(0);
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

  // ---------------------------------------------------------------------------
  // Pickaxe
  // ---------------------------------------------------------------------------

  /** Swap the pickaxe model. With `celebrate`, the explorer raises it overhead. */
  setPickTier(tier: number, celebrate = false): void {
    this.pick = makePickTier(tier);
    this.pickTierIndex = tier;
    if (this.pickMesh) {
      this.pickHolder.remove(this.pickMesh);
      this.pickMesh.geometry.dispose();
    }
    if (this.pickOrbit) {
      this.pickHolder.remove(this.pickOrbit);
      this.pickOrbit.geometry.dispose();
      this.pickOrbit = null;
    }
    this.pickMesh = new THREE.Mesh(this.pick.geometry, this.mat);
    this.pickMesh.castShadow = true;
    this.pickHolder.add(this.pickMesh);
    if (this.pick.orbit) {
      this.pickOrbit = new THREE.Mesh(this.pick.orbit, this.mat);
      this.pickOrbit.position.set(0, HEAD_Y, 0);
      this.pickHolder.add(this.pickOrbit);
    }
    this.pickLight.color.set(this.pick.light ?? 0xffffff);
    this.pickLight.visible = this.pick.light !== null;
    if (celebrate) {
      this.present = 1.7;
      this.strikePhase = 'idle';
      this.pendingStrike = null;
    }
  }

  get pickTier(): PickTier {
    return this.pick;
  }

  /** World position of the pick head. */
  pickHeadWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.headMarker.getWorldPosition(out);
  }

  get striking(): boolean {
    return this.strikePhase !== 'idle';
  }

  /**
   * Ask for a strike towards `target`. `onImpact` runs on the impact frame.
   * Returns false if a strike is already queued (input buffering is 1 deep).
   */
  requestStrike(target: THREE.Vector3, onImpact: () => void, reach = 2.05): boolean {
    if (this.present > 0) return false;
    const req = { target: target.clone(), onImpact, reach };
    if (this.strikePhase === 'idle') {
      this.beginStrike(req);
      return true;
    }
    if (this.strikePhase === 'recover') {
      // Chain straight into the next wind-up from wherever the arm is.
      this.beginStrike(req);
      return true;
    }
    if (this.pendingStrike) return false;
    this.pendingStrike = req;
    return true;
  }

  private beginStrike(req: StrikeReq): void {
    this.current = req;
    this.strikePhase = 'windup';
    this.phaseT = 0;
    this.phaseFrom = this.armAngle;
  }

  jump(): void {
    if (this.grounded) {
      this.vy = JUMP;
      this.grounded = false;
      this.squash = 0.22;
      this.squashV = 0;
    }
  }

  /** Short celebration: a hop with both arms raised (milestones, bridges, big purchases). */
  cheer(): void {
    if (this.present > 0 || this.strikePhase !== 'idle') return;
    this.cheerT = 0.9;
    if (this.grounded) {
      this.vy = JUMP * 0.55;
      this.grounded = false;
    }
  }

  update(dt: number, move: { x: number; y: number }, camYaw: number, ground: Ground, time: number): void {
    this.ground = ground;
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
    const px = this.position.x;
    const pz = this.position.z;
    if (ground.canMove(px, pz, nx, nz)) {
      this.position.x = nx;
      this.position.z = nz;
    } else if (ground.canMove(px, pz, nx, pz)) {
      this.position.x = nx;
      this.velocity.z *= 0.5;
    } else if (ground.canMove(px, pz, px, nz)) {
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
        // Landing squash, stronger after a long fall.
        this.squash = -Math.min(0.35, 0.12 + Math.abs(this.vy) * 0.02);
        this.squashV = 0;
        this.vy = 0;
        this.onLand?.(this.position);
      }
    } else {
      this.position.y = gy > this.position.y ? damp(this.position.y, gy, 30, dt) : damp(this.position.y, gy, 20, dt);
      if (Math.abs(this.position.y - gy) > 0.6) this.position.y = gy;
    }

    // Facing.
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    let facingError = 0;
    if (this.current && this.strikePhase !== 'idle') {
      const t = this.current.target;
      const a = Math.atan2(-(t.x - this.position.x), -(t.z - this.position.z));
      this.facing = dampAngle(this.facing, a, 22, dt);
      facingError = Math.abs(Math.atan2(Math.sin(a - this.facing), Math.cos(a - this.facing)));
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

    this.updateStrike(dt, facingError, sw, k, time);
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

    // Squash & stretch spring (volume preserving).
    this.squashV += (-this.squash * 220 - this.squashV * 16) * dt;
    this.squash += this.squashV * dt;
    if (!this.grounded && this.vy > 0) this.squash = Math.max(this.squash, Math.min(0.15, this.vy * 0.02));
    const sy = 1 + this.squash;
    const sxz = 1 / Math.sqrt(Math.max(0.5, sy));
    this.root.scale.set(sxz, sy, sxz);
    // Celebration: arms up and waving.
    if (this.cheerT > 0) {
      this.cheerT = Math.max(0, this.cheerT - dt);
      const c = Math.sin((this.cheerT / 0.9) * Math.PI);
      this.armL.rotation.x = 2.7 * c;
      this.armL.rotation.z = -0.5 * c + Math.sin(time * 18) * 0.25 * c;
      if (this.strikePhase === 'idle' && this.present <= 0) {
        this.armR.rotation.x = 2.7 * c;
        this.armR.rotation.z = 0.5 * c - Math.sin(time * 18) * 0.25 * c;
      }
    }

    this.root.position.copy(this.position);
    this.root.rotation.y = this.facing;
  }

  private updateStrike(dt: number, facingError: number, sw: number, k: number, time: number): void {
    // Reveal pose for a new pickaxe: both arms raise it overhead.
    if (this.present > 0) {
      this.present = Math.max(0, this.present - dt);
      const t = 1 - this.present / 1.7;
      const up = t < 0.25 ? easeOut(t / 0.25) : t > 0.82 ? 1 - easeInOut((t - 0.82) / 0.18) : 1;
      this.armAngle = REST + (3.05 - REST) * up;
      this.armR.rotation.x = this.armL.rotation.x = this.armAngle;
      this.armR.rotation.z = 0.25 * up;
      this.armL.rotation.z = -0.25 * up;
      this.pickHolder.rotation.set(0, 0, (Math.PI / 2) * up);
      this.body.position.y += Math.abs(Math.sin(t * Math.PI * 3)) * 0.08 * up;
      if (!this.presentPeakDone && t > 0.25) {
        this.presentPeakDone = true;
        this.onPresentPeak?.(this.pickHeadWorld());
      }
      if (this.present === 0) {
        this.presentPeakDone = false;
        this.pickHolder.rotation.set(0, 0, 0);
        this.armR.rotation.z = this.armL.rotation.z = 0;
      }
      this.pickLight.intensity = 3 * up;
      return;
    }

    if (this.strikePhase === 'idle') {
      this.armAngle = REST + sw * 0.5 * k;
      this.armR.rotation.x = this.armAngle;
      this.pickLight.intensity = this.pick.light !== null ? 0.35 + Math.sin(time * 3) * 0.12 : 0;
      if (this.pickOrbit) this.pickOrbit.rotation.y = time * 2;
      return;
    }

    // Hit-stop freezes the pose for a few frames.
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      this.pushTrail();
      return;
    }

    const sp = this.strikeSpeed;
    this.phaseT += dt * sp;
    const ph = this.strikePhase;
    const set = (from: number, to: number, t: number, e: (x: number) => number) => {
      this.armAngle = from + (to - from) * e(Math.min(1, t));
    };
    let lean = 0;
    switch (ph) {
      case 'windup': {
        const t = this.phaseT / STRIKE.windup.dur;
        set(this.phaseFrom, STRIKE.windup.to, t, easeOut);
        lean = 0.18 * easeOut(Math.min(1, t));
        // Step into reach while winding up, and wait until facing the target.
        const close = this.lunge(dt);
        if (t >= 1 && ((facingError < 0.35 && close) || this.phaseT > STRIKE.windup.dur + 0.7)) this.next('antic');
        break;
      }
      case 'antic': {
        const t = this.phaseT / STRIKE.antic.dur;
        set(STRIKE.windup.to, STRIKE.antic.to, t, easeInOut);
        lean = 0.22;
        if (t >= 1) {
          this.next('strike');
          this.onSwing?.();
        }
        break;
      }
      case 'strike': {
        const t = this.phaseT / STRIKE.strike.dur;
        set(STRIKE.antic.to, STRIKE.strike.to, t, easeIn);
        lean = 0.22 - 0.52 * easeIn(Math.min(1, t));
        this.pushTrail();
        if (t >= 1) {
          this.next('hitstop');
          this.hitStop = STRIKE.hitstop.dur;
          const cb = this.current?.onImpact;
          cb?.();
          this.body.scale.set(1.04, 0.94, 1.04);
        }
        break;
      }
      case 'hitstop':
        this.next('recoil');
        break;
      case 'recoil': {
        const t = this.phaseT / STRIKE.recoil.dur;
        set(STRIKE.strike.to, STRIKE.recoil.to, t, easeOut);
        lean = -0.3 + 0.1 * t;
        this.body.scale.set(1, 1, 1);
        this.pushTrail();
        if (t >= 1) {
          if (this.pendingStrike) {
            const p = this.pendingStrike;
            this.pendingStrike = null;
            this.beginStrike(p);
          } else this.next('recover');
        }
        break;
      }
      case 'recover': {
        const t = this.phaseT / STRIKE.recover.dur;
        set(STRIKE.recoil.to, REST, t, easeInOut);
        lean = -0.2 * (1 - Math.min(1, t));
        if (t >= 1) {
          this.strikePhase = 'idle';
          this.current = null;
        }
        break;
      }
    }
    this.body.rotation.x = lean;
    this.armR.rotation.x = this.armAngle;
    // Two-handed grip: the left arm follows the swing.
    this.armL.rotation.x = this.armAngle * 0.94;
    this.armL.rotation.z = -0.18;
    this.pickLight.intensity = this.pick.light !== null ? 0.9 : 0;
    if (this.pickOrbit) this.pickOrbit.rotation.y = time * 6;
  }

  /** Move towards the strike target until within reach. Returns true when in reach. */
  private lunge(dt: number): boolean {
    if (!this.current || !this.ground) return true;
    const t = this.current.target;
    const dx = t.x - this.position.x;
    const dz = t.z - this.position.z;
    const d = Math.hypot(dx, dz);
    const gap = d - this.current.reach;
    if (gap <= 0.05) return true;
    const step = Math.min(gap, 7.5 * dt);
    const nx = this.position.x + (dx / d) * step;
    const nz = this.position.z + (dz / d) * step;
    if (!this.ground.canMove(this.position.x, this.position.z, nx, nz)) return true; // blocked: strike from here
    this.position.x = nx;
    this.position.z = nz;
    this.position.y = this.ground.heightAt(nx, nz);
    this.walkPhase += dt * 9;
    return false;
  }

  private next(p: StrikePhase): void {
    this.strikePhase = p;
    this.phaseT = 0;
    if (p === 'idle' || p === 'recover') this.armL.rotation.z = 0;
  }

  private pushTrail(): void {
    if (this.pick.trail === null) return;
    const a = this.headMarker.getWorldPosition(new THREE.Vector3());
    const b = this.handleMarker.getWorldPosition(new THREE.Vector3());
    this.trail.push(a, b, trailColorAt(this.pick, performance.now() / 600, this.trailCol));
  }
}
