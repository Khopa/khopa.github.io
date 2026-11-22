import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const QUALITY = {
  low: { dpr: 1, shadows: 0, bloom: false, msaa: 0, atlas: 128, lights: 2 },
  medium: { dpr: 1.5, shadows: 1024, bloom: true, msaa: 0, atlas: 192, lights: 6 },
  high: { dpr: 2, shadows: 2048, bloom: true, msaa: 4, atlas: 256, lights: 10 },
};

const isMobile = () => matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
export function autoQuality() {
  return isMobile() ? 'medium' : 'high';
}

// Smoothly damped isometric (orthographic) camera.
export class IsoCamera {
  constructor() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.target = new THREE.Vector2(10, -10); // world x, z
    this.cur = this.target.clone();
    this.yaw = Math.PI / 7;
    this.curYaw = this.yaw;
    this.pitch = 0.87;
    this.view = 16; // world units visible vertically
    this.curView = this.view;
    this.minView = 5;
    this.maxView = 60;
    this.bounds = null;
    this.aspect = 1;
    this.shake = 0;
  }
  setBounds(w, h) {
    this.bounds = { w, h };
  }
  jump(x, z, view) {
    this.target.set(x, z);
    this.cur.copy(this.target);
    if (view) this.view = this.curView = view;
    this.curYaw = this.yaw;
  }
  resize(w, h) {
    this.aspect = w / h;
    this.screenH = h;
  }
  // ground-plane basis vectors for screen motion
  basis(yaw = this.curYaw) {
    const right = new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw));
    const up = new THREE.Vector2(-Math.sin(yaw), -Math.cos(yaw));
    return { right, up };
  }
  // vertical world extent: `view` applies to the shorter screen side
  extent(view = this.curView) {
    return this.aspect >= 1 ? view : view / this.aspect;
  }
  pan(dxPx, dyPx) {
    const upp = this.extent() / this.screenH;
    const { right, up } = this.basis();
    const fz = 1 / Math.sin(this.pitch);
    this.target.addScaledVector(right, -dxPx * upp);
    this.target.addScaledVector(up, dyPx * upp * fz);
    this.clamp();
    this.cur.copy(this.target); // direct manipulation feels better without lag
  }
  zoom(factor, sx, sy, w, h) {
    const before = this.groundAt(sx, sy, w, h, this.view);
    this.view = Math.max(this.minView, Math.min(this.maxView, this.view * factor));
    const after = this.groundAt(sx, sy, w, h, this.view);
    if (before && after) {
      this.target.x += before.x - after.x;
      this.target.y += before.z - after.z;
    }
    this.clamp();
  }
  rotate(d) {
    this.yaw += d;
  }
  clamp() {
    if (!this.bounds) return;
    this.target.x = Math.max(0, Math.min(this.bounds.w, this.target.x));
    this.target.y = Math.max(-this.bounds.h, Math.min(0, this.target.y));
  }
  // Ground point (y=0) under a screen pixel, for the target camera state
  groundAt(sx, sy, w, h, view) {
    const cam = this.camera.clone();
    this.place(cam, this.target, this.yaw, view);
    const ray = screenRay(cam, sx, sy, w, h);
    const t = -ray.origin.y / ray.direction.y;
    if (!(t > 0)) return null;
    return ray.origin.clone().addScaledVector(ray.direction, t);
  }
  place(cam, target, yaw, view) {
    const d = 80;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    cam.position.set(target.x + Math.sin(yaw) * cp * d, sp * d, target.y + Math.cos(yaw) * cp * d);
    cam.up.set(0, 1, 0);
    cam.lookAt(target.x, 0, target.y);
    const halfH = this.extent(view) / 2, halfW = halfH * this.aspect;
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }
  update(dt) {
    const k = 1 - Math.exp(-dt * 10);
    this.cur.lerp(this.target, k);
    this.curYaw += (this.yaw - this.curYaw) * k;
    this.curView += (this.view - this.curView) * k;
    const t = this.cur.clone();
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2);
      t.x += (Math.random() - 0.5) * this.shake * 0.15;
      t.y += (Math.random() - 0.5) * this.shake * 0.15;
    }
    this.place(this.camera, t, this.curYaw, this.curView);
  }
}

export function screenRay(cam, sx, sy, w, h) {
  const ndc = new THREE.Vector2((sx / w) * 2 - 1, -(sy / h) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, cam);
  return ray.ray;
}

