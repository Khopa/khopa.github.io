import * as THREE from 'three';
import { Terrain, GEM_COLORS } from './terrain.js';
import { buildTerrainAtlas, mineMarkerTexture, tileFillTexture } from './textures.js';
import { objectModel, setRackItems } from './models.js';
import { DwarfView } from './dwarfview.js';
import { FX } from './fx.js';
import { Torches, LightPools } from './lights.js';
import { screenRay } from './view.js';
import { ROOMS, OBJECTS } from '../defs.js';
import { GameObject } from '../sim/objects.js';

const BLOCK_COLOR = { 1: 0x2a2627, 2: 0x7a4d28, 3: 0xb98a6a, 4: 0x9fe6ff, 9: 0x8a4fb0, 10: 0x4a63b8, 11: 0x3aa864, 12: 0x77777d, 17: 0x8a5a5a };

let atlasCache = null;

// Everything game-specific in the 3D scene.
export class World {
  constructor(view, game, opts = {}) {
    this.view = view;
    this.game = game;
    this.scene = view.scene;
    const size = view.q.atlas;
    if (!atlasCache || atlasCache.size !== size) atlasCache = buildTerrainAtlas(size);
    this.atlas = atlasCache;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.terrain = new Terrain(game.map, this.atlas, this.root);
    this.fx = new FX(this.root);
    this.torches = new Torches(game, this.root);
    this.pools = new LightPools(this.root);
    this.flashes = [];
    this.torchTimer = 0;
    this.objectViews = new Map();
    this.dwarfViews = new Map();
    this.floats = [];
    this.selected = null;
    this.time = 0;
    this.buildOverlays();
    for (const o of game.objects.list) this.addObject(o);
    for (const d of game.dwarves) this.addDwarf(d);
    this.bind();
    view.cam.setBounds(game.map.w, game.map.h);
  }

  bind() {
    const g = this.game;
    const on = (n, f) => g.on(n, f);
    on('tileMined', (x, y, oldId, info) => {
      const h = 1;
      this.terrain.tileChanged(x, y);
      this.torchDirty = true;
      this.fx.blockBreak(x + 0.5, h, -y - 0.5, BLOCK_COLOR[oldId] || 0x7a4d28);
      if (info.wealth) {
        this.float(x + 0.5, 1.1, -y - 0.5, '+' + info.wealth, 'gold');
        this.fx.gemBurst(x + 0.5, 0.8, -y - 0.5, GEM_COLORS[oldId] || 0xffd060, 26);
      }
      if (info.wealth) this.flash(x + 0.5, -y - 0.5, GEM_COLORS[oldId] || 0xffd060, 2.2, 0.7);
      if (info.diamond) {
        this.flash(x + 0.5, -y - 0.5, 0x8fefff, 4.5, 1.6, 4);
        this.fx.gemBurst(x + 0.5, 0.9, -y - 0.5, 0x8fefff, 90);
        this.view.cam.shake = 1;
      }
      this.rebuildMarks();
    });
    on('mineHit', (d, tx, ty) => {
      const mx = (d.x + tx) / 2 + 0.5, mz = -((d.y + ty) / 2) - 0.5;
      this.fx.mineHit(mx, 0.45, mz, BLOCK_COLOR[g.map.get(tx, ty)] || 0x7a4d28);
    });
    on('objectAdded', (o) => this.addObject(o));
    on('objectRemoved', (o) => this.removeObject(o));
    on('rackChanged', (o) => {
      const v = this.objectViews.get(o);
      if (v) setRackItems(v, o.items);
    });
    on('dwarfAdded', (d) => this.addDwarf(d));
    on('dwarfRemoved', (d) => {
      const v = this.dwarfViews.get(d);
      if (v) v.dispose();
      this.dwarfViews.delete(d);
      if (this.selected === d) this.selected = null;
    });
    on('roomsChanged', () => this.rebuildRooms());
    on('tasksChanged', () => this.rebuildMarks());
    on('money', (amount, x, y) => this.float(x + 0.5, 1, -y - 0.5, (amount > 0 ? '+' : '') + amount, amount > 0 ? 'gold' : 'red'));
    on('enchanted', (rack) => {
      this.fx.gemBurst(rack.x + 0.5, 0.6, -rack.y - 0.5, 0x8ff0ff, 40);
      this.flash(rack.x + 0.5, -rack.y - 0.5, 0x7fd8ff, 3, 1.1, 3);
    });
    on('pickaxeBreak', (d) => {
      this.fx.sparks(d.x + 0.5, 0.4, -d.y - 0.5, 18);
      this.flash(d.x + 0.5, -d.y - 0.5, 0xffa040, 1.6, 0.35);
      this.float(d.x + 0.5, 1, -d.y - 0.5, '✖', 'red');
    });
    on('mapReset', () => {
      this.terrain.rebuildAll();
      this.torches.rebuild();
      this.rebuildMarks();
    });
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }

