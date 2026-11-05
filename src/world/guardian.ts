/**
 * Crystal guardian: a stocky rock golem studded with rose and cyan crystals.
 * It rises from the ground, sways, flinches when struck, raises its arms and
 * slams the ground every few hits (an expanding shockwave the player must jump
 * over), and shatters into glowing pieces when defeated.
 */
import * as THREE from 'three';
import { GUARDIAN } from '../config/guardians';
import { PALETTE } from '../config/palette';
import { build, jitter, makeMaterial, part, type Part } from './geom';
import { setEmitBoost } from './landmarks';
import type { Particles } from './particles';

const ROCK = 0x4a4160;
const ROCK_HI = 0x7d7290;
const ROSE = 0xf08cb0;

type Phase = 'off' | 'rise' | 'idle' | 'windup' | 'slam' | 'die' | 'leave';

function crystal(h: number, r: number, color: number, pos: [number, number, number], rot: [number, number, number]): Part {
  return part(new THREE.ConeGeometry(r, h, 5), color, pos, { rot, emit: 1.1 });
}

export class Guardian {
  readonly group = new THREE.Group();
  private body = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private mat = makeMaterial({ emissiveIntensity: 1.6, roughness: 0.8 });
  private waveMat = new THREE.MeshBasicMaterial({ color: ROSE, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  private wave: THREE.Mesh;
  private light = new THREE.PointLight(ROSE, 0, 9, 1.5);
  private phase: Phase = 'off';
  private t = 0;
  private flinch = 0;
  private glow = 1;
  private home = new THREE.Vector3();
  hp = 0;
  maxHp = GUARDIAN.hp;
  timeLeft = 0;
  /** Seconds since the fight started (records). */
  elapsed = 0;
  /** Shockwave radius (m), < 0 when no wave is travelling. */
  waveRadius = -1;
  /** Hits taken since the last slam. */
  private sinceSlam = 0;
  onSlam?: (at: THREE.Vector3) => void;

  constructor(private particles: Particles) {
    // Legs.
    const legs = new THREE.Mesh(
      build([
        part(jitter(new THREE.BoxGeometry(0.55, 0.9, 0.6), 0.06, 1), ROCK, [-0.45, 0.45, 0]),
        part(jitter(new THREE.BoxGeometry(0.55, 0.9, 0.6), 0.06, 2), ROCK, [0.45, 0.45, 0]),
        part(new THREE.BoxGeometry(0.7, 0.18, 0.8), ROCK_HI, [-0.45, 0.09, 0.05]),
        part(new THREE.BoxGeometry(0.7, 0.18, 0.8), ROCK_HI, [0.45, 0.09, 0.05]),
      ]),
      this.mat,
    );
    // Torso + head + crystals on the back.
    const torso = new THREE.Mesh(
      build([
        part(jitter(new THREE.DodecahedronGeometry(1.0, 0), 0.12, 3), ROCK, [0, 0.4, 0], { scale: [1.15, 0.95, 0.85] }),
        part(jitter(new THREE.BoxGeometry(0.8, 0.6, 0.7), 0.05, 4), ROCK_HI, [0, 1.4, 0.15]),
        part(new THREE.BoxGeometry(0.16, 0.1, 0.05), 0xfff1f6, [-0.18, 1.45, 0.51], { emit: 2.2 }),
        part(new THREE.BoxGeometry(0.16, 0.1, 0.05), 0xfff1f6, [0.18, 1.45, 0.51], { emit: 2.2 }),
        part(new THREE.BoxGeometry(0.5, 0.06, 0.05), 0x2a2035, [0, 1.25, 0.5]),
        // Chest core.
        part(new THREE.OctahedronGeometry(0.28, 0), ROSE, [0, 0.55, 0.78], { emit: 1.6, scale: [1, 1.3, 0.6] }),
        crystal(0.9, 0.22, ROSE, [-0.45, 1.15, -0.45], [-0.5, 0, 0.35]),
        crystal(1.2, 0.26, PALETTE.crystal, [0.05, 1.3, -0.55], [-0.6, 0, 0]),
        crystal(0.8, 0.2, ROSE, [0.55, 1.05, -0.4], [-0.45, 0, -0.4]),
        crystal(0.55, 0.15, PALETTE.crystal, [-0.7, 0.6, -0.3], [-0.2, 0, 0.9]),
        crystal(0.5, 0.14, ROSE, [0.75, 0.55, -0.2], [-0.1, 0, -1]),
      ]),
      this.mat,
    );
    torso.position.y = 1.0;
    this.body.add(torso);
    // Arms: pivot at the shoulder, a boulder fist at the end.
    const arm = (side: number) =>
      new THREE.Mesh(
        build([
          part(jitter(new THREE.BoxGeometry(0.42, 1.0, 0.45), 0.05, 5 + side), ROCK, [0, -0.5, 0]),
          part(jitter(new THREE.DodecahedronGeometry(0.42, 0), 0.08, 7 + side), ROCK_HI, [0, -1.15, 0.05]),
          crystal(0.4, 0.12, ROSE, [side * 0.15, -0.2, -0.2], [-0.4, 0, side * 0.5]),
        ]),
        this.mat,
      );
    this.armL.add(arm(-1));
    this.armR.add(arm(1));
    this.armL.position.set(-1.15, 2.0, 0);
    this.armR.position.set(1.15, 2.0, 0);
    this.body.add(this.armL, this.armR);
    for (const m of [legs, torso, ...this.armL.children, ...this.armR.children]) {
      (m as THREE.Mesh).castShadow = true;
      (m as THREE.Mesh).receiveShadow = true;
    }
    this.group.add(legs, this.body);
    this.light.position.set(0, 1.8, 1);
    this.group.add(this.light);

    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), this.waveMat);
    this.wave.rotation.x = -Math.PI / 2;
    this.wave.visible = false;
    this.group.visible = false;
  }

