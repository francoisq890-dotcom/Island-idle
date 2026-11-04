/**
 * The World owns every 3D object and keeps them in sync with the game state.
 * It knows nothing about the DOM: it exposes interactables, projections and
 * hooks that the game layer wires to the economy, UI and audio.
 */
import * as THREE from 'three';
import { MACHINES, MACHINE_ORDER, type MachineId, type ZoneId } from '../config/economy';
import { HOME_SEASONS, PALETTE, ZONE_GRASS, type GrassTheme } from '../config/palette';
import { BRIDGES, ISLANDS, LIGHTHOUSE, MAIN_CRYSTAL, NEXUS, RANGES, SITES, SPAWN, type V2 } from '../config/world';
import { computeRates, milestoneMult, type Rates } from '../economy/economy';
import type { GameState } from '../economy/state';
import { mulberry32 } from '../core/noise';
import { Ease, type Tweens } from '../core/tween';
import { Bridge } from './bridges';
import { CameraRig } from './cameraRig';
import { Conveyors } from './conveyors';
import { createDecor, type DecorHandle } from './decor';
import { build, instanced, jitter, makeMaterial, part, tmpObj } from './geom';
import { Beacon, buildSigns, HarvestCrystal, Lighthouse, Nexus, type SignDef } from './landmarks';
import { MachineSite } from './machines';
import { Particles } from './particles';
import { Player } from './player';
import type { Renderer } from './renderer';
import { buildIslandMesh, distToPolyline, Ground, islandTopHeight, type Trail } from './terrain';

export type InteractKind = 'crystal' | 'site' | 'bridge' | 'lighthouse';

export interface Interactable {
  id: string;
  kind: InteractKind;
  machine?: MachineId;
  zone?: ZoneId;
  /** Anchor for tooltips. */
  anchor: THREE.Vector3;
  /** Proximity range (player). */
  range: number;
  /** Click sphere. */
  sphere: THREE.Sphere;
  active: boolean;
}

export interface WorldHooks {
  /** A resource cube reached the Nexus. */
  onArrive?: (kind: 'shards' | 'lumen') => void;
  onStep?: () => void;
  onPlank?: () => void;
}

const BELT_BRIDGE_OFFSET = 1.12;

function offsetAlongBridge(zone: ZoneId, side: number): V2[] {
  const b = BRIDGES.find((x) => x.zone === zone)!;
  const dx = b.to[0] - b.from[0];
  const dz = b.to[1] - b.from[1];
  const l = Math.hypot(dx, dz);
  const nx = -dz / l;
  const nz = dx / l;
  const o = BELT_BRIDGE_OFFSET * side;
  return [
    [b.to[0] + nx * o + (dx / l) * 1.5, b.to[1] + nz * o + (dz / l) * 1.5],
    [b.to[0] + nx * o, b.to[1] + nz * o],
    [b.from[0] + nx * o, b.from[1] + nz * o],
    [b.from[0] + nx * o - (dx / l) * 1.5, b.from[1] + nz * o - (dz / l) * 1.5],
  ];
}

export class World {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly rig: CameraRig;
  readonly ground = new Ground();
  /** Ground with every bridge, used to lay out belts. */
  private fullGround = new Ground();
  readonly player = new Player();
  readonly particles = new Particles();
  readonly sites = {} as Record<MachineId, MachineSite>;
  readonly bridges = new Map<ZoneId, Bridge>();
  readonly crystal: HarvestCrystal;
  readonly nexus: Nexus;
  readonly lighthouse: Lighthouse;
  readonly beacon: Beacon;
  readonly conveyors: Conveyors;
  readonly interactables: Interactable[] = [];
  private islandMeshes = new Map<ZoneId, THREE.Mesh>();
  private decor: DecorHandle;
  private machineMat = makeMaterial({ emissiveIntensity: 1.5, roughness: 0.65 });
  private time = 0;
  private emitTimers = new Map<MachineId, number[]>();
  private raycaster = new THREE.Raycaster();
  private trails: Trail[];
  private themes: Record<ZoneId, GrassTheme>;
  hooks: WorldHooks = {};
  private zoneAmbience: THREE.Group;
  private lavaMat = makeMaterial({ emissiveIntensity: 1.2 });

