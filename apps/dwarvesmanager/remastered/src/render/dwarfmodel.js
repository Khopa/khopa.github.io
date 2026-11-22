import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MATS, colorMat } from './models.js';

// Detailed procedural dwarves. Each dwarf gets a seeded variation (beard, hair, skin, build).
// Part API used by the animator: legL/legR, armL/armR, handL/handR, head, eyes, brows, staff, lamp.

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

const SKIN = [0xf2c09a, 0xe8ad84, 0xd99a70, 0xf5cfae, 0xc98a62];
const BEARDS = {
  Miner: [0x6b3a1c, 0x4a2a16, 0xa0521f, 0x2b211c, 0x8a5a2b],
  Barman: [0x5b3516, 0x7a4520, 0x3a2414, 0xb06a2a],
  Craftman: [0x9c8e80, 0x7d6f63, 0xb5aa9c, 0x6b5a4a],
  Enchanter: [0xf1ece2, 0xdcd6cc],
};
const OUTFIT = {
  Miner: { body: 0xb88a5a, trim: 0x6d4a2b, pants: 0x4a3b30 },
  Barman: { body: 0x3e7a44, trim: 0x2a522e, pants: 0x3b3430 },
  Craftman: { body: 0x7e3c43, trim: 0x52262b, pants: 0x34302d },
  Enchanter: { body: 0x8c2433, trim: 0xd9a63a, pants: 0x2b2027 },
};

function mesh(parent, geo, mat, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (o.rx) m.rotation.x = o.rx;
  if (o.ry) m.rotation.y = o.ry;
  if (o.rz) m.rotation.z = o.rz;
  if (o.s) m.scale.set(...o.s);
  m.castShadow = o.shadow !== false;
  m.receiveShadow = true;
  if (o.keep) m.userData.keep = true;
  parent.add(m);
  return m;
}
const sph = (r, ws = 16, hs = 12, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) => new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl);
const cyl = (rt, rb, h, s = 14, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
// curved apron wrapping the belly (front = +Z)
const apron = (r, h, spread = 1.0) => {
  const g = new THREE.CylinderGeometry(r, r * 1.08, h, 14, 1, true, -spread, spread * 2);
  return g;
};
const lathe = (pts, s = 18) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), s);

// Merge the static meshes directly under `group` that share a material (fewer draw calls).
function mergeStatic(group) {
  const byMat = new Map();
  for (const c of [...group.children]) {
    if (!c.isMesh || c.userData.keep) continue;
    const list = byMat.get(c.material) || [];
    list.push(c);
    byMat.set(c.material, list);
  }
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      m.updateMatrix();
      let g = m.geometry.index ? m.geometry : m.geometry;
      g = g.clone().applyMatrix4(m.matrix);
      if (!g.index) g = g.toNonIndexed ? g : g;
      return g;
    });
    // all geometries must agree on being indexed
    const indexed = geos.every((g) => g.index);
    const ready = indexed ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g));
    for (const g of ready) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const merged = mergeGeometries(ready, false);
    if (!merged) continue;
    for (const m of list) group.remove(m);
    const mm = new THREE.Mesh(merged, mat);
    mm.castShadow = true;
    mm.receiveShadow = true;
    group.add(mm);
  }
}

