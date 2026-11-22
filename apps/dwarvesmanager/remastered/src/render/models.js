import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Procedural low-poly models. Object models are built in a local frame where
// the footprint spans x in [0, nx] and z in [-ny, 0], floor at y = 0.

const M = {};
function mat(name, opts) {
  if (!M[name]) M[name] = new THREE.MeshStandardMaterial(opts);
  return M[name];
}
export const MATS = {
  wood: () => mat('wood', { color: 0x8a5a33, roughness: 0.8 }),
  woodDark: () => mat('woodDark', { color: 0x5a3519, roughness: 0.85 }),
  woodLight: () => mat('woodLight', { color: 0xb07a45, roughness: 0.75 }),
  iron: () => mat('iron', { color: 0x4a4d52, roughness: 0.4, metalness: 0.85 }),
  steel: () => mat('steel', { color: 0xa7adb5, roughness: 0.3, metalness: 0.9 }),
  gold: () => mat('gold', { color: 0xd9a63a, roughness: 0.3, metalness: 1 }),
  stone: () => mat('stone', { color: 0x6c6560, roughness: 0.95, flatShading: true }),
  stoneDark: () => mat('stoneDark', { color: 0x47423f, roughness: 0.95, flatShading: true }),
  cloth: () => mat('cloth', { color: 0x4f8f5a, roughness: 1 }),
  linen: () => mat('linen', { color: 0xc9bfa8, roughness: 1 }),
  pillow: () => mat('pillow', { color: 0xd6cdb9, roughness: 1 }),
  beer: () => mat('beer', { color: 0xd9901f, roughness: 0.3, emissive: 0x3a1c00, emissiveIntensity: 0.4 }),
  foam: () => mat('foam', { color: 0xfff3d6, roughness: 0.9 }),
  ember: () => mat('ember', { color: 0x2a0d05, emissive: 0xff5a10, emissiveIntensity: 1.4, roughness: 1 }),
  candle: () => mat('candle', { color: 0xf3e7c4, roughness: 0.6 }),
  flame: () => mat('flame', { color: 0xffd27a, emissive: 0xffa53a, emissiveIntensity: 3, roughness: 1 }),
  magic: () => mat('magic', { color: 0x9ff3ff, emissive: 0x47d6ff, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.2 }),
  skin: () => mat('skin', { color: 0xf2b98a, roughness: 0.75 }),
  boots: () => mat('boots', { color: 0x2b211b, roughness: 0.9 }),
  pants: () => mat('pants', { color: 0x3b3430, roughness: 0.9 }),
  eye: () => mat('eye', { color: 0x15100c, roughness: 0.3 }),
  white: () => mat('white', { color: 0xd9d3c6, roughness: 0.9 }),
  leather: () => mat('leather', { color: 0x5c3a22, roughness: 0.85 }),
};
export function colorMat(hex, extra = {}) {
  return mat('c' + hex.toString(16) + JSON.stringify(extra), { color: hex, roughness: 0.85, ...extra });
}

function add(group, geo, material, x, y, z, opts = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.rz) m.rotation.z = opts.rz;
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = true;
  group.add(m);
  return m;
}
const box = (w, h, d, r = 0.02) => (r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);

// ---------------------------------------------------------------------- objects
function bed() {
  const g = new THREE.Group();
  const W = MATS.wood(), D = MATS.woodDark();
  add(g, box(1.84, 0.16, 0.8, 0.03), W, 1, 0.2, -0.5);
  for (const [x, z] of [[0.12, -0.15], [1.88, -0.15], [0.12, -0.85], [1.88, -0.85]]) add(g, box(0.09, 0.2, 0.09, 0.01), D, x, 0.1, z);
  add(g, box(0.1, 0.55, 0.86, 0.03), D, 0.08, 0.36, -0.5);
  add(g, box(0.08, 0.36, 0.86, 0.03), D, 1.94, 0.26, -0.5);
  add(g, box(1.72, 0.12, 0.72, 0.05), MATS.linen(), 1, 0.33, -0.5);
  add(g, box(0.34, 0.1, 0.52, 0.05), MATS.pillow(), 0.32, 0.42, -0.5);
  const blanket = add(g, box(1.12, 0.1, 0.78, 0.05), MATS.cloth(), 1.36, 0.37, -0.5);
  blanket.name = 'blanket';
  return g;
}

