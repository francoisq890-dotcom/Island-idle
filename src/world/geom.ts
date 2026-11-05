/** Helpers to author low-poly models in code: coloured primitives merged into one geometry. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/noise';

export interface Part {
  geo: THREE.BufferGeometry;
  color: THREE.ColorRepresentation;
  /** Optional transform. */
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number] | number;
  /** Extra emissive strength baked in the "emit" attribute (0..1+). */
  emit?: number;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const s = new THREE.Vector3();

export function part(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, pos?: [number, number, number], opts: Partial<Part> = {}): Part {
  return { geo, color, pos, ...opts };
}

/** Merge coloured parts into a single non-indexed, flat-shaded geometry with a `color` attribute. */
export function build(parts: Part[]): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  const c = new THREE.Color();
  for (const p of parts) {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    e.set(...(p.rot ?? [0, 0, 0]));
    q.setFromEuler(e);
    v.set(...(p.pos ?? [0, 0, 0]));
    if (typeof p.scale === 'number') s.setScalar(p.scale);
    else s.set(...(p.scale ?? [1, 1, 1]));
    m4.compose(v, q, s);
    g.applyMatrix4(m4);
    c.set(p.color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const emit = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      emit[i] = p.emit ?? 0;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('emit', new THREE.BufferAttribute(emit, 1));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false)!;
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/** Randomly displace vertices for an organic low-poly look (welds shared vertices first). */
export function jitter(geo: THREE.BufferGeometry, amount: number, seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const pos = geo.attributes.position;
  const map = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let d = map.get(key);
    if (!d) {
      d = [(rand() - 0.5) * amount, (rand() - 0.5) * amount, (rand() - 0.5) * amount];
      map.set(key, d);
    }
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  pos.needsUpdate = true;
  return geo;
}

/**
 * Standard flat-shaded material that reads the `color` attribute and an `emit`
 * attribute (per-vertex emissive mask) so glowing parts bloom.
 */
/** Shared uniform: glow multiplier for every emissive part (raised at night). */
export const GLOBAL_EMIT = { value: 1 };
/** Shared uniform: seconds, for animated shaders (wind, shimmer, clouds). */
export const GLOBAL_TIME = { value: 0 };
/** Shared uniform: wind strength (0 = off, "Économie" quality). */
export const GLOBAL_WIND = { value: 1 };

export interface MaterialOptions {
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  /** Vertices sway with the wind, proportionally to their height (leaves, grass). */
  wind?: number;
  /** Crystal look: fresnel rim and slow light bands moving inside the emissive parts. */
  shimmer?: boolean;
}

export function makeMaterial(opts: MaterialOptions = {}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: opts.roughness ?? 0.75,
    metalness: opts.metalness ?? 0.05,
  });
  const emissiveIntensity = opts.emissiveIntensity ?? 2.5;
  const wind = opts.wind ?? 0;
  const shimmer = !!opts.shimmer;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uEmitBoost = { value: emissiveIntensity };
    shader.uniforms.uGlobalEmit = GLOBAL_EMIT;
    shader.uniforms.uTime = GLOBAL_TIME;
    shader.uniforms.uWind = GLOBAL_WIND;
    mat.userData.shader = shader;
    let vs = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float emit;\nvarying float vEmit;\nvarying vec3 vWorldP;\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = emit;');
    if (wind > 0) {
      // Sway: phase from the instance position, amplitude grows with the height of the vertex.
      vs = vs.replace(
        '#include <begin_vertex>\nvEmit = emit;',
        `#include <begin_vertex>\nvEmit = emit;
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float h = max(0.0, position.y);
        float ph = uTime * 1.6 + ip.x * 0.31 + ip.z * 0.23;
        float gust = 0.6 + 0.4 * sin(uTime * 0.37 + ip.x * 0.05);
        transformed.x += sin(ph) * ${wind.toFixed(3)} * h * h * gust * uWind;
        transformed.z += cos(ph * 0.83) * ${(wind * 0.6).toFixed(3)} * h * h * gust * uWind;`,
      );
    }
    vs = vs.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvec4 wpP = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nwpP = instanceMatrix * wpP;\n#endif\nvWorldP = (modelMatrix * wpP).xyz;');
    shader.vertexShader = vs;
    let fs = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vEmit;\nvarying vec3 vWorldP;\nuniform float uEmitBoost;\nuniform float uGlobalEmit;\nuniform float uTime;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vEmit * uEmitBoost * uGlobalEmit;\ndiffuseColor.rgb *= 1.0 - min(vEmit, 1.0) * 0.75;');
    if (shimmer) {
      // Crystal: rim light + bands of light drifting up through the emissive faces.
      fs = fs.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rim = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.0);
        float band = smoothstep(0.75, 1.0, sin(vWorldP.y * 5.0 - uTime * 2.2 + vWorldP.x * 1.3));
        float spark = step(0.985, fract(sin(dot(floor(vWorldP * 9.0), vec3(12.9898, 78.233, 37.719)) + floor(uTime * 6.0)) * 43758.5453));
        totalEmissiveRadiance += diffuseColor.rgb * vEmit * (rim * 0.45 + band * 0.35 + spark * 1.2) * uGlobalEmit;`,
      );
    }
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => 'emit' + emissiveIntensity + '|w' + wind + (shimmer ? 's' : '');
  return mat;
}

/** Convenience: instanced mesh with shadows. */
export function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, count: number, shadows = true): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
  m.castShadow = shadows;
  m.receiveShadow = true;
  m.count = 0;
  return m;
}

export const tmpObj = new THREE.Object3D();