  // ---------------------------------------------------------------- objects
  addObject(o) {
    const m = objectModel(o.type);
    const [nx, ny] = OBJECTS[o.type].size;
    placeObjectModel(m, o.x, o.y, o.rot, nx, ny);
    if (o.type === 'Rack') setRackItems(m, o.items);
    m.userData.obj = o;
    this.root.add(m);
    this.objectViews.set(o, m);
  }
  removeObject(o) {
    const m = this.objectViews.get(o);
    if (m) this.root.remove(m);
    this.objectViews.delete(o);
  }
  addDwarf(d) {
    this.dwarfViews.set(d, new DwarfView(d, this.root, this.fx));
  }

  // ---------------------------------------------------------------- overlays
  buildOverlays() {
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    this.planeGeo = plane;
    this.markMat = new THREE.MeshBasicMaterial({ map: mineMarkerTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.marks = null;
    this.fillTex = tileFillTexture();
    this.roomGroup = new THREE.Group();
    this.root.add(this.roomGroup);
    this.selMat = new THREE.MeshBasicMaterial({ map: this.fillTex, transparent: true, depthWrite: false, color: 0xffffff, opacity: 0.7 });
    this.selection = new THREE.InstancedMesh(plane, this.selMat, 4096);
    this.selection.count = 0;
    this.selection.frustumCulled = false;
    this.selection.renderOrder = 3;
    this.root.add(this.selection);
    const ringGeo = new THREE.RingGeometry(0.26, 0.33, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.visible = false;
    this.ring.renderOrder = 4;
    this.root.add(this.ring);
    this.hover = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: this.fillTex, transparent: true, opacity: 0.45, depthWrite: false, color: 0xfff2c0 }));
    this.hover.visible = false;
    this.hover.renderOrder = 3;
    this.root.add(this.hover);
    this.ghost = null;
    this.rebuildMarks();
    this.rebuildRooms();
  }

  rebuildMarks() {
    const tasks = this.game.tasks;
    const n = tasks.toMine.size;
    if (!this.marks || this.marks.instanceMatrix.count < n) {
      if (this.marks) this.root.remove(this.marks);
      this.marks = new THREE.InstancedMesh(this.planeGeo, this.markMat, Math.max(256, n * 2));
      this.marks.frustumCulled = false;
      this.marks.renderOrder = 2;
      this.root.add(this.marks);
    }
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let k = 0;
    for (const i of tasks.toMine) {
      const [x, y] = tasks.xy(i);
      const h = this.terrain.heightAt(x, y) + 0.015;
      m.makeTranslation(x + 0.5, h, -y - 0.5);
      this.marks.setMatrixAt(k, m);
      const assigned = tasks.assigned.has(i);
      c.set(tasks.accessible.has(i) ? (assigned ? 0xffffff : 0xffe7a0) : 0x9a7b58);
      this.marks.setColorAt(k, c);
      k++;
    }
    this.marks.count = k;
    this.marks.instanceMatrix.needsUpdate = true;
    if (this.marks.instanceColor) this.marks.instanceColor.needsUpdate = true;
  }

