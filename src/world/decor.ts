/**
 * Scenery: trees, rocks, grass tufts, flowers, hanging rocks, floating debris and
 * the sea of clouds. Everything is instanced: a handful of draw calls in total.
 */
import * as THREE from 'three';
import { ISLANDS, type IslandLayout } from '../config/world';
import { PALETTE, type GrassTheme } from '../config/palette';
import { mulberry32 } from '../core/noise';
import { build, GLOBAL_TIME, instanced, jitter, makeMaterial, part, tmpObj } from './geom';
import { islandRadiusAt, islandTopHeight } from './terrain';

export type Exclusion = (x: number, z: number) => number; // returns distance to nearest gameplay feature

function treeRoundGeo(): THREE.BufferGeometry {
  return build([
    part(jitter(new THREE.IcosahedronGeometry(1, 0), 0.25, 1), 0xffffff, [0, 2.0, 0], { scale: [1.15, 1, 1.15] }),
    part(jitter(new THREE.IcosahedronGeometry(0.8, 0), 0.2, 2), 0xf2f2f2, [0.45, 2.7, 0.2]),
    part(jitter(new THREE.IcosahedronGeometry(0.65, 0), 0.2, 3), 0xe6e6e6, [-0.4, 2.55, -0.3]),
  ]);
}

function treePineGeo(): THREE.BufferGeometry {
  return build([
    part(new THREE.ConeGeometry(1.25, 1.5, 6), 0xe9e9e9, [0, 1.5, 0]),
    part(new THREE.ConeGeometry(1.0, 1.3, 6), 0xf6f6f6, [0, 2.3, 0], { rot: [0, 0.4, 0] }),
    part(new THREE.ConeGeometry(0.7, 1.1, 6), 0xffffff, [0, 3.0, 0], { rot: [0, 0.8, 0] }),
  ]);
}

function trunkGeo(): THREE.BufferGeometry {
  return build([part(new THREE.CylinderGeometry(0.14, 0.22, 1.6, 5), PALETTE.woodDark, [0, 0.8, 0])]);
}

function rockGeo(seed: number): THREE.BufferGeometry {
  return build([
    part(jitter(new THREE.DodecahedronGeometry(0.6, 0), 0.3, seed), PALETTE.rock1, [0, 0.25, 0], { scale: [1, 0.7, 1] }),
    part(jitter(new THREE.DodecahedronGeometry(0.35, 0), 0.2, seed + 1), PALETTE.rock2, [0.5, 0.12, 0.2], { scale: [1, 0.7, 1] }),
  ]);
}

function tuftGeo(): THREE.BufferGeometry {
  const blade = new THREE.ConeGeometry(0.07, 0.55, 3);
  return build([
    part(blade, 0xffffff, [0, 0.27, 0], { rot: [0.15, 0, 0.1] }),
    part(blade, 0xeeeeee, [0.12, 0.22, 0.05], { rot: [-0.1, 0, -0.35], scale: 0.85 }),
    part(blade, 0xf4f4f4, [-0.1, 0.22, -0.06], { rot: [0.2, 0, 0.35], scale: 0.8 }),
    part(blade, 0xe2e2e2, [0.02, 0.2, -0.12], { rot: [0.4, 0, 0], scale: 0.75 }),
  ]);
}

function flowerGeo(): THREE.BufferGeometry {
  return build([
    part(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 3), 0x5b8a3c, [0, 0.2, 0]),
    part(new THREE.IcosahedronGeometry(0.11, 0), 0xffffff, [0, 0.42, 0], { emit: 0.15 }),
  ]);
}

function cloudGeo(seed: number): THREE.BufferGeometry {
  const r = mulberry32(seed);
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const sc = 0.6 + r() * 0.7;
    parts.push(
      part(jitter(new THREE.IcosahedronGeometry(1, 1), 0.15, seed + i), 0xffffff, [(r() - 0.5) * 3.2, (r() - 0.3) * 0.6, (r() - 0.5) * 1.6], {
        scale: [sc * 1.2, sc * 0.75, sc],
      }),
    );
  }
  return build(parts);
}

