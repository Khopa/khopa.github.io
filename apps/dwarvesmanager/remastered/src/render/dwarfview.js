import * as THREE from 'three';
import { itemModel } from './models.js';
import { buildDwarf } from './dwarfmodel.js';
import { Pickaxe, Beer } from '../sim/objects.js';

const DIR_YAW = { down: 0, up: Math.PI, right: Math.PI / 2, left: -Math.PI / 2 };
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// rotate a local object-space game vector by the object's rotation
function rotVec(rot, u, v) {
  switch (rot) {
    case 1: return [-v, u];
    case 2: return [-u, -v];
    case 3: return [v, -u];
    default: return [u, v];
  }
}
const yawOf = (gx, gy) => Math.atan2(gx, -gy);

// How a dwarf sits/lies when occupying an object slot.
function slotPose(d) {
  const s = d.slot;
  if (!s) return null;
  const [sx, sy] = s.pos;
  if (Math.abs(d.x - sx) > 0.01 || Math.abs(d.y - sy) > 0.01) return null;
  const o = s.obj, rot = o.rot;
  switch (o.type) {
    case 'Bed': {
      if (d.pose !== 'lie') return null;
      const [ox, oy] = rotVec(rot, 0.66, 0);
      const [hx, hy] = rotVec(rot, -1, 0);
      return { off: [ox, oy], yaw: Math.atan2(-hx, hy), pose: 'lie', y: 0.4 };
    }
    case 'TableObject': {
      if (d.pose !== 'sit') return null;
      const dir = s.lx === 0 ? 1 : -1;
      const [fx, fy] = rotVec(rot, dir, 0);
      const [ox, oy] = rotVec(rot, dir * 0.06, 0);
      return { off: [ox, oy], yaw: yawOf(fx, fy), pose: 'sit', y: 0.14 };
    }
    case 'Counter': {
      const barman = s.who === 'Barman';
      const [fx, fy] = rotVec(rot, 0, barman ? -1 : 1);
      return { off: [0, 0], yaw: yawOf(fx, fy), pose: 'stand', y: 0 };
    }
    case 'Anvil': {
      const [fx, fy] = rotVec(rot, -1, 0);
      return { off: [0, 0], yaw: yawOf(fx, fy), pose: 'stand', y: 0 };
    }
  }
  return null;
}

export class DwarfView {
  constructor(dwarf, scene, fx) {
    this.d = dwarf;
    this.fx = fx;
    this.root = buildDwarf(dwarf.job, dwarf.id + (dwarf.firstName || '').length * 97);
    this.root.rotation.order = 'YXZ';
    this.P = this.root.userData.parts;
    this.root.userData.dwarf = dwarf;
    scene.add(this.root);
    this.scene = scene;
    this.blob = new THREE.Mesh(blobGeo(), blobMat());
    this.blob.renderOrder = 1;
    scene.add(this.blob);
    this.yaw = DIR_YAW[dwarf.facing] || 0;
    this.walkPhase = Math.random() * 6;
    this.items = { right: null, left: null };
    this.itemKind = { right: null, left: null };
    this.blinkT = Math.random() * 4;
    this.hammerStrikes = 0;
    this.pos = new THREE.Vector3(dwarf.x + 0.5, 0, -dwarf.y - 0.5);
    this.root.position.copy(this.pos);
    this.lastAnim = null;
  }
  dispose() {
    this.scene.remove(this.root);
    this.scene.remove(this.blob);
  }
  // world position of the miner's helmet lamp / enchanter's crystal, for light effects
  lampWorld(v = new THREE.Vector3()) {
    const p = this.P.lamp || this.P.crystal;
    return p ? p.getWorldPosition(v) : null;
  }
  setItem(hand, kind) {
    if (this.itemKind[hand] === kind) return;
    const holder = hand === 'right' ? this.P.handR : this.P.handL;
    if (this.items[hand]) holder.remove(this.items[hand]);
    this.items[hand] = null;
    this.itemKind[hand] = kind;
    if (!kind) return;
    const m = itemModel(kind);
    if (kind.startsWith('pickaxe') || kind === 'hammer') {
      m.rotation.set(Math.PI / 2, 0, 0);
      m.position.set(0, 0, -0.05);
    } else {
      m.position.set(0, -0.04, 0.03);
    }
    holder.add(m);
    this.items[hand] = m;
  }