function table() {
  const g = new THREE.Group();
  const W = MATS.wood(), D = MATS.woodDark();
  for (let i = 0; i < 4; i++) add(g, box(0.52, 0.08, 2.62, 0.02), i % 2 ? W : MATS.woodLight(), 1.25 + i * 0.5, 0.52, -1.5);
  add(g, box(1.9, 0.08, 0.1, 0.02), D, 2, 0.44, -0.4);
  add(g, box(1.9, 0.08, 0.1, 0.02), D, 2, 0.44, -2.6);
  for (const [x, z] of [[1.15, -0.35], [2.85, -0.35], [1.15, -2.65], [2.85, -2.65]]) add(g, box(0.1, 0.48, 0.1, 0.02), D, x, 0.24, z);
  for (let r = 0; r < 3; r++)
    for (const x of [0.55, 3.45]) {
      add(g, cyl(0.17, 0.15, 0.06, 14), W, x, 0.3, -0.5 - r);
      add(g, cyl(0.04, 0.05, 0.28, 8), D, x, 0.14, -0.5 - r);
    }
  // decoration
  const m1 = mug();
  m1.position.set(1.5, 0.56, -0.9);
  g.add(m1);
  const m2 = mug();
  m2.position.set(2.5, 0.56, -2.1);
  m2.rotation.y = 2;
  g.add(m2);
  add(g, cyl(0.035, 0.04, 0.14, 10), MATS.candle(), 2.05, 0.63, -1.5);
  const flame = add(g, new THREE.SphereGeometry(0.03, 8, 6), MATS.flame(), 2.05, 0.73, -1.5, { shadow: false });
  flame.scale.set(1, 1.8, 1);
  flame.name = 'flame';
  g.userData.emitter = { x: 2.05, y: 0.8, z: -1.5, color: 0xffb060, power: 0.6 };
  return g;
}

function barrel() {
  const g = new THREE.Group();
  const prof = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    prof.push(new THREE.Vector2(0.27 + Math.sin(t * Math.PI) * 0.07, t * 0.78));
  }
  const body = new THREE.LatheGeometry(prof, 18);
  add(g, body, MATS.wood(), 0.5, 0, -0.5);
  add(g, new THREE.CircleGeometry(0.27, 18), MATS.woodDark(), 0.5, 0.78, -0.5, { rx: -Math.PI / 2 });
  for (const y of [0.1, 0.39, 0.68]) {
    const r = 0.27 + Math.sin((y / 0.78) * Math.PI) * 0.07 + 0.006;
    add(g, new THREE.TorusGeometry(r, 0.014, 6, 24), MATS.iron(), 0.5, y, -0.5, { rx: Math.PI / 2 });
  }
  add(g, cyl(0.025, 0.025, 0.12, 8), MATS.steel(), 0.5, 0.3, -0.13, { rx: Math.PI / 2 });
  add(g, box(0.03, 0.06, 0.03, 0), MATS.steel(), 0.5, 0.27, -0.07);
  return g;
}

function anvil() {
  const g = new THREE.Group();
  add(g, cyl(0.28, 0.32, 0.34, 14), MATS.woodDark(), 0.5, 0.17, -0.5);
  add(g, new THREE.CircleGeometry(0.28, 14), MATS.woodLight(), 0.5, 0.341, -0.5, { rx: -Math.PI / 2 });
  const I = MATS.iron();
  add(g, box(0.34, 0.08, 0.26, 0.01), I, 0.5, 0.38, -0.5);
  add(g, box(0.18, 0.12, 0.14, 0.01), I, 0.5, 0.48, -0.5);
  add(g, box(0.46, 0.1, 0.22, 0.02), MATS.steel(), 0.52, 0.58, -0.5);
  const horn = add(g, new THREE.ConeGeometry(0.07, 0.24, 10), MATS.steel(), 0.17, 0.585, -0.5, { rz: Math.PI / 2 });
  horn.scale.set(1, 1, 0.8);
  // tongs and a bucket for flavour
  add(g, cyl(0.12, 0.1, 0.2, 12), MATS.wood(), 0.82, 0.1, -0.85);
  add(g, new THREE.CircleGeometry(0.11, 12), colorMat(0x2a4d6b, { roughness: 0.1, metalness: 0.2 }), 0.82, 0.19, -0.85, { rx: -Math.PI / 2 });
  // a glowing ingot on the anvil
  const ingot = add(g, box(0.16, 0.035, 0.07, 0.01), MATS.ember(), 0.56, 0.645, -0.5, { shadow: false });
  ingot.name = 'ingot';
  return g;
}

export function pickaxe(enchanted = false) {
  const g = new THREE.Group();
  add(g, cyl(0.016, 0.018, 0.36, 6), MATS.woodLight(), 0, 0.18, 0);
  const head = new THREE.TorusGeometry(0.11, 0.02, 5, 10, Math.PI * 0.75);
  const h = add(g, head, enchanted ? MATS.magic() : MATS.steel(), 0, 0.27, 0, { rz: Math.PI * 0.125 });
  h.scale.set(1, 0.6, 1);
  return g;
}
function hammer() {
  const g = new THREE.Group();
  add(g, cyl(0.014, 0.016, 0.26, 6), MATS.woodLight(), 0, 0.13, 0);
  add(g, box(0.12, 0.06, 0.06, 0.01), MATS.iron(), 0, 0.27, 0);
  return g;
}
export function mug() {
  const g = new THREE.Group();
  add(g, cyl(0.045, 0.04, 0.1, 10), MATS.woodLight(), 0, 0.05, 0);
  add(g, cyl(0.04, 0.04, 0.012, 10), MATS.foam(), 0, 0.104, 0, { shadow: false });
  add(g, new THREE.TorusGeometry(0.03, 0.008, 5, 8, Math.PI), MATS.woodDark(), 0.045, 0.05, 0, { rz: -Math.PI / 2 });
  return g;
}