function hangingRockGeo(seed: number): THREE.BufferGeometry {
  return build([
    part(jitter(new THREE.ConeGeometry(1, 3, 5), 0.3, seed), PALETTE.rock2, [0, -1.5, 0], { rot: [Math.PI, 0, 0] }),
    part(jitter(new THREE.DodecahedronGeometry(0.8, 0), 0.3, seed + 4), PALETTE.rock1, [0, 0, 0], { scale: [1.1, 0.6, 1.1] }),
  ]);
}

interface Placement {
  x: number;
  y: number;
  z: number;
  s: number;
  r: number;
  color?: THREE.Color;
}

export interface DecorHandle {
  group: THREE.Group;
  update(dt: number, time: number, cam: THREE.Vector3, focus: THREE.Vector3): void;
  rebuild(themes: Record<string, GrassTheme>, variant?: number): void;
}

export function createDecor(exclusion: Exclusion, themes: Record<string, GrassTheme>): DecorHandle {
  const group = new THREE.Group();
  const leafMat = makeMaterial({ roughness: 0.85, wind: 0.035 });
  const grassMat = makeMaterial({ roughness: 0.85, wind: 0.5 });
  const solidMat = makeMaterial({ roughness: 0.95 });
  const flowerMat = makeMaterial({ roughness: 0.6, emissiveIntensity: 1.2 });
  const cloudMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, emissive: 0xffe4d6, emissiveIntensity: 0.12, fog: true, color: 0xf7ece8 });

  const MAX_TREES = 140;
  const round = instanced(treeRoundGeo(), leafMat, MAX_TREES);
  const pine = instanced(treePineGeo(), leafMat, MAX_TREES);
  const trunks = instanced(trunkGeo(), solidMat, MAX_TREES * 2);
  const rocks = instanced(rockGeo(5), solidMat, 160);
  const tufts = instanced(tuftGeo(), grassMat, 900, false);
  const flowers = instanced(flowerGeo(), flowerMat, 500, false);
  // Clouds breathe and drift up and down (vertex shader, no per-frame CPU work).
  cloudMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = GLOBAL_TIME;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 cp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float w = sin(uTime * 0.35 + cp.x * 0.04 + cp.z * 0.03);
        transformed *= 1.0 + 0.05 * sin(uTime * 0.5 + cp.z * 0.07);
        transformed.y += w * 0.18 + sin(uTime * 0.9 + position.x * 0.9 + cp.x) * 0.05;`,
      );
  };
  const hanging = instanced(hangingRockGeo(9), solidMat, 60);
  const floaters = instanced(jitter(new THREE.DodecahedronGeometry(1, 0), 0.4, 77), solidMat, 40);
  floaters.geometry = build([part(floaters.geometry, PALETTE.rock1)]);
  [round, pine, trunks, rocks, tufts, flowers, hanging, floaters].forEach((m) => group.add(m));

  // --- Sea of clouds (static) + drifting clouds ---------------------------------
  const cloudSea = instanced(cloudGeo(3), cloudMat, 220, false);
  cloudSea.receiveShadow = false;
  const rc = mulberry32(99);
  const seaClouds: { x: number; y: number; z: number; s: number; r: number; speed: number }[] = [];
  for (let i = 0; i < 220; i++) {
    const a = rc() * Math.PI * 2;
    const high = i < 30;
    const d = high ? 75 + rc() * 170 : 28 + Math.pow(rc(), 0.7) * 230;
    seaClouds.push({
      x: Math.cos(a) * d,
      z: Math.sin(a) * d - 15,
      y: high ? 2 + rc() * 18 : -46 - rc() * 14 + d * 0.05,
      s: high ? 2 + rc() * 2.5 : 5 + rc() * 7,
      r: rc() * Math.PI,
      speed: (high ? 1.2 : 0.4) * (0.5 + rc()),
    });
  }
  cloudSea.count = seaClouds.length;
  cloudSea.frustumCulled = false;
  floaters.frustumCulled = false;
  group.add(cloudSea);

  const fill = (mesh: THREE.InstancedMesh, list: Placement[], tilt = 0) => {
    mesh.count = Math.min(list.length, mesh.instanceMatrix.count);
    for (let i = 0; i < mesh.count; i++) {
      const p = list[i];
      tmpObj.position.set(p.x, p.y, p.z);
      tmpObj.rotation.set(tilt ? (Math.sin(p.r * 7) * tilt) : 0, p.r, tilt ? Math.cos(p.r * 5) * tilt : 0);
      tmpObj.scale.setScalar(p.s);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
      if (p.color) mesh.setColorAt(i, p.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  };

  function scatter(isl: IslandLayout, rand: () => number, n: number, minR: number, maxR: number, clearance: number, out: (x: number, z: number, y: number) => void) {
    let tries = 0;
    let placed = 0;
    while (placed < n && tries < n * 30) {
      tries++;
      const a = rand() * Math.PI * 2;
      const R = islandRadiusAt(isl, a);
      const d = Math.sqrt(minR * minR + rand() * (maxR * maxR - minR * minR)) * R;
      const x = isl.cx + Math.cos(a) * d;
      const z = isl.cz + Math.sin(a) * d;
      if (exclusion(x, z) < clearance) continue;
      out(x, z, islandTopHeight(isl, x, z));
      placed++;
    }
  }

  function rebuild(th: Record<string, GrassTheme>, variant = 0) {
    const treesR: Placement[] = [];
    const treesP: Placement[] = [];
    const trunkL: Placement[] = [];
    const rockL: Placement[] = [];
    const tuftL: Placement[] = [];
    const flowerL: Placement[] = [];
    const hangL: Placement[] = [];
    const floatL: Placement[] = [];
    for (const isl of ISLANDS) {
      const theme = th[isl.zone];
      const rand = mulberry32(isl.seed * 31 + variant * 7919);
      const leafCols = theme.leaf.map((c) => new THREE.Color(c));
      const area = (isl.radius * isl.radius) / (17 * 17);
      const nTrees = Math.round((isl.zone === 'sky' ? 14 : 30) * area);
      scatter(isl, rand, nTrees, 0.5, 0.9, 2.6, (x, z, y) => {
        const s = 0.75 + rand() * 0.6;
        const p = { x, y: y - 0.05, z, s, r: rand() * 6.28, color: leafCols[Math.floor(rand() * leafCols.length)].clone().offsetHSL(0, 0, (rand() - 0.5) * 0.08) };
        (rand() < (isl.zone === 'geyser' || isl.zone === 'forge' ? 0.6 : 0.35) ? treesP : treesR).push(p);
        trunkL.push({ ...p, color: undefined });
      });
      scatter(isl, rand, Math.round(18 * area), 0.2, 0.95, 1.6, (x, z, y) => rockL.push({ x, y: y - 0.1, z, s: 0.6 + rand() * 1.1, r: rand() * 6.28 }));
      const grassCol = new THREE.Color(theme.grassLight);
      scatter(isl, rand, Math.round(220 * area), 0.05, 0.97, 0.9, (x, z, y) =>
        tuftL.push({ x, y: y - 0.04, z, s: 0.7 + rand() * 0.7, r: rand() * 6.28, color: grassCol.clone().offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.1) }),
      );
      const fcols = [PALETTE.flowerA, PALETTE.flowerB, PALETTE.flowerC].map((c) => new THREE.Color(c));
      scatter(isl, rand, Math.round(110 * area), 0.1, 0.95, 1.0, (x, z, y) => flowerL.push({ x, y, z, s: 0.8 + rand() * 0.6, r: rand() * 6.28, color: fcols[Math.floor(rand() * 3)] }));

      // Hanging rocks under the island rim.
      for (let i = 0; i < Math.round(10 * Math.sqrt(area)); i++) {
        const a = rand() * Math.PI * 2;
        const d = islandRadiusAt(isl, a) * (0.45 + rand() * 0.35);
        hangL.push({ x: isl.cx + Math.cos(a) * d, y: isl.y - 1.6 - isl.depth * (0.15 + rand() * 0.35), z: isl.cz + Math.sin(a) * d, s: 0.8 + rand() * 1.2, r: rand() * 6.28 });
      }
      // Floating debris around the island.
      for (let i = 0; i < 6; i++) {
        const a = rand() * Math.PI * 2;
        const d = isl.radius * (1.25 + rand() * 0.6);
        floatL.push({ x: isl.cx + Math.cos(a) * d, y: isl.y - 3 - rand() * 8, z: isl.cz + Math.sin(a) * d, s: 0.5 + rand() * 1.3, r: rand() * 6.28 });
      }
    }
    fill(round, treesR);
    fill(pine, treesP);
    fill(trunks, trunkL);
    treeSets = [
      { mesh: round, list: treesR, k: treesR.map(() => 1) },
      { mesh: pine, list: treesP, k: treesP.map(() => 1) },
    ];
    trunkIndex = new Map(trunkL.map((t, i) => [`${t.x},${t.z}`, i]));
    fill(rocks, rockL);
    fill(tufts, tuftL, 0.15);
    fill(flowers, flowerL, 0.12);
    fill(hanging, hangL);
    fill(floaters, floatL);
    floatBase = floatL;
  }

  let floatBase: Placement[] = [];
  let treeSets: { mesh: THREE.InstancedMesh; list: Placement[]; k: number[] }[] = [];
  let trunkIndex = new Map<string, number>();
  rebuild(themes);

  return {
    group,
    rebuild,
    update(dt, time, cam, focus) {
      const sx = focus.x - cam.x;
      const sz = focus.z - cam.z;
      const sl = sx * sx + sz * sz || 1;
      // Trees between the camera and the player shrink away so they never hide the action.
      for (const set of treeSets) {
        let changed = false;
        for (let i = 0; i < set.list.length; i++) {
          const p = set.list[i];
          // Distance from the tree to the camera→player segment (XZ).
          let u = ((p.x - cam.x) * sx + (p.z - cam.z) * sz) / sl;
          u = Math.max(0, Math.min(1, u));
          const d = Math.hypot(p.x - (cam.x + sx * u), p.z - (cam.z + sz * u));
          const want = d < 1.6 + p.s * 1.3 && u < 0.92 && cam.y < p.y + 9 ? 0 : 1;
          const k = set.k[i];
          if (Math.abs(k - want) < 0.001) continue;
          set.k[i] = want > k ? Math.min(1, k + dt * 3) : Math.max(0, k - dt * 5);
          changed = true;
          const s = Math.max(0.0001, p.s * set.k[i]);
          tmpObj.position.set(p.x, p.y, p.z);
          tmpObj.rotation.set(0, p.r, 0);
          tmpObj.scale.set(s, s, s);
          tmpObj.updateMatrix();
          set.mesh.setMatrixAt(i, tmpObj.matrix);
          const ti = trunkIndex.get(`${p.x},${p.z}`);
          if (ti !== undefined) trunks.setMatrixAt(ti, tmpObj.matrix);
        }
        if (changed) {
          set.mesh.instanceMatrix.needsUpdate = true;
          trunks.instanceMatrix.needsUpdate = true;
        }
      }
      // Drift clouds slowly.
      for (let i = 0; i < seaClouds.length; i++) {
        const c = seaClouds[i];
        c.x += c.speed * dt;
        if (c.x > 260) c.x = -260;
        tmpObj.position.set(c.x, c.y + Math.sin(time * 0.2 + i) * 0.3, c.z);
        tmpObj.rotation.set(0, c.r, 0);
        tmpObj.scale.setScalar(c.s);
        tmpObj.updateMatrix();
        cloudSea.setMatrixAt(i, tmpObj.matrix);
      }
      cloudSea.instanceMatrix.needsUpdate = true;
      // Bob floating rocks.
      for (let i = 0; i < floatBase.length; i++) {
        const p = floatBase[i];
        tmpObj.position.set(p.x, p.y + Math.sin(time * 0.6 + i * 1.7) * 0.4, p.z);
        tmpObj.rotation.set(0, p.r + time * 0.05, 0);
        tmpObj.scale.setScalar(p.s);
        tmpObj.updateMatrix();
        floaters.setMatrixAt(i, tmpObj.matrix);
      }
      floaters.instanceMatrix.needsUpdate = true;
    },
  };
}
