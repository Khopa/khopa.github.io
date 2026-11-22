import * as THREE from 'three';
import { CELL } from './textures.js';
import { tileDef } from '../defs.js';

const CHUNK = 16;
const BEVEL = 0.07;

// Visual configuration per tile id
const LOOK = {
  1: { h: 1.32, top: CELL.bedrockTop, side: CELL.bedrockSide, deep: 0.45, flat: true, period: 4 },
  2: { h: 0.96, top: CELL.dirtTop, side: CELL.dirtSide, deep: 0.25 },
  3: { h: 1.02, top: CELL.clayTop, side: CELL.claySide, deep: 0.25 },
  4: { h: 1.0, top: CELL.diamond, side: CELL.oreSide, deep: 0.0 },
  9: { h: 1.0, top: CELL.amethyst, side: CELL.oreSide, deep: 0.05 },
  10: { h: 1.0, top: CELL.sapphire, side: CELL.oreSide, deep: 0.05 },
  11: { h: 1.0, top: CELL.emerald, side: CELL.oreSide, deep: 0.05 },
  12: { h: 1.12, top: CELL.graniteTop, side: CELL.graniteSide, deep: 0.25 },
  17: { h: 0.98, top: CELL.poorore, side: CELL.oreSide, deep: 0.1 },
};
const lookOf = (id) => LOOK[id] || LOOK[1];

export const GEM_COLORS = {
  9: 0xb05cff, // amethyst
  10: 0x3f7bff, // sapphire
  11: 0x2cf07a, // emerald
  17: 0xc0609a, // poor ore
};