  update(dt, t, selected) {
    const d = this.d, P = this.P;
    // items
    let right = null;
    if (d.right instanceof Pickaxe) right = d.right.enchanted ? 'pickaxeE' : 'pickaxe';
    else if (d.right instanceof Beer) right = 'beer';
    const anim = d.anim;
    if (anim && anim.name === 'hammer') right = 'hammer';
    const inBed = d.pose === 'lie';
    this.setItem('right', inBed ? null : right);
    this.setItem('left', d.left && !inBed ? 'beer' : null);

    // position, with slot pose
    const sp = slotPose(d);
    let tx = d.x + 0.5, tz = -d.y - 0.5, ty = 0;
    let targetYaw = DIR_YAW[d.facing] ?? this.yaw;
    let pose = 'stand';
    if (sp) {
      tx += sp.off[0];
      tz -= sp.off[1];
      targetYaw = sp.yaw;
      pose = sp.pose;
      ty = sp.y;
    }
    const k = 1 - Math.exp(-dt * 18);
    this.pos.x += (tx - this.pos.x) * k;
    this.pos.z += (tz - this.pos.z) * k;
    this.pos.y += (ty - this.pos.y) * (1 - Math.exp(-dt * 10));
    let dy = targetYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * (1 - Math.exp(-dt * 12));
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.root.rotation.x += ((pose === 'lie' ? -Math.PI / 2 : 0) - this.root.rotation.x) * (1 - Math.exp(-dt * 8));

    // reset pose
    const body = this.root.children[0];
    body.position.y = 0;
    P.head.rotation.set(0, 0, 0);
    if (P.brows) {
      P.brows[0].rotation.z = 0.15;
      P.brows[1].rotation.z = -0.15;
      P.brows[0].position.y = P.brows[1].position.y = 0.082;
    }
    P.armL.rotation.set(0, 0, -0.12);
    P.armR.rotation.set(0, 0, 0.12);
    P.legL.rotation.set(0, 0, 0);
    P.legR.rotation.set(0, 0, 0);

    // breathing
    const breath = Math.sin(t * 2 + d.id) * 0.008;
    body.position.y += breath;

    if (pose === 'sit') {
      P.legL.rotation.x = -1.4;
      P.legR.rotation.x = -1.4;
    } else if (d.moving && pose === 'stand') {
      this.walkPhase += dt * 15 * d.speed;
      const s = Math.sin(this.walkPhase);
      P.legL.rotation.x = s * 0.75;
      P.legR.rotation.x = -s * 0.75;
      P.armL.rotation.x = -s * 0.6;
      P.armR.rotation.x = s * 0.6;
      body.position.y += Math.abs(Math.cos(this.walkPhase)) * 0.035;
      if (d.speed > 1 && Math.random() < 0.3) this.fx.speedTrail(this.pos.x, 0.15, this.pos.z);
    }

    if (anim) {
      const p = Math.min(1, anim.t / anim.dur);
      switch (anim.name) {
        case 'mine': {
          // fast strike at the start, slow wind-up after
          const a = p < 0.18 ? lerp(-2.8, -0.75, ease(p / 0.18)) : lerp(-0.75, -2.8, ease((p - 0.18) / 0.82));
          P.armR.rotation.x = a;
          P.armL.rotation.x = a * 0.85;
          P.armL.rotation.z = 0.3;
          P.armR.rotation.z = -0.3;
          body.position.y -= p < 0.18 ? 0.02 : 0;
          break;
        }
        case 'hammer': {
          const strikes = 3;
          const local = (p * strikes) % 1;
          const n = Math.floor(p * strikes);
          if (anim !== this.lastAnim) this.hammerStrikes = 0;
          if (local > 0.2 && this.hammerStrikes <= n) {
            this.hammerStrikes = n + 1;
            this.strike = true;
          }
          P.armR.rotation.x = local < 0.2 ? lerp(-2.6, -0.9, ease(local / 0.2)) : lerp(-0.9, -2.6, ease((local - 0.2) / 0.8));
          P.armL.rotation.x = -0.9;
          break;
        }
        case 'drink': {
          const a = Math.sin(Math.min(1, p * 1.6) * Math.PI);
          P.armL.rotation.x = -2.3 * a;
          P.armL.rotation.z = -0.12 - 0.5 * a;
          P.head.rotation.x = -0.35 * a;
          break;
        }
        case 'requestBeer':
          P.armR.rotation.x = -2.9;
          P.armR.rotation.z = 0.12 + Math.sin(t * 14) * 0.35;
          break;
        case 'replenish': {
          const a = Math.sin(p * Math.PI);
          P.armR.rotation.x = -1.3 * a;
          P.armL.rotation.x = -1.3 * a;
          body.position.y += a * 0.02;
          break;
        }
        case 'enchant': {
          P.armR.rotation.x = -2.7;
          P.armL.rotation.x = -2.7;
          P.armR.rotation.z = 0.5;
          P.armL.rotation.z = -0.5;
          body.position.y += 0.05 + Math.sin(t * 3) * 0.03;
          if (Math.random() < 0.6) this.fx.magic(this.pos.x, 0.6, this.pos.z, 1);
          break;
        }
        case 'complain':
          if (P.brows) {
            P.brows[0].rotation.z = -0.45;
            P.brows[1].rotation.z = 0.45;
            P.brows[0].position.y = P.brows[1].position.y = 0.07;
          }
          P.head.rotation.y = Math.sin(t * 22) * 0.35;
          P.armR.rotation.x = -2.2;
          P.armL.rotation.x = -2.2;
          P.armR.rotation.z = 0.7;
          P.armL.rotation.z = -0.7;
          break;
        case 'hop':
          body.position.y += Math.sin(p * Math.PI) * 0.16;
          break;
        case 'wake':
          P.armR.rotation.x = -3 * Math.sin(p * Math.PI);
          P.armL.rotation.x = -3 * Math.sin(p * Math.PI);
          break;
        case 'grumpyWake':
          P.head.rotation.y = Math.sin(t * 18) * 0.3;
          P.armR.rotation.z = 0.12 + Math.sin(p * Math.PI) * 1.2;
          P.armL.rotation.z = -0.12 - Math.sin(p * Math.PI) * 1.2;
          break;
      }
    }
    this.lastAnim = anim;

    // blinking eyes
    this.blinkT -= dt;
    let eye = 1;
    if (d.eyesClosed) eye = 0.12;
    else if (this.blinkT < 0) {
      eye = 0.15;
      if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 4;
    }
    for (const e of P.eyes) e.scale.y = eye;
    if (P.crystal) {
      P.crystal.rotation.y = t * 2;
      const s = anim && anim.name === 'enchant' ? 1.25 + Math.sin(t * 9) * 0.2 : 0.95 + Math.sin(t * 3) * 0.08;
      P.crystal.scale.set(0.8 * s, 1.3 * s, 0.8 * s);
    }
    if (P.hat) P.hat.rotation.z = Math.sin(t * 1.7 + d.id) * 0.06 + (d.moving ? Math.sin(this.walkPhase) * 0.08 : 0);
    // contact shadow
    const lying = pose === 'lie';
    this.blob.position.set(this.pos.x, lying ? 0.42 : 0.02 + this.pos.y * 0.0, this.pos.z);
    this.blob.visible = !lying;
    const lift = Math.max(0, body.position.y);
    this.blob.scale.setScalar(1 - lift * 1.5);
  }

  // world position of the head (for labels)
  headPos() {
    const lying = Math.abs(this.root.rotation.x) > 0.5;
    return [this.pos.x, this.pos.y + (lying ? 0.62 : 1.0), this.pos.z];
  }
  handWorld() {
    const v = new THREE.Vector3();
    this.P.handR.getWorldPosition(v);
    return v;
  }
}

let _blobGeo = null, _blobMat = null;
function blobGeo() {
  if (!_blobGeo) {
    _blobGeo = new THREE.PlaneGeometry(0.62, 0.62);
    _blobGeo.rotateX(-Math.PI / 2);
  }
  return _blobGeo;
}
function blobMat() {
  if (!_blobMat) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(0.6, 'rgba(0,0,0,0.25)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    _blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  }
  return _blobMat;
}
