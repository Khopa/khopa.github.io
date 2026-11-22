import { OBJECTS, ROOMS } from './defs.js';
import { rotatedSize } from './sim/objects.js';
import { audio } from './audio.js';

const RECT_TOOLS = new Set(['mine', 'mineErase', 'room', 'roomErase']);
const TAP_PX = 8;

// Mouse / touch / keyboard handling for the game canvas.
export class Input {
  constructor(app, canvas) {
    this.app = app;
    this.canvas = canvas;
    this.pointers = new Map();
    this.gesture = null;
    this.hoverPos = null;
    this.keys = new Set();
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e, true));
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') {
        this.hoverPos = null;
        this.updateHover();
      }
    });
    canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => this.keys.clear());
  }
  get world() {
    return this.app.world;
  }
  get game() {
    return this.app.game;
  }
  get hud() {
    return this.app.hud;
  }
  get active() {
    return this.app.state === 'game' && !this.app.popupOpen && !this.app.menuOpen;
  }
  get tool() {
    return this.hud.tool;
  }

  cancel() {
    this.gesture = null;
    if (this.world) {
      this.world.clearSelection();
      this.world.setGhost(null);
    }
    this.updateHover();
  }

  // ---------------------------------------------------------------- pointers
  down(e) {
    if (this.app.state !== 'game' && this.app.state !== 'title') return;
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, type: e.pointerType, button: e.button });
    if (!this.active) {
      if (this.app.state === 'title') this.gesture = { kind: 'pan', moved: true };
      return;
    }
    if (this.pointers.size === 2) {
      // two fingers: camera gesture, cancel anything else
      if (this.gesture && this.gesture.kind === 'rect') this.world.clearSelection();
      const [a, b] = [...this.pointers.values()];
      this.gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      return;
    }
    if (this.pointers.size > 2) return;
    const tool = this.tool;
    const mouse = e.pointerType === 'mouse';
    if (mouse && e.button === 1) {
      this.gesture = { kind: 'pan', moved: true };
      return;
    }
    if (mouse && e.button === 2) {
      if (tool && RECT_TOOLS.has(tool.kind)) {
        const erase = tool.kind.startsWith('mine') ? 'mineErase' : 'roomErase';
        this.startRect(e, erase);
      } else this.gesture = { kind: 'rotate', moved: false, erase: tool && (tool.kind === 'object' || tool.kind === 'recruit') };
      return;
    }
    if (tool && RECT_TOOLS.has(tool.kind)) this.startRect(e, tool.kind);
    else if (tool && tool.kind === 'object') {
      this.gesture = { kind: 'ghost', moved: false };
      this.hoverPos = { x: e.clientX, y: e.clientY };
      this.updateHover();
    } else this.gesture = { kind: 'tap', moved: false };
  }

  startRect(e, kind) {
    const top = kind.startsWith('mine');
    const p = this.world.pick(e.clientX, e.clientY, top ? 'top' : 'ground');
    if (!p) return;
    this.gesture = { kind: 'rect', tool: kind, start: p, end: p };
    this.showRect();
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (e.pointerType === 'mouse') {
      this.hoverPos = { x: e.clientX, y: e.clientY };
    }
    if (!p) {
      if (this.active) this.updateHover();
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    const g = this.gesture;
    if (!g) return;
    const cam = this.app.view.cam;
    const far = Math.hypot(p.x - p.sx, p.y - p.sy) > TAP_PX;
    switch (g.kind) {
      case 'pinch': {
        if (this.pointers.size < 2) return;
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        cam.pan(mx - g.mx, my - g.my);
        if (d > 10 && g.d > 10) cam.zoom(g.d / d, mx, my, this.app.view.w, this.app.view.h);
        let da = ang - g.ang;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        cam.rotate(-da);
        cam.curYaw = cam.yaw;
        Object.assign(g, { d, ang, mx, my });
        break;
      }
      case 'pan':
        cam.pan(dx, dy);
        break;
      case 'rotate':
        if (far) g.moved = true;
        cam.rotate(dx * 0.008);
        cam.curYaw = cam.yaw;
        break;
      case 'tap':
        if (far) g.kind = 'pan';
        if (g.kind === 'pan') cam.pan(dx, dy);
        break;
      case 'rect': {
        const top = g.tool.startsWith('mine');
        const q = this.world.pick(e.clientX, e.clientY, top ? 'top' : 'ground');
        if (q) {
          g.end = q;
          this.showRect();
        }
        break;
      }
      case 'ghost':
        if (far) g.moved = true;
        this.hoverPos = { x: e.clientX, y: e.clientY };
        this.updateHover();
        break;
    }
  }

  up(e, cancelled = false) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (!p || !g) return;
    if (g.kind === 'pinch') {
      if (this.pointers.size === 1) {
        const [q] = this.pointers.values();
        q.sx = q.x;
        q.sy = q.y;
        this.gesture = { kind: 'pan', moved: true };
      } else this.gesture = null;
      return;
    }
    if (this.pointers.size > 0) return;
    this.gesture = null;
    if (cancelled || !this.active) {
      this.world && this.world.clearSelection();
      return;
    }
    switch (g.kind) {
      case 'rect':
        this.applyRect(g);
        this.world.clearSelection();
        break;
      case 'tap':
        this.tap(e.clientX, e.clientY);
        break;
      case 'ghost':
        this.placeObject(e.clientX, e.clientY);
        if (e.pointerType !== 'mouse') {
          this.hoverPos = null;
          this.updateHover();
        }
        break;
      case 'rotate':
        if (!g.moved && g.erase) this.eraseAt(e.clientX, e.clientY);
        break;
    }
  }

  wheel(e) {
    e.preventDefault();
    if (this.app.state !== 'game') return;
    const f = Math.exp((e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) * 0.0012);
    this.app.view.cam.zoom(f, e.clientX, e.clientY, this.app.view.w, this.app.view.h);
  }

  // ---------------------------------------------------------------- actions
  rectTiles(g) {
    const x0 = Math.min(g.start.x, g.end.x), x1 = Math.max(g.start.x, g.end.x);
    const y0 = Math.min(g.start.y, g.end.y), y1 = Math.max(g.start.y, g.end.y);
    return { x0, y0, x1, y1 };
  }
  showRect() {
    const g = this.gesture;
    const { x0, y0, x1, y1 } = this.rectTiles(g);
    const map = this.game.map;
    const tiles = [];
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (!map.inside(x, y)) continue;
        if (g.tool === 'mine' && !map.minable(x, y)) continue;
        if (g.tool === 'mineErase' && !this.game.tasks.isDesignated(x, y)) continue;
        if (g.tool === 'room' && map.blocking(x, y)) continue;
        tiles.push([x, y]);
      }
    let color = 0xffd34a;
    if (g.tool === 'room') color = ROOMS[this.tool.type].color;
    if (g.tool.endsWith('Erase')) color = 0xff5a4a;
    this.world.setSelection(tiles, color, g.tool.startsWith('mine'));
  }
  applyRect(g) {
    const { x0, y0, x1, y1 } = this.rectTiles(g);
    const game = this.game;
    if (g.tool === 'mine') {
      if (game.designate(x0, y0, x1, y1)) audio.play('Menu_ok', 0.5);
    } else if (g.tool === 'mineErase') {
      if (game.undesignate(x0, y0, x1, y1)) audio.play('Menu_cancel', 0.5);
    } else if (g.tool === 'room') {
      const type = this.tool && this.tool.type;
      if (type) game.placeRoom(type, x0, y0, x1, y1);
    } else if (g.tool === 'roomErase') game.removeRooms(x0, y0, x1, y1);
  }

  tap(sx, sy) {
    const tool = this.tool;
    const p = this.world.pick(sx, sy, 'ground');
    if (tool && tool.kind === 'recruit') {
      if (!p) return;
      const d = this.game.recruit(tool.job, p.x, p.y);
      if (!d) this.refuse(p);
      return;
    }
    if (tool && tool.kind.endsWith('Erase')) return this.eraseAt(sx, sy);
    // inspect
    const d = this.world.pickDwarf(sx, sy);
    if (d) {
      audio.play('Menu_ok', 0.4);
      return this.hud.showDwarf(d);
    }
    if (p) {
      const o = this.game.objectAt(p.x, p.y);
      if (o) {
        audio.play('Menu_ok', 0.4);
        return this.hud.showObject(o);
      }
    }
    this.hud.closeInfo();
  }

  eraseAt(sx, sy) {
    const tool = this.tool;
    const p = this.world.pick(sx, sy, 'ground');
    if (!tool) return;
    if (tool.kind === 'recruitErase' || tool.kind === 'recruit') {
      const d = this.world.pickDwarf(sx, sy) || (p && this.game.dwarfAt(p.x, p.y));
      if (d) this.game.dismiss(d);
    } else if (tool.kind === 'objectErase' || tool.kind === 'object') {
      if (p) this.game.sellObjectAt(p.x, p.y);
    }
  }

  ghostOrigin(sx, sy) {
    const tool = this.tool;
    const p = this.world.pick(sx, sy, 'ground');
    if (!p) return null;
    const [w, h] = rotatedSize(tool.type, this.hud.rot);
    // centre the footprint on the pointer
    const ox = Math.floor(p.fx - w / 2 + 0.5), oy = Math.floor(p.fy - h / 2 + 0.5);
    return { x: ox, y: oy };
  }
  placeObject(sx, sy) {
    const tool = this.tool;
    if (!tool || tool.kind !== 'object') return;
    const o = this.ghostOrigin(sx, sy);
    if (!o) return;
    const obj = this.game.placeObject(tool.type, o.x, o.y, this.hud.rot);
    if (!obj) this.refuse({ x: o.x, y: o.y });
  }
  refuse(p) {
    audio.play('Menu_cancel', 0.6);
    this.world.float(p.x + 0.5, 0.6, -p.y - 0.5, '✖', 'red');
  }

  refreshGhost() {
    this.updateHover();
  }
  updateHover() {
    const world = this.world;
    if (!world || !this.active) return;
    const tool = this.tool;
    const hp = this.hoverPos;
    if (tool && tool.kind === 'object' && hp) {
      const o = this.ghostOrigin(hp.x, hp.y);
      if (o) {
        const ok = this.game.canPlace(tool.type, o.x, o.y, this.hud.rot) && this.game.money >= OBJECTS[tool.type].price;
        world.setGhost(tool.type, o.x, o.y, this.hud.rot, ok);
        world.setHover(null);
        return;
      }
    }
    world.setGhost(null);
    if (this.gesture && this.gesture.kind === 'rect') return;
    world.clearSelection();
    if (!hp || this.pointers.size) {
      world.setHover(null);
      return;
    }
    if (tool && (tool.kind === 'mine' || tool.kind === 'mineErase')) {
      const p = world.pick(hp.x, hp.y, 'top');
      if (p && (tool.kind === 'mineErase' || this.game.map.minable(p.x, p.y))) world.setHover(p.x, p.y, p.rock, tool.kind === 'mine' ? 0xffd34a : 0xff5a4a);
      else world.setHover(null);
    } else if (tool && (tool.kind === 'room' || tool.kind === 'recruit')) {
      const p = world.pick(hp.x, hp.y, 'ground');
      if (p && !this.game.map.blocking(p.x, p.y)) world.setHover(p.x, p.y, false, tool.kind === 'room' ? ROOMS[tool.type].color : 0xfff2c0);
      else world.setHover(null);
    } else world.setHover(null);
  }

  // ---------------------------------------------------------------- keyboard
  key(e, down) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    const code = e.code;
    if (down) this.keys.add(code);
    else this.keys.delete(code);
    if (!down || this.app.state !== 'game') return;
    if (this.app.popupOpen) {
      if (k === 'enter' || k === ' ' || k === 'escape') {
        e.preventDefault();
        this.hud.closePopup();
      }
      return;
    }
    if (k === 'escape') {
      if (this.app.menuOpen) this.app.resume();
      else if (this.hud.mode !== 'main') {
        this.hud.fire('hitBackButton');
        this.hud.back();
      } else if (this.hud.info) this.hud.closeInfo();
      else this.app.pause();
      return;
    }
    if (this.app.menuOpen) return;
    const cam = this.app.view.cam;
    if (code === 'KeyQ') cam.rotate(-Math.PI / 4);
    else if (code === 'KeyE') cam.rotate(Math.PI / 4);
    else if (k === 'r' && this.tool && this.tool.kind === 'object') this.hud.rotate();
    else if (k === ' ') {
      e.preventDefault();
      this.app.setSpeed(this.app.userPaused ? this.game.speed || 1 : 0);
    } else if (k === '1') this.app.setSpeed(1);
    else if (k === '2') this.app.setSpeed(2);
    else if (k === '3') this.app.setSpeed(4);
    else if (k === '+' || k === '=') cam.zoom(0.8, this.app.view.w / 2, this.app.view.h / 2, this.app.view.w, this.app.view.h);
    else if (k === '-') cam.zoom(1.25, this.app.view.w / 2, this.app.view.h / 2, this.app.view.w, this.app.view.h);
  }
  // continuous keyboard panning
  update(dt) {
    if (!this.active) return;
    const k = this.keys;
    let x = 0, y = 0;
    // physical key codes, so AZERTY (ZQSD) and QWERTY (WASD) both work
    if (k.has('ArrowLeft') || k.has('KeyA')) x += 1;
    if (k.has('ArrowRight') || k.has('KeyD')) x -= 1;
    if (k.has('ArrowUp') || k.has('KeyW')) y += 1;
    if (k.has('ArrowDown') || k.has('KeyS')) y -= 1;
    if (x || y) {
      const sp = 700 * dt;
      this.app.view.cam.pan(x * sp, y * sp);
    }
  }
}
