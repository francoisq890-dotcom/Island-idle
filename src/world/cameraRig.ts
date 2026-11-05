/** Third-person orbit camera with damping, zoom, screen shake and cinematic moves. */
import * as THREE from 'three';
import { damp, dampAngle } from '../core/tween';
import { noise2 } from '../core/noise';

export class CameraRig {
  yaw = 0;
  pitch = 0.66;
  distance = 12;
  private curYaw = 0;
  private curPitch = 0.66;
  private curDist = 12;
  readonly target = new THREE.Vector3();
  private smoothTarget = new THREE.Vector3();
  private trauma = 0;
  private time = 0;
  /** When set, the camera blends towards this cinematic pose. */
  cinematic: { pos: THREE.Vector3; look: THREE.Vector3; weight: number } | null = null;
  private lookAt = new THREE.Vector3();
  minDist = 5;
  maxDist = 22;

  constructor(private camera: THREE.PerspectiveCamera) {}

  orbit(dx: number, dy: number, invertY = false): void {
    this.yaw -= dx * 0.0055;
    this.pitch += (invertY ? -dy : dy) * 0.004;
    this.pitch = THREE.MathUtils.clamp(this.pitch, 0.12, 1.25);
  }

  zoom(delta: number): void {
    this.distance = THREE.MathUtils.clamp(this.distance * (1 + delta * 0.1), this.minDist, this.maxDist);
  }

  /** Punch-in zoom (0..1): the camera snaps closer, then eases back. */
  private punchK = 0;
  punch(amount: number): void {
    this.punchK = Math.min(1, Math.max(this.punchK, amount));
  }

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  snap(): void {
    this.curYaw = this.yaw;
    this.curPitch = this.pitch;
    this.curDist = this.distance;
    this.smoothTarget.copy(this.target);
  }

  /** Yaw the camera should have to look along the current view (used for movement). */
  get viewYaw(): number {
    return this.curYaw;
  }

  update(dt: number): void {
    this.time += dt;
    this.curYaw = dampAngle(this.curYaw, this.yaw, 10, dt);
    this.curPitch = damp(this.curPitch, this.pitch, 10, dt);
    this.curDist = damp(this.curDist, this.distance, 8, dt);
    this.smoothTarget.x = damp(this.smoothTarget.x, this.target.x, 9, dt);
    this.smoothTarget.z = damp(this.smoothTarget.z, this.target.z, 9, dt);
    this.smoothTarget.y = damp(this.smoothTarget.y, this.target.y, 6, dt);

    const cp = Math.cos(this.curPitch);
    const pos = new THREE.Vector3(
      this.smoothTarget.x + Math.sin(this.curYaw) * cp * this.curDist,
      this.smoothTarget.y + Math.sin(this.curPitch) * this.curDist,
      this.smoothTarget.z + Math.cos(this.curYaw) * cp * this.curDist,
    );
    this.lookAt.copy(this.smoothTarget);

    if (this.cinematic) {
      const w = this.cinematic.weight;
      pos.lerp(this.cinematic.pos, w);
      this.lookAt.lerp(this.cinematic.look, w);
    }

    // Screen shake (trauma², Perlin-ish).
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma;
    if (s > 0) {
      const t = this.time * 22;
      pos.x += noise2(t, 1.3) * 0.35 * s;
      pos.y += noise2(t, 7.1) * 0.35 * s;
      pos.z += noise2(t, 3.7) * 0.35 * s;
    }
    // Punch-in: pull towards the target and narrow the field of view a little.
    this.punchK = Math.max(0, this.punchK - dt * 1.8);
    const pk = this.punchK * this.punchK * (3 - 2 * this.punchK);
    if (pk > 0) pos.lerp(this.lookAt, pk * 0.28);
    const fov = ((this.camera.userData.baseFov as number | undefined) ?? 50) * (1 - pk * 0.12);
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(this.lookAt);
  }
}
