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
import { PALETTE } from '../config/palette';

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

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private sky: THREE.Mesh;
  private pixelRatio: number;
  private maxPixelRatio: number;
  private frameTimes: number[] = [];
  private adaptCooldown = 3;
  quality: 'auto' | 'high' | 'low' = 'auto';
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
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.5, 0.95);
    this.composer.addPass(this.bloom);
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
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 c = mix(horizon, mid, smoothstep(0.02, 0.28, h));
          c = mix(c, top, smoothstep(0.25, 0.85, h));
          c = mix(c, below, smoothstep(0.0, -0.25, h));
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          c += sunColor * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.35);
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
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
  }

  setQuality(q: 'auto' | 'high' | 'low'): void {
    this.quality = q;
    if (q === 'high') this.pixelRatio = this.maxPixelRatio;
    else if (q === 'low') this.pixelRatio = Math.min(1, this.maxPixelRatio) * 0.75;
    else this.pixelRatio = Math.min(this.maxPixelRatio, 1.5);
    this.renderer.shadowMap.enabled = q !== 'low';
    this.sun.castShadow = q !== 'low';
    this.bloom.enabled = q !== 'low';
    this.resize();
  }

  /** Draw calls / triangles of the last frame (all passes). */
  stats = { calls: 0, triangles: 0 };

  render(dt: number): void {
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
    if (median > 1 / 50 && this.pixelRatio > 0.6) {
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
