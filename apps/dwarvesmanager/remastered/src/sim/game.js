import { TileMap } from './map.js';
import { findPath } from './pathfinder.js';
import { TaskManager } from './tasks.js';
import { Rooms, Room } from './rooms.js';
import { GameObject, Pickaxe } from './objects.js';
import { Dwarf } from './dwarves.js';
import { OBJECTS, JOBS, DAY_DURATION, GRANT, SIM_HZ } from '../defs.js';

const STEP = 1 / SIM_HZ;

// The whole simulation state of one level. Rendering and UI listen to events.
export class Game {
  constructor({ level, mapData, names, lang, script }) {
    this.level = level;
    this.lang = lang;
    this.names = names;
    this.map = TileMap.fromJSON(mapData);
    this.tasks = new TaskManager(this);
    this.rooms = new Rooms(this);
    this.objects = {
      list: [],
      has: (o) => this.objects.list.includes(o),
    };
    this.dwarves = [];
    this.money = 0;
    this.diamonds = 0;
    this.objective = 1;
    this.time = 0; // simulated seconds
    this.elapsed = 0; // whole seconds, as in GameThread
    this.dayCounter = 0;
    this.speed = 1;
    this.paused = false;
    this.ended = null; // 'win' | 'lose'
    this.acc = 0;
    this.secAcc = 0;
    this.needsEnabled = true;
    this.pickaxeBreakable = true;
    this.listeners = {};
    this.script = script;
    this.mapVersion = 0;
    this.labels = null;
    this.map.listeners.push(() => {
      this.mapVersion++;
      this.labels = null;
    });
  }

  // ------------------------------------------------------------ events
  on(name, fn) {
    (this.listeners[name] ||= []).push(fn);
  }
  emit(name, ...args) {
    const l = this.listeners[name];
    if (l) for (const fn of l) fn(...args);
  }
  // Events sent to the level's Lua script (DwarvesManagerScript.receiveDwarfEvent)
  fire(name, p1, p2) {
    if (this.script) this.script.event(name, p1, p2);
  }
  sound(name) {
    this.emit('sound', name);
  }
  log(text) {
    this.emit('log', text);
  }

  // ------------------------------------------------------------ loop
  update(realDt) {
    if (this.paused || this.ended) return;
    this.acc += Math.min(realDt, 0.25) * this.speed;
    let steps = 0;
    while (this.acc >= STEP && steps < 40) {
      this.acc -= STEP;
      steps++;
      this.tick(STEP);
      if (this.ended) break;
    }
  }

  tick(dt) {
    this.time += dt;
    for (const d of [...this.dwarves]) d.update(dt);
    this.updateHearths();
    this.secAcc += dt;
    if (this.secAcc >= 1) {
      this.secAcc -= 1;
      this.secondTick();
    }
  }

  // GameThread.run(): once per second
  secondTick() {
    this.elapsed++;
    this.dayCounter++;
    if (this.money < 0) return this.end('lose');
    if (this.diamonds >= this.objective) return this.end('win');
    if (this.dayCounter >= DAY_DURATION) {
      this.payday();
      this.dayCounter = 0;
    }
    if (this.script) this.script.run();
  }

  payday() {
    const wages = this.payroll();
    this.sound('cash');
    this.emit('payday', { wages, grant: GRANT, total: GRANT - wages });
    this.money += GRANT - wages;
  }

  payroll() {
    return this.dwarves.reduce((s, d) => s + d.salary, 0);
  }

  end(result) {
    if (this.ended) return;
    this.ended = result;
    this.emit('end', result);
  }

  updateHearths() {
    for (const h of this.objects.list) {
      if (h.type !== 'Hearth') continue;
      for (const d of this.dwarves) {
        if (d.speed <= 1 && Math.hypot(d.x - h.x, d.y - h.y) < 4) {
          d.speed = 1.75;
          d.speedTimer = 5.5;
        }
      }
    }
  }

