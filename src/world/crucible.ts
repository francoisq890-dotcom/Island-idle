/**
 * Creuset runique: an iron cauldron on a stone hearth near the Nexus, where
 * duplicate runes are fused. Rose liquid bubbles inside, three rune stones orbit
 * above it; a fusion throws a column of light in the colour of the result.
 */
import * as THREE from 'three';
import { PALETTE } from '../config/palette';
import { build, jitter, makeMaterial, part, type Part } from './geom';
import { setEmitBoost } from './landmarks';
import type { Particles } from './particles';

export const CRUCIBLE_POS: [number, number] = [7.4, -7.6];
const ROSE = 0xf08cb0;

export class Crucible {
  readonly group = new THREE.Group();
  readonly position: THREE.Vector3;
  private liquid: THREE.Mesh;
  private liquidMat = makeMaterial({ emissiveIntensity: 1.4, roughness: 0.3 });
  private stones: THREE.Group;
  private stoneMat = makeMaterial({ emissiveIntensity: 1.6, roughness: 0.5 });
  private light: THREE.PointLight;
  private flash = 0;
  private bubbleTimer = 0;
  private heat = 0;
  /** Lit once the player has fragments (after the first guardian). */
  lit = false;

  constructor(y: number, private particles: Particles) {
    this.position = new THREE.Vector3(CRUCIBLE_POS[0], y, CRUCIBLE_POS[1]);
    const iron = 0x4a4258;
    const ironHi = 0x6d6480;
    const parts: Part[] = [
      // Hearth stones.
      part(new THREE.CylinderGeometry(1.75, 1.95, 0.32, 9), PALETTE.rock3, [0, 0.16, 0]),
      part(new THREE.CylinderGeometry(1.45, 1.6, 0.2, 9), PALETTE.rock2, [0, 0.42, 0]),
      // Embers under the pot.
      part(new THREE.CylinderGeometry(0.85, 0.95, 0.08, 7), PALETTE.lava, [0, 0.56, 0], { emit: 1.2 }),
      // Pot: a squashed sphere with a lip.
      part(new THREE.SphereGeometry(1.05, 10, 7, 0, Math.PI * 2, Math.PI * 0.32, Math.PI * 0.68), iron, [0, 1.25, 0], { scale: [1, 0.8, 1] }),
      part(new THREE.TorusGeometry(0.9, 0.11, 5, 14), ironHi, [0, 1.68, 0], { rot: [Math.PI / 2, 0, 0] }),
      // Brass bands and rune studs.
      part(new THREE.TorusGeometry(1.02, 0.05, 4, 16), PALETTE.copper, [0, 1.18, 0], { rot: [Math.PI / 2, 0, 0] }),
    ];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      parts.push(part(new THREE.OctahedronGeometry(0.09, 0), ROSE, [Math.cos(a) * 1.04, 1.18, Math.sin(a) * 1.04], { emit: 1.2 }));
    }
    // Three short legs.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      parts.push(part(new THREE.CylinderGeometry(0.1, 0.07, 0.55, 5), iron, [Math.cos(a) * 0.7, 0.72, Math.sin(a) * 0.7], { rot: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3] }));
    }
    // Small stacked rune stones around the hearth.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.9;
      parts.push(part(jitter(new THREE.CylinderGeometry(0.22, 0.24, 0.16, 6), 0.03, i), 0xd9cdb8, [Math.cos(a) * 1.7, 0.42, Math.sin(a) * 1.7], { rot: [0.2, a, 0.1] }));
    }
    const base = new THREE.Mesh(build(parts), makeMaterial({ emissiveIntensity: 1.3, roughness: 0.7 }));
    base.castShadow = true;
    base.receiveShadow = true;
    this.group.add(base);

    this.liquid = new THREE.Mesh(build([part(new THREE.CylinderGeometry(0.82, 0.82, 0.08, 14), ROSE, [0, 0, 0], { emit: 0.9 })]), this.liquidMat);
    this.liquid.position.y = 1.6;
    this.group.add(this.liquid);

    this.stones = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const st = new THREE.Mesh(
        build([
          part(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 6), 0xf3e7d4, [0, 0, 0], { rot: [Math.PI / 2, 0, 0] }),
          part(new THREE.BoxGeometry(0.04, 0.22, 0.1), ROSE, [0, 0, 0], { emit: 1.4 }),
        ]),
        this.stoneMat,
      );
      const a = (i / 3) * Math.PI * 2;
      st.position.set(Math.cos(a) * 1.1, 2.4, Math.sin(a) * 1.1);
      this.stones.add(st);
    }
    this.group.add(this.stones);

    this.light = new THREE.PointLight(ROSE, 0, 7, 1.6);
    this.light.position.y = 2.2;
    this.group.add(this.light);
    this.group.position.copy(this.position);
  }

  get mouth(): THREE.Vector3 {
    return this.position.clone().setY(this.position.y + 1.7);
  }

  /** Fusion: column of light and sparks in the colour of the rune obtained. */
  fuseFx(color: number, rarity: number): void {
    this.flash = 1 + rarity * 0.3;
    const at = this.mouth;
    this.particles.sparks(at, { count: 30 + rarity * 18, color, speed: 6 + rarity, life: 1.1, size: 0.1 + rarity * 0.01, up: 5, gravity: 4 });
    this.particles.smoke(at, { count: 10, color: ROSE, speed: 2.2, life: 1.2, size: 0.35, grow: 2.2, up: 1.4, gravity: -0.5 });
  }

  update(dt: number, time: number): void {
    this.heat += ((this.lit ? 1 : 0.15) - this.heat) * Math.min(1, dt * 0.8);
    this.flash = Math.max(0, this.flash - dt * 1.3);
    const h = this.heat;
    this.liquid.position.y = 1.6 + Math.sin(time * 2.3) * 0.03;
    this.liquid.rotation.y += dt * 0.4;
    setEmitBoost(this.liquidMat, 0.4 + h * 1.1 + this.flash * 2);
    setEmitBoost(this.stoneMat, 0.3 + h * 1.3 + this.flash * 2);
    this.stones.visible = h > 0.3;
    this.stones.rotation.y += dt * (0.5 + this.flash * 4);
    this.stones.children.forEach((c, i) => {
      c.position.y = 2.35 + Math.sin(time * 1.4 + i * 2.1) * 0.15 + this.flash * 0.6;
      c.rotation.y += dt * 1.5;
    });
    this.light.intensity = h * 3 + this.flash * 16;
    this.bubbleTimer -= dt;
    if (this.bubbleTimer <= 0 && h > 0.3) {
      this.bubbleTimer = 0.25 + Math.random() * 0.5;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.6;
      const p = this.position.clone().add(new THREE.Vector3(Math.cos(a) * r, 1.65, Math.sin(a) * r));
      this.particles.sparks(p, { count: 2, color: ROSE, speed: 0.6, up: 1.6, life: 0.6, size: 0.07, gravity: -0.5 });
    }
  }
}