  constructor(
    private renderer: Renderer,
    private tweens: Tweens,
    state: GameState,
  ) {
    this.scene = renderer.scene;
    this.camera = renderer.camera;
    this.rig = new CameraRig(this.camera);
    this.fullGround.unlocked = { home: true, forge: true, geyser: true, sky: true };

    this.themes = this.themesFor(state.islandSeed);
    this.trails = this.makeTrails();

    for (const isl of ISLANDS) {
      const mesh = buildIslandMesh(isl, { theme: this.themes[isl.zone], trails: this.trails, rock: rockFor(isl.zone) });
      this.islandMeshes.set(isl.zone, mesh);
      this.scene.add(mesh);
    }

    this.decor = createDecor((x, z) => this.exclusionDistance(x, z), this.themes);
    this.decor.rebuild(this.themes, state.islandSeed);
    this.scene.add(this.decor.group);
    this.zoneAmbience = this.buildAmbience();
    this.scene.add(this.zoneAmbience);

    const h = (x: number, z: number) => this.fullGround.heightAt(x, z);
    this.nexus = new Nexus(NEXUS, h(NEXUS[0], NEXUS[1]));
    this.scene.add(this.nexus.group);
    this.crystal = new HarvestCrystal(MAIN_CRYSTAL, h(MAIN_CRYSTAL[0], MAIN_CRYSTAL[1]) - 0.1, tweens);
    this.scene.add(this.crystal.group);
    this.lighthouse = new Lighthouse(LIGHTHOUSE, h(LIGHTHOUSE[0], LIGHTHOUSE[1]));
    this.scene.add(this.lighthouse.group);
    this.beacon = new Beacon(tweens);
    this.scene.add(this.beacon.group);
    this.scene.add(this.particles.group);

    // Obstacles.
    this.ground.obstacles.push({ x: NEXUS[0], z: NEXUS[1], r: 2.5, zone: 'home', active: () => true });
    this.ground.obstacles.push({ x: MAIN_CRYSTAL[0], z: MAIN_CRYSTAL[1], r: 1.9, zone: 'home', active: () => true });
    this.ground.obstacles.push({ x: LIGHTHOUSE[0], z: LIGHTHOUSE[1], r: 2.9, zone: 'sky', active: () => true });

    // Machines.
    for (const id of MACHINE_ORDER) {
      const site = new MachineSite(id, SITES[id], h, this.machineMat, tweens);
      this.sites[id] = site;
      this.scene.add(site.group);
      site.slots.forEach((s, i) => this.ground.obstacles.push({ x: s.x, z: s.z, r: site.model.radius * 0.9, zone: MACHINES[id].zone, active: () => i < site.visible }));
      this.emitTimers.set(id, site.slots.map(() => Math.random() * 3));
    }

    // Signs.
    const signs: SignDef[] = [];
    const signColor: Record<MachineId, number> = { drill: PALETTE.crystal, excavator: PALETTE.crystal, refinery: PALETTE.lumen, geyser: PALETTE.crystal, prism: PALETTE.lumen };
    for (const id of MACHINE_ORDER) {
      const s = SITES[id];
      const yaw = Math.atan2(s.sign[0] - s.center[0], s.sign[1] - s.center[1]);
      signs.push({ at: s.sign, y: h(s.sign[0], s.sign[1]), color: signColor[id], yaw });
      this.ground.obstacles.push({ x: s.sign[0], z: s.sign[1], r: 0.35, zone: MACHINES[id].zone, active: () => true });
    }
    for (const b of BRIDGES) {
      const yaw = Math.atan2(b.sign[0] - b.from[0], b.sign[1] - b.from[1]);
      signs.push({ at: b.sign, y: h(b.sign[0], b.sign[1]), color: PALETTE.lumen, yaw });
      this.ground.obstacles.push({ x: b.sign[0], z: b.sign[1], r: 0.35, zone: 'home', active: () => true });
    }
    this.scene.add(buildSigns(signs));

    // Bridges.
    for (const b of BRIDGES) {
      const br = new Bridge(b, tweens);
      this.bridges.set(b.zone, br);
      this.scene.add(br.group);
    }

    // Conveyors.
    this.conveyors = new Conveyors(h);
    const arrive = (k: 'shards' | 'lumen') => () => {
      this.nexus.absorb();
      this.hooks.onArrive?.(k);
    };
    this.conveyors.add({ id: 'drill', pts: SITES.drill.route, color: PALETTE.crystal }, arrive('shards'));
    this.conveyors.add({ id: 'excavator', pts: SITES.excavator.route, color: PALETTE.crystal }, arrive('shards'));
    const forgeOut = offsetAlongBridge('forge', 1);
    const forgeIn = offsetAlongBridge('forge', -1);
    this.conveyors.add({ id: 'refinery-in', pts: [[1.8, -1.6], ...forgeIn.slice().reverse(), [SITES.refinery.center[0] - 2.2, SITES.refinery.center[1] + 0.8]], color: PALETTE.crystal }, () => this.sites.refinery.pulse(0));
    this.conveyors.add({ id: 'refinery-out', pts: [[SITES.refinery.center[0] - 2.4, SITES.refinery.center[1] + 2.2], ...forgeOut, [2.1, 0.6]], color: PALETTE.lumen }, arrive('lumen'));
    this.conveyors.add({ id: 'geyser', pts: [SITES.geyser.center, ...offsetAlongBridge('geyser', 1), [-2.1, -0.9]], color: PALETTE.crystal }, arrive('shards'));
    this.conveyors.add({ id: 'prism', pts: [SITES.prism.center, ...offsetAlongBridge('sky', 1), [0.9, -2.1]], color: PALETTE.lumen }, arrive('lumen'));
    this.scene.add(this.conveyors.group);

    // Interactables.
    const crystalCenter = this.crystal.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    this.interactables.push({ id: 'crystal', kind: 'crystal', anchor: this.crystal.position.clone().add(new THREE.Vector3(0, 3.8, 0)), range: RANGES.harvest, sphere: new THREE.Sphere(crystalCenter, 1.9), active: true });
    for (const id of MACHINE_ORDER) {
      const s = SITES[id];
      const anchor = new THREE.Vector3(s.sign[0], h(s.sign[0], s.sign[1]) + 2.6, s.sign[1]);
      const c = new THREE.Vector3(s.center[0], h(s.center[0], s.center[1]) + 1.5, s.center[1]);
      this.interactables.push({ id: `site:${id}`, kind: 'site', machine: id, zone: MACHINES[id].zone, anchor, range: RANGES.site, sphere: new THREE.Sphere(c, s.radius * 0.75), active: false });
    }
    for (const b of BRIDGES) {
      const anchor = new THREE.Vector3(b.sign[0], h(b.sign[0], b.sign[1]) + 2.6, b.sign[1]);
      this.interactables.push({ id: `bridge:${b.zone}`, kind: 'bridge', zone: b.zone, anchor, range: RANGES.bridge, sphere: new THREE.Sphere(anchor.clone().setY(anchor.y - 1), 1.6), active: false });
    }
    const lh = this.lighthouse.position.clone().add(new THREE.Vector3(0, 3, 0));
    this.interactables.push({ id: 'lighthouse', kind: 'lighthouse', zone: 'sky', anchor: lh.clone().setY(lh.y + 3), range: RANGES.lighthouse, sphere: new THREE.Sphere(lh, 3), active: false });

    // Player.
    this.scene.add(this.player.root);
    this.player.onStep = () => this.hooks.onStep?.();
    this.player.onLand = (p) => this.particles.smoke(p.clone().setY(p.y + 0.1), { count: 6, color: 0xf4e6d4, speed: 2.5, life: 0.5, size: 0.18, up: 0.5 });

    this.sync(state, null, false);
    // Restore the saved position only if it is still on solid ground.
    const okPos = this.ground.walkable(state.player.x, state.player.z);
    this.player.teleport(okPos ? state.player.x : SPAWN.x, okPos ? state.player.z : SPAWN.z, state.player.yaw, this.ground);
    this.rig.yaw = state.player.yaw;
    this.rig.target.copy(this.player.position).add(new THREE.Vector3(0, 1.3, 0));
    this.rig.snap();
  }

