/**
 * Bridges between islands. Locked bridges show a hologram; buying one makes the
 * planks fly in one after the other.
 */
import * as THREE from 'three';
import { PALETTE } from '../config/palette';
import type { BridgeLayout } from '../config/world';
import { mulberry32 } from '../core/noise';
import { Ease, type Tweens } from '../core/tween';
import { build, makeMaterial, part, type Part } from './geom';
import { bridgeHeight } from './terrain';

interface Plank {
  pos: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  scale: number;
  color: THREE.Color;
}

export class Bridge {
  readonly group = new THREE.Group();
  private planks: THREE.InstancedMesh;
  private rails: THREE.Mesh;
  private ghost: THREE.Group;
  private ghostMat: THREE.MeshBasicMaterial;
  private data: Plank[] = [];
  built = false;
  available = false;
  private o = new THREE.Object3D();
  readonly length: number;

  constructor(readonly layout: BridgeLayout, private tweens: Tweens) {
    const [ax, az] = layout.from;
    const [bx, bz] = layout.to;
    const dx = bx - ax;
    const dz = bz - az;
    this.length = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const stairs = layout.style === 'stairs';
    const step = stairs ? 0.5 : 0.55;
    const n = Math.ceil(this.length / step);
    const rand = mulberry32(Math.round(ax * 13 + az * 7));
    const plankGeo = stairs
      ? build([part(new THREE.BoxGeometry(layout.width, 0.3, 0.52), 0xffffff, [0, -0.15, 0])])
      : build([part(new THREE.BoxGeometry(layout.width, 0.12, 0.46), 0xffffff, [0, -0.06, 0])]);
    const mat = makeMaterial({ roughness: 0.9 });
    this.planks = new THREE.InstancedMesh(plankGeo, mat, n + 1);
    this.planks.castShadow = true;
    this.planks.receiveShadow = true;
    this.planks.frustumCulled = false;
    const wood = new THREE.Color(PALETTE.wood);
    const stone = new THREE.Color(0xeee6f5);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = bridgeHeight(layout, t);
      const t2 = Math.min(1, t + 1 / n);
      const slope = (bridgeHeight(layout, t2) - y) / (this.length / n);
      this.data.push({
        pos: new THREE.Vector3(ax + dx * t, y, az + dz * t),
        yaw: yaw + (stairs ? 0 : (rand() - 0.5) * 0.06),
        pitch: stairs ? 0 : -Math.atan(slope),
        roll: stairs ? 0 : (rand() - 0.5) * 0.03,
        scale: 0,
        color: (stairs ? stone.clone().offsetHSL(0, 0, (i % 2) * -0.05) : wood.clone()).offsetHSL(0, 0, (rand() - 0.5) * 0.1),
      });
    }
    for (let i = 0; i < this.data.length; i++) this.planks.setColorAt(i, this.data[i].color);
    this.group.add(this.planks);

