/**
 * Ether familiars in the world: the Nid d'éther (a twig nest on a rock pillar,
 * eggs glowing inside) and the creatures themselves. Perched familiars circle
 * the crystal and dive to peck it on their own rhythm; the others rest around
 * the nest; familiars on an expedition are away.
 */
import * as THREE from 'three';
import { PET_RARITIES, SPECIES, type SpeciesId } from '../config/familiars';
import { PALETTE } from '../config/palette';
import type { GameState, Pet } from '../economy/state';
import { build, jitter, makeMaterial, part, type Part } from './geom';
import type { Particles } from './particles';

export const NEST_POS: [number, number] = [-46.2, -17.4];

const RARITY_GLOW = [0, 0.25, 0.6, 1];

function speciesParts(sp: SpeciesId, c: number): { body: Part[]; wing: Part[] } {
  const white = 0xfff8ec;
  switch (sp) {
    case 'firefly':
      return {
        body: [
          part(new THREE.SphereGeometry(0.13, 7, 5), 0x3b3552, [0, 0, 0.08], { scale: [1, 1, 1.3] }),
          part(new THREE.SphereGeometry(0.15, 7, 5), c, [0, -0.02, -0.15], { emit: 1.6, scale: [1, 1, 1.4] }),
          part(new THREE.SphereGeometry(0.035, 4, 3), white, [0.06, 0.05, 0.22], { emit: 1 }),
          part(new THREE.SphereGeometry(0.035, 4, 3), white, [-0.06, 0.05, 0.22], { emit: 1 }),
        ],
        wing: [part(new THREE.BoxGeometry(0.32, 0.01, 0.16), 0xe8f6ff, [0.18, 0, 0], { emit: 0.3 })],
      };
    case 'manta':
      return {
        body: [
          part(new THREE.OctahedronGeometry(0.22, 0), c, [0, 0, 0], { scale: [0.9, 0.3, 1.2] }),
          part(new THREE.ConeGeometry(0.03, 0.45, 4), c, [0, 0, -0.42], { rot: [-Math.PI / 2, 0, 0] }),
          part(new THREE.SphereGeometry(0.04, 4, 3), white, [0.08, 0.04, 0.2], { emit: 1.2 }),
          part(new THREE.SphereGeometry(0.04, 4, 3), white, [-0.08, 0.04, 0.2], { emit: 1.2 }),
        ],
        wing: [part(new THREE.ConeGeometry(0.2, 0.42, 3), c, [0.3, 0, -0.02], { rot: [0, 0, -Math.PI / 2], scale: [1, 1, 0.25], emit: 0.4 })],
      };
    case 'owl':
      return {
        body: [
          part(new THREE.SphereGeometry(0.2, 8, 6), c, [0, 0, 0], { scale: [1, 1.1, 0.9] }),
          part(new THREE.ConeGeometry(0.05, 0.14, 4), c, [0.1, 0.22, 0], { rot: [0, 0, -0.3] }),
          part(new THREE.ConeGeometry(0.05, 0.14, 4), c, [-0.1, 0.22, 0], { rot: [0, 0, 0.3] }),
          part(new THREE.SphereGeometry(0.065, 6, 4), white, [0.08, 0.06, 0.15], { emit: 0.6 }),
          part(new THREE.SphereGeometry(0.065, 6, 4), white, [-0.08, 0.06, 0.15], { emit: 0.6 }),
          part(new THREE.SphereGeometry(0.03, 4, 3), 0x2a2035, [0.08, 0.06, 0.2]),
          part(new THREE.SphereGeometry(0.03, 4, 3), 0x2a2035, [-0.08, 0.06, 0.2]),
          part(new THREE.ConeGeometry(0.03, 0.07, 4), PALETTE.lumen, [0, -0.01, 0.2], { rot: [Math.PI / 2, 0, 0] }),
        ],
        wing: [part(new THREE.BoxGeometry(0.3, 0.03, 0.2), c, [0.2, 0, -0.02])],
      };
    case 'drake':
      return {
        body: [
          part(new THREE.SphereGeometry(0.15, 7, 5), c, [0, 0, 0], { scale: [0.9, 0.9, 1.4] }),
          part(new THREE.SphereGeometry(0.11, 6, 5), c, [0, 0.1, 0.22]),
          part(new THREE.ConeGeometry(0.03, 0.12, 4), 0xfff1d0, [0.05, 0.2, 0.2], { rot: [-0.5, 0, 0] }),
          part(new THREE.ConeGeometry(0.03, 0.12, 4), 0xfff1d0, [-0.05, 0.2, 0.2], { rot: [-0.5, 0, 0] }),
          part(new THREE.ConeGeometry(0.06, 0.4, 4), c, [0, -0.02, -0.32], { rot: [-Math.PI / 2, 0, 0] }),
          part(new THREE.SphereGeometry(0.03, 4, 3), PALETTE.lumen, [0.05, 0.13, 0.31], { emit: 1.5 }),
          part(new THREE.SphereGeometry(0.03, 4, 3), PALETTE.lumen, [-0.05, 0.13, 0.31], { emit: 1.5 }),
          part(new THREE.OctahedronGeometry(0.05, 0), PALETTE.lava, [0, 0, -0.52], { emit: 1.6 }),
        ],
        wing: [part(new THREE.ConeGeometry(0.16, 0.36, 3), 0xc46a3c, [0.24, 0.05, 0], { rot: [0, 0, -Math.PI / 2], scale: [1, 1, 0.2] })],
      };
  }
}