function rack() {
  const g = new THREE.Group();
  const D = MATS.woodDark();
  add(g, box(0.07, 0.8, 0.07, 0.01), D, 0.12, 0.4, -0.72);
  add(g, box(0.07, 0.8, 0.07, 0.01), D, 0.88, 0.4, -0.72);
  add(g, box(0.86, 0.06, 0.08, 0.01), MATS.wood(), 0.5, 0.72, -0.72);
  add(g, box(0.86, 0.05, 0.08, 0.01), MATS.wood(), 0.5, 0.18, -0.72);
  add(g, box(0.9, 0.04, 0.4, 0.01), MATS.wood(), 0.5, 0.02, -0.6);
  const holder = new THREE.Group();
  holder.name = 'items';
  g.add(holder);
  return g;
}
export function setRackItems(model, items) {
  const holder = model.getObjectByName('items');
  if (!holder) return;
  while (holder.children.length) holder.remove(holder.children[0]);
  items.forEach((p, i) => {
    const pk = pickaxe(p.enchanted);
    pk.position.set(0.2 + i * 0.15, 0.06, -0.62);
    pk.rotation.set(-0.15, Math.PI / 2, 0.05);
    holder.add(pk);
  });
}

function counter() {
  const g = new THREE.Group();
  const W = MATS.wood(), T = MATS.woodLight(), D = MATS.woodDark();
  add(g, box(3, 0.56, 0.32, 0.03), W, 1.5, 0.28, -0.98);
  add(g, box(3.1, 0.06, 0.42, 0.02), T, 1.5, 0.59, -0.98);
  add(g, box(0.3, 0.56, 0.9, 0.03), W, 0.15, 0.28, -1.55);
  add(g, box(0.36, 0.06, 0.96, 0.02), T, 0.15, 0.59, -1.55);
  add(g, box(0.3, 0.56, 0.9, 0.03), W, 2.85, 0.28, -1.55);
  add(g, box(0.36, 0.06, 0.96, 0.02), T, 2.85, 0.59, -1.55);
  for (let i = 0; i < 6; i++) add(g, box(0.02, 0.4, 0.01, 0), D, 0.3 + i * 0.48, 0.28, -0.815, { shadow: false });
  // taps and mugs
  add(g, box(0.18, 0.2, 0.12, 0.02), MATS.gold(), 1.5, 0.72, -1.02);
  add(g, cyl(0.012, 0.012, 0.1, 6), MATS.gold(), 1.5, 0.75, -0.94, { rx: Math.PI / 2 });
  const m = mug();
  m.position.set(0.6, 0.62, -0.98);
  g.add(m);
  const m2 = mug();
  m2.position.set(2.45, 0.62, -0.95);
  g.add(m2);
  const beer = mug();
  beer.name = 'servedBeer';
  beer.position.set(1.5, 0.62, -0.88);
  beer.visible = false;
  g.add(beer);
  return g;
}

function hearth() {
  const g = new THREE.Group();
  const stones = new THREE.DodecahedronGeometry(0.1, 0);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const s = add(g, stones, i % 2 ? MATS.stone() : MATS.stoneDark(), 0.5 + Math.cos(a) * 0.34, 0.07, -0.5 + Math.sin(a) * 0.34, { ry: a });
    s.scale.set(1.1, 0.8, 1);
  }
  add(g, cyl(0.3, 0.32, 0.03, 16), MATS.stoneDark(), 0.5, 0.015, -0.5);
  for (let i = 0; i < 3; i++) add(g, cyl(0.04, 0.045, 0.5, 7), MATS.woodDark(), 0.5, 0.09, -0.5, { rz: Math.PI / 2, ry: (i / 3) * Math.PI });
  add(g, new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), MATS.ember(), 0.5, 0.05, -0.5, { shadow: false });
  const fire = new THREE.Group();
  fire.name = 'fire';
  fire.position.set(0.5, 0.06, -0.5);
  const fmat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const fmat2 = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.07 + (i === 0 ? 0.05 : 0), 0.32 + (i === 0 ? 0.15 : 0), 7, 1, true), i === 0 ? fmat2 : fmat);
    const a = (i / 5) * Math.PI * 2;
    c.position.set(i ? Math.cos(a) * 0.08 : 0, 0.16, i ? Math.sin(a) * 0.08 : 0);
    c.userData.phase = i * 1.7;
    fire.add(c);
  }
  g.add(fire);
  g.userData.emitter = { x: 0.5, y: 0.45, z: -0.5, color: 0xff8a3a, power: 2.6, flicker: true };
  return g;
}

const BUILDERS = { Bed: bed, TableObject: table, Barrel: barrel, Anvil: anvil, Rack: rack, Counter: counter, Hearth: hearth };
export function objectModel(type) {
  const g = BUILDERS[type]();
  g.userData.type = type;
  return g;
}

// Item meshes held in hands, cached by kind
export function itemModel(kind) {
  if (kind === 'pickaxe') return pickaxe(false);
  if (kind === 'pickaxeE') return pickaxe(true);
  if (kind === 'beer') return mug();
  if (kind === 'hammer') return hammer();
  return null;
}