    // Posts and rails / ropes.
    const parts: Part[] = [];
    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const posts = Math.max(2, Math.round(this.length / 2.6));
    const half = layout.width / 2 - 0.1;
    const railCol = layout.style === 'rope' ? 0xd9c08f : stairs ? 0xb7a2e8 : PALETTE.woodDark;
    const postCol = stairs ? 0xf1ebf7 : PALETTE.woodDark;
    let prevTop: THREE.Vector3[] | null = null;
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      const y = bridgeHeight(layout, t);
      const c = new THREE.Vector3(ax + dx * t, y, az + dz * t);
      const tops: THREE.Vector3[] = [];
      for (const s of [-1, 1]) {
        const p = c.clone().addScaledVector(side, s * half);
        parts.push(part(new THREE.CylinderGeometry(0.08, 0.1, 1.2, 5), postCol, [p.x, p.y + 0.5, p.z]));
        if (stairs) parts.push(part(new THREE.OctahedronGeometry(0.12, 0), PALETTE.lumen, [p.x, p.y + 1.2, p.z], { emit: 1.2 }));
        tops.push(new THREE.Vector3(p.x, p.y + 1.0, p.z));
      }
      if (prevTop) {
        for (let k = 0; k < 2; k++) {
          const a = prevTop[k];
          const b = tops[k];
          const segs = layout.style === 'rope' ? 4 : 1;
          for (let sIdx = 0; sIdx < segs; sIdx++) {
            const t0 = sIdx / segs;
            const t1 = (sIdx + 1) / segs;
            const sag = (u: number) => (layout.style === 'rope' ? -Math.sin(u * Math.PI) * 0.25 : 0);
            const p0 = a.clone().lerp(b, t0).add(new THREE.Vector3(0, sag(t0), 0));
            const p1 = a.clone().lerp(b, t1).add(new THREE.Vector3(0, sag(t1), 0));
            const mid = p0.clone().add(p1).multiplyScalar(0.5);
            const dir = p1.clone().sub(p0);
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
            const e = new THREE.Euler().setFromQuaternion(q);
            parts.push(part(new THREE.CylinderGeometry(0.045, 0.045, dir.length(), 4), railCol, [mid.x, mid.y, mid.z], { rot: [e.x, e.y, e.z] }));
          }
        }
      }
      prevTop = tops;
    }
    this.rails = new THREE.Mesh(build(parts), mat);
    this.rails.castShadow = true;
    this.rails.visible = false;
    this.group.add(this.rails);

    // Hologram.
    this.ghostMat = new THREE.MeshBasicMaterial({ color: PALETTE.lumen, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending });
    this.ghost = new THREE.Group();
    const gGeo = new THREE.BoxGeometry(layout.width, 0.05, 0.3);
    const ghostPlanks = new THREE.InstancedMesh(gGeo, this.ghostMat, Math.ceil(this.data.length / 2));
    let gi = 0;
    for (let i = 0; i < this.data.length; i += 2) {
      const d = this.data[i];
      this.o.position.copy(d.pos);
      this.o.rotation.set(d.pitch, d.yaw, 0, 'YXZ');
      this.o.scale.set(1, 1, 1);
      this.o.updateMatrix();
      ghostPlanks.setMatrixAt(gi++, this.o.matrix);
    }
    ghostPlanks.count = gi;
    this.ghost.add(ghostPlanks);
    this.ghost.visible = false;
    this.group.add(this.ghost);
    this.applyMatrices();
  }

  private applyMatrices(): void {
    for (let i = 0; i < this.data.length; i++) {
      const d = this.data[i];
      this.o.position.copy(d.pos);
      this.o.position.y -= (1 - Math.min(1, d.scale)) * 3;
      this.o.rotation.set(d.pitch, d.yaw, d.roll, 'YXZ');
      this.o.scale.setScalar(Math.max(0.0001, d.scale));
      this.o.updateMatrix();
      this.planks.setMatrixAt(i, this.o.matrix);
    }
    this.planks.instanceMatrix.needsUpdate = true;
  }

  setBuilt(onPlank?: (pos: THREE.Vector3, i: number) => void): Promise<void> {
    this.built = true;
    this.ghost.visible = false;
    if (!onPlank) {
      for (const d of this.data) d.scale = 1;
      this.rails.visible = true;
      this.applyMatrices();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const per = Math.min(0.05, 1.6 / this.data.length);
      this.data.forEach((d, i) => {
        this.tweens.add(
          0.45,
          (v) => {
            d.scale = v;
            this.applyMatrices();
          },
          {
            delay: i * per,
            ease: Ease.outBack,
            done: () => {
              if (i % 3 === 0) onPlank(d.pos, i);
              if (i === this.data.length - 1) {
                this.rails.visible = true;
                this.rails.scale.set(1, 0.01, 1);
                this.tweens.add(0.5, (v) => this.rails.scale.set(1, v, 1), { ease: Ease.outBack, done: resolve });
              }
            },
          },
        );
      });
    });
  }

  /** Center of the bridge (for camera / markers). */
  get midpoint(): THREE.Vector3 {
    return this.data[Math.floor(this.data.length / 2)].pos.clone();
  }

  update(time: number): void {
    this.ghost.visible = !this.built && this.available;
    if (this.ghost.visible) this.ghostMat.opacity = 0.18 + Math.sin(time * 3) * 0.08;
  }
}