interface Flyer {
  pet: Pet;
  root: THREE.Group;
  wingL: THREE.Object3D;
  wingR: THREE.Object3D;
  timer: number;
  dive: number;
  phase: number;
  pos: THREE.Vector3;
  aura: THREE.Mesh;
}

export class Familiars {
  readonly group = new THREE.Group();
  readonly nestPosition: THREE.Vector3;
  private nestEggs: THREE.Mesh[] = [];
  private mat = makeMaterial({ emissiveIntensity: 1.6, roughness: 0.55 });
  private eggMat = makeMaterial({ emissiveIntensity: 1.3, roughness: 0.4 });
  private flyers = new Map<number, Flyer>();
  private geoCache = new Map<string, { body: THREE.BufferGeometry; wing: THREE.BufferGeometry }>();
  private auraGeo = new THREE.SphereGeometry(0.42, 10, 8);
  private tmp = new THREE.Vector3();
  /** Called when a perched familiar's beak lands on the crystal. */
  onPeck?: (pet: Pet, at: THREE.Vector3) => void;

  constructor(y: number, private particles: Particles) {
    this.nestPosition = new THREE.Vector3(NEST_POS[0], y, NEST_POS[1]);
    const parts: Part[] = [
      part(jitter(new THREE.CylinderGeometry(0.9, 1.3, 2.4, 7), 0.12, 3), 0xa38f86, [0, 1.2, 0]),
      part(jitter(new THREE.DodecahedronGeometry(0.6, 0), 0.15, 5), 0x8a7a72, [0.9, 0.4, 0.5]),
      part(jitter(new THREE.DodecahedronGeometry(0.45, 0), 0.15, 6), 0x8a7a72, [-0.8, 0.3, -0.6]),
      part(new THREE.TorusGeometry(0.95, 0.32, 5, 12), PALETTE.woodDark, [0, 2.55, 0], { rot: [Math.PI / 2, 0, 0] }),
      part(new THREE.TorusGeometry(0.8, 0.18, 4, 10), PALETTE.wood, [0, 2.75, 0], { rot: [Math.PI / 2, 0, 0.4] }),
      part(new THREE.CylinderGeometry(0.75, 0.6, 0.2, 9), PALETTE.woodDark, [0, 2.45, 0]),
    ];
    // Twigs sticking out.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      parts.push(part(new THREE.BoxGeometry(0.06, 0.06, 0.8), PALETTE.wood, [Math.cos(a) * 1.05, 2.65, Math.sin(a) * 1.05], { rot: [0.3 * Math.sin(i), -a, 0.2] }));
    }
    // Hanging crystal lanterns.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      parts.push(part(new THREE.OctahedronGeometry(0.14, 0), PALETTE.crystal, [Math.cos(a) * 1.15, 2.2, Math.sin(a) * 1.15], { emit: 1.4, scale: [1, 1.6, 1] }));
    }
    const nest = new THREE.Mesh(build(parts), makeMaterial({ emissiveIntensity: 1.2, roughness: 0.85 }));
    nest.castShadow = true;
    nest.receiveShadow = true;
    nest.position.copy(this.nestPosition);
    this.group.add(nest);
    const eggGeo = build([part(new THREE.SphereGeometry(0.22, 8, 6), 0xffffff, [0, 0, 0], { scale: [0.85, 1.1, 0.85], emit: 0.5 }), part(new THREE.TorusGeometry(0.19, 0.025, 3, 10), 0xffffff, [0, 0.02, 0], { rot: [Math.PI / 2, 0, 0], emit: 1.2 })]);
    const eggColors = [0xc4fbff, 0xffe2a8, 0xe6d6ff];
    for (let i = 0; i < 3; i++) {
      const e = new THREE.Mesh(eggGeo.clone(), this.eggMat);
      const col = new THREE.Color(eggColors[i]);
      const colors = e.geometry.getAttribute('color') as THREE.BufferAttribute;
      for (let k = 0; k < colors.count; k++) colors.setXYZ(k, col.r, col.g, col.b);
      e.position.set(this.nestPosition.x + (i - 1) * 0.36, y + 2.75, this.nestPosition.z + (i % 2) * 0.2 - 0.1);
      e.visible = false;
      this.group.add(e);
      this.nestEggs.push(e);
    }
  }

  private geometry(sp: SpeciesId, rarityIndex: number): { body: THREE.BufferGeometry; wing: THREE.BufferGeometry } {
    const key = sp + rarityIndex;
    let g = this.geoCache.get(key);
    if (!g) {
      const base = new THREE.Color(SPECIES[sp].color);
      // Rarer familiars are brighter and slightly golden.
      const c = base.lerp(new THREE.Color(0xffe9a8), rarityIndex * 0.08).getHex();
      const p = speciesParts(sp, c);
      g = { body: build(p.body), wing: build(p.wing) };
      this.geoCache.set(key, g);
    }
    return g;
  }

  private make(pet: Pet): Flyer {
    const ri = PET_RARITIES.findIndex((r) => r.id === pet.rarity);
    const g = this.geometry(pet.species, ri);
    const root = new THREE.Group();
    const body = new THREE.Mesh(g.body, this.mat);
    body.castShadow = true;
    const wingL = new THREE.Mesh(g.wing, this.mat);
    const wingR = new THREE.Mesh(g.wing, this.mat);
    wingR.scale.x = -1;
    const auraMat = new THREE.MeshBasicMaterial({ color: SPECIES[pet.species].color, transparent: true, opacity: 0.08 + RARITY_GLOW[ri] * 0.14, blending: THREE.AdditiveBlending, depthWrite: false });
    const aura = new THREE.Mesh(this.auraGeo, auraMat);
    root.add(body, wingL, wingR, aura);
    const scale = pet.species === 'owl' ? 1.25 : pet.species === 'drake' ? 1.2 : 1.1;
    root.scale.setScalar(scale);
    this.group.add(root);
    return { pet, root, wingL, wingR, timer: Math.random() * SPECIES[pet.species].period, dive: 0, phase: Math.random() * Math.PI * 2, pos: this.nestPosition.clone(), aura };
  }

  /** Burst at the nest when an egg hatches. */
  hatchFx(): void {
    const at = this.nestPosition.clone().setY(this.nestPosition.y + 2.9);
    this.particles.sparks(at, { count: 70, color: 0xfff1a8, speed: 6, life: 1.2, size: 0.1, up: 4 });
    this.particles.smoke(at, { count: 12, color: 0xffffff, speed: 2, life: 1, size: 0.3, grow: 2 });
  }

  update(dt: number, time: number, state: GameState, crystal: THREE.Vector3): void {
    // Eggs waiting in the nest.
    this.nestEggs.forEach((e, i) => {
      e.visible = i < state.eggs;
      e.rotation.z = Math.sin(time * 3 + i) * 0.12 * (1 + Math.sin(time * 0.7 + i));
      e.position.y = this.nestPosition.y + 2.78 + Math.abs(Math.sin(time * 2.4 + i * 1.3)) * 0.04;
    });
    // Create / remove flyers.
    const ids = new Set(state.pets.map((p) => p.id));
    for (const [id, f] of this.flyers) {
      if (!ids.has(id)) {
        this.group.remove(f.root);
        this.flyers.delete(id);
      }
    }
    let perchIdx = 0;
    let restIdx = 0;
    const perchedN = state.pets.filter((p) => p.perched && !p.away).length;
    for (const pet of state.pets) {
      let f = this.flyers.get(pet.id);
      if (!f) {
        f = this.make(pet);
        f.pos.copy(this.nestPosition).setY(this.nestPosition.y + 3);
        this.flyers.set(pet.id, f);
      }
      f.pet = pet;
      f.root.visible = !pet.away;
      if (pet.away) continue;
      const flap = Math.sin(time * (pet.species === 'manta' ? 6 : 22) + f.phase);
      f.wingL.rotation.z = flap * (pet.species === 'manta' ? 0.35 : 0.7);
      f.wingR.rotation.z = -flap * (pet.species === 'manta' ? 0.35 : 0.7);
      let target: THREE.Vector3;
      if (pet.perched) {
        // Orbit the crystal; dive to peck it every period.
        const k = perchIdx++ / Math.max(1, perchedN);
        const a = time * 0.6 + k * Math.PI * 2;
        const r = 2.6 + Math.sin(time * 0.9 + f.phase) * 0.3;
        target = this.tmp.set(crystal.x + Math.cos(a) * r, crystal.y + 3.4 + Math.sin(time * 1.3 + f.phase) * 0.35, crystal.z + Math.sin(a) * r);
        f.timer -= dt;
        if (f.timer <= 0) {
          f.timer = SPECIES[pet.species].period;
          f.dive = 1;
        }
        if (f.dive > 0) {
          f.dive = Math.max(0, f.dive - dt * 2.6);
          const d = Math.sin((1 - f.dive) * Math.PI); // 0 → 1 → 0
          const hit = this.tmp.clone().lerp(crystal.clone().setY(crystal.y + 1.6), d);
          target = hit;
          if (f.dive < 0.5 && f.dive + dt * 2.6 >= 0.5) {
            const at = crystal.clone().setY(crystal.y + 1.6).lerp(f.pos, 0.25);
            this.particles.sparks(at, { count: 6, color: SPECIES[pet.species].color, speed: 3, life: 0.45, size: 0.06, up: 1.5 });
            this.onPeck?.(pet, at);
          }
        }
      } else {
        // Resting around the nest.
        const a = time * 0.35 + restIdx++ * 1.3;
        target = this.tmp.set(this.nestPosition.x + Math.cos(a) * 2.2, this.nestPosition.y + 3.6 + Math.sin(time + f.phase) * 0.3, this.nestPosition.z + Math.sin(a) * 2.2);
      }
      // Smooth follow (fast when diving).
      const follow = 1 - Math.exp(-dt * (f.dive > 0 ? 14 : 3));
      const prev = f.root.position.clone();
      f.pos.lerp(target, follow);
      f.root.position.copy(f.pos);
      const vx = f.pos.x - prev.x;
      const vz = f.pos.z - prev.z;
      if (vx * vx + vz * vz > 1e-6) f.root.rotation.y = Math.atan2(vx, vz);
      f.root.rotation.z = Math.sin(time * 2 + f.phase) * 0.15;
      (f.aura.material as THREE.MeshBasicMaterial).opacity = (0.1 + 0.08 * Math.sin(time * 3 + f.phase)) * (pet.rarity === 'common' ? 0.6 : 1.2);
    }
  }
}