export class View {
  constructor(canvas, qualityName) {
    this.canvas = canvas;
    this.qualityName = qualityName;
    this.q = QUALITY[qualityName];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090706);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.25;
    this.cam = new IsoCamera();
    this.setupLights();
    this.setupComposer();
    this.applyQuality();
    this.resize();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', this.onResize);
  }

  setupLights() {
    const s = this.scene;
    // moody cave balance: dim warm key, cool bounce, the torches do the rest
    this.hemi = new THREE.HemisphereLight(0xffd9b0, 0x120c0a, 0.55);
    s.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe2c0, 1.55);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    s.add(this.sun);
    s.add(this.sun.target);
    this.fill = new THREE.DirectionalLight(0x6f8cff, 0.32);
    this.fill.position.set(-20, 18, -30);
    s.add(this.fill);
    this.pool = [];
    for (let i = 0; i < 10; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 4, 1.6);
      s.add(l);
      this.pool.push(l);
    }
  }

  setupComposer() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: this.q.msaa });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(this.scene, this.cam.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.45, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GRADE);
    this.composer.addPass(this.grade);
  }

  setQuality(name) {
    if (name === this.qualityName) return;
    this.qualityName = name;
    this.q = QUALITY[name];
    this.composer.renderTarget1.samples = this.q.msaa;
    this.composer.renderTarget2.samples = this.q.msaa;
    this.applyQuality();
    this.resize();
  }
  applyQuality() {
    const q = this.q;
    this.renderer.shadowMap.enabled = q.shadows > 0;
    this.sun.castShadow = q.shadows > 0;
    if (q.shadows) {
      this.sun.shadow.mapSize.set(q.shadows, q.shadows);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
    this.bloom.enabled = q.bloom;
    this.pool.forEach((l, i) => (l.visible = i < q.lights));
    this.scene.traverse((o) => {
      if (o.material) o.material.needsUpdate = true;
    });
  }

  resize() {
    const vv = window.visualViewport;
    const w = Math.round(vv ? vv.width : window.innerWidth);
    const h = Math.round(vv ? vv.height : window.innerHeight);
    this.w = w;
    this.h = h;
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.dpr);
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.setSize(Math.round(w * dpr / 2), Math.round(h * dpr / 2));
    this.cam.resize(w, h);
  }

  // Position lights relative to the camera target; assign the point-light pool
  // to the emitters closest to the view centre.
  updateLights(emitters, t) {
    const c = this.cam.cur;
    const view = this.cam.extent();
    const dir = new THREE.Vector3(-0.55, 1, 0.35).normalize();
    const R = Math.max(view * this.cam.aspect, view / Math.sin(this.cam.pitch)) * 0.62;
    if (this.sun.castShadow) {
      const sc = this.sun.shadow.camera;
      sc.left = -R;
      sc.right = R;
      sc.top = R;
      sc.bottom = -R;
      sc.near = 1;
      sc.far = 120;
      sc.updateProjectionMatrix();
    }
    // snap to shadow texels to avoid shimmering
    const texel = (2 * R) / (this.q.shadows || 1024);
    const tx = Math.round(c.x / texel) * texel, tz = Math.round(c.y / texel) * texel;
    this.sun.position.set(tx + dir.x * 50, dir.y * 50, tz + dir.z * 50);
    this.sun.target.position.set(tx, 0, tz);
    this.sun.target.updateMatrixWorld();
    const reach = view * 0.75;
    const list = emitters
      .map((e) => {
        const d = Math.sqrt((e.x - c.x) ** 2 + (e.z - c.y) ** 2);
        return { e, d, s: d - (e.prio || 0) * reach * 0.35 };
      })
      .filter((o) => o.d < reach * 1.5)
      .sort((a, b) => a.s - b.s);
    const n = this.q.lights;
    this.pool.forEach((l, i) => {
      const o = i < n ? list[i] : null;
      if (!o) {
        l.intensity = 0;
        return;
      }
      const e = o.e;
      l.position.set(e.x, e.y, e.z);
      l.color.setHex(e.color);
      l.distance = e.range || 4.5;
      const fl = e.flicker ? 0.8 + 0.2 * Math.sin(t * 13 + e.x) * Math.sin(t * 7.3 + e.z) + Math.random() * 0.08 : 1;
      l.intensity = e.power * fl;
    });
  }

  render() {
    if (this.q.bloom || this.q.msaa) this.composer.render();
    else this.renderer.render(this.scene, this.cam.camera);
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', this.onResize);
  }

  // world -> screen px
  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.cam.camera);
    return [(v.x * 0.5 + 0.5) * this.w, (-v.y * 0.5 + 0.5) * this.h, v.z];
  }
}

// Final colour grade (display space): gentle contrast, warm shadows, vignette.
const GRADE = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 1.12);                       // saturation
      col = (col - 0.5) * 1.06 + 0.5;                      // contrast
      col += vec3(0.022, 0.008, -0.012) * (1.0 - l);       // warm shadows
      col += vec3(-0.01, 0.0, 0.015) * l;                  // cooler highlights
      vec2 d = vUv - 0.5;
      col *= 1.0 - smoothstep(0.35, 0.95, length(d * vec2(1.1, 1.0))) * 0.45;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};