function hash2(x, y, s = 0) {
  let h = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export class Terrain {
  constructor(map, atlas, scene, quality) {
    this.map = map;
    this.atlas = atlas;
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.material = new THREE.MeshStandardMaterial({
      map: atlas.map,
      normalMap: atlas.normalMap,
      normalScale: new THREE.Vector2(0.9, 0.9),
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.0,
    });
    this.chunks = new Map();
    this.cw = Math.ceil(map.w / CHUNK);
    this.ch = Math.ceil(map.h / CHUNK);
    this.dist = new Uint8Array(map.w * map.h);
    this.computeDistance();
    for (let cy = 0; cy < this.ch; cy++) for (let cx = 0; cx < this.cw; cx++) this.buildChunk(cx, cy);
    this.buildSkirt();
    this.gems = new Gems(map, scene, this);
    this.dirty = new Set();
  }

  heightAt(x, y) {
    if (!this.map.inside(x, y)) return lookOf(1).h;
    const id = this.map.get(x, y);
    if (!tileDef(id).collide) return 0;
    const look = lookOf(id);
    const d = this.dist[y * this.map.w + x];
    const jitter = d <= 4 && !look.flat ? (hash2(x, y, 1) - 0.5) * 0.1 : 0;
    return look.h + jitter;
  }

  // Distance (in tiles) from open floor, used to darken the deep rock mass.
  computeDistance() {
    const { w, h } = this.map;
    const dist = this.dist;
    dist.fill(255);
    const q = new Int32Array(w * h);
    let qh = 0, qt = 0;
    for (let i = 0; i < w * h; i++)
      if (!this.map.blocking(i % w, (i / w) | 0)) {
        dist[i] = 0;
        q[qt++] = i;
      }
    while (qh < qt) {
      const c = q[qh++];
      const d = dist[c];
      if (d >= 14) continue;
      const x = c % w, y = (c / w) | 0;
      const nb = [x + 1 < w ? c + 1 : -1, x > 0 ? c - 1 : -1, y + 1 < h ? c + w : -1, y > 0 ? c - w : -1];
      for (const n of nb) if (n >= 0 && dist[n] > d + 1) {
        dist[n] = d + 1;
        q[qt++] = n;
      }
    }
  }

  buildChunk(cx, cy) {
    const old = this.chunks.get(cy * this.cw + cx);
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
    }
    const pos = [], nor = [], uv = [], col = [], idx = [];
    const map = this.map;
    const atlasUV = this.atlas.uv;
    const pushQuad = (p, uvs, cols) => {
      const base = pos.length / 3;
      const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
      const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      for (let k = 0; k < 4; k++) {
        pos.push(p[k][0], p[k][1], p[k][2]);
        nor.push(nx, ny, nz);
        uv.push(uvs[k][0], uvs[k][1]);
        const c = cols[k];
        col.push(c, c, c);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    // local tile coords (s,t) in [0,1] -> atlas uv with rotation
    const cellUV = (cell, s, t, rot) => {
      const [u0, v0, u1, v1] = atlasUV(cell);
      let a = s, b = t;
      if (rot === 1) [a, b] = [1 - t, s];
      else if (rot === 2) [a, b] = [1 - s, 1 - t];
      else if (rot === 3) [a, b] = [t, 1 - s];
      return [u0 + a * (u1 - u0), v0 + b * (v1 - v0)];
    };
    // world-space mapping so textures flow across tiles without seams
    const mod = (a, p) => ((a % p) + p) % p;
    const worldUV = (cell, X, Z, P) => {
      const [u0, v0, u1, v1] = atlasUV(cell);
      return [u0 + (mod(X, P) / P) * (u1 - u0), v0 + (mod(Z, P) / P) * (v1 - v0)];
    };
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    for (let y = y0; y < Math.min(y0 + CHUNK, map.h); y++) {
      for (let x = x0; x < Math.min(x0 + CHUNK, map.w); x++) {
        const id = map.get(x, y);
        // World corners: A (x, -y) near-left, B (x+1, -y), C (x+1, -y-1), D (x, -y-1)
        const X0 = x, X1 = x + 1, Zn = -y, Zf = -y - 1;
        if (!tileDef(id).collide) {
          const wall = (dx, dy) => (map.blocking(x + dx, y + dy) ? 1 : 0);
          const ao = (s1, s2, c) => [0.42, 0.62, 0.82, 1][s1 && s2 ? 0 : 3 - (s1 + s2 + c)];
          const aA = ao(wall(-1, 0), wall(0, -1), wall(-1, -1));
          const aB = ao(wall(1, 0), wall(0, -1), wall(1, -1));
          const aC = ao(wall(1, 0), wall(0, 1), wall(1, 1));
          const aD = ao(wall(-1, 0), wall(0, 1), wall(-1, 1));
          const planks = id === 8;
          const cell = planks ? CELL.planks : CELL.cobble;
          const P = 2;
          const fuv = (X, Z) => {
            const bx = mod(X0, P), bz = mod(Zf, P);
            const [u0, v0, u1, v1] = atlasUV(cell);
            return [u0 + ((bx + X - X0) / P) * (u1 - u0), v0 + ((bz + Z - Zf) / P) * (v1 - v0)];
          };
          pushQuad(
            [[X0, 0, Zn], [X1, 0, Zn], [X1, 0, Zf], [X0, 0, Zf]],
            [fuv(X0, Zn), fuv(X1, Zn), fuv(X1, Zf), fuv(X0, Zf)],
            [aA, aB, aC, aD]
          );
          continue;
        }
        const look = lookOf(id);
        const h = this.heightAt(x, y);
        const d = this.dist[y * map.w + x];
        const shade = 1 - look.deep * smooth(1, 9, d);
        const nh = [this.heightAt(x, y - 1), this.heightAt(x + 1, y), this.heightAt(x, y + 1), this.heightAt(x - 1, y)]; // S E N W
        const drop = nh.map((v) => v < 0.3); // neighbour is (near) floor: bevel the edge
        const b = BEVEL;
        const inS = drop[0] ? b : 0, inE = drop[1] ? b : 0, inN = drop[2] ? b : 0, inW = drop[3] ? b : 0;
        const A = [X0 + inW, h, Zn - inS], B = [X1 - inE, h, Zn - inS], C = [X1 - inE, h, Zf + inN], D = [X0 + inW, h, Zf + inN];
        const P = look.period || 3;
        const tuv = (p) => {
          const bx = mod(X0, P), bz = mod(Zf, P);
          const [u0, v0, u1, v1] = atlasUV(look.top);
          return [u0 + ((bx + p[0] - X0) / P) * (u1 - u0), v0 + ((bz + p[2] - Zf) / P) * (v1 - v0)];
        };
        pushQuad([A, B, C, D], [tuv(A), tuv(B), tuv(C), tuv(D)], [shade, shade, shade, shade]);
        // Edges: S (A->B), E (B->C), N (C->D), W (D->A) using outer corners
        const outer = {
          A: [X0, Zn], B: [X1, Zn], C: [X1, Zf], D: [X0, Zf],
        };
        const edges = [
          ['A', 'B', A, B, 0], ['B', 'C', B, C, 1], ['C', 'D', C, D, 2], ['D', 'A', D, A, 3],
        ];
        for (const [e0, e1, i0, i1, k] of edges) {
          const lo = nh[k];
          if (lo >= h - 0.001) continue;
          const o0 = outer[e0], o1 = outer[e1];
          const alongX = o0[0] !== o1[0];
          const a0 = alongX ? o0[0] : o0[1], a1 = alongX ? o1[0] : o1[1];
          const am = Math.min(a0, a1), ab = mod(Math.floor(am), 2);
          const su0 = (ab + a0 - am) / 2, su1 = (ab + a1 - am) / 2;
          let top = h;
          if (drop[k]) {
            top = h - b;
            const s0 = su0, s1 = su1;
            pushQuad(
              [[o0[0], top, o0[1]], [o1[0], top, o1[1]], [i1[0], h, i1[2]], [i0[0], h, i0[2]]],
              [cellUV(look.side, s0, 1 - top / 1.5, 0), cellUV(look.side, s1, 1 - top / 1.5, 0), cellUV(look.side, s1, 1 - h / 1.5, 0), cellUV(look.side, s0, 1 - h / 1.5, 0)],
              [shade * 1.08, shade * 1.08, shade * 1.1, shade * 1.1]
            );
          }
          const floorAO = lo < 0.3 ? 0.42 : 0.9;
          pushQuad(
            [[o0[0], lo, o0[1]], [o1[0], lo, o1[1]], [o1[0], top, o1[1]], [o0[0], top, o0[1]]],
            [cellUV(look.side, su0, Math.min(1, 1 - lo / 1.5), 0), cellUV(look.side, su1, Math.min(1, 1 - lo / 1.5), 0), cellUV(look.side, su1, 1 - top / 1.5, 0), cellUV(look.side, su0, 1 - top / 1.5, 0)],
            [floorAO * shade, floorAO * shade, shade * 0.95, shade * 0.95]
          );
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const mesh = new THREE.Mesh(g, this.material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    this.chunks.set(cy * this.cw + cx, mesh);
  }

  // Floor around the map: the mountain continues into darkness.
  buildSkirt() {
    const { w, h } = this.map;
    const H = lookOf(1).h;
    const big = Math.max(w, h) * 3 + 60;
    const shape = new THREE.Shape();
    shape.moveTo(-big, -big);
    shape.lineTo(big + w, -big);
    shape.lineTo(big + w, big + h);
    shape.lineTo(-big, big + h);
    const hole = new THREE.Path();
    hole.moveTo(0, 0);
    hole.lineTo(0, h);
    hole.lineTo(w, h);
    hole.lineTo(w, 0);
    shape.holes.push(hole);
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2); // shape y -> world z (positive), we need -y
    g.scale(1, 1, -1);
    g.computeVertexNormals();
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, H);
    const nor = g.attributes.normal;
    for (let i = 0; i < nor.count; i++) nor.setXYZ(i, 0, 1, 0);
    const m = new THREE.MeshStandardMaterial({ color: 0x141113, roughness: 1 });
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.skirt = mesh;
  }

  // A tile changed (mined): rebuild nearby chunks.
  tileChanged(x, y) {
    this.computeDistance();
    const R = 8; // distance shading radius
    for (let cy = Math.floor((y - R) / CHUNK); cy <= Math.floor((y + R) / CHUNK); cy++)
      for (let cx = Math.floor((x - R) / CHUNK); cx <= Math.floor((x + R) / CHUNK); cx++)
        if (cx >= 0 && cy >= 0 && cx < this.cw && cy < this.ch) this.dirty.add(cy * this.cw + cx);
    this.gems.remove(x, y);
  }
  rebuildAll() {
    this.computeDistance();
    for (let cy = 0; cy < this.ch; cy++) for (let cx = 0; cx < this.cw; cx++) this.dirty.add(cy * this.cw + cx);
    this.gems.rebuild();
  }
  update(t) {
    // Rebuild a few chunks per frame
    let n = 0;
    for (const k of this.dirty) {
      this.buildChunk(k % this.cw, (k / this.cw) | 0);
      this.dirty.delete(k);
      if (++n >= 6) break;
    }
    this.gems.update(t);
  }
}

function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Crystals growing out of gem tiles, and the floating diamonds.
class Gems {
  constructor(map, scene, terrain) {
    this.map = map;
    this.scene = scene;
    this.terrain = terrain;
    this.group = new THREE.Group();
    scene.add(this.group);
    const g = new THREE.OctahedronGeometry(0.1, 0);
    g.scale(0.8, 2.6, 0.8);
    g.translate(0, 0.16, 0);
    this.crystalGeo = g;
    this.meshes = {};
    this.diamondGeo = makeDiamondGeometry();
    this.diamondMat = new THREE.MeshStandardMaterial({
      color: 0xcff6ff, emissive: 0x5fd8ff, emissiveIntensity: 1.6, roughness: 0.05, metalness: 0.3, flatShading: true,
    });
    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0x6fe3ff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.diamonds = new Map();
    this.rebuild();
  }
  rebuild() {
    for (const m of Object.values(this.meshes)) {
      this.group.remove(m);
      m.dispose();
    }
    this.meshes = {};
    for (const d of this.diamonds.values()) this.group.remove(d);
    this.diamonds.clear();
    const map = this.map;
    const tiles = {};
    for (let y = 0; y < map.h; y++)
      for (let x = 0; x < map.w; x++) {
        const id = map.get(x, y);
        if (GEM_COLORS[id]) (tiles[id] ||= []).push([x, y]);
        if (id === 4) this.addDiamond(x, y);
      }
    const dummy = new THREE.Object3D();
    this.index = new Map(); // tile -> [mesh, [instance ids]]
    for (const [id, list] of Object.entries(tiles)) {
      const per = 4;
      const color = new THREE.Color(GEM_COLORS[id]);
      const mat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: id == 17 ? 0.35 : 0.9, roughness: 0.15, metalness: 0.1, flatShading: true,
      });
      const mesh = new THREE.InstancedMesh(this.crystalGeo, mat, list.length * per);
      mesh.castShadow = false;
      let k = 0;
      for (const [x, y] of list) {
        const h = this.terrain.heightAt(x, y);
        const ids = [];
        const n = id == 17 ? 2 : 3 + ((hash2(x, y, 5) * 2) | 0);
        for (let i = 0; i < per; i++) {
          if (i < n) {
            const a = hash2(x, y, 10 + i) * Math.PI * 2;
            const r = 0.12 + hash2(x, y, 20 + i) * 0.22;
            dummy.position.set(x + 0.5 + Math.cos(a) * r, h - 0.02, -y - 0.5 + Math.sin(a) * r);
            dummy.rotation.set((hash2(x, y, 30 + i) - 0.5) * 0.9, a, (hash2(x, y, 40 + i) - 0.5) * 0.9);
            const s = 0.7 + hash2(x, y, 50 + i) * 0.8;
            dummy.scale.set(s, s, s);
          } else dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(k, dummy.matrix);
          ids.push(k++);
        }
        this.index.set(y * map.w + x, [mesh, ids]);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
      this.meshes[id] = mesh;
    }
  }
  addDiamond(x, y) {
    const grp = new THREE.Group();
    const h = this.terrain.heightAt(x, y);
    grp.position.set(x + 0.5, h + 0.45, -y - 0.5);
    const gem = new THREE.Mesh(this.diamondGeo, this.diamondMat);
    gem.castShadow = true;
    grp.add(gem);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.24, 3.5, 12, 1, true), this.beamMat);
    beam.position.y = 1.6;
    grp.add(beam);
    grp.userData = { gem, phase: hash2(x, y, 7) * 6 };
    this.group.add(grp);
    this.diamonds.set(y * this.map.w + x, grp);
  }
  remove(x, y) {
    const i = y * this.map.w + x;
    const e = this.index && this.index.get(i);
    if (e) {
      const [mesh, ids] = e;
      const m = new THREE.Matrix4().makeScale(0, 0, 0);
      for (const k of ids) mesh.setMatrixAt(k, m);
      mesh.instanceMatrix.needsUpdate = true;
      this.index.delete(i);
    }
    const d = this.diamonds.get(i);
    if (d) {
      this.group.remove(d);
      this.diamonds.delete(i);
    }
  }
  update(t) {
    for (const d of this.diamonds.values()) {
      const { gem, phase } = d.userData;
      gem.rotation.y = t * 0.9 + phase;
      gem.position.y = Math.sin(t * 2 + phase) * 0.08;
    }
  }
}

function makeDiamondGeometry() {
  // brilliant cut profile, lathed with 8 facets
  const pts = [
    new THREE.Vector2(0.0, -0.34),
    new THREE.Vector2(0.27, 0.0),
    new THREE.Vector2(0.2, 0.1),
    new THREE.Vector2(0.0, 0.12),
  ];
  const g = new THREE.LatheGeometry(pts, 8);
  g.computeVertexNormals();
  return g;
}