  /** The shockwave lives in world space (added next to the guardian group). */
  get waveMesh(): THREE.Mesh {
    return this.wave;
  }

  get active(): boolean {
    return this.phase !== 'off' && this.phase !== 'die' && this.phase !== 'leave';
  }

  /** Raising its arms before a slam. */
  get winding(): boolean {
    return this.phase === 'windup';
  }

  get visible(): boolean {
    return this.phase !== 'off';
  }

  get position(): THREE.Vector3 {
    return this.home;
  }

  /** Point where the pickaxe lands. */
  impactPoint(from: THREE.Vector3): THREE.Vector3 {
    const d = new THREE.Vector3(from.x - this.home.x, 0, from.z - this.home.z).normalize();
    return new THREE.Vector3(this.home.x + d.x * 0.9, this.home.y + 1.5, this.home.z + d.z * 0.9);
  }

  spawn(at: THREE.Vector3, faceTo: THREE.Vector3, hp: number, time: number): void {
    this.home.copy(at);
    this.group.position.copy(at);
    this.group.rotation.y = Math.atan2(faceTo.x - at.x, faceTo.z - at.z);
    this.hp = hp;
    this.maxHp = hp;
    this.timeLeft = time;
    this.elapsed = 0;
    this.sinceSlam = 0;
    this.phase = 'rise';
    this.t = 0;
    this.glow = 1;
    this.group.visible = true;
    this.waveRadius = -1;
    this.particles.smoke(at.clone().setY(at.y + 0.2), { count: 18, color: 0xb9a6c8, speed: 3.5, life: 1, size: 0.35, grow: 1.6, up: 0.6 });
    this.particles.sparks(at.clone().setY(at.y + 0.5), { count: 30, color: ROSE, speed: 5, life: 1, size: 0.1, up: 4 });
  }

  /** One pickaxe hit. Returns true when the guardian breaks. */
  hit(damage: number, from: THREE.Vector3): boolean {
    if (!this.active || this.phase === 'rise') return false;
    this.hp = Math.max(0, this.hp - damage);
    this.flinch = 1;
    const at = this.impactPoint(from);
    this.particles.sparks(at, { count: 14 + damage * 6, color: ROSE, speed: 6, life: 0.7, size: 0.09, up: 3 });
    this.particles.sparks(at, { count: 6, color: ROCK_HI, speed: 4, life: 0.6, size: 0.12, up: 2, gravity: 14 });
    if (this.hp <= 0) {
      this.phase = 'die';
      this.t = 0;
      this.shatter();
      return true;
    }
    this.sinceSlam += 1;
    if (this.sinceSlam >= GUARDIAN.stompEvery && this.phase === 'idle') {
      this.sinceSlam = 0;
      this.phase = 'windup';
      this.t = 0;
    }
    return false;
  }

