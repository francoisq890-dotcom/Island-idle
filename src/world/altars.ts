/**
 * Rune altars: one per island. A floating rune slab spins above a stepped stone
 * platform ringed by standing stones; rolling lights a column in the colour of
 * the best rarity obtained and throws rune shards around.
 */
import * as THREE from 'three';
import { PALETTE } from '../config/palette';
import { FAMILIES, RARITIES, type FamilyDef, type FamilyId } from '../config/runes';
import { build, jitter, makeMaterial, part, type Part } from './geom';
import { setEmitBoost } from './landmarks';
import type { Particles } from './particles';

export class Altar {
  readonly group = new THREE.Group();
  readonly def: FamilyDef;
  readonly position: THREE.Vector3;
  private slab: THREE.Mesh;
  private slabMat = makeMaterial({ emissiveIntensity: 1.2, roughness: 0.4 });
  private beam: THREE.Mesh;
  private beamMat: THREE.MeshBasicMaterial;
  private wave: THREE.Mesh;
  private waveMat: THREE.MeshBasicMaterial;
  private light: THREE.PointLight;
  private spin = 0;
  private flash = 0;
  private waveT = 1;
  active = true;

  constructor(family: FamilyId, y: number, private particles: Particles) {
    this.def = FAMILIES[family];
    const [x, z] = this.def.altar;
    this.position = new THREE.Vector3(x, y, z);
    const accent = this.def.color;
    const stone = family === 'star' ? 0xefe7f7 : family === 'ember' ? 0x6e4a48 : family === 'mist' ? 0xb9a28f : PALETTE.rock1;
    const dark = family === 'star' ? 0xb7a2e8 : PALETTE.rock3;
    const parts: Part[] = [
      part(new THREE.CylinderGeometry(2.3, 2.5, 0.28, 8), dark, [0, 0.14, 0]),
      part(new THREE.CylinderGeometry(1.9, 2.1, 0.26, 8), stone, [0, 0.41, 0]),
      part(new THREE.CylinderGeometry(1.95, 1.95, 0.06, 8), accent, [0, 0.56, 0], { emit: 0.5 }),
      part(new THREE.CylinderGeometry(0.42, 0.62, 0.9, 6), stone, [0, 1.0, 0]),
      part(new THREE.CylinderGeometry(0.75, 0.42, 0.3, 6), dark, [0, 1.55, 0]),
      part(new THREE.TorusGeometry(0.62, 0.05, 4, 16), accent, [0, 1.72, 0], { rot: [Math.PI / 2, 0, 0], emit: 0.9 }),
    ];
    // Standing stones with glowing glyphs.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const px = Math.cos(a) * 1.75;
      const pz = Math.sin(a) * 1.75;
      parts.push(part(jitter(new THREE.BoxGeometry(0.34, 1.1 + (i % 2) * 0.35, 0.22), 0.05, i), stone, [px, 1.05, pz], { rot: [0, -a + Math.PI / 2, (i % 2 ? 0.06 : -0.05)] }));
      parts.push(part(new THREE.BoxGeometry(0.06, 0.38, 0.03), accent, [px * 1.07, 1.2, pz * 1.07], { rot: [0, -a + Math.PI / 2, 0], emit: 1.1 }));
    }
    const base = new THREE.Mesh(build(parts), makeMaterial({ emissiveIntensity: 1.3, roughness: 0.85 }));
    base.castShadow = true;
    base.receiveShadow = true;
    this.group.add(base);

    // Floating hexagonal rune slab with an engraved glyph.
    this.slab = new THREE.Mesh(
      build([
        part(new THREE.CylinderGeometry(0.5, 0.5, 0.16, 6), stone, [0, 0, 0], { rot: [Math.PI / 2, 0, 0] }),
        part(new THREE.CylinderGeometry(0.42, 0.42, 0.18, 6), accent, [0, 0, 0], { rot: [Math.PI / 2, 0, 0], emit: 0.35 }),
        part(new THREE.BoxGeometry(0.07, 0.56, 0.2), 0xffffff, [0, 0, 0], { emit: 1.3 }),
        part(new THREE.BoxGeometry(0.32, 0.07, 0.2), 0xffffff, [0.05, 0.1, 0], { rot: [0, 0, 0.6], emit: 1.3 }),
        part(new THREE.BoxGeometry(0.32, 0.07, 0.2), 0xffffff, [-0.05, -0.12, 0], { rot: [0, 0, 0.6], emit: 1.3 }),
      ]),
      this.slabMat,
    );
    this.slab.position.y = 2.55;
    this.slab.castShadow = true;
    this.group.add(this.slab);

    this.beamMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beamGeo = new THREE.CylinderGeometry(0.35, 0.9, 14, 16, 1, true);
    beamGeo.translate(0, 7 + 1.6, 0);
    this.beam = new THREE.Mesh(beamGeo, this.beamMat);
    this.beam.visible = false;
    this.group.add(this.beam);

    this.waveMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.2, 48), this.waveMat);
    this.wave.rotation.x = -Math.PI / 2;
    this.wave.position.y = 0.6;
    this.group.add(this.wave);

    this.light = new THREE.PointLight(accent, 2, 8, 1.6);
    this.light.position.y = 2.6;
    this.group.add(this.light);
    this.group.position.copy(this.position);
  }

  get slabWorld(): THREE.Vector3 {
    return this.slab.getWorldPosition(new THREE.Vector3());
  }

  /** Visual of a roll. `best` = index of the best rarity obtained. */
  rollFx(best: number, count: number): void {
    const r = RARITIES[best];
    const col = new THREE.Color(r.color);
    this.beamMat.color.copy(col);
    this.waveMat.color.copy(col);
    this.light.color.copy(col);
    this.spin = 1;
    this.flash = 0.6 + best * 0.2;
    if (best >= 2) this.waveT = 0;
    const at = this.slabWorld;
    this.particles.sparks(at, { count: 8 + Math.min(30, count * 3) + best * 12, color: r.color, speed: 4 + best * 1.5, life: 0.8 + best * 0.15, size: 0.08 + best * 0.015, up: 2 });
    if (best >= 3) {
      this.particles.sparks(at, { count: 30 + best * 15, color: 0xffffff, speed: 9, life: 1.2, size: 0.08, up: 4, gravity: 3 });
      this.particles.smoke(this.position.clone().setY(this.position.y + 0.7), { count: 10, color: r.color, speed: 5, life: 0.9, size: 0.25, grow: 2, spread: 0.1, up: 0.2 });
    }
  }

  update(dt: number, time: number): void {
    this.spin = Math.max(0, this.spin - dt * 1.4);
    this.flash = Math.max(0, this.flash - dt * 1.2);
    this.slab.rotation.y += dt * (0.6 + this.spin * 18);
    this.slab.rotation.z = Math.sin(time * 0.8) * 0.12;
    this.slab.position.y = 2.55 + Math.sin(time * 1.6) * 0.12 + this.spin * 0.4;
    setEmitBoost(this.slabMat, 1.1 + this.flash * 2.5 + Math.sin(time * 2) * 0.15);
    this.beam.visible = this.flash > 0.01;
    this.beamMat.opacity = Math.min(0.55, this.flash * 0.45);
    this.beam.rotation.y += dt * 2;
    this.light.intensity = (this.active ? 2 : 0.4) + this.flash * 18;
    if (this.waveT < 1) {
      this.waveT = Math.min(1, this.waveT + dt * 1.1);
      const k = this.waveT;
      this.wave.scale.setScalar(1 + k * 9);
      this.waveMat.opacity = (1 - k) * 0.8;
    } else this.waveMat.opacity = 0;
  }
}