  private themesFor(seed: number): Record<ZoneId, GrassTheme> {
    return { home: HOME_SEASONS[(seed - 1) % HOME_SEASONS.length], forge: ZONE_GRASS.forge, geyser: ZONE_GRASS.geyser, sky: ZONE_GRASS.sky };
  }

  private makeTrails(): Trail[] {
    const t: Trail[] = [];
    for (const id of MACHINE_ORDER) t.push({ pts: SITES[id].route, width: 1.8 });
    for (const b of BRIDGES) {
      const toward = (p: [number, number, number], q: V2): V2 => [p[0], p[1]].map((v, i) => v + (q[i] - v) * 0) as V2;
      t.push({ pts: [NEXUS, toward(b.from, NEXUS)], width: 2.2 });
      const isl = ISLANDS.find((i) => i.zone === b.zone)!;
      t.push({ pts: [[b.to[0], b.to[1]], [isl.cx, isl.cz]], width: 2.2 });
    }
    t.push({ pts: [NEXUS, MAIN_CRYSTAL], width: 1.8 });
    t.push({ pts: [[0, 10.5], NEXUS], width: 1.8 });
    return t;
  }

  /** Distance from (x,z) to the nearest gameplay feature (decor avoids them). */
  private exclusionDistance(x: number, z: number): number {
    let d = Math.hypot(x - NEXUS[0], z - NEXUS[1]) - 3.2;
    d = Math.min(d, Math.hypot(x - MAIN_CRYSTAL[0], z - MAIN_CRYSTAL[1]) - 2.8);
    d = Math.min(d, Math.hypot(x - LIGHTHOUSE[0], z - LIGHTHOUSE[1]) - 3.4);
    for (const id of MACHINE_ORDER) {
      const s = SITES[id];
      for (const sl of s.slots) d = Math.min(d, Math.hypot(x - sl[0], z - sl[1]) - 1.7);
      d = Math.min(d, Math.hypot(x - s.sign[0], z - s.sign[1]) - 1.2);
    }
    for (const tr of this.trails) d = Math.min(d, distToPolyline(x, z, tr.pts) - tr.width * 0.6);
    for (const b of BRIDGES) {
      d = Math.min(d, Math.hypot(x - b.sign[0], z - b.sign[1]) - 1.2);
      d = Math.min(d, distToPolyline(x, z, [[b.from[0], b.from[1]], [b.to[0], b.to[1]]]) - b.width);
    }
    return d;
  }