  private shatter(): void {
    const c = this.home.clone().setY(this.home.y + 1.4);
    this.particles.sparks(c, { count: 140, color: ROSE, speed: 11, life: 1.6, size: 0.14, up: 5, gravity: 7 });
    this.particles.sparks(c, { count: 60, color: PALETTE.crystal, speed: 9, life: 1.4, size: 0.12, up: 4, gravity: 6 });
    this.particles.sparks(c, { count: 40, color: ROCK_HI, speed: 7, life: 1.2, size: 0.2, up: 4, gravity: 16 });
    this.particles.smoke(c, { count: 20, color: 0xd9c8e6, speed: 4, life: 1.3, size: 0.5, grow: 2, up: 0.5 });
  }

  /** Retreat into the ground (time out). */
  leave(): void {
    if (!this.active) return;
    this.phase = 'leave';
    this.t = 0;
  }

  /** Returns 'timeout' when the timer ran out this frame. */
  update(dt: number, time: number): 'timeout' | null {
    if (this.phase === 'off') return null;
    this.t += dt;
    let ev: 'timeout' | null = null;
    if (this.active) {
      this.timeLeft -= dt;
      this.elapsed += dt;
      if (this.timeLeft <= 0) {
        this.leave();
        ev = 'timeout';
      }
    }
    this.flinch = Math.max(0, this.flinch - dt * 5);
    const sway = Math.sin(time * 1.8) * 0.06;
    let armUp = 0;
    let bodyY = 0;
    let scale = 1;
    switch (this.phase) {
      case 'rise': {
        const k = Math.min(1, this.t / 0.9);
        bodyY = -2.6 * (1 - k * k * (3 - 2 * k));
        if (k >= 1) {
          this.phase = 'idle';
          this.t = 0;
        }
        break;
      }
      case 'windup': {
        const k = Math.min(1, this.t / GUARDIAN.windup);
        armUp = k;
        bodyY = k * 0.25;
        this.glow = 1 + k * 2;
        if (k >= 1) {
          this.phase = 'slam';
          this.t = 0;
        }
        break;
      }
      case 'slam': {
        const k = Math.min(1, this.t / 0.12);
        armUp = 1 - k * 1.3;
        bodyY = 0.25 - k * 0.4;
        if (k >= 1 && this.waveRadius < 0) {
          this.waveRadius = 0.6;
          this.particles.smoke(this.home.clone().setY(this.home.y + 0.2), { count: 24, color: 0xd9c8e6, speed: 6, life: 0.9, size: 0.4, grow: 1.4, up: 0.2 });
          this.particles.sparks(this.home.clone().setY(this.home.y + 0.3), { count: 40, color: ROSE, speed: 8, life: 0.8, size: 0.1, up: 2 });
          this.onSlam?.(this.home);
        }
        if (this.t > 0.6) {
          this.phase = 'idle';
          this.t = 0;
          this.glow = 1;
        }
        break;
      }
      case 'die': {
        scale = Math.max(0.001, 1 - this.t * 4);
        if (this.t > 0.3) this.phase = 'off';
        break;
      }
      case 'leave': {
        const k = Math.min(1, this.t / 1.2);
        bodyY = -2.8 * k * k;
        if (k >= 1) this.phase = 'off';
        break;
      }
    }
    this.body.position.y = bodyY;
    this.body.rotation.z = sway * (this.phase === 'idle' ? 1 : 0.3) + this.flinch * 0.12;
    this.body.rotation.x = -this.flinch * 0.18;
    this.armL.rotation.x = -armUp * 2.6 + Math.sin(time * 1.8) * 0.12;
    this.armR.rotation.x = -armUp * 2.6 - Math.sin(time * 1.8) * 0.12;
    this.group.scale.setScalar(scale * 1.3);
    // Glow pulses faster as time runs out.
    const urgency = this.active ? Math.max(0, 1 - this.timeLeft / 10) : 0;
    setEmitBoost(this.mat, 1.4 * this.glow + this.flinch * 2 + Math.max(0, Math.sin(time * (4 + urgency * 10))) * urgency * 1.5);
    this.light.intensity = (this.active ? 3 : 0) * this.glow + this.flinch * 6;
    this.group.visible = this.phase !== 'off';

    // Shockwave.
    if (this.waveRadius >= 0) {
      this.waveRadius += GUARDIAN.waveSpeed * dt;
      const r = this.waveRadius;
      this.wave.visible = true;
      this.wave.position.set(this.home.x, this.home.y + 0.15, this.home.z);
      this.wave.scale.setScalar(r);
      this.waveMat.opacity = Math.max(0, 1 - r / GUARDIAN.waveReach) * 0.9;
      if (r > GUARDIAN.waveReach) {
        this.waveRadius = -1;
        this.wave.visible = false;
      }
    }
    return ev;
  }
}
