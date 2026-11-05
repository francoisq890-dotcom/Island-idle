/**
 * Conveyor belts (one merged mesh, one scrolling texture) and the glowing
 * resource cubes that ride on them. Item density follows the production rate,
 * so a richer economy literally fills the belts.
 */
import * as THREE from 'three';
import { PALETTE } from '../config/palette';
import type { V2 } from '../config/world';
import { build, makeMaterial, part, tmpObj } from './geom';

export interface BeltDef {
  id: string;
  pts: V2[];
  color: number;
}

interface Belt {
  def: BeltDef;
  /** Sampled 3D polyline. */
  path: THREE.Vector3[];
  cum: number[];
  length: number;
  items: number[];
  spawnAcc: number;
  /** Items per second. */
  rate: number;
  visible: boolean;
  onArrive?: () => void;
  colorObj: THREE.Color;
}

const BELT_W = 0.62;
const LIFT = 0.16;

function makeBeltTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a3450';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#4c4566';
  for (let i = 0; i < 2; i++) {
    const y = i * 32;
    g.beginPath();
    g.moveTo(8, y + 22);
    g.lineTo(32, y + 8);
    g.lineTo(56, y + 22);
    g.lineTo(56, y + 30);
    g.lineTo(32, y + 16);
    g.lineTo(8, y + 30);
    g.closePath();
    g.fill();
  }
  g.fillStyle = '#2a2540';
  g.fillRect(0, 0, 4, 64);
  g.fillRect(60, 0, 4, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Conveyors {
  readonly group = new THREE.Group();
  private belts = new Map<string, Belt>();
  private tex: THREE.CanvasTexture;
  private items: THREE.InstancedMesh;
  private beltMat: THREE.MeshStandardMaterial;
  private frameMat: THREE.Material;
  private meshes = new Map<string, THREE.Mesh>();
  speed = 1.8;
  private time = 0;
  private col = new THREE.Color();

  constructor(private heightAt: (x: number, z: number) => number) {
    this.tex = makeBeltTexture();
    this.beltMat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.8, metalness: 0.1 });
    this.frameMat = makeMaterial({ roughness: 0.7 });
    const itemGeo = build([part(new THREE.BoxGeometry(0.22, 0.22, 0.22), 0xffffff, [0, 0, 0], { emit: 1 })]);
    this.items = new THREE.InstancedMesh(itemGeo, makeMaterial({ emissiveIntensity: 1.4 }), 900);
    this.items.count = 0;
    this.items.frustumCulled = false;
    this.items.castShadow = true;
    this.group.add(this.items);
  }

  add(def: BeltDef, onArrive?: () => void): void {
    // Subdivide the polyline every ~0.8 m and follow the ground.
    const path: THREE.Vector3[] = [];
    for (let i = 0; i < def.pts.length - 1; i++) {
      const [ax, az] = def.pts[i];
      const [bx, bz] = def.pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.8));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        path.push(new THREE.Vector3(x, this.heightAt(x, z) + LIFT, z));
      }
    }
    const [lx, lz] = def.pts[def.pts.length - 1];
    path.push(new THREE.Vector3(lx, this.heightAt(lx, lz) + LIFT, lz));
    // Smooth heights a little.
    for (let pass = 0; pass < 2; pass++)
      for (let i = 1; i < path.length - 1; i++) path[i].y = (path[i - 1].y + path[i].y * 2 + path[i + 1].y) / 4;
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + path[i].distanceTo(path[i - 1]));
    const belt: Belt = { def, path, cum, length: cum[cum.length - 1], items: [], spawnAcc: 0, rate: 0, visible: false, onArrive, colorObj: new THREE.Color(def.color) };
    this.belts.set(def.id, belt);

    const mesh = this.buildMesh(belt);
    mesh.visible = false;
    this.meshes.set(def.id, mesh);
    this.group.add(mesh);
  }

  private buildMesh(b: Belt): THREE.Mesh {
    const pos: number[] = [];
    const uv: number[] = [];
    const nrm: number[] = [];
    const frame: THREE.BufferGeometry[] = [];
    const side = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const lefts: THREE.Vector3[] = [];
    const rights: THREE.Vector3[] = [];
    for (let i = 0; i < b.path.length; i++) {
      const a = b.path[Math.max(0, i - 1)];
      const c = b.path[Math.min(b.path.length - 1, i + 1)];
      const dir = c.clone().sub(a).setY(0).normalize();
      side.crossVectors(dir, up).normalize().multiplyScalar(BELT_W / 2);
      lefts.push(b.path[i].clone().sub(side));
      rights.push(b.path[i].clone().add(side));
    }
    for (let i = 0; i < b.path.length - 1; i++) {
      const v0 = b.cum[i] / 1.2;
      const v1 = b.cum[i + 1] / 1.2;
      const L0 = lefts[i], R0 = rights[i], L1 = lefts[i + 1], R1 = rights[i + 1];
      pos.push(L0.x, L0.y, L0.z, R0.x, R0.y, R0.z, L1.x, L1.y, L1.z, R0.x, R0.y, R0.z, R1.x, R1.y, R1.z, L1.x, L1.y, L1.z);
      uv.push(0, v0, 1, v0, 0, v1, 1, v0, 1, v1, 0, v1);
      for (let k = 0; k < 6; k++) nrm.push(0, 1, 0);
      // Side rails.
      const mid = b.path[i].clone().add(b.path[i + 1]).multiplyScalar(0.5);
      const seg = b.path[i + 1].clone().sub(b.path[i]);
      const len = seg.length();
      const yaw = Math.atan2(seg.x, seg.z);
      const pitch = -Math.atan2(seg.y, Math.hypot(seg.x, seg.z));
      const s = side.clone().crossVectors(seg.clone().setY(0).normalize(), up).normalize();
      for (const sgn of [-1, 1]) {
        const p = mid.clone().addScaledVector(s, sgn * (BELT_W / 2 + 0.06));
        const g = build([part(new THREE.BoxGeometry(0.12, 0.2, len + 0.05), PALETTE.copper, [0, -0.02, 0])]);
        g.applyMatrix4(new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')), new THREE.Vector3(1, 1, 1)));
        frame.push(g);
      }
      const body = build([part(new THREE.BoxGeometry(BELT_W + 0.1, 0.16, len + 0.05), PALETTE.slate, [0, -0.1, 0])]);
      body.applyMatrix4(new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')), new THREE.Vector3(1, 1, 1)));
      frame.push(body);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    const top = new THREE.Mesh(g, this.beltMat);
    top.receiveShadow = true;
    // Lift the top surface a hair to avoid z-fighting with the body.
    top.position.y = 0.005;
    const merged = new THREE.Mesh(mergeKeepColors(frame), this.frameMat);
    merged.castShadow = true;
    merged.receiveShadow = true;
    merged.add(top);
    return merged;
  }

  setVisible(id: string, v: boolean): void {
    const b = this.belts.get(id);
    if (!b) return;
    b.visible = v;
    this.meshes.get(id)!.visible = v;
    if (!v) b.items.length = 0;
  }

  /** Items per second shown on a belt (purely visual). */
  setRate(id: string, itemsPerSecond: number): void {
    const b = this.belts.get(id);
    if (b) b.rate = itemsPerSecond;
  }

  /** Pre-fill belts so they don't look empty after loading. */
  prefill(): void {
    for (const b of this.belts.values()) {
      if (!b.visible || b.rate <= 0) continue;
      const spacing = this.speed / b.rate;
      b.items.length = 0;
      for (let u = b.length - 0.3; u > 0; u -= spacing) b.items.push(u);
    }
  }

  pointAt(b: Belt, u: number, out: THREE.Vector3): THREE.Vector3 {
    let i = 0;
    while (i < b.cum.length - 2 && b.cum[i + 1] < u) i++;
    const t = (u - b.cum[i]) / Math.max(1e-6, b.cum[i + 1] - b.cum[i]);
    return out.lerpVectors(b.path[i], b.path[i + 1], Math.min(1, Math.max(0, t)));
  }

  startOf(id: string): THREE.Vector3 | null {
    const b = this.belts.get(id);
    return b ? b.path[0].clone() : null;
  }

  update(dt: number): void {
    this.time += dt;
    this.tex.offset.y -= (this.speed * dt) / 1.2;
    let n = 0;
    const p = new THREE.Vector3();
    const max = this.items.instanceMatrix.count;
    for (const b of this.belts.values()) {
      if (!b.visible) continue;
      if (b.rate > 0) {
        b.spawnAcc += dt * b.rate;
        const minGap = 0.32;
        while (b.spawnAcc >= 1) {
          b.spawnAcc -= 1;
          if (b.items.length === 0 || b.items[b.items.length - 1] > minGap) b.items.push(0);
        }
      }
      for (let i = b.items.length - 1; i >= 0; i--) {
        b.items[i] += this.speed * dt;
        if (b.items[i] >= b.length) {
          b.items.splice(i, 1);
          b.onArrive?.();
        }
      }
      for (let i = 0; i < b.items.length && n < max; i++) {
        const u = b.items[i];
        this.pointAt(b, u, p);
        // Cubes hop over the rollers and tumble a little.
        const hop = Math.abs(Math.sin(u * 6.3 + i * 1.7));
        tmpObj.position.set(p.x, p.y + 0.14 + hop * hop * 0.08, p.z);
        tmpObj.rotation.set(Math.sin(u * 3.1 + i) * 0.35, u * 0.8, Math.cos(u * 2.7 + i) * 0.25);
        const s = Math.min(1, u * 3, (b.length - u) * 4 + 0.2);
        tmpObj.scale.setScalar(s);
        tmpObj.updateMatrix();
        this.items.setMatrixAt(n, tmpObj.matrix);
        this.items.setColorAt(n, this.col.copy(b.colorObj));
        n++;
      }
    }
    this.items.count = n;
    this.items.instanceMatrix.needsUpdate = true;
    if (this.items.instanceColor) this.items.instanceColor.needsUpdate = true;
  }
}

/** Merge geometries that already carry color/emit attributes, keeping their colors. */
function mergeKeepColors(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const emit = new Float32Array(total);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    col.set(g.attributes.color.array as Float32Array, o * 3);
    emit.set(g.attributes.emit.array as Float32Array, o);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('emit', new THREE.BufferAttribute(emit, 1));
  out.computeVertexNormals();
  return out;
}