export function buildDwarf(job, seed = 1) {
  const r = rng(seed * 7919 + job.length * 31);
  const fit = OUTFIT[job];
  const skin = colorMat(pick(r, SKIN), { roughness: 0.7 });
  const nose = colorMat(0xe8957a, { roughness: 0.6 });
  const beardHex = pick(r, BEARDS[job]);
  const beard = colorMat(beardHex, { roughness: 1 });
  const hair = job === 'Craftman' || job === 'Enchanter' ? beard : colorMat(new THREE.Color(beardHex).multiplyScalar(0.8).getHex(), { roughness: 1 });
  const body = colorMat(fit.body, { roughness: 0.92 });
  const trim = colorMat(fit.trim, { roughness: job === 'Enchanter' ? 0.35 : 0.9, metalness: job === 'Enchanter' ? 0.8 : 0 });
  const pants = colorMat(fit.pants, { roughness: 0.95 });
  const leather = MATS.leather();
  const boots = MATS.boots();
  const robe = job === 'Enchanter';
  const belly = 1 + (r() - 0.4) * 0.18;
  const tall = 0.95 + r() * 0.1;

  const root = new THREE.Group();
  const bodyG = new THREE.Group();
  root.add(bodyG);
  const P = {};

  // ---- legs & boots (pivot at hip)
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.075, 0.2, 0);
    mesh(leg, cyl(0.055, 0.05, 0.13, 10), pants, 0, -0.07, 0);
    mesh(leg, sph(0.062, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), boots, 0, -0.165, 0.02, { s: [1, 0.9, 1.45] });
    mesh(leg, cyl(0.063, 0.063, 0.03, 12), boots, 0, -0.165, 0.02, { s: [1, 1, 1.45] });
    mesh(leg, cyl(0.058, 0.058, 0.035, 10), colorMat(0x3a2a1e), 0, -0.13, 0);
    bodyG.add(leg);
    P[side < 0 ? 'legL' : 'legR'] = leg;
    mergeStatic(leg);
  }

  // ---- torso (lathe): hem, belly, chest, shoulders
  const b = belly;
  const torsoProfile = robe
    ? [[0.0, 0.02], [0.22, 0.02], [0.215, 0.08], [0.2, 0.2], [0.19 * b, 0.3], [0.185, 0.4], [0.15, 0.47], [0.07, 0.5], [0, 0.505]]
    : [[0.0, 0.14], [0.17, 0.14], [0.175, 0.17], [0.18 * b, 0.24], [0.195 * b, 0.3], [0.185, 0.38], [0.15, 0.46], [0.07, 0.5], [0, 0.505]];
  mesh(bodyG, lathe(torsoProfile, 20), body, 0, 0, 0);
  // hem trim
  mesh(bodyG, new THREE.TorusGeometry(robe ? 0.218 : 0.172, 0.012, 6, 24), trim, 0, robe ? 0.03 : 0.15, 0, { rx: Math.PI / 2 });
  // belt + buckle
  mesh(bodyG, new THREE.TorusGeometry(0.185 * b, 0.022, 6, 24), leather, 0, 0.245, 0, { rx: Math.PI / 2 });
  mesh(bodyG, new THREE.BoxGeometry(0.07, 0.055, 0.02), MATS.gold(), 0, 0.245, 0.19 * b + 0.01);
  mesh(bodyG, new THREE.BoxGeometry(0.035, 0.025, 0.022), leather, 0, 0.245, 0.19 * b + 0.012);
  // shoulders
  for (const side of [-1, 1]) mesh(bodyG, sph(0.07, 12, 8), job === 'Miner' ? leather : body, side * 0.15, 0.43, 0, { s: [1, 0.85, 1] });

  // job outfit details
  if (job === 'Barman') {
    mesh(bodyG, apron(0.2 * b, 0.26, 0.85), colorMat(0xe6e0d2, { roughness: 0.95, side: THREE.DoubleSide }), 0, 0.2, 0);
    mesh(bodyG, new THREE.BoxGeometry(0.06, 0.22, 0.015), MATS.white(), -0.12, 0.44, 0.02, { rz: 0.5, rx: 0.2 }); // towel on shoulder
    mesh(bodyG, new THREE.BoxGeometry(0.03, 0.16, 0.02), colorMat(0x2a2a2a), 0.06, 0.38, 0.16, { rz: -0.15 }); // vest strap
    mesh(bodyG, new THREE.BoxGeometry(0.03, 0.16, 0.02), colorMat(0x2a2a2a), -0.06, 0.38, 0.16, { rz: 0.15 });
  } else if (job === 'Craftman') {
    mesh(bodyG, apron(0.202 * b, 0.3, 0.95), colorMat(0x5c3a22, { roughness: 0.85, side: THREE.DoubleSide }), 0, 0.27, 0);
    mesh(bodyG, apron(0.17, 0.08, 0.6), colorMat(0x5c3a22, { roughness: 0.85, side: THREE.DoubleSide }), 0, 0.41, 0);
    mesh(bodyG, new THREE.BoxGeometry(0.05, 0.05, 0.03), MATS.iron(), 0.07, 0.2, 0.2 * b + 0.03); // apron rivets/pocket
    // hammer hanging at the belt
    const hm = new THREE.Group();
    hm.position.set(0.17 * b, 0.2, 0.06);
    hm.rotation.z = 0.25;
    mesh(hm, cyl(0.012, 0.012, 0.16, 6), MATS.woodLight(), 0, -0.05, 0);
    mesh(hm, new THREE.BoxGeometry(0.08, 0.04, 0.04), MATS.iron(), 0, 0.03, 0);
    bodyG.add(hm);
  } else if (job === 'Miner') {
    // satchel strap & bag
    mesh(bodyG, new THREE.TorusGeometry(0.2, 0.014, 5, 24, Math.PI * 1.1), leather, 0, 0.33, 0, { rz: 0.9, ry: Math.PI / 2 });
    mesh(bodyG, new THREE.BoxGeometry(0.1, 0.09, 0.06), leather, -0.17 * b, 0.22, 0.05, { ry: -0.4 });
  } else if (robe) {
    // stars on the robe
    const star = new THREE.OctahedronGeometry(0.018);
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2, y = 0.08 + r() * 0.28;
      const rad = 0.215 - (y - 0.05) * 0.1;
      mesh(bodyG, star, trim, Math.sin(a) * rad, y, Math.cos(a) * rad, { shadow: false });
    }
  }

  // ---- head
  const head = new THREE.Group();
  head.position.set(0, 0.63 * tall, 0);
  bodyG.add(head);
  P.head = head;
  mesh(head, sph(0.155, 22, 16), skin, 0, 0, 0);
  // ears
  for (const side of [-1, 1]) mesh(head, sph(0.04, 10, 8), skin, side * 0.15, 0.0, -0.01, { s: [0.55, 1, 0.8] });
  // nose: big round dwarf nose
  const noseSize = 0.045 + r() * 0.015;
  mesh(head, sph(noseSize, 14, 10), nose, 0, -0.02, 0.15, { s: [1, 0.95, 1.1] });
  // cheeks
  for (const side of [-1, 1]) mesh(head, sph(0.035, 10, 8), colorMat(0xf0a58e, { roughness: 0.7 }), side * 0.085, -0.035, 0.12);
  // eyes (keep separate for blinking)
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.058, 0.035, 0.13);
    mesh(eye, sph(0.03, 12, 10), MATS.white(), 0, 0, 0, { s: [1, 1.1, 0.6], shadow: false });
    mesh(eye, sph(0.017, 10, 8), MATS.eye(), 0, 0, 0.014, { shadow: false });
    mesh(eye, sph(0.005, 6, 4), colorMat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.6 }), 0.006, 0.007, 0.027, { shadow: false });
    head.add(eye);
    eyes.push(eye);
  }
  P.eyes = eyes;
  // bushy brows (animated)
  const brows = [];
  for (const side of [-1, 1]) {
    const brow = mesh(head, sph(0.03, 10, 6), hair === beard ? beard : hair, side * 0.06, 0.082, 0.128, { s: [1.5, 0.55, 0.7], rz: side * -0.15, keep: true });
    brows.push(brow);
  }
  P.brows = brows;

  // beard: layered lobes
  const long = robe ? 1.7 : 1 + r() * 0.35;
  mesh(head, sph(0.15, 18, 12, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58), beard, 0, -0.025, 0.02, { s: [1.04, 1.1 * long, 0.95] });
  mesh(head, sph(0.1, 14, 10), beard, 0, -0.13 * long, 0.085, { s: [1.15, 1.15 * long, 0.75] });
  mesh(head, sph(0.075, 12, 8), beard, 0, -0.2 * long, 0.08, { s: [0.95, 1.2, 0.7] });
  // mustache
  for (const side of [-1, 1]) mesh(head, sph(0.05, 12, 8), beard, side * 0.05, -0.055, 0.145, { s: [1.3, 0.55, 0.65], rz: side * 0.35 });
  // braids with golden beads
  if (job === 'Craftman' || (job === 'Miner' && r() > 0.5) || robe) {
    for (const side of [-1, 1]) {
      mesh(head, cyl(0.022, 0.016, 0.11 * long, 8), beard, side * 0.055, -0.25 * long, 0.07);
      mesh(head, cyl(0.026, 0.026, 0.03, 10), MATS.gold(), side * 0.055, -0.29 * long, 0.07);
    }
  }

  // hair / hats
  if (job === 'Miner') {
    const helm = colorMat(0x6f6a62, { metalness: 0.55, roughness: 0.55 });
    mesh(head, sph(0.165, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), helm, 0, 0.03, -0.005);
    mesh(head, cyl(0.2, 0.2, 0.018, 24), helm, 0, 0.035, 0);
    mesh(head, new THREE.TorusGeometry(0.165, 0.01, 6, 24), helm, 0, 0.1, -0.005, { rx: Math.PI / 2 });
    // lamp
    mesh(head, cyl(0.035, 0.04, 0.05, 12), MATS.iron(), 0, 0.1, 0.15, { rx: Math.PI / 2 - 0.3 });
    const lens = mesh(head, new THREE.CircleGeometry(0.032, 14), colorMat(0xfff2c8, { emissive: 0xffd88a, emissiveIntensity: 4 }), 0, 0.108, 0.177, { rx: -0.3, shadow: false, keep: true });
    P.lamp = lens;
  } else if (job === 'Barman') {
    // bald top with a fringe and side hair
    mesh(head, new THREE.TorusGeometry(0.135, 0.035, 8, 20, Math.PI * 1.25), hair, 0, 0.03, -0.01, { rx: Math.PI / 2, rz: -Math.PI * 0.125 + Math.PI });
    mesh(head, sph(0.05, 10, 8), hair, 0, 0.06, -0.13, { s: [2.2, 1, 0.8] });
  } else if (job === 'Craftman') {
    mesh(head, sph(0.158, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, 0, 0.012, -0.012);
    mesh(head, new THREE.TorusGeometry(0.157, 0.018, 6, 24), colorMat(0x5c5c5c), 0, 0.06, 0, { rx: Math.PI / 2 - 0.08 });
    // goggles on the forehead
    const gl = colorMat(0x9fd8ff, { roughness: 0.05, metalness: 0.3, emissive: 0x204060, emissiveIntensity: 0.4 });
    for (const side of [-1, 1]) {
      mesh(head, cyl(0.035, 0.035, 0.03, 14), MATS.steel(), side * 0.05, 0.1, 0.13, { rx: Math.PI / 2 - 0.55 });
      mesh(head, new THREE.CircleGeometry(0.028, 14), gl, side * 0.05, 0.11, 0.146, { rx: -0.55, shadow: false });
    }
  } else if (robe) {
    const hatMat = colorMat(0x4a3a7a, { roughness: 0.85 });
    mesh(head, cyl(0.24, 0.24, 0.02, 24), hatMat, 0, 0.07, 0);
    mesh(head, cyl(0.12, 0.155, 0.2, 18), hatMat, 0, 0.17, -0.01, { rx: -0.08 });
    mesh(head, cyl(0.157, 0.157, 0.035, 18), MATS.gold(), 0, 0.09, 0);
    const tip = new THREE.Group();
    tip.position.set(0, 0.27, -0.03);
    tip.rotation.x = -0.45;
    mesh(tip, new THREE.ConeGeometry(0.12, 0.26, 18), hatMat, 0, 0.12, 0);
    head.add(tip);
    P.hat = tip;
    mesh(head, new THREE.OctahedronGeometry(0.03), MATS.magic(), 0, 0.17, 0.135, { shadow: false, keep: true });
  }

  // ---- arms
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.19, 0.44, 0);
    mesh(arm, cyl(0.05, 0.045, 0.14, 10), body, 0, -0.07, 0);
    mesh(arm, sph(0.05, 10, 8), body, 0, -0.14, 0);
    const fore = new THREE.Group();
    fore.position.set(0, -0.14, 0);
    fore.rotation.x = -0.25;
    const gloves = job === 'Craftman' || job === 'Miner';
    mesh(fore, cyl(0.045, 0.04, 0.11, 10), robe ? body : gloves ? leather : skin, 0, -0.055, 0);
    if (job === 'Barman') mesh(fore, cyl(0.05, 0.05, 0.03, 10), MATS.white(), 0, -0.005, 0); // rolled sleeve
    const hand = new THREE.Group();
    hand.position.set(0, -0.12, 0);
    const hmat = gloves ? leather : skin;
    mesh(hand, sph(0.052, 12, 10), hmat, 0, -0.01, 0, { s: [1, 1.1, 0.85] });
    mesh(hand, sph(0.024, 8, 6), hmat, -side * 0.04, 0.005, 0.025);
    fore.add(hand);
    arm.add(fore);
    arm.rotation.z = side * 0.12;
    bodyG.add(arm);
    mergeStatic(fore);
    mergeStatic(arm);
    P[side < 0 ? 'armL' : 'armR'] = arm;
    P[side < 0 ? 'handL' : 'handR'] = hand;
  }
  if (robe) {
    const staff = new THREE.Group();
    mesh(staff, cyl(0.015, 0.02, 0.8, 7), MATS.woodDark(), 0, 0.15, 0);
    mesh(staff, new THREE.TorusGeometry(0.04, 0.01, 6, 12), MATS.gold(), 0, 0.56, 0);
    const crystal = mesh(staff, new THREE.OctahedronGeometry(0.05), MATS.magic(), 0, 0.6, 0, { shadow: false, keep: true });
    crystal.scale.set(0.8, 1.3, 0.8);
    staff.rotation.x = 0.12;
    P.handL.add(staff);
    P.staff = staff;
    P.crystal = crystal;
  }

  mergeStatic(head);
  mergeStatic(bodyG);
  root.userData.parts = P;
  root.userData.scale = tall;
  return root;
}
