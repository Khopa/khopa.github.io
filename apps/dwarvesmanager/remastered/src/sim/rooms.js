import { ROOMS } from '../defs.js';

let nextId = 1;

// A room is a set of floor tiles of one type plus the objects fully inside it.
// The original stored rectangles; a tile set gives the same behaviour with
// simpler merging and splitting.
export class Room {
  constructor(type, map) {
    this.id = nextId++;
    this.type = type;
    this.def = ROOMS[type];
    this.map = map;
    this.tiles = new Set();
    this.objects = [];
    this.operational = false;
  }
  has(x, y) {
    return this.tiles.has(y * this.map.w + x);
  }
  objectIn(obj) {
    return obj.tiles().every(([x, y]) => this.has(x, y));
  }
  barycenter() {
    let sx = 0, sy = 0;
    for (const i of this.tiles) {
      sx += i % this.map.w;
      sy += (i / this.map.w) | 0;
    }
    const n = Math.max(1, this.tiles.size);
    return [sx / n, sy / n];
  }
  tileList() {
    return [...this.tiles].map((i) => [i % this.map.w, (i / this.map.w) | 0]);
  }
  addObject(obj) {
    if (!this.objects.includes(obj)) this.objects.push(obj);
    obj.room = this;
    this.updateOperational();
  }
  removeObject(obj) {
    this.objects = this.objects.filter((o) => o !== obj);
    if (obj.room === this) obj.room = null;
    this.updateOperational();
  }
  updateObjects() {
    for (const o of [...this.objects]) if (!this.objectIn(o)) this.removeObject(o);
    this.updateOperational();
  }
  objectsOf(type) {
    return this.objects.filter((o) => o.type === type);
  }
  missing() {
    const out = [];
    for (const [type, n] of Object.entries(this.def.needs)) {
      const have = this.objectsOf(type).length;
      if (have < n) out.push(type);
    }
    return out;
  }
  updateOperational() {
    this.operational = this.missing().length === 0;
    return this.operational;
  }
  // Tavern: has a counter with a free bartender spot
  hasAvailableCounter() {
    if (!this.operational) return false;
    return this.objectsOf('Counter').some((c) => !c.barmanSlot().occupant);
  }
  haveAvailableBed() {
    return this.objectsOf('Bed').some((b) => b.slotAvailable());
  }
  toJSON() {
    return { t: this.type, tiles: [...this.tiles] };
  }
}

export class Rooms {
  constructor(game) {
    this.game = game;
    this.list = [];
  }
  get map() {
    return this.game.map;
  }
  has(room) {
    return this.list.includes(room);
  }
  at(x, y) {
    return this.list.find((r) => r.has(x, y)) || null;
  }
  ofType(type, mustBeOperational = false) {
    return this.list.filter((r) => r.type === type && (!mustBeOperational || r.operational));
  }
  sorted(type, fromX, fromY, mustBeOperational = true) {
    const rooms = this.ofType(type, mustBeOperational);
    const d = (r) => {
      const [x, y] = r.barycenter();
      return (x - fromX) ** 2 + (y - fromY) ** 2;
    };
    return rooms.sort((a, b) => d(a) - d(b));
  }

  // Place a room of `type` over a rectangle (inclusive tile bounds). Returns the room or null.
  place(type, x0, y0, x1, y1) {
    const map = this.map;
    const tiles = [];
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        if (map.inside(x, y) && !map.blocking(x, y)) tiles.push(y * map.w + x);
    if (!tiles.length) return null;
    const set = new Set(tiles);
    // Remove these tiles from rooms of other types, find same-type rooms to merge.
    const merge = [];
    for (const r of [...this.list]) {
      let overlap = false;
      for (const t of set) if (r.tiles.has(t)) { overlap = true; break; }
      if (!overlap) continue;
      if (r.type === type) merge.push(r);
      else {
        for (const t of set) r.tiles.delete(t);
        if (r.tiles.size === 0) this.removeRoom(r);
        else r.updateObjects();
      }
    }
    let room;
    if (merge.length) {
      room = merge[0];
      for (const t of set) room.tiles.add(t);
      for (const other of merge.slice(1)) {
        for (const t of other.tiles) room.tiles.add(t);
        for (const o of other.objects) room.addObject(o);
        this.removeRoom(other);
      }
    } else {
      room = new Room(type, map);
      room.tiles = set;
      this.list.push(room);
    }
    for (const obj of this.game.objects.list) {
      if (!obj.room && room.objectIn(obj)) {
        room.addObject(obj);
        this.game.fire('ObjectInRoom', obj.type, room.type);
      }
    }
    room.updateOperational();
    this.game.emit('roomsChanged');
    this.game.fire('roomPlaced', String(tiles.length));
    return room;
  }

  removeArea(x0, y0, x1, y1) {
    const w = this.map.w;
    let changed = false;
    for (const r of [...this.list]) {
      let touched = false;
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
        for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
          if (r.tiles.delete(y * w + x)) touched = true;
      if (touched) {
        changed = true;
        if (r.tiles.size === 0) this.removeRoom(r, false);
        else r.updateObjects();
      }
    }
    if (changed) this.game.emit('roomsChanged');
    return changed;
  }

  removeRoom(room, emit = true) {
    for (const o of room.objects) o.room = null;
    room.objects = [];
    this.list = this.list.filter((r) => r !== room);
    if (emit) this.game.emit('roomsChanged');
  }

  clear() {
    for (const r of [...this.list]) this.removeRoom(r, false);
    this.game.emit('roomsChanged');
  }
}