  /** Zone-specific dressing: lava cracks, steaming pools, sky arches, crystal veins. */
  private buildAmbience(): THREE.Group {
    const g = new THREE.Group();
    const rand = mulberry32(404);
    // Glowing crystal vein under the drill site.
    const veins = [];
    const ds = SITES.drill;
    for (let i = 0; i < 14; i++) {
      const x = ds.center[0] + (rand() - 0.5) * 9.5;
      const z = ds.center[1] + (rand() - 0.5) * 6.5;
      const y = islandTopHeight(ISLANDS[0], x, z);
      veins.push(part(new THREE.OctahedronGeometry(0.12 + rand() * 0.12, 0), PALETTE.crystal, [x, y + 0.05, z], { emit: 0.45, scale: [1, 0.35, 2.2], rot: [0, rand() * 3, 0] }));
    }
    // Excavator site: rubble
    const es = SITES.excavator;
    for (let i = 0; i < 14; i++) {
      const x = es.center[0] + (rand() - 0.5) * 10;
      const z = es.center[1] + (rand() - 0.5) * 7;
      const y = islandTopHeight(ISLANDS[0], x, z);
      veins.push(part(jitter(new THREE.DodecahedronGeometry(0.22 + rand() * 0.2, 0), 0.1, i), i % 3 ? PALETTE.rock2 : PALETTE.crystal, [x, y + 0.05, z], { emit: i % 3 ? 0 : 0.8 }));
    }
    // Forge: lava cracks.
    const forge = ISLANDS[1];
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2;
      const d = forge.radius * (0.3 + rand() * 0.55);
      const x = forge.cx + Math.cos(a) * d;
      const z = forge.cz + Math.sin(a) * d;
      if (this.exclusionDistance(x, z) < 1) continue;
      const y = islandTopHeight(forge, x, z);
      veins.push(part(new THREE.CylinderGeometry(0.5 + rand() * 0.5, 0.6, 0.06, 6), PALETTE.lava, [x, y + 0.02, z], { emit: 1.1, scale: [1, 1, 0.6], rot: [0, rand() * 3, 0] }));
      veins.push(part(jitter(new THREE.DodecahedronGeometry(0.4, 0), 0.2, i), 0x5a4048, [x + 0.7, y + 0.1, z + 0.3], { scale: [1, 0.6, 1] }));
    }
    // Geyser: pools
    const gey = ISLANDS[2];
    for (let i = 0; i < 9; i++) {
      const a = rand() * Math.PI * 2;
      const d = gey.radius * (0.25 + rand() * 0.6);
      const x = gey.cx + Math.cos(a) * d;
      const z = gey.cz + Math.sin(a) * d;
      if (this.exclusionDistance(x, z) < 1.4) continue;
      const y = islandTopHeight(gey, x, z);
      veins.push(part(new THREE.CylinderGeometry(0.9, 0.9, 0.05, 8), 0x7fe9ff, [x, y + 0.03, z], { emit: 0.5 }));
      veins.push(part(jitter(new THREE.TorusGeometry(0.95, 0.18, 4, 8), 0.08, i), 0xa38f86, [x, y + 0.05, z], { rot: [Math.PI / 2, 0, 0] }));
    }
    // Sky: floating arches / stones.
    const sky = ISLANDS[3];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const d = sky.radius * 0.82;
      const x = sky.cx + Math.cos(a) * d;
      const z = sky.cz + Math.sin(a) * d;
      if (this.exclusionDistance(x, z) < 0.5) continue;
      const y = islandTopHeight(sky, x, z);
      veins.push(part(new THREE.CylinderGeometry(0.25, 0.32, 2.4, 6), 0xf1ebf7, [x, y + 1.2, z]));
      veins.push(part(new THREE.OctahedronGeometry(0.22, 0), PALETTE.seed, [x, y + 2.7, z], { emit: 1.2 }));
    }
    const m = new THREE.Mesh(build(veins), this.lavaMat);
    m.receiveShadow = true;
    m.castShadow = true;
    g.add(m);

    // Crystal clusters scattered (instanced) for sparkle.
    const clusterGeo = build([
      part(new THREE.OctahedronGeometry(0.3, 0), PALETTE.crystal, [0, 0.35, 0], { scale: [0.6, 1.7, 0.6], emit: 0.9 }),
      part(new THREE.OctahedronGeometry(0.2, 0), 0x8ff7ff, [0.25, 0.2, 0.1], { scale: [0.6, 1.5, 0.6], rot: [0, 0, -0.5], emit: 0.9 }),
      part(new THREE.OctahedronGeometry(0.18, 0), PALETTE.crystal, [-0.2, 0.18, -0.1], { scale: [0.6, 1.4, 0.6], rot: [0.4, 0, 0.5], emit: 0.9 }),
    ]);
    const clusters = instanced(clusterGeo, this.lavaMat, 40);
    let n = 0;
    for (const isl of ISLANDS) {
      for (let i = 0; i < 8; i++) {
        const a = rand() * Math.PI * 2;
        const d = isl.radius * (0.4 + rand() * 0.5);
        const x = isl.cx + Math.cos(a) * d;
        const z = isl.cz + Math.sin(a) * d;
        if (this.exclusionDistance(x, z) < 1) continue;
        tmpObj.position.set(x, islandTopHeight(isl, x, z) - 0.05, z);
        tmpObj.rotation.set(0, rand() * 6, 0);
        tmpObj.scale.setScalar(0.8 + rand() * 0.9);
        tmpObj.updateMatrix();
        const col = new THREE.Color(isl.zone === 'sky' ? PALETTE.seed : isl.zone === 'forge' ? PALETTE.lumen : 0xffffff);
        clusters.setMatrixAt(n, tmpObj.matrix);
        clusters.setColorAt(n, col);
        n++;
      }
    }
    clusters.count = n;
    g.add(clusters);
    return g;
  }

  /** Rebuild island colours & decor (new season after prestige). */
  regrow(seed: number): void {
    this.themes = this.themesFor(seed);
    const home = ISLANDS[0];
    const old = this.islandMeshes.get('home')!;
    const mesh = buildIslandMesh(home, { theme: this.themes.home, trails: this.trails });
    this.scene.remove(old);
    old.geometry.dispose();
    this.islandMeshes.set('home', mesh);
    this.scene.add(mesh);
    this.decor.rebuild(this.themes, seed);
  }

  /** Islands of the archipelago (for the prestige animation). */
  islandGroup(): THREE.Object3D[] {
    return [...this.islandMeshes.values()];
  }

  sync(state: GameState, rates: Rates | null, animate: boolean): { spawned: { machine: MachineId; index: number }[] } {
    const spawned: { machine: MachineId; index: number }[] = [];
    for (const id of MACHINE_ORDER) {
      const site = this.sites[id];
      const n = state.machines[id];
      const tier = Math.round(Math.log2(milestoneMult(n)));
      const before = site.count;
      for (const i of site.setCount(n, tier, animate)) spawned.push({ machine: id, index: i });
      if (animate && n > before && n > site.slots.length) site.pulseAll();
      site.open = state.zones[MACHINES[id].zone];
    }
    let prevOpen = true;
    for (const b of BRIDGES) {
      const br = this.bridges.get(b.zone)!;
      const built = state.zones[b.zone];
      if (built && !br.built) {
        if (animate) br.setBuilt(() => this.onPlank(br));
        else br.setBuilt();
      }
      br.available = prevOpen && !built;
      prevOpen = built;
    }
    this.ground.unlocked = { ...state.zones };

    // Interactables.
    for (const it of this.interactables) {
      if (it.kind === 'site') it.active = state.zones[it.zone!];
      if (it.kind === 'bridge') it.active = this.bridges.get(it.zone!)!.available;
      if (it.kind === 'lighthouse') it.active = state.zones.sky;
    }

    // Conveyor flows (visual density from production rates).
    if (rates) {
      const pm = rates.perMachine;
      const flow = (v: number) => (v <= 0 ? 0 : Math.min(4.5, 0.35 + Math.log10(1 + v) * 0.9));
      const setBelt = (id: string, on: boolean, v: number) => {
        this.conveyors.setVisible(id, on);
        this.conveyors.setRate(id, on ? flow(v) : 0);
      };
      setBelt('drill', state.machines.drill > 0, pm.drill.shards);
      setBelt('excavator', state.machines.excavator > 0, pm.excavator.shards);
      setBelt('refinery-in', state.machines.refinery > 0, pm.refinery.processed);
      setBelt('refinery-out', state.machines.refinery > 0, pm.refinery.lumen * 10);
      setBelt('geyser', state.machines.geyser > 0, pm.geyser.shards);
      setBelt('prism', state.machines.prism > 0, pm.prism.lumen * 10 + pm.prism.shards * 0.1);
      const total = rates.shardsGross + rates.lumen * 10;
      this.nexus.activity = Math.min(1, Math.log10(1 + total) / 5);
      this.nexus.hasLumen = state.lumen > 0 || rates.lumen > 0;
      let speed = 1.8;
      for (const id of ['belt1', 'belt2', 'belt3']) if (state.upgrades[id]) speed *= 1.3;
      this.conveyors.speed = speed;
    }
    return { spawned };
  }

  private onPlank(br: Bridge): void {
    this.hooks.onPlank?.();
    const p = br.midpoint;
    this.particles.smoke(p, { count: 2, color: 0xf4e6d4, speed: 1.5, life: 0.6, size: 0.25 });
  }

  /** Effects when a machine appears. */
  spawnFx(machine: MachineId, index: number): void {
    const site = this.sites[machine];
    const p = site.slotPosition(index);
    this.particles.smoke(p.clone().setY(p.y + 0.2), { count: 12, color: 0xf6e8d6, speed: 4.5, life: 0.7, size: 0.2, up: 0.4, spread: 0.25, grow: 1.2 });
    this.particles.sparks(p.clone().setY(p.y + 1.2), { count: 26, color: PALETTE.crystal, speed: 6, life: 0.9, size: 0.1, up: 3 });
    this.rig.shake(0.35);
  }

  /** Resolve a click to an interactable (ray vs. spheres). */
  pick(clientX: number, clientY: number): Interactable | null {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const it of this.interactables) {
      if (!it.active) continue;
      const hit = this.raycaster.ray.intersectSphere(it.sphere, new THREE.Vector3());
      if (hit) {
        const d = hit.distanceTo(this.camera.position);
        if (d < bestD) {
          bestD = d;
          best = it;
        }
      }
    }
    return best;
  }

  /** Nearest interactable within its range of the player. */
  nearest(): Interactable | null {
    let best: Interactable | null = null;
    let bestD = Infinity;
    const p = this.player.position;
    for (const it of this.interactables) {
      if (!it.active) continue;
      const d = this.distanceTo(it, p);
      if (d < it.range && d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  distanceTo(it: Interactable, p: THREE.Vector3): number {
    if (it.kind === 'site') {
      // Distance to the sign or to any visible machine / ghost of the site.
      const s = SITES[it.machine!];
      let d = Math.hypot(p.x - s.sign[0], p.z - s.sign[1]);
      const site = this.sites[it.machine!];
      const n = Math.min(site.slots.length, site.visible + 1);
      for (let i = 0; i < n; i++) d = Math.min(d, Math.hypot(p.x - site.slots[i].x, p.z - site.slots[i].z) - site.model.radius * 0.6);
      return d;
    }
    if (it.kind === 'crystal') return Math.hypot(p.x - this.crystal.position.x, p.z - this.crystal.position.z) - 1.2;
    if (it.kind === 'lighthouse') return Math.hypot(p.x - this.lighthouse.position.x, p.z - this.lighthouse.position.z) - 2.6;
    return Math.hypot(p.x - it.anchor.x, p.z - it.anchor.z);
  }

  /** World position used by objective beacons. */
  beaconTarget(kind: 'crystal' | 'site' | 'bridge' | 'lighthouse', key?: string): THREE.Vector3 {
    if (kind === 'crystal') return this.crystal.position.clone();
    if (kind === 'site') {
      const site = this.sites[key as MachineId];
      const g = site.nextGhostIndex;
      return g >= 0 ? site.slotPosition(g) : new THREE.Vector3(SITES[key as MachineId].sign[0], 0, SITES[key as MachineId].sign[1]).setY(this.fullGround.heightAt(SITES[key as MachineId].sign[0], SITES[key as MachineId].sign[1]));
    }
    if (kind === 'bridge') {
      const b = BRIDGES.find((x) => x.zone === key)!;
      return new THREE.Vector3(b.sign[0], this.fullGround.heightAt(b.sign[0], b.sign[1]), b.sign[1]);
    }
    return this.lighthouse.position.clone();
  }

  project(v: THREE.Vector3, out: { x: number; y: number; visible: boolean }): void {
    const p = v.clone().project(this.camera);
    out.visible = p.z < 1 && p.z > -1;
    out.x = (p.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-p.y * 0.5 + 0.5) * window.innerHeight;
  }

  /** Strike the crystal: visual + particles. */
  harvestFx(value: number): void {
    this.crystal.hit();
    const hp = this.crystal.hitPoint.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.6, (Math.random() - 0.5) * 0.6));
    const big = Math.min(1, Math.log10(1 + value) / 4);
    this.particles.sparks(hp, { count: 10 + Math.round(big * 14), color: PALETTE.crystal, speed: 5 + big * 3, life: 0.7, size: 0.09 + big * 0.05, up: 2.5 });
    this.particles.sparks(hp, { count: 4, color: 0xffffff, speed: 3, life: 0.4, size: 0.06, up: 1 });
    this.rig.shake(0.12);
    this.player.strike(this.crystal.position);
  }

  update(dt: number, state: GameState): void {
    this.time += dt;
    const t = this.time;
    this.decor.update(dt, t, this.camera.position, this.player.position);
    this.crystal.update(dt, t);
    this.nexus.update(dt, t);
    this.lighthouse.update(dt, t);
    this.beacon.update(t);
    for (const b of this.bridges.values()) b.update(t);
    for (const id of MACHINE_ORDER) {
      const site = this.sites[id];
      site.update(t, 1 + site.tier * 0.15);
      this.machineEmit(id, site, dt, state);
    }
    this.conveyors.update(dt);
    this.particles.update(dt);
    this.renderer.focusShadows(this.player.position);
  }

  /** Each machine periodically throws a glowing shard onto its belt; smoke from vents. */
  private machineEmit(id: MachineId, site: MachineSite, dt: number, _state: GameState): void {
    const timers = this.emitTimers.get(id)!;
    const beltId = id === 'refinery' ? 'refinery-out' : id;
    for (let i = 0; i < site.visible; i++) {
      timers[i] -= dt;
      if (timers[i] > 0) continue;
      timers[i] = 2.2 + Math.random() * 2.4 - Math.min(1.2, site.tier * 0.3);
      const from = site.outletOf(i);
      const to = this.conveyors.startOf(beltId);
      if (to && id !== 'refinery') {
        const T = 0.75;
        const g = 14;
        const v = new THREE.Vector3((to.x - from.x) / T, (to.y + 0.3 - from.y + 0.5 * g * T * T) / T, (to.z - from.z) / T);
        this.particles.sparks(from, { count: 1, color: id === 'prism' ? PALETTE.lumen : PALETTE.crystal, speed: 0, dir: v, gravity: g, drag: 0, life: T, size: 0.13 });
      }
      this.particles.sparks(from, { count: 3, color: id === 'prism' || id === 'refinery' ? PALETTE.lumen : PALETTE.crystal, speed: 2, life: 0.45, size: 0.05, up: 1.2 });
      const vent = site.ventOf(i);
      if (vent) this.particles.smoke(vent, { count: id === 'geyser' ? 4 : 2, color: id === 'geyser' ? 0xe8fbff : 0xd8d0d8, speed: 0.6, up: id === 'geyser' ? 2.5 : 1.2, life: 1.8, size: 0.25, spread: 0.2 });
      if (id === 'geyser') this.particles.sparks(vent ?? from, { count: 6, color: 0xbaf6ff, speed: 1.5, up: 5, life: 0.9, size: 0.08, gravity: 4 });
    }
  }

  /** Cinematic "island descends" animation used by prestige. */
  async descend(): Promise<void> {
    const objs = this.islandGroup();
    const all: THREE.Object3D[] = [...objs, this.decor.group, this.zoneAmbience, this.nexus.group, this.crystal.group, this.lighthouse.group, this.conveyors.group, ...Object.values(this.sites).map((s) => s.group), ...[...this.bridges.values()].map((b) => b.group)];
    const start = all.map((o) => o.position.y);
    this.rig.shake(0.6);
    await new Promise<void>((resolve) =>
      this.tweens.add(
        2.6,
        (v) => {
          all.forEach((o, i) => (o.position.y = start[i] - v * 60));
          this.rig.shake(0.05);
        },
        { ease: Ease.inCubic, done: resolve },
      ),
    );
  }

  async rise(): Promise<void> {
    const all: THREE.Object3D[] = [...this.islandGroup(), this.decor.group, this.zoneAmbience, this.nexus.group, this.crystal.group, this.lighthouse.group, this.conveyors.group, ...Object.values(this.sites).map((s) => s.group), ...[...this.bridges.values()].map((b) => b.group)];
    all.forEach((o) => (o.position.y = o === this.nexus.group ? this.nexus.position.y - 60 : o === this.crystal.group ? this.crystal.position.y - 60 : o === this.lighthouse.group ? this.lighthouse.position.y - 60 : -60));
    const targets = all.map((o) => (o === this.nexus.group ? this.nexus.position.y : o === this.crystal.group ? this.crystal.position.y : o === this.lighthouse.group ? this.lighthouse.position.y : 0));
    const start = all.map((o) => o.position.y);
    await new Promise<void>((resolve) =>
      this.tweens.add(
        3,
        (v) => all.forEach((o, i) => (o.position.y = start[i] + (targets[i] - start[i]) * v)),
        { ease: Ease.outCubic, done: resolve },
      ),
    );
  }

  /** Reset bridges & machines after prestige (no animation). */
  resetForNewIsland(state: GameState): void {
    for (const [zone, br] of this.bridges) {
      if (!state.zones[zone]) {
        this.scene.remove(br.group);
        const nb = new Bridge(br.layout, this.tweens);
        this.bridges.set(zone, nb);
        this.scene.add(nb.group);
      }
    }
    for (const id of MACHINE_ORDER) this.sites[id].setCount(0, 0, false);
    this.sync(state, computeRates(state), false);
    this.conveyors.prefill();
  }
}

function rockFor(zone: ZoneId): [number, number, number] | undefined {
  if (zone === 'forge') return [0x9a6a5a, 0x6e4848, 0x4a3240];
  if (zone === 'geyser') return [0xb9a28f, 0x8a7a72, 0x5e5560];
  if (zone === 'sky') return [0xe9e1f2, 0xbfb0dc, 0x8f7fb8];
  return undefined;
}
