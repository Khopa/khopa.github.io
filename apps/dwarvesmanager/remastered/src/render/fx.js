import * as THREE from 'three';

const VERT = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale;
}`;
const FRAG = `
varying float vAlpha;
varying vec3 vColor;
uniform float uSoft;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = mix(step(d, 1.0), 1.0 - smoothstep(0.0, 1.0, d), uSoft);
  if (a <= 0.01) discard;
  gl_FragColor = vec4(vColor, a * vAlpha);
}`;

class ParticlePool {
  constructor(scene, cap, additive, soft) {
    this.cap = cap;
    this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.size0 = new Float32Array(cap);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 100 }, uSoft: { value: soft ? 1 : 0.35 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.geo = g;
  }
  spawn(x, y, z, vx, vy, vz, color, size, life, grav = 0) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    const c = color instanceof THREE.Color ? color : tmpColor.set(color);
    this.col.set([c.r, c.g, c.b], i * 3);
    this.size0[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = grav;
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        const j = --this.n;
        if (i !== j) {
          for (let k = 0; k < 3; k++) {
            this.pos[i * 3 + k] = this.pos[j * 3 + k];
            this.vel[i * 3 + k] = this.vel[j * 3 + k];
            this.col[i * 3 + k] = this.col[j * 3 + k];
          }
          this.life[i] = this.life[j];
          this.maxLife[i] = this.maxLife[j];
          this.grav[i] = this.grav[j];
          this.size0[i] = this.size0[j];
        }
        continue;
      }
      const k = i * 3;
      this.vel[k + 1] -= this.grav[i] * dt;
      this.vel[k] *= 1 - dt * 1.2;
      this.vel[k + 2] *= 1 - dt * 1.2;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.01) {
        this.pos[k + 1] = 0.01;
        this.vel[k + 1] *= -0.3;
      }
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.min(1, t * 2.5) * (t > 0.9 ? (1 - t) * 10 : 1);
      this.size[i] = this.size0[i] * (0.6 + 0.4 * t);
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    for (const a of ['position', 'aColor', 'aSize', 'aAlpha']) this.geo.attributes[a].needsUpdate = true;
  }
}
const tmpColor = new THREE.Color();

class Debris {
  constructor(scene, cap = 260) {
    this.cap = cap;
    const geo = new THREE.DodecahedronGeometry(0.06, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.items = [];
    this.dummy = new THREE.Object3D();
    for (let i = 0; i < cap; i++) {
      this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.next = 0;
    scene.add(this.mesh);
  }
  spawn(x, y, z, color, n) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.cap;
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * 1.6;
      this.items[i] = {
        p: new THREE.Vector3(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.6),
        v: new THREE.Vector3(Math.cos(a) * s, 1.5 + Math.random() * 2.5, Math.sin(a) * s),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
        w: (Math.random() - 0.5) * 12,
        s: 0.5 + Math.random() * 1.3,
        life: 2.5 + Math.random(),
      };
      this.mesh.setColorAt(i, tmpColor.set(color).multiplyScalar(0.7 + Math.random() * 0.5));
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.cap; i++) {
      const it = this.items[i];
      if (!it) continue;
      any = true;
      it.life -= dt;
      it.v.y -= 9.8 * dt;
      it.p.addScaledVector(it.v, dt);
      if (it.p.y < 0.04) {
        it.p.y = 0.04;
        it.v.y *= -0.35;
        it.v.x *= 0.6;
        it.v.z *= 0.6;
        it.w *= 0.6;
      }
      it.r.x += it.w * dt;
      it.r.z += it.w * dt * 0.7;
      const sc = it.life < 0.5 ? it.s * Math.max(0, it.life / 0.5) : it.s;
      this.dummy.position.copy(it.p);
      this.dummy.rotation.copy(it.r);
      this.dummy.scale.setScalar(sc);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      if (it.life <= 0) this.items[i] = null;
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class FX {
  constructor(scene) {
    this.glow = new ParticlePool(scene, 2500, true, true);
    this.dust = new ParticlePool(scene, 1500, false, true);
    this.debris = new Debris(scene);
    this.motes = [];
  }
  setScale(s) {
    this.glow.material.uniforms.uScale.value = s;
    this.dust.material.uniforms.uScale.value = s;
  }
  update(dt) {
    this.glow.update(dt);
    this.dust.update(dt);
    this.debris.update(dt);
  }
  mineHit(x, y, z, color) {
    for (let i = 0; i < 6; i++)
      this.dust.spawn(x, y, z, (Math.random() - 0.5) * 1.2, Math.random() * 1.2, (Math.random() - 0.5) * 1.2, color, 0.07 + Math.random() * 0.05, 0.5 + Math.random() * 0.4, 3);
    for (let i = 0; i < 3; i++)
      this.glow.spawn(x, y, z, (Math.random() - 0.5) * 2.5, Math.random() * 2, (Math.random() - 0.5) * 2.5, 0xffd080, 0.04, 0.25, 6);
  }
  blockBreak(x, h, z, color) {
    this.debris.spawn(x, h * 0.6, z, color, 9);
    for (let i = 0; i < 26; i++)
      this.dust.spawn(x + (Math.random() - 0.5) * 0.9, Math.random() * h, z + (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.8, Math.random() * 0.6, (Math.random() - 0.5) * 0.8, color, 0.18 + Math.random() * 0.2, 1.2 + Math.random(), -0.2);
  }
  gemBurst(x, y, z, color, n = 30) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2;
      this.glow.spawn(x, y, z, Math.cos(a) * s, 1.5 + Math.random() * 3, Math.sin(a) * s, color, 0.08 + Math.random() * 0.08, 0.8 + Math.random() * 0.6, 4);
    }
  }
  sparks(x, y, z, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.5;
      this.glow.spawn(x, y, z, Math.cos(a) * s, 1 + Math.random() * 2.5, Math.sin(a) * s, i % 3 ? 0xffa030 : 0xffe9a0, 0.035 + Math.random() * 0.03, 0.35 + Math.random() * 0.35, 9);
    }
  }
  magic(x, y, z, n = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.25;
      this.glow.spawn(x + Math.cos(a) * r, y + Math.random() * 0.3, z + Math.sin(a) * r, -Math.cos(a) * 0.2, 0.4 + Math.random() * 0.6, -Math.sin(a) * 0.2, Math.random() < 0.5 ? 0x7fe8ff : 0xc88cff, 0.05 + Math.random() * 0.05, 1 + Math.random() * 0.8, -0.3);
    }
  }
  embers(x, y, z) {
    this.glow.spawn(x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3, Math.random() < 0.5 ? 0xff7a20 : 0xffc060, 0.03 + Math.random() * 0.03, 1 + Math.random(), -0.4);
  }
  speedTrail(x, y, z) {
    this.glow.spawn(x, y, z, 0, 0.3, 0, 0xffd34a, 0.04, 0.5, 0);
  }
  // Ambient dust motes drifting around the camera target
  ambient(cx, cz, radius) {
    if (Math.random() < 0.6)
      this.dust.spawn(cx + (Math.random() - 0.5) * radius * 2, 0.2 + Math.random() * 1.8, cz + (Math.random() - 0.5) * radius * 2, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.05, 0xd8c3a0, 0.02 + Math.random() * 0.025, 5 + Math.random() * 4, 0);
  }
}