  // ------------------------------------------------------------ connectivity
  // Connected-component labels of open tiles, to reject unreachable targets
  // without running A* over the whole map.
  label(x, y) {
    if (!this.labels) this.computeLabels();
    return this.labels[y * this.map.w + x];
  }
  computeLabels() {
    const { w, h } = this.map;
    const lab = new Int32Array(w * h);
    let next = 1;
    const stack = [];
    for (let i = 0; i < w * h; i++) {
      if (lab[i] || this.map.blocking(i % w, (i / w) | 0)) continue;
      lab[i] = next;
      stack.push(i);
      while (stack.length) {
        const c = stack.pop();
        const x = c % w, y = (c / w) | 0;
        if (x + 1 < w && !lab[c + 1] && !this.map.blocking(x + 1, y)) (lab[c + 1] = next), stack.push(c + 1);
        if (x > 0 && !lab[c - 1] && !this.map.blocking(x - 1, y)) (lab[c - 1] = next), stack.push(c - 1);
        if (y + 1 < h && !lab[c + w] && !this.map.blocking(x, y + 1)) (lab[c + w] = next), stack.push(c + w);
        if (y > 0 && !lab[c - w] && !this.map.blocking(x, y - 1)) (lab[c - w] = next), stack.push(c - w);
      }
      next++;
    }
    this.labels = lab;
  }
  // Label of the area a dwarf stands in (a dwarf in rock can step to a neighbour).
  dwarfLabels(d) {
    const out = new Set();
    const x = d.tx, y = d.ty;
    if (!this.map.blocking(x, y)) out.add(this.label(x, y));
    else
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]])
        if (this.map.inside(nx, ny) && !this.map.blocking(nx, ny)) out.add(this.label(nx, ny));
    return out;
  }
  reachable(d, x, y) {
    if (!this.map.inside(x, y) || this.map.blocking(x, y)) return false;
    return this.dwarfLabels(d).has(this.label(x, y));
  }

  // ------------------------------------------------------------ path helpers
  pathToTile(d, x, y) {
    if (!this.reachable(d, x, y)) return null;
    return findPath(this.map, d.tx, d.ty, x, y);
  }
  pathToRoom(d, room) {
    const labels = this.dwarfLabels(d);
    let best = null, bestD = Infinity;
    for (const [x, y] of room.tileList()) {
      if (!labels.has(this.label(x, y))) continue;
      const dist = (x - d.x) ** 2 + (y - d.y) ** 2;
      if (dist < bestD) {
        bestD = dist;
        best = [x, y];
      }
    }
    return best ? findPath(this.map, d.tx, d.ty, best[0], best[1]) : null;
  }
  pathToAdjacent(d, x, y) {
    // bottom, top, right, left as in PathUtils.pathToAdjacentTile
    for (const [nx, ny] of [[x, y - 1], [x, y + 1], [x + 1, y], [x - 1, y]]) {
      const p = this.pathToTile(d, nx, ny);
      if (p) return p;
    }
    return null;
  }
  objectsInRoomSorted(room, type, d, job) {
    const list = room.objectsOf(type).filter((o) => !o.slots.length || o.slotAvailable(job || 'any'));
    return list.sort((a, b) => (a.x - d.x) ** 2 + (a.y - d.y) ** 2 - ((b.x - d.x) ** 2 + (b.y - d.y) ** 2));
  }
  nearestObjectInRoom(room, type, d, job) {
    return this.objectsInRoomSorted(room, type, d, job)[0] || null;
  }
  randomStep(d) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const [dx, dy] = dirs[(Math.random() * 4) | 0];
    const x = d.tx + dx, y = d.ty + dy;
    return this.map.blocking(x, y) ? null : [x, y];
  }

  // ------------------------------------------------------------ mining
  tileMinedBy(miner, x, y) {
    const map = this.map;
    const wealth = map.prop(x, y, 'wealth');
    const diamond = map.prop(x, y, 'diamond');
    const oldId = map.get(x, y);
    if (wealth > 0) {
      this.money += wealth;
      this.sound('cash');
    }
    if (diamond > 0) {
      this.diamonds++;
      this.sound('success');
    }
    map.set(x, y, 0);
    const i = y * map.w + x;
    this.tasks.tileMined(i);
    this.emit('tileMined', x, y, oldId, { wealth, diamond, miner });
    if (miner) {
      miner.toMine = null;
      this.tasks.assign(miner);
    }
  }

  // ------------------------------------------------------------ player actions
  designate(x0, y0, x1, y1) {
    return this.tasks.addArea(x0, y0, x1, y1);
  }
  undesignate(x0, y0, x1, y1) {
    return this.tasks.removeArea(x0, y0, x1, y1);
  }
  placeRoom(type, x0, y0, x1, y1) {
    const r = this.rooms.place(type, x0, y0, x1, y1);
    if (r) this.sound('placeRoom');
    return r;
  }
  removeRooms(x0, y0, x1, y1) {
    const changed = this.rooms.removeArea(x0, y0, x1, y1);
    if (changed) this.sound('removeRoom');
    return changed;
  }

  canPlace(type, x, y, rot) {
    const probe = new GameObject(type, x, y, rot);
    for (const [tx, ty] of probe.tiles()) {
      if (this.map.blocking(tx, ty)) return false;
      if (this.objects.list.some((o) => o.covers(tx, ty))) return false;
    }
    return true;
  }
  placeObject(type, x, y, rot, free = false) {
    if (!this.canPlace(type, x, y, rot)) return null;
    const price = OBJECTS[type].price;
    if (!free) {
      if (this.money - price < 0) return null;
      this.money -= price;
    }
    const obj = new GameObject(type, x, y, rot);
    this.addObject(obj);
    if (!free) {
      this.sound('placeObject');
      this.emit('money', -price, x, y);
    }
    return obj;
  }
  addObject(obj) {
    this.objects.list.push(obj);
    this.emit('objectAdded', obj);
    this.fire(obj.type + 'Placed', String(obj.x), String(obj.y));
    for (const room of this.rooms.list) {
      if (room.objectIn(obj)) {
        room.addObject(obj);
        this.fire('ObjectInRoom', obj.type, room.type);
        this.emit('roomsChanged');
        break;
      }
    }
  }
  objectAt(x, y) {
    return this.objects.list.find((o) => o.covers(x, y)) || null;
  }
  // Selling refunds the full price, like the original.
  sellObjectAt(x, y) {
    const obj = this.objectAt(x, y);
    if (!obj) return null;
    for (const s of obj.slots) {
      const occ = s.occupant;
      s.leave();
      if (occ) occ.slot = null;
    }
    if (obj.barman) obj.barman = null;
    this.objects.list = this.objects.list.filter((o) => o !== obj);
    if (obj.room) {
      const r = obj.room;
      r.removeObject(obj);
      this.emit('roomsChanged');
    }
    this.money += obj.price;
    this.emit('objectRemoved', obj);
    this.emit('money', obj.price, obj.x, obj.y);
    this.sound('removeRoom');
    return obj;
  }

  canRecruitAt(x, y) {
    return this.map.inside(x, y) && !this.map.blocking(x, y);
  }
  recruit(job, x, y) {
    if (!this.canRecruitAt(x, y)) return null;
    const fee = JOBS[job].hello;
    if (this.money - fee < 0) return null;
    this.money -= fee;
    const d = this.addDwarf(job, x, y);
    this.emit('money', -fee, x, y);
    this.sound('grunt');
    this.fire(job + 'Recruited');
    return d;
  }
  addDwarf(job, x, y) {
    const d = new Dwarf(this, job, x, y);
    this.dwarves.push(d);
    this.emit('dwarfAdded', d);
    return d;
  }
  dwarfAt(x, y, radius = 0.6) {
    let best = null, bd = radius;
    for (const d of this.dwarves) {
      const dist = Math.hypot(d.x - x, d.y - y);
      if (dist < bd) {
        bd = dist;
        best = d;
      }
    }
    return best;
  }
  dismiss(d) {
    const cost = d.def.parachute;
    this.money -= cost; // the original removed the dwarf even when this overdrew
    d.destroy();
    this.dwarves = this.dwarves.filter((x) => x !== d);
    this.emit('dwarfRemoved', d);
    this.emit('money', -cost, d.x, d.y);
    this.sound('Menu_cancel');
  }

  // ------------------------------------------------------------ save / load
  serialize() {
    return {
      v: 1,
      level: this.level.file,
      map: Array.from(this.map.ids, (v) => String.fromCharCode(48 + v)).join(''),
      money: this.money,
      diamonds: this.diamonds,
      elapsed: this.elapsed,
      day: this.dayCounter,
      progression: this.script ? this.script.getProgression() : 0,
      dwarves: this.dwarves.map((d) => d.toJSON()),
      objects: this.objects.list.map((o) => o.toJSON()),
      rooms: this.rooms.list.map((r) => r.toJSON()),
      tasks: this.tasks.toJSON(),
    };
  }
  restore(s) {
    for (let i = 0; i < this.map.ids.length; i++) this.map.ids[i] = s.map.charCodeAt(i) - 48;
    this.mapVersion++;
    this.labels = null;
    this.money = s.money;
    this.diamonds = s.diamonds;
    this.elapsed = s.elapsed;
    this.dayCounter = s.day;
    for (const o of s.objects) {
      const obj = new GameObject(o.t, o.x, o.y, o.r);
      if (o.items) obj.items = o.items.map(Pickaxe.from);
      this.objects.list.push(obj);
      this.emit('objectAdded', obj);
    }
    for (const r of s.rooms) {
      const room = new Room(r.t, this.map);
      room.tiles = new Set(r.tiles);
      this.rooms.list.push(room);
      for (const obj of this.objects.list) if (!obj.room && room.objectIn(obj)) room.addObject(obj);
      room.updateOperational();
    }
    for (const dd of s.dwarves) {
      const d = this.addDwarf(dd.job, dd.x, dd.y);
      d.firstName = dd.f;
      d.lastName = dd.l;
      [d.needs.sleep, d.needs.thirst, d.needs.sleepNeed, d.needs.beerNeed] = dd.n;
      d.right = dd.r ? Pickaxe.from(dd.r) : null;
    }
    this.tasks.load(s.tasks);
    if (this.script) this.script.setProgression(s.progression);
    this.emit('roomsChanged');
    this.emit('tasksChanged');
    this.emit('mapReset');
  }
}
