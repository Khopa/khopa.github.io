import { OBJECTS } from '../defs.js';

let nextId = 1;

// Tools ------------------------------------------------------------------
// Pickaxe rules from Tool/Pickaxe/NoEnchantment/Enchanted (durability .2, enchant x8 power, x2 durability).
export class Pickaxe {
  constructor() {
    this.damage = 0;
    this.enchanted = false;
  }
  get power() {
    return this.enchanted ? 8 : 1;
  }
  // Wear applied on each mined block. Mirrors the original formula exactly
  // (the enchanted branch applies the durability factor twice).
  use() {
    const base = 0.2;
    if (this.enchanted) this.damage = Math.min(100, this.damage + 1 / (base * 2 * 2));
    else this.damage = Math.min(100, this.damage + 1 / base);
  }
  repair(speed) {
    this.damage = Math.max(0, this.damage - speed);
  }
  toJSON() {
    return { d: this.damage, e: this.enchanted ? 1 : 0 };
  }
  static from(o) {
    const p = new Pickaxe();
    p.damage = o.d;
    p.enchanted = !!o.e;
    return p;
  }
}

export class Beer {
  constructor() {
    this.quantity = 4;
  }
}

// Rotation helpers (0..3 quarter turns clockwise) ---------------------------
export function rotatedSize(type, rot) {
  const [sx, sy] = OBJECTS[type].size;
  return rot % 2 === 0 ? [sx, sy] : [sy, sx];
}

// Slot offset after rotation, same rules as the original Slot.getX/getY.
export function rotateSlot(type, rot, x, y) {
  const [nx, ny] = OBJECTS[type].size;
  switch (rot) {
    case 1: return [ny - y - 1, x];
    case 2: return [nx - x - 1, ny - y - 1];
    case 3: return [y, nx - x - 1];
    default: return [x, y];
  }
}

export class Slot {
  constructor(obj, x, y, who) {
    this.obj = obj;
    this.lx = x;
    this.ly = y;
    this.who = who; // 'any' or job name
    this.occupant = null;
  }
  get pos() {
    const [dx, dy] = rotateSlot(this.obj.type, this.obj.rot, this.lx, this.ly);
    return [this.obj.x + dx, this.obj.y + dy];
  }
  accepts(job) {
    return this.who === 'any' || this.who === job;
  }
  occupy(ch) {
    this.occupant = ch;
    ch.slot = this;
  }
  leave() {
    if (this.occupant) {
      if (this.occupant.slot === this) this.occupant.slot = null;
      this.occupant = null;
    }
  }
}

export class GameObject {
  constructor(type, x, y, rot = 0) {
    this.id = nextId++;
    this.type = type;
    this.def = OBJECTS[type];
    this.x = x;
    this.y = y;
    this.rot = rot;
    this.room = null;
    this.slots = this.def.slots.map(([sx, sy, who]) => new Slot(this, sx, sy, who));
    if (type === 'Rack') this.items = [];
    if (type === 'Counter') {
      this.beer = 0;
      this.barman = null;
    }
  }
  get price() {
    return this.def.price;
  }
  get size() {
    return rotatedSize(this.type, this.rot);
  }
  tiles() {
    const [sx, sy] = this.size;
    const out = [];
    for (let i = 0; i < sx; i++) for (let j = 0; j < sy; j++) out.push([this.x + i, this.y + j]);
    return out;
  }
  covers(x, y) {
    const [sx, sy] = this.size;
    return x >= this.x && y >= this.y && x < this.x + sx && y < this.y + sy;
  }
  slotAvailable(job = 'any') {
    return this.slots.some((s) => !s.occupant && (job === 'any' ? s.who === 'any' : s.accepts(job)));
  }
  availableSlot(job = 'any') {
    return this.slots.find((s) => !s.occupant && (job === 'any' ? s.who === 'any' : s.accepts(job))) || null;
  }
  // Counter helpers
  barmanSlot() {
    return this.slots.find((s) => s.who === 'Barman') || null;
  }
  // Rack helpers
  isFull() {
    return this.items.length >= this.def.capacity;
  }
  addItem(p) {
    if (!this.isFull()) this.items.push(p);
  }
  newPickaxe() {
    let out = null;
    for (const p of this.items) {
      out = p;
      if (p.damage <= 0) return p;
    }
    return out;
  }
  itemToRepair() {
    return this.items.find((p) => p.damage > 0) || null;
  }
  toJSON() {
    const o = { t: this.type, x: this.x, y: this.y, r: this.rot };
    if (this.items) o.items = this.items.map((p) => p.toJSON());
    return o;
  }
}
