import * as THREE from 'three';

// Fake lighting layers that cost almost nothing: additive light pools on floors and walls,
// procedural wall torches with shader flames. Real point lights are assigned by the View
// to the most relevant emitters.

const GLOW_VERT = `
varying vec2 vUv;
varying vec3 vColor;
varying float vFlick;
uniform float uTime;
uniform float uFlicker;
void main() {
  vUv = uv;
  vColor = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
    vColor = instanceColor;
  #endif
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = modelMatrix * instanceMatrix;
  #endif
  vec4 wp = m * vec4(position, 1.0);
  float ph = wp.x * 3.1 + wp.z * 1.7;
  vFlick = mix(1.0, 0.82 + 0.12 * sin(uTime * 11.0 + ph) * sin(uTime * 7.3 + ph * 1.3) + 0.06 * sin(uTime * 23.0 + ph * 2.1), uFlicker);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const GLOW_FRAG = `
varying vec2 vUv;
varying vec3 vColor;
varying float vFlick;
uniform float uIntensity;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = clamp(1.0 - r, 0.0, 1.0);
  a = a * a * (0.6 + 0.4 * a);
  gl_FragColor = vec4(vColor * a * uIntensity * vFlick, 1.0);
}`;

export function glowMaterial(flicker, intensity = 1) {
  return new THREE.ShaderMaterial({
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    uniforms: { uTime: { value: 0 }, uFlicker: { value: flicker ? 1 : 0 }, uIntensity: { value: intensity } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
}

const FLAME_VERT = `
varying float vH;
varying float vSeed;
uniform float uTime;
void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = modelMatrix * instanceMatrix;
  #endif
  vec3 p = position;
  vec4 origin = m * vec4(0.0, 0.0, 0.0, 1.0);
  float seed = origin.x * 7.13 + origin.z * 3.71;
  vSeed = seed;
  float h = clamp(p.y / 0.22 + 0.5, 0.0, 1.0);
  vH = h;
  float lick = 0.85 + 0.25 * sin(uTime * 13.0 + seed) * sin(uTime * 5.7 + seed * 2.0);
  p.y *= lick;
  p.x += sin(uTime * 9.0 + seed + h * 3.0) * 0.025 * h;
  p.z += cos(uTime * 7.0 + seed * 1.3 + h * 2.0) * 0.02 * h;
  gl_Position = projectionMatrix * viewMatrix * m * vec4(p, 1.0);
}`;
const FLAME_FRAG = `
varying float vH;
uniform vec3 uBase;
uniform vec3 uTip;
void main() {
  vec3 c = mix(uBase, uTip, smoothstep(0.0, 0.8, vH));
  float a = (1.0 - smoothstep(0.55, 1.0, vH)) * 0.95;
  gl_FragColor = vec4(c * a * 2.2, a);
}`;
export function flameMaterial(base = 0xff6a1a, tip = 0xffe7a0) {
  return new THREE.ShaderMaterial({
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    uniforms: { uTime: { value: 0 }, uBase: { value: new THREE.Color(base) }, uTip: { value: new THREE.Color(tip) } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function hash2(x, y, s = 0) {
  let h = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const TORCH_COLOR = new THREE.Color(1.0, 0.55, 0.22);

// Wall torches mounted where floor meets rock. Selection is deterministic and local,
// so digging only changes torches near the dug tile.
export class Torches {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.group = new THREE.Group();
    root.add(this.group);
    const handle = new THREE.CylinderGeometry(0.018, 0.024, 0.26, 6);
    handle.translate(0, 0.13, 0);
    const cup = new THREE.CylinderGeometry(0.05, 0.03, 0.06, 8);
    cup.translate(0, 0.27, 0);
    this.handleGeo = handle;
    this.cupGeo = cup;
    const bracket = new THREE.BoxGeometry(0.05, 0.05, 0.14);
    bracket.translate(0, 0.08, 0.05);
    this.bracketGeo = bracket;
    const flame = new THREE.ConeGeometry(0.05, 0.22, 7, 3, true);
    this.flameGeo = flame;
    const flame2 = new THREE.ConeGeometry(0.028, 0.15, 6, 2, true);
    this.flameGeo2 = flame2;
    this.woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 0.9 });
    this.ironMat = new THREE.MeshStandardMaterial({ color: 0x2c2b2a, roughness: 0.5, metalness: 0.8 });
    this.flameMat = flameMaterial();
    this.flameMat2 = flameMaterial(0xffb040, 0xffffff);
    this.floorGlowMat = glowMaterial(true, 0.8);
    this.wallGlowMat = glowMaterial(true, 0.65);
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    this.planeGeo = plane;
    this.vplane = new THREE.PlaneGeometry(1, 1);
    this.list = [];
    this.rebuild();
  }
  select() {
    const map = this.game.map;
    const best = new Map(); // tile index -> {h, d}
    const cands = [];
    for (let y = 0; y < map.h; y++)
      for (let x = 0; x < map.w; x++) {
        if (map.blocking(x, y)) continue;
        for (let d = 0; d < 4; d++) {
          const [dx, dy] = DIRS[d];
          if (!map.inside(x + dx, y + dy) || !map.blocking(x + dx, y + dy)) continue;
          const h = hash2(x, y, d + 11);
          if (h > 0.2) continue;
          cands.push({ x, y, d, h });
          const i = y * map.w + x;
          const b = best.get(i);
          if (!b || h < b.h) best.set(i, { h, d });
        }
      }
    const R = 3;
    const out = [];
    for (const c of cands) {
      const b = best.get(c.y * map.w + c.x);
      if (b.d !== c.d) continue;
      let ok = true;
      for (let yy = c.y - R; yy <= c.y + R && ok; yy++)
        for (let xx = c.x - R; xx <= c.x + R && ok; xx++) {
          if (xx === c.x && yy === c.y) continue;
          const o = best.get(yy * map.w + xx);
          if (o && o.h < c.h) ok = false;
        }
      if (ok) out.push(c);
    }
    return out;
  }
  rebuild() {
    while (this.group.children.length) {
      const c = this.group.children.pop();
      c.dispose && c.dispose();
    }
    const list = this.select();
    this.list = list.map((c) => {
      const [dx, dy] = DIRS[c.d];
      const wx = dx, wz = -dy; // world direction toward the wall
      const fx = c.x + 0.5 + wx * 0.5 - wx * 0.04;
      const fz = -c.y - 0.5 + wz * 0.5 - wz * 0.04;
      return { x: fx, y: 0.62, z: fz, wx, wz, tx: c.x, ty: c.y };
    });
    const n = this.list.length;
    if (!n) return;
    const mk = (geo, mat) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    };
    const handle = mk(this.handleGeo, this.woodMat);
    const cup = mk(this.cupGeo, this.ironMat);
    const bracket = mk(this.bracketGeo, this.ironMat);
    const flame = mk(this.flameGeo, this.flameMat);
    const flame2 = mk(this.flameGeo2, this.flameMat2);
    const floor = mk(this.planeGeo, this.floorGlowMat);
    const wall = mk(this.vplane, this.wallGlowMat);
    handle.castShadow = true;
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    this.list.forEach((t, i) => {
      const yaw = Math.atan2(-t.wx, -t.wz); // bracket points away from wall
      o.position.set(t.x, t.y, t.z);
      o.rotation.set(0, yaw, 0);
      o.rotateX(0.35);
      o.scale.set(1.3, 1.3, 1.3);
      o.updateMatrix();
      handle.setMatrixAt(i, o.matrix);
      cup.setMatrixAt(i, o.matrix);
      // bracket at wall
      const b = new THREE.Object3D();
      b.position.set(t.x, t.y, t.z);
      b.rotation.set(0, yaw + Math.PI, 0);
      b.updateMatrix();
      bracket.setMatrixAt(i, b.matrix);
      // flame at cup top
      const top = new THREE.Vector3(0, 0.36, 0).applyMatrix4(o.matrix);
      const f = new THREE.Object3D();
      f.position.copy(top);
      f.scale.set(1.35, 1.35, 1.35);
      f.updateMatrix();
      flame.setMatrixAt(i, f.matrix);
      f.position.y -= 0.02;
      f.updateMatrix();
      flame2.setMatrixAt(i, f.matrix);
      t.fx = top.x;
      t.fy = top.y;
      t.fz = top.z;
      // light pools
      const g = new THREE.Object3D();
      g.position.set(t.x - t.wx * 0.55, 0.015, t.z - t.wz * 0.55);
      g.scale.set(3.8, 1, 3.8);
      g.updateMatrix();
      floor.setMatrixAt(i, g.matrix);
      floor.setColorAt(i, col.copy(TORCH_COLOR));
      const w = new THREE.Object3D();
      w.position.set(t.x + t.wx * 0.035, 0.6, t.z + t.wz * 0.035);
      w.rotation.set(0, Math.atan2(-t.wx, -t.wz), 0);
      w.scale.set(2.0, 1.6, 1);
      w.updateMatrix();
      wall.setMatrixAt(i, w.matrix);
      wall.setColorAt(i, col.copy(TORCH_COLOR));
    });
    for (const m of this.group.children) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
  update(t) {
    this.flameMat.uniforms.uTime.value = t;
    this.flameMat2.uniforms.uTime.value = t;
    this.floorGlowMat.uniforms.uTime.value = t;
    this.wallGlowMat.uniforms.uTime.value = t;
  }
}

// Light pools: static (rebuilt on demand) and dynamic (refilled every frame).
export class LightPools {
  constructor(root) {
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    this.steadyMat = glowMaterial(false, 0.6);
    this.fireMat = glowMaterial(true, 0.75);
    this.dyn = new THREE.InstancedMesh(plane, this.steadyMat, 256);
    this.dynFire = new THREE.InstancedMesh(plane, this.fireMat, 64);
    for (const m of [this.dyn, this.dynFire]) {
      m.frustumCulled = false;
      m.count = 0;
      m.setColorAt(0, new THREE.Color());
      root.add(m);
    }
    this.o = new THREE.Object3D();
    this.c = new THREE.Color();
  }
  begin() {
    this.n = 0;
    this.nf = 0;
  }
  add(x, y, z, radius, color, intensity = 1, fire = false) {
    const mesh = fire ? this.dynFire : this.dyn;
    const k = fire ? this.nf : this.n;
    if (k >= mesh.instanceMatrix.count) return;
    this.o.position.set(x, y, z);
    this.o.scale.set(radius * 2, 1, radius * 2);
    this.o.updateMatrix();
    mesh.setMatrixAt(k, this.o.matrix);
    mesh.setColorAt(k, this.c.set(color).multiplyScalar(intensity));
    if (fire) this.nf++;
    else this.n++;
  }
  end(t) {
    this.dyn.count = this.n;
    this.dynFire.count = this.nf;
    for (const m of [this.dyn, this.dynFire]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.fireMat.uniforms.uTime.value = t;
  }
}
