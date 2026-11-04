/**
 * CPU particle pools rendered as instanced low-poly shards / puffs.
 * Glowing particles use the emissive vertex attribute so they bloom.
 */
import * as THREE from 'three';
import { build, makeMaterial, part, tmpObj } from './geom';

interface P {
  alive: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  size: number;
  gravity: number;
  drag: number;
  spin: number;
  rot: number;
  grow: number;
}

export interface EmitOptions {
  count: number;
  color: THREE.ColorRepresentation;
  speed?: number;
  /** Extra upward velocity. */
  up?: number;
  spread?: number;
  life?: number;
  size?: number;
  gravity?: number;
  drag?: number;
  /** Particle size multiplier at end of life (default shrinks to 0). */
  grow?: number;
  /** Direction bias. */
  dir?: THREE.Vector3;
}

class Pool {
  readonly mesh: THREE.InstancedMesh;
  private ps: P[] = [];
  private next = 0;
  private col = new THREE.Color();

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, size: number) {
    this.mesh = new THREE.InstancedMesh(geo, mat, size);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    for (let i = 0; i < size; i++) {
      this.ps.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, gravity: 0, drag: 0, spin: 0, rot: 0, grow: 0 });
      this.mesh.setColorAt(i, this.col.set(0xffffff));
    }
    this.mesh.count = size;
    tmpObj.scale.setScalar(0);
    tmpObj.updateMatrix();
    for (let i = 0; i < size; i++) this.mesh.setMatrixAt(i, tmpObj.matrix);
  }

  emit(at: THREE.Vector3, o: EmitOptions): void {
    const speed = o.speed ?? 3;
    const spread = o.spread ?? 1;
    for (let k = 0; k < o.count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.ps.length;
      const p = this.ps[i];
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(1 - Math.random() * (1 + spread));
      const sp = speed * (0.5 + Math.random() * 0.7);
      p.alive = true;
      p.x = at.x; p.y = at.y; p.z = at.z;
      p.vx = Math.sin(ph) * Math.cos(th) * sp + (o.dir?.x ?? 0);
      p.vy = Math.cos(ph) * sp + (o.up ?? 0) + (o.dir?.y ?? 0);
      p.vz = Math.sin(ph) * Math.sin(th) * sp + (o.dir?.z ?? 0);
      p.max = p.life = (o.life ?? 0.8) * (0.7 + Math.random() * 0.6);
      p.size = (o.size ?? 0.12) * (0.6 + Math.random() * 0.8);
      p.gravity = o.gravity ?? 9;
      p.drag = o.drag ?? 1.5;
      p.spin = (Math.random() - 0.5) * 12;
      p.rot = Math.random() * 6;
      p.grow = o.grow ?? 0;
      this.mesh.setColorAt(i, this.col.set(o.color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.1));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        tmpObj.scale.setScalar(0);
        tmpObj.updateMatrix();
        this.mesh.setMatrixAt(i, tmpObj.matrix);
        continue;
      }
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr - p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.spin * dt;
      const t = p.life / p.max;
      const s = p.size * (p.grow ? 1 + (1 - t) * p.grow : Math.min(1, t * 2.5));
      tmpObj.position.set(p.x, p.y, p.z);
      tmpObj.rotation.set(p.rot, p.rot * 0.7, 0);
      tmpObj.scale.setScalar(p.grow ? s * Math.min(1, t * 3) : s);
      tmpObj.updateMatrix();
      this.mesh.setMatrixAt(i, tmpObj.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Particles {
  readonly group = new THREE.Group();
  private glow: Pool;
  private puff: Pool;

  constructor() {
    const glowGeo = build([part(new THREE.OctahedronGeometry(1, 0), 0xffffff, [0, 0, 0], { emit: 1, scale: [0.7, 1.3, 0.7] })]);
    this.glow = new Pool(glowGeo, makeMaterial({ emissiveIntensity: 1.7 }), 700);
    const puffGeo = build([part(new THREE.IcosahedronGeometry(1, 0), 0xffffff, [0, 0, 0])]);
    const puffMat = makeMaterial({ roughness: 1, emissiveIntensity: 0.25 });
    this.puff = new Pool(puffGeo, puffMat, 400);
    this.group.add(this.glow.mesh, this.puff.mesh);
  }

  sparks(at: THREE.Vector3, o: EmitOptions): void {
    this.glow.emit(at, o);
  }

  smoke(at: THREE.Vector3, o: EmitOptions): void {
    this.puff.emit(at, { gravity: -0.6, drag: 1.2, grow: 1.6, ...o });
  }

  update(dt: number): void {
    this.glow.update(dt);
    this.puff.update(dt);
  }
}
