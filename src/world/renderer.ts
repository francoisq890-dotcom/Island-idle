/**
 * Renderer, lights, sky, fog and post-processing (bloom + grading/vignette).
 * Adaptive resolution keeps the frame rate up on modest laptops.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { PALETTE } from '../config/palette';
import { GLOBAL_EMIT, GLOBAL_TIME, GLOBAL_WIND } from './geom';

/** Night palette (sky, fog, lights). */
const NIGHT = {
  skyTop: 0x0b0f2e,
  skyMid: 0x252866,
  skyHorizon: 0x5c4785,
  skyBelow: 0x3a3060,
  fog: 0x4a3f72,
  sun: 0x9fb4ff,
  hemiSky: 0x5d6ad6,
  hemiGround: 0x3a2f5a,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.32 },
    uSaturation: { value: 1.08 },
    uWarm: { value: new THREE.Vector3(1.03, 1.0, 0.96) },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uSaturation;
    uniform vec3 uWarm;
    uniform float uFlash;
    uniform vec3 uFlashColor;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSaturation) * uWarm;
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.25, length(d * vec2(1.15, 1.0)));
      c.rgb *= mix(1.0 - uVignette, 1.0, v);
      c.rgb = mix(c.rgb, uFlashColor * 2.0, uFlash);
      gl_FragColor = c;
    }
  `,
};

/**
 * Sun (or moon) shafts: a cheap screen-space radial blur of the bright pixels
 * towards the light's position on screen, added back with a warm tint.
 */
const RaysShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSun: { value: new THREE.Vector2(0.5, 0.5) },
    uStrength: { value: 0 },
    uTint: { value: new THREE.Color(1, 0.85, 0.65) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uSun;
    uniform float uStrength;
    uniform vec3 uTint;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uStrength <= 0.001) { gl_FragColor = base; return; }
      vec2 d = (uSun - vUv) / 24.0 * 0.9;
      vec2 p = vUv;
      float decay = 1.0;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 24; i++) {
        p += d;
        vec3 c = texture2D(tDiffuse, p).rgb;
        float l = max(0.0, dot(c, vec3(0.299, 0.587, 0.114)) - 0.72);
        acc += c * l * decay;
        decay *= 0.93;
      }
      float fall = smoothstep(1.2, 0.0, distance(vUv, uSun));
      gl_FragColor = vec4(base.rgb + acc * uTint * uStrength * fall * 0.11, base.a);
    }
  `,
};

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private rays: ShaderPass;
  private gtao: GTAOPass;
  /** Preset actually in use (Automatique moves between them). */
  level: QualityLevel = 'high';
  private sunDir = new THREE.Vector3(-0.55, 0.32, 0.4).normalize();
  private moonDir = new THREE.Vector3(0.45, 0.42, -0.62).normalize();
  private tmpV = new THREE.Vector3();
  private sky: THREE.Mesh;
  private pixelRatio: number;
  private maxPixelRatio: number;
  private frameTimes: number[] = [];
  private adaptCooldown = 3;
  quality: 'auto' | QualityLevel = 'auto';
  private night = 0;
  private skyTime = 0;
  private dayColors = { fog: new THREE.Color(PALETTE.fog), sun: new THREE.Color(0xffdcb0), hemiSky: new THREE.Color(0xc4ccff), hemiGround: new THREE.Color(0xd9967a), bg: new THREE.Color(PALETTE.skyHorizon) };
  private nightColors = { fog: new THREE.Color(NIGHT.fog), sun: new THREE.Color(NIGHT.sun), hemiSky: new THREE.Color(NIGHT.hemiSky), hemiGround: new THREE.Color(NIGHT.hemiGround), bg: new THREE.Color(NIGHT.skyHorizon) };
  /** Offset of the sun from the shadow focus point. */
  private sunOffset = new THREE.Vector3(-26, 38, 18);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.pixelRatio = Math.min(this.maxPixelRatio, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.3, 900);

    // --- Fog & sky -----------------------------------------------------------
    this.scene.fog = new THREE.Fog(PALETTE.fog, 95, 340);
    this.scene.background = new THREE.Color(PALETTE.skyHorizon);
    this.sky = this.makeSky();
    this.scene.add(this.sky);

    // --- Lights ---------------------------------------------------------------
    this.hemi = new THREE.HemisphereLight(0xc4ccff, 0xd9967a, 1.0);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffdcb0, 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -34;
    sc.right = 34;
    sc.top = 34;
    sc.bottom = -34;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target);
    // Soft rim light from the opposite side for a warm sunset feel.
    const rim = new THREE.DirectionalLight(0xa9b4ff, 0.55);
    rim.position.set(30, 20, -40);
    this.scene.add(rim);

    // --- Post-processing ------------------------------------------------------
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 0.65;
    this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.6, thickness: 1.2, scale: 1 });
    this.gtao.enabled = false;
    this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.5, 0.95);
    this.composer.addPass(this.bloom);
    this.rays = new ShaderPass(RaysShader);
    this.composer.addPass(this.rays);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private makeSky(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(600, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(PALETTE.skyTop) },
        mid: { value: new THREE.Color(PALETTE.skyMid) },
        horizon: { value: new THREE.Color(PALETTE.skyHorizon) },
        below: { value: new THREE.Color(PALETTE.skyBelow) },
        sunDir: { value: new THREE.Vector3(-0.55, 0.32, 0.4).normalize() },
        sunColor: { value: new THREE.Color(PALETTE.sun) },
        nTop: { value: new THREE.Color(NIGHT.skyTop) },
        nMid: { value: new THREE.Color(NIGHT.skyMid) },
        nHorizon: { value: new THREE.Color(NIGHT.skyHorizon) },
        nBelow: { value: new THREE.Color(NIGHT.skyBelow) },
        moonDir: { value: new THREE.Vector3(0.45, 0.42, -0.62).normalize() },
        uNight: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 below;
        uniform vec3 sunDir; uniform vec3 sunColor;
        uniform vec3 nTop; uniform vec3 nMid; uniform vec3 nHorizon; uniform vec3 nBelow;
        uniform vec3 moonDir; uniform float uNight; uniform float uTime;
        varying vec3 vDir;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 c = mix(horizon, mid, smoothstep(0.02, 0.28, h));
          c = mix(c, top, smoothstep(0.25, 0.85, h));
          c = mix(c, below, smoothstep(0.0, -0.25, h));
          vec3 n = mix(nHorizon, nMid, smoothstep(0.02, 0.3, h));
          n = mix(n, nTop, smoothstep(0.25, 0.85, h));
          n = mix(n, nBelow, smoothstep(0.0, -0.25, h));
          c = mix(c, n, uNight);
          float s = max(dot(d, sunDir), 0.0);
          c += sunColor * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.35) * (1.0 - uNight);
          if (uNight > 0.01) {
            // Stars: a hashed grid on the sphere, twinkling, fading near the horizon.
            vec3 g = floor(d * 140.0);
            float r = hash(g);
            float star = step(0.985, r) * smoothstep(0.02, 0.25, h);
            float tw = 0.6 + 0.4 * sin(uTime * (1.5 + r * 4.0) + r * 60.0);
            vec3 sc = mix(vec3(1.0, 0.92, 0.8), vec3(0.75, 0.85, 1.0), hash(g + 7.0));
            c += sc * star * tw * 1.6 * uNight;
            // Moon with a soft halo.
            float m = max(dot(d, moonDir), 0.0);
            c += vec3(0.95, 0.93, 1.0) * (smoothstep(0.9993, 0.9996, m) * 2.4 + pow(m, 60.0) * 0.25) * uNight;
            // Aurora: slow curtains above the northern horizon.
            float az = atan(d.x, -d.z);
            float band = smoothstep(0.08, 0.22, h) * smoothstep(0.62, 0.3, h);
            float wave = sin(az * 5.0 + uTime * 0.25 + sin(az * 11.0 - uTime * 0.4) * 0.8);
            float curtain = pow(0.5 + 0.5 * wave, 3.0) * smoothstep(-0.2, 0.6, -d.z);
            vec3 ac = mix(vec3(0.25, 1.0, 0.75), vec3(0.75, 0.45, 1.0), smoothstep(0.12, 0.5, h));
            c += ac * band * curtain * 0.55 * uNight;
          }
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = -10;
    m.frustumCulled = false;
    return m;
  }

  /** Keep the shadow frustum centered on what the player sees. */
  focusShadows(target: THREE.Vector3): void {
    // Snap to texel grid to avoid shimmering.
    const step = 68 / 2048;
    const x = Math.round(target.x / step) * step;
    const z = Math.round(target.z / step) * step;
    this.sun.target.position.set(x, target.y, z);
    this.sun.position.set(x + this.sunOffset.x, target.y + this.sunOffset.y, z + this.sunOffset.z);
    this.sky.position.copy(this.camera.position);
  }

  /** 0 = day … 1 = night: sky, fog, lights, bloom and emissive glow follow. */
  setNight(k: number): void {
    this.night = k;
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
    u.uNight.value = k;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.dayColors.fog).lerp(this.nightColors.fog, k);
    (this.scene.background as THREE.Color).copy(this.dayColors.bg).lerp(this.nightColors.bg, k);
    this.sun.color.copy(this.dayColors.sun).lerp(this.nightColors.sun, k);
    this.sun.intensity = 3.2 - 2.45 * k;
    this.hemi.color.copy(this.dayColors.hemiSky).lerp(this.nightColors.hemiSky, k);
    this.hemi.groundColor.copy(this.dayColors.hemiGround).lerp(this.nightColors.hemiGround, k);
    this.hemi.intensity = 1.0 - 0.35 * k;
    // At night the moon lights from the other side.
    this.sunOffset.set(-26 + 50 * k, 38, 18 - 46 * k);
    this.bloom.strength = 0.55 + 0.35 * k;
    GLOBAL_EMIT.value = 1 + 0.9 * k;
    this.grade.uniforms.uSaturation.value = 1.08 - 0.22 * k;
    this.grade.uniforms.uWarm.value.set(1.03 - 0.08 * k, 1.0 - 0.02 * k, 0.96 + 0.1 * k);
  }

  get nightAmount(): number {
    return this.night;
  }

  set flash(v: number) {
    this.grade.uniforms.uFlash.value = v;
  }

  setFlashColor(c: THREE.ColorRepresentation): void {
    (this.grade.uniforms.uFlashColor.value as THREE.Color).set(c);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 62 : 50;
    this.camera.userData.baseFov = this.camera.fov;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
  }

  setQuality(q: 'auto' | QualityLevel): void {
    this.quality = q;
    this.applyLevel(q === 'auto' ? 'high' : q);
  }

  /**
   * Presets:
   *  - low (Économie): 0.75 px ratio, no shadows, no bloom, no wind;
   *  - medium: 1× pixels, 1024 shadows, bloom;
   *  - high: up to 1.5× pixels, 2048 shadows, bloom, light shafts;
   *  - ultra: full device ratio, 4096 soft shadows, light shafts, ambient occlusion.
   */
  private applyLevel(l: QualityLevel): void {
    this.level = l;
    const pr = { low: Math.min(1, this.maxPixelRatio) * 0.75, medium: Math.min(1, this.maxPixelRatio), high: Math.min(this.maxPixelRatio, 1.5), ultra: this.maxPixelRatio }[l];
    this.pixelRatio = pr;
    const shadows = l !== 'low';
    this.renderer.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
    const size = l === 'ultra' ? 4096 : l === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.renderer.shadowMap.type = l === 'ultra' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.bloom.enabled = l !== 'low';
    this.rays.enabled = l === 'high' || l === 'ultra';
    this.gtao.enabled = l === 'ultra';
    GLOBAL_WIND.value = l === 'low' ? 0 : 1;
    this.resize();
  }

  /** Draw calls / triangles of the last frame (all passes). */
  stats = { calls: 0, triangles: 0 };

  render(dt: number): void {
    this.skyTime += dt;
    GLOBAL_TIME.value = this.skyTime;
    if (this.rays.enabled) {
      // Screen position of the sun (day) or the moon (night); fade out when behind the camera.
      const k = this.night;
      const dir = this.tmpV.copy(this.sunDir).lerp(this.moonDir, k).normalize();
      const p = dir.multiplyScalar(400).add(this.camera.position).project(this.camera);
      const facing = p.z < 1 ? 1 : 0;
      const u = this.rays.uniforms;
      u.uSun.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
      const onScreen = Math.max(0, 1 - Math.max(0, Math.abs(p.x) - 1) * 0.8) * Math.max(0, 1 - Math.max(0, Math.abs(p.y) - 1) * 0.8);
      u.uStrength.value = facing * onScreen * (1 - k * 0.6);
      (u.uTint.value as THREE.Color).setRGB(1 - 0.35 * k, 0.85 - 0.05 * k, 0.65 + 0.35 * k);
    }
    (this.sky.material as THREE.ShaderMaterial).uniforms.uTime.value = this.skyTime;
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    this.composer.render(dt);
    this.stats.calls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
    this.adapt(dt);
  }

  /** Adaptive resolution: drop pixel ratio when frames are slow, raise it back when fast. */
  private adapt(dt: number): void {
    if (this.quality !== 'auto') return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    this.adaptCooldown -= dt;
    if (this.adaptCooldown > 0 || this.frameTimes.length < 60) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median > 1 / 40 && this.pixelRatio <= 0.75 && this.level !== 'low') {
      // Still slow at the lowest resolution: drop a whole preset.
      this.applyLevel(this.level === 'ultra' ? 'high' : this.level === 'high' ? 'medium' : 'low');
      this.pixelRatio = Math.max(0.6, this.pixelRatio * 0.8);
      this.resize();
      this.adaptCooldown = 4;
      this.frameTimes.length = 0;
    } else if (median > 1 / 50 && this.pixelRatio > 0.6) {
      this.pixelRatio = Math.max(0.6, this.pixelRatio - 0.15);
      this.resize();
      this.adaptCooldown = 2.5;
      this.frameTimes.length = 0;
    } else if (median < 1 / 75 && this.pixelRatio < Math.min(this.maxPixelRatio, 1.5)) {
      this.pixelRatio = Math.min(Math.min(this.maxPixelRatio, 1.5), this.pixelRatio + 0.1);
      this.resize();
      this.adaptCooldown = 5;
      this.frameTimes.length = 0;
    }
  }

  get info(): THREE.WebGLInfo {
    return this.renderer.info;
  }
}