  rebuildRooms() {
    const grp = this.roomGroup;
    while (grp.children.length) {
      const c = grp.children[0];
      grp.remove(c);
      if (c.isInstancedMesh) c.dispose();
    }
    const w = this.game.map.w;
    const edgeGeo = new THREE.BoxGeometry(1, 0.03, 0.06);
    for (const room of this.game.rooms.list) {
      const color = new THREE.Color(ROOMS[room.type].color);
      const fill = new THREE.InstancedMesh(this.planeGeo, new THREE.MeshBasicMaterial({ map: this.fillTex, color, transparent: true, opacity: room.operational ? 0.22 : 0.14, depthWrite: false }), room.tiles.size);
      fill.renderOrder = 1;
      const m = new THREE.Matrix4();
      let k = 0;
      const edges = [];
      for (const i of room.tiles) {
        const x = i % w, y = (i / w) | 0;
        m.makeTranslation(x + 0.5, 0.012, -y - 0.5);
        fill.setMatrixAt(k++, m);
        if (!room.has(x, y - 1)) edges.push([x + 0.5, -y, 0]);
        if (!room.has(x, y + 1)) edges.push([x + 0.5, -y - 1, 0]);
        if (!room.has(x - 1, y)) edges.push([x, -y - 0.5, Math.PI / 2]);
        if (!room.has(x + 1, y)) edges.push([x + 1, -y - 0.5, Math.PI / 2]);
      }
      fill.instanceMatrix.needsUpdate = true;
      grp.add(fill);
      const border = new THREE.InstancedMesh(edgeGeo, new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(room.operational ? 1.6 : 0.9), transparent: true, opacity: room.operational ? 0.95 : 0.6 }), edges.length);
      const q = new THREE.Quaternion();
      edges.forEach(([x, z, r], j) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r);
        m.compose(new THREE.Vector3(x, 0.02, z), q, new THREE.Vector3(1, 1, 1));
        border.setMatrixAt(j, m);
      });
      border.instanceMatrix.needsUpdate = true;
      border.userData.pulse = !room.operational;
      grp.add(border);
    }
  }

  // tiles: [[x,y]...] ; color hex; onTop: draw at rock height
  setSelection(tiles, color, onTop) {
    const m = new THREE.Matrix4();
    let k = 0;
    for (const [x, y] of tiles) {
      if (k >= 4096) break;
      const h = onTop ? this.terrain.heightAt(x, y) + 0.03 : 0.03;
      m.makeTranslation(x + 0.5, h, -y - 0.5);
      this.selection.setMatrixAt(k++, m);
    }
    this.selection.count = k;
    this.selection.instanceMatrix.needsUpdate = true;
    this.selMat.color.setHex(color);
  }
  clearSelection() {
    this.selection.count = 0;
  }
  setHover(x, y, onTop, color = 0xfff2c0) {
    if (x == null) {
      this.hover.visible = false;
      return;
    }
    this.hover.visible = true;
    this.hover.material.color.setHex(color);
    this.hover.position.set(x + 0.5, (onTop ? this.terrain.heightAt(x, y) : 0) + 0.035, -y - 0.5);
  }
  setGhost(type, x, y, rot, valid) {
    if (!type) {
      if (this.ghost) this.root.remove(this.ghost);
      this.ghost = null;
      return;
    }
    if (!this.ghost || this.ghost.userData.type !== type) {
      if (this.ghost) this.root.remove(this.ghost);
      this.ghost = objectModel(type);
      this.ghost.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.opacity = 0.7;
          o.material.depthWrite = false;
          o.castShadow = false;
          o.userData.baseColor = o.material.color.clone();
        }
      });
      this.root.add(this.ghost);
    }
    const [nx, ny] = OBJECTS[type].size;
    placeObjectModel(this.ghost, x, y, rot, nx, ny);
    const tint = new THREE.Color(valid ? 0x7dff9a : 0xff5a4a);
    this.ghost.traverse((o) => {
      if (o.isMesh) {
        o.material.color.copy(o.userData.baseColor).lerp(tint, 0.55);
        if (o.material.emissive) o.material.emissive.copy(tint).multiplyScalar(0.25);
      }
    });
    // footprint
    const probe = new GameObject(type, x, y, rot);
    this.setSelection(probe.tiles(), valid ? 0x7dff9a : 0xff5a4a, false);
  }
  select(d) {
    this.selected = d;
  }

  // short-lived light burst (floor pool + optional point light)
  flash(x, z, color, radius, dur, power = 2) {
    this.flashes.push({ x, z, color, radius, dur, t: 0, power });
  }
  float(x, y, z, text, cls) {
    this.floats.push({ x, y, z, text, cls, t: 0, id: Math.random() });
  }

  // ---------------------------------------------------------------- picking
  // mode 'top': first rock/floor surface hit; 'ground': the y=0 plane.
  pick(sx, sy, mode = 'ground') {
    const v = this.view;
    const ray = screenRay(v.cam.camera, sx, sy, v.w, v.h);
    const o = ray.origin, d = ray.direction;
    if (d.y >= 0) return null;
    const tBot = -o.y / d.y;
    const map = this.game.map;
    if (mode === 'top') {
      const tTop = (1.5 - o.y) / d.y;
      const steps = 60;
      for (let i = 0; i <= steps; i++) {
        const t = tTop + ((tBot - tTop) * i) / steps;
        const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
        const gx = Math.floor(x), gy = Math.floor(-z);
        if (!map.inside(gx, gy)) continue;
        if (map.blocking(gx, gy) && y <= this.terrain.heightAt(gx, gy)) return { x: gx, y: gy, rock: true };
      }
    }
    const x = o.x + d.x * tBot, z = o.z + d.z * tBot;
    return { x: Math.floor(x), y: Math.floor(-z), fx: x, fy: -z, rock: false };
  }
  // Dwarf under the cursor (screen-space test around the body)
  pickDwarf(sx, sy) {
    let best = null, bd = 40 * 40;
    for (const [d, v] of this.dwarfViews) {
      const [px, py] = this.view.project(v.pos.x, v.pos.y + 0.35, v.pos.z);
      const dist = (px - sx) ** 2 + (py - sy) ** 2;
      const scale = this.view.h / this.view.cam.extent() / 40;
      if (dist < bd * Math.max(0.6, scale * scale)) {
        bd = dist;
        best = d;
      }
    }
    return best;
  }

  emitters() {
    const out = [];
    for (const f of this.flashes) {
      const k = 1 - f.t / f.dur;
      out.push({ x: f.x, y: 0.8, z: f.z, color: f.color, power: f.power * k * k, range: f.radius * 1.8, prio: 3 });
    }
    for (const t of this.torches.list) out.push({ x: t.fx - t.wx * 0.15, y: t.fy, z: t.fz - t.wz * 0.15, color: 0xff9a4a, power: 1.5, flicker: true, range: 4.5, prio: 1 });
    const v = new THREE.Vector3();
    for (const [d, dv] of this.dwarfViews) {
      if (!dv.lampWorld(v)) continue;
      const enchant = d.anim && d.anim.name === 'enchant';
      if (d.job === 'Enchanter') out.push({ x: v.x, y: v.y, z: v.z, color: 0x6fd8ff, power: enchant ? 2.4 : 0.7, range: enchant ? 4 : 2.2, prio: enchant ? 2 : 0 });
      else if (d.pose !== 'lie') out.push({ x: v.x, y: v.y, z: v.z, color: 0xffe0a8, power: 0.55, range: 2.4, prio: 0 });
    }
    for (const [i, grp] of this.terrain.gems.diamonds) out.push({ x: grp.position.x, y: grp.position.y + 0.2, z: grp.position.z, color: 0x7fe6ff, power: 2.2, range: 3.5, prio: 1 });
    for (const [o, m] of this.objectViews) {
      const e = m.userData.emitter;
      if (!e) continue;
      const p = new THREE.Vector3(e.x, e.y, e.z).applyMatrix4(m.matrixWorld);
      out.push({ x: p.x, y: p.y, z: p.z, color: e.color, power: e.power, flicker: e.flicker, range: o.type === 'Hearth' ? 6 : 3, prio: o.type === 'Hearth' ? 2 : 0 });
    }
    return out;
  }

  updatePools(t, dt) {
    const P = this.pools;
    P.begin();
    for (const [o] of this.objectViews) {
      if (o.type === 'Hearth') P.add(o.x + 0.5, 0.02, -o.y - 0.5, 3, 0xff7a2a, 1.1, true);
      else if (o.type === 'TableObject') {
        const m = this.objectViews.get(o);
        const p = new THREE.Vector3(2.05, 0.02, -1.5).applyMatrix4(m.matrixWorld);
        P.add(p.x, 0.02, p.z, 1.6, 0xffa050, 0.45, true);
      }
    }
    for (const [i, grp] of this.terrain.gems.diamonds) P.add(grp.position.x, 0.02, grp.position.z, 2.2, 0x58c8ff, 0.7);
    const v = new THREE.Vector3();
    for (const [d, dv] of this.dwarfViews) {
      if (d.pose === 'lie' || !dv.lampWorld(v)) continue;
      if (d.job === 'Enchanter') {
        const e = d.anim && d.anim.name === 'enchant';
        P.add(dv.pos.x, 0.02, dv.pos.z, e ? 2.4 : 1.1, 0x5fd0ff, e ? 1 + Math.sin(t * 9) * 0.3 : 0.45);
      } else {
        const f = Math.sin(dv.yaw), c = Math.cos(dv.yaw);
        P.add(dv.pos.x + f * 0.55, 0.02, dv.pos.z + c * 0.55, 0.85, 0xffe2b0, 0.55);
      }
    }
    this.flashes = this.flashes.filter((f) => (f.t += dt) < f.dur);
    for (const f of this.flashes) {
      const k = 1 - f.t / f.dur;
      P.add(f.x, 0.025, f.z, f.radius * (0.7 + 0.3 * k), f.color, k * 1.4);
    }
    P.end(t);
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    this.time += dt;
    const t = this.time;
    this.terrain.update(t);
    this.torches.update(t);
    if (this.torchDirty && (this.torchTimer -= dt) <= 0) {
      this.torchDirty = false;
      this.torchTimer = 0.5;
      this.torches.rebuild();
    }
    this.updatePools(t, dt);
    for (const [d, v] of this.dwarfViews) {
      v.update(dt, t, this.selected === d);
      if (v.strike) {
        v.strike = false;
        const anvil = d.slot && d.slot.obj;
        if (anvil) {
          const p = new THREE.Vector3(0.55, 0.66, -0.5).applyMatrix4(this.objectViews.get(anvil)?.matrixWorld || new THREE.Matrix4());
          this.fx.sparks(p.x, p.y, p.z, 12);
          this.flash(p.x, p.z, 0xff9a40, 1.5, 0.3, 1.8);
          const m = this.objectViews.get(anvil);
          if (m) m.userData.heat = 1;
        }
      }
    }
    for (const [o, m] of this.objectViews) {
      if (o.type === 'Hearth') {
        const fire = m.getObjectByName('fire');
        fire.children.forEach((c, i) => {
          const ph = c.userData.phase;
          c.scale.set(1 + Math.sin(t * 9 + ph) * 0.15, 0.8 + Math.sin(t * 11 + ph * 2) * 0.3 + Math.random() * 0.1, 1 + Math.cos(t * 8 + ph) * 0.15);
          c.rotation.y = t * (i % 2 ? 1.5 : -1.2);
        });
      } else if (o.type === 'Counter') {
        const b = m.getObjectByName('servedBeer');
        if (b) b.visible = o.beer > 0;
      } else if (o.type === 'Anvil') {
        const ingot = m.getObjectByName('ingot');
        m.userData.heat = Math.max(0.15, (m.userData.heat || 0) - dt * 0.6);
        ingot.material.emissiveIntensity = 0.4 + m.userData.heat * 2.5;
      } else if (o.type === 'TableObject') {
        const f = m.getObjectByName('flame');
        f.scale.y = 1.6 + Math.sin(t * 17) * 0.25 + Math.random() * 0.15;
      }
    }
    // hearth embers need world centre
    for (const [o, m] of this.objectViews)
      if (o.type === 'Hearth' && Math.random() < 0.3) this.fx.embers(o.x + 0.5, 0.35, -o.y - 0.5);
    // selection ring
    const sel = this.selected && this.dwarfViews.get(this.selected);
    this.ring.visible = !!sel;
    if (sel) {
      this.ring.position.set(sel.pos.x, 0.03, sel.pos.z);
      this.ring.scale.setScalar(1 + Math.sin(t * 5) * 0.06);
    }
    for (const c of this.roomGroup.children) if (c.userData.pulse) c.material.opacity = 0.35 + Math.sin(t * 4) * 0.25;
    if (this.marks) this.markMat.opacity = 0.75 + Math.sin(t * 3) * 0.2;
    this.fx.setScale(this.view.h * this.view.dpr / this.view.cam.extent());
    this.fx.ambient(this.view.cam.cur.x, this.view.cam.cur.y, this.view.cam.curView * 0.6);
    this.fx.update(dt);
    this.floats = this.floats.filter((f) => (f.t += dt) < 1.6);
  }
}

// Position an object model built in its local frame at (ox, oy) with rotation.
export function placeObjectModel(m, ox, oy, rot, nx, ny) {
  m.rotation.y = (rot * Math.PI) / 2;
  const off = [[ox, -oy], [ox + ny, -oy], [ox + nx, -oy - ny], [ox, -oy - nx]][rot];
  m.position.set(off[0], 0, off[1]);
  m.updateMatrixWorld(true);
}
