import { JOBS, NEEDS_MAX, COMPLAINT, SIM_HZ } from '../defs.js';
import { Pickaxe, Beer } from './objects.js';

let nextId = 1;

// Behaviours are generators. They yield a number (seconds to wait) or nothing
// (resume next tick). Nested behaviours use yield*. Cancelling a behaviour
// runs its finally blocks, which is where reservations are released.
class Behavior {
  constructor(gen) {
    this.gen = gen;
    this.wait = 0;
    this.done = false;
  }
  step(dt) {
    if (this.done) return;
    if (this.wait > 0) {
      this.wait -= dt;
      return;
    }
    const r = this.gen.next();
    if (r.done) this.done = true;
    else if (typeof r.value === 'number') this.wait = r.value;
  }
  cancel() {
    if (!this.done) {
      this.done = true;
      try {
        this.gen.return();
      } catch (e) {
        console.error(e);
      }
    }
  }
}

function gaussian() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function needFactor() {
  // MEAN 2.5, DEVIATION 1, clamped to [0.5, 4.5]
  let r = gaussian() * 1 + 2.5;
  if (r <= 0.5) r = 0.5;
  else if (r >= 4.5) r = 4.5;
  return r;
}

export class Needs {
  constructor() {
    this.sleep = 0;
    this.thirst = 0;
    this.sleepNeed = needFactor();
    this.beerNeed = needFactor();
  }
  clamp(v) {
    return Math.max(0, Math.min(NEEDS_MAX, v));
  }
  setSleep(v) {
    this.sleep = this.clamp(v);
  }
  setThirst(v) {
    this.thirst = this.clamp(v);
  }
  // Called once per simulation tick (60 Hz), like the original per-frame update.
  update(job) {
    this.setSleep(this.sleep + this.sleepNeed);
    this.setThirst(this.thirst + this.beerNeed);
    if (job === 'Barman') this.thirst = 0;
  }
  get satisfied() {
    return this.sleep < 0.5 * NEEDS_MAX && this.thirst < 0.5 * NEEDS_MAX;
  }
  get ableToWork() {
    return this.sleep < 0.8 * NEEDS_MAX && this.thirst < 0.8 * NEEDS_MAX;
  }
}

export class Dwarf {
  constructor(game, job, x, y) {
    this.id = nextId++;
    this.game = game;
    this.job = job;
    this.def = JOBS[job];
    this.x = x;
    this.y = y;
    this.facing = 'down'; // up/down/left/right in game space
    this.needs = new Needs();
    this.right = job === 'Miner' ? new Pickaxe() : null; // item in right hand
    this.left = null; // item in left hand
    this.slot = null;
    this.speed = 1;
    this.speedTimer = 0;
    this.mode = null; // 'work' | 'rest'
    this.behavior = null;
    this.activity = 'idle';
    this.anim = null; // { name, t, dur } read by the view
    this.pose = 'stand'; // stand | sit | lie
    this.complaint = null; // { id, t }
    this.eyesClosed = false;
    this.toMine = null;
    this.refused = new Map();
    const n = game.names;
    if (game.lang === 'fr') {
      this.firstName = 'Nain';
      this.lastName = pick(n.fr);
    } else {
      this.firstName = pick(n.first);
      this.lastName = pick(n.last);
    }
  }
  get name() {
    return `${this.firstName} ${this.lastName}`;
  }
  get tx() {
    return Math.round(this.x);
  }
  get ty() {
    return Math.round(this.y);
  }
  get salary() {
    return this.def.salary;
  }
  hasPickaxe() {
    return this.right instanceof Pickaxe;
  }

  update(dt) {
    this.speedTimer -= dt;
    if (this.speedTimer < dt) this.speed = 1;
    if (this.anim) {
      this.anim.t += dt;
      if (this.anim.t > this.anim.dur) this.anim = null;
    }
    if (this.complaint) {
      this.complaint.t += dt;
      if (this.complaint.t > 6) this.complaint = null;
    }
    const needs = this.needs;
    if (!needs.ableToWork && this.mode === 'work') {
      this.behavior.cancel();
      this.startRest();
    }
    if (!this.behavior || this.behavior.done) {
      if (!needs.satisfied) this.startRest();
      else this.startWork();
    } else this.behavior.step(dt);
    needs.update(this.job);
    // ManageNeeds updated the needs a second time each frame in the original.
    if (this.mode === 'rest') needs.update(this.job);
    if (!this.game.needsEnabled) {
      needs.sleep = 0;
      needs.thirst = 0;
    }
  }

  startRest() {
    this.mode = 'rest';
    this.behavior = new Behavior(this.manageNeeds());
  }
  startWork() {
    this.mode = 'work';
    const gen = {
      Miner: () => this.goMining(),
      Barman: () => this.goServing(),
      Craftman: () => this.goCrafting(),
      Enchanter: () => this.goEnchanting(),
    }[this.job]();
    this.behavior = new Behavior(gen);
  }
  destroy() {
    if (this.behavior) this.behavior.cancel();
    if (this.slot) this.slot.leave();
    this.game.tasks.leave(this);
  }

  // ---------------------------------------------------------------- helpers
  play(name, dur) {
    this.anim = { name, t: 0, dur };
  }
  *abort(complaint) {
    this.complaint = { id: complaint, t: 0 };
    this.play('complain', 1.2);
    this.game.emit('complaint', this, complaint);
    this.activity = 'complaining';
    yield 6;
  }
  face(tx, ty) {
    if (ty > this.y) this.facing = 'up';
    else if (ty < this.y) this.facing = 'down';
    else if (tx > this.x) this.facing = 'right';
    else if (tx < this.x) this.facing = 'left';
  }
  // Walk along a path of [x, y] tiles; `dur` seconds per tile at speed 1.
  *walk(path, dur = 0.2) {
    if (!path) return false;
    this.pose = 'stand';
    this.eyesClosed = false;
    const dt = 1 / SIM_HZ;
    for (const [nx, ny] of path) {
      const sx = this.x, sy = this.y;
      this.face(nx, ny);
      let t = 0;
      this.moving = true;
      while (t < dur) {
        t += dt * this.speed;
        const k = Math.min(1, t / dur);
        this.x = sx + (nx - sx) * k;
        this.y = sy + (ny - sy) * k;
        yield;
      }
      this.x = nx;
      this.y = ny;
    }
    this.moving = false;
    return true;
  }
  at(x, y) {
    return this.x === x && this.y === y;
  }

  // -------------------------------------------------------------- needs
  *manageNeeds() {
    for (;;) {
      if (this.needs.thirst >= this.needs.sleep) yield* this.goDrinking();
      else yield* this.goSleeping();
      if (this.needs.satisfied) {
        this.play('hop', 0.25);
        return;
      }
      yield;
    }
  }

  *goDrinking() {
    const g = this.game;
    this.activity = 'thirsty';
    // Find an operational tavern with a staffed counter and a free customer spot.
    let tavern = null, path = null;
    for (const t of g.rooms.sorted('Tavern', this.x, this.y)) {
      const ok = t.objectsOf('Counter').some((c) => c.barman && c.availableSlot('any'));
      if (!ok) continue;
      path = g.pathToRoom(this, t);
      tavern = t;
      if (path) break;
    }
    if (!path) return yield* this.abort(COMPLAINT.NO_BEER);
    this.activity = 'goingToTavern';
    yield* this.walk(path);
    for (;;) {
      if (!g.rooms.has(tavern) || !tavern.operational) return yield* this.abort(COMPLAINT.NO_BEER);
      // Go to a counter spot
      let slot = null, counter = null;
      for (const c of g.objectsInRoomSorted(tavern, 'Counter', this, 'any')) {
        if (!c.barman) continue;
        const s = c.availableSlot('any');
        if (!s) continue;
        const p = g.pathToTile(this, ...s.pos);
        if (p) {
          slot = s;
          counter = c;
          s.occupy(this);
          path = p;
          break;
        }
      }
      if (!slot) return yield* this.abort(COMPLAINT.NO_BEER);
      try {
        yield* this.walk(path);
        this.activity = 'waitingForBeer';
        this.facing = 'up';
        // Wait for the bartender to bring a beer.
        while (!(counter.beer > 0)) {
          if (!g.objects.has(counter) || !counter.barman) return yield* this.abort(COMPLAINT.NO_BEER);
          this.play('requestBeer', 1.1);
          yield 1.1;
        }
        counter.beer--;
      } finally {
        slot.leave();
      }
      yield* this.drinking(tavern);
      if (this.needs.thirst <= NEEDS_MAX / 10) return;
    }
  }

  *drinking(tavern) {
    const g = this.game;
    this.left = new Beer();
    try {
      const table = g.nearestObjectInRoom(tavern, 'TableObject', this, 'any');
      const slot = table && table.availableSlot('any');
      const path = slot && g.pathToTile(this, ...slot.pos);
      if (!path) return yield* this.abort(COMPLAINT.NO_PATH);
      slot.occupy(this);
      try {
        this.activity = 'goingToTable';
        yield* this.walk(path);
        this.pose = 'sit';
        this.activity = 'drinking';
        const beer = this.left;
        while (beer.quantity > 0) {
          beer.quantity--;
          this.needs.setThirst(this.needs.thirst - NEEDS_MAX / 7);
          this.play('drink', 1.5);
          yield 1.5;
        }
      } finally {
        this.pose = 'stand';
        slot.leave();
      }
    } finally {
      this.left = null;
    }
  }

  *goSleeping() {
    const g = this.game;
    this.activity = 'sleepy';
    let dorm = null, path = null;
    for (const d of g.rooms.sorted('Dorm', this.x, this.y)) {
      if (!d.haveAvailableBed()) continue;
      path = g.pathToRoom(this, d);
      dorm = d;
      if (path) break;
    }
    if (!path) return yield* this.abort(COMPLAINT.NO_BED);
    this.activity = 'goingToDorm';
    yield* this.walk(path);
    for (let tries = 0; tries < 5; tries++) {
      if (!g.rooms.has(dorm)) return yield* this.abort(COMPLAINT.NO_BED);
      const bed = g.nearestObjectInRoom(dorm, 'Bed', this, this.job);
      if (!bed) return yield* this.abort(COMPLAINT.NO_BED);
      const p = g.pathToTile(this, bed.x, bed.y);
      if (!p) return yield* this.abort(COMPLAINT.NO_BED);
      yield* this.walk(p);
      const slot = bed.availableSlot('any');
      if (!g.objects.has(bed) || !slot) continue; // someone took it, look for another
      yield* this.sleeping(bed, slot);
      return;
    }
  }

  *sleeping(bed, slot) {
    const g = this.game;
    slot.occupy(this);
    this.activity = 'sleeping';
    this.facing = 'down';
    this.pose = 'lie';
    this.eyesClosed = true;
    let easy = false;
    const dt = 1 / SIM_HZ;
    try {
      for (;;) {
        if (!g.objects.has(bed)) break;
        this.needs.setSleep(this.needs.sleep - dt * 1600);
        if (this.needs.sleep <= 0) {
          easy = true;
          break;
        }
        yield;
      }
    } finally {
      slot.leave();
      this.pose = 'stand';
      this.eyesClosed = false;
      this.play(easy ? 'wake' : 'grumpyWake', easy ? 0.6 : 1.9);
    }
  }

  // -------------------------------------------------------------- miner
  stopWorking() {
    this.game.tasks.leave(this);
  }

  *goMining() {
    const g = this.game;
    try {
      for (;;) {
        if (!this.hasPickaxe()) {
          this.stopWorking();
          this.activity = 'lookingForPickaxe';
          let found = null;
          outer: for (const room of g.rooms.sorted('Workshop', this.x, this.y)) {
            for (const rack of g.objectsInRoomSorted(room, 'Rack', this)) {
              if (!rack.newPickaxe()) continue;
              const path = g.pathToAdjacent(this, rack.x, rack.y);
              if (path) {
                found = { rack, room, path };
                break outer;
              }
            }
          }
          if (!found) {
            yield* this.abort(COMPLAINT.NO_PICKAXE);
            continue;
          }
          yield* this.walk(found.path);
          if (!g.objects.has(found.rack) || !g.rooms.has(found.room)) {
            yield* this.abort(COMPLAINT.TROLL);
            continue;
          }
          const p = found.rack.newPickaxe();
          if (!p) {
            yield* this.abort(COMPLAINT.NO_PICKAXE);
            continue;
          }
          found.rack.items.splice(found.rack.items.indexOf(p), 1);
          this.right = p;
          this.play('hop', 0.25);
          g.emit('rackChanged', found.rack);
          continue;
        }
        if (this.toMine != null) {
          const [tx, ty] = g.tasks.xy(this.toMine);
          if (!g.map.blocking(tx, ty)) {
            g.tasks.tileMined(this.toMine);
            this.toMine = null;
            continue;
          }
          const path = g.pathToAdjacent(this, tx, ty);
          if (path) {
            this.activity = 'goingToMine';
            yield* this.walk(path);
            yield* this.mining(tx, ty);
          } else {
            g.tasks.refuse(this);
            yield 0.2;
          }
          continue;
        }
        g.tasks.assign(this);
        if (this.toMine == null) {
          this.activity = 'idle';
          const step = g.randomStep(this);
          if (step) yield* this.walk([step], 0.8);
          else yield 0.5;
        }
      }
    } finally {
      this.stopWorking();
    }
  }

  *mining(tx, ty) {
    const g = this.game;
    const hardness = g.map.prop(tx, ty, 'hardness');
    let progression = 0;
    this.activity = 'mining';
    this.face(tx, ty);
    this.miningTarget = [tx, ty];
    try {
      for (;;) {
        if (!this.hasPickaxe()) return yield* this.abort(COMPLAINT.TROLL);
        const pk = this.right;
        const step = 0.7 / pk.power;
        if (progression > hardness * step) {
          g.sound('mined' + ((Math.random() * 4) | 0));
          pk.use();
          if (pk.damage >= 100 && g.pickaxeBreakable) this.breakPickaxe();
          yield step;
          g.tileMinedBy(this, tx, ty);
          return;
        }
        this.play('mine', step);
        g.emit('mineHit', this, tx, ty, progression / Math.max(1, hardness * step));
        if (pk.damage >= 100) {
          this.breakPickaxe();
          return;
        }
        progression++;
        yield step;
      }
    } finally {
      this.miningTarget = null;
    }
  }

  breakPickaxe() {
    this.right = null;
    this.game.sound('break');
    this.game.emit('pickaxeBreak', this);
    this.game.fire('pickaxeBreak', String(this.x), String(this.y));
  }

  // -------------------------------------------------------------- craftsman
  *goCrafting() {
    const g = this.game;
    for (;;) {
      this.activity = 'goingToWorkshop';
      let found = null;
      outer: for (const room of g.rooms.sorted('Workshop', this.x, this.y)) {
        for (const anvil of room.objectsOf('Anvil')) {
          const slot = anvil.availableSlot('Craftman');
          if (!slot) continue;
          const path = g.pathToTile(this, ...slot.pos);
          if (path) {
            found = { room, anvil, slot, path };
            break outer;
          }
        }
      }
      if (!found) {
        yield* this.abort(COMPLAINT.NO_PICKAXE);
        continue;
      }
      const { room, anvil, slot } = found;
      slot.occupy(this);
      try {
        yield* this.walk(found.path);
        for (;;) {
          if (!g.objects.has(anvil) || !g.rooms.has(room) || !room.operational) break;
          if (!this.at(...slot.pos)) {
            const back = g.pathToTile(this, ...slot.pos);
            if (!back) {
              yield* this.abort(COMPLAINT.NO_PATH);
              break;
            }
            yield* this.walk(back);
          }
          this.facing = 'left';
          const ok = yield* this.crafting(room, anvil, slot);
          if (!ok) break;
        }
      } finally {
        slot.leave();
        this.right = null;
      }
    }
  }

  *crafting(room, anvil, slot) {
    const g = this.game;
    const racks = g.objectsInRoomSorted(room, 'Rack', this);
    if (!racks.length) {
      yield* this.abort(COMPLAINT.TROLL);
      return false;
    }
    const faceAnvil = () => this.face(anvil.x, anvil.y);
    const hammer = function* (self) {
      faceAnvil();
      self.play('hammer', 3.7);
      g.sound('anvil' + ((Math.random() * 2) | 0));
      g.emit('anvilHit', anvil);
      yield 3.7;
    };
    // Repair a damaged pickaxe first
    for (const rack of racks) {
      if (!rack.itemToRepair()) continue;
      const path = g.pathToAdjacent(this, rack.x, rack.y);
      if (!path) continue;
      this.activity = 'repairing';
      yield* this.walk(path);
      const p = rack.itemToRepair();
      if (!g.objects.has(rack) || !p) {
        yield* this.abort(COMPLAINT.TROLL);
        return false;
      }
      rack.items.splice(rack.items.indexOf(p), 1);
      g.emit('rackChanged', rack);
      this.right = p;
      yield* this.walk(g.pathToTile(this, ...slot.pos));
      while (p.damage > 0) {
        p.repair(35);
        yield* hammer(this);
      }
      return yield* this.storePickaxe(room, slot);
    }
    // Otherwise craft a new one if a rack has room
    if (!racks.some((r) => !r.isFull())) {
      yield* this.abort(COMPLAINT.NO_PICKAXE);
      return true;
    }
    this.activity = 'crafting';
    this.right = new Pickaxe();
    let percent = 0;
    while (percent < 100) {
      percent += 35;
      yield* hammer(this);
    }
    return yield* this.storePickaxe(room, slot);
  }

  *storePickaxe(room, slot) {
    const g = this.game;
    for (let tries = 0; tries < 3; tries++) {
      const rack = g.objectsInRoomSorted(room, 'Rack', this).find((r) => !r.isFull());
      const path = rack && g.pathToAdjacent(this, rack.x, rack.y);
      if (!path) break;
      this.activity = 'storingPickaxe';
      yield* this.walk(path);
      if (!g.objects.has(rack) || rack.isFull()) continue;
      this.face(rack.x, rack.y);
      rack.addItem(this.right);
      this.right = null;
      this.play('replenish', 0.6);
      g.emit('rackChanged', rack);
      yield 0.4;
      const back = g.pathToTile(this, ...slot.pos);
      if (back) yield* this.walk(back);
      return true;
    }
    this.right = null;
    yield* this.abort(COMPLAINT.NO_PICKAXE);
    return false;
  }

  // -------------------------------------------------------------- bartender
  *goServing() {
    const g = this.game;
    for (;;) {
      this.activity = 'lookingForBar';
      let counter = null, tavern = null;
      outer: for (const t of g.rooms.sorted('Tavern', this.x, this.y)) {
        for (const c of t.objectsOf('Counter')) {
          if (!c.barmanSlot().occupant && !c.barman) {
            counter = c;
            tavern = t;
            break outer;
          }
        }
      }
      if (!counter) {
        yield* this.abort(COMPLAINT.NO_BEER);
        continue;
      }
      counter.barman = this;
      try {
        const bs = counter.barmanSlot();
        const path = g.pathToTile(this, ...bs.pos);
        if (!path) {
          yield* this.abort(COMPLAINT.NO_PATH);
          continue;
        }
        this.activity = 'goingToBar';
        yield* this.walk(path);
        for (;;) {
          if (!g.objects.has(counter) || !g.rooms.has(tavern) || !tavern.operational) {
            yield* this.abort(COMPLAINT.TROLL);
            break;
          }
          if (!this.at(...bs.pos)) {
            const back = g.pathToTile(this, ...bs.pos);
            if (!back) break;
            yield* this.walk(back);
          }
          this.facing = 'down';
          const waiting = counter.slots.some((s) => s !== bs && s.occupant);
          if (waiting) {
            const ok = yield* this.serving(tavern, counter);
            if (!ok) yield* this.abort(COMPLAINT.NO_BEER);
          } else {
            counter.beer = 0;
            this.activity = 'cleaning';
            this.play('replenish', 3);
            yield 3;
          }
        }
      } finally {
        if (counter.barman === this) counter.barman = null;
        counter.beer = 0;
        this.right = null;
      }
    }
  }

  *serving(tavern, counter) {
    const g = this.game;
    const barrel = g.nearestObjectInRoom(tavern, 'Barrel', this);
    const path = barrel && g.pathToAdjacent(this, barrel.x, barrel.y);
    if (!path) return false;
    this.activity = 'fetchingBeer';
    yield* this.walk(path);
    this.face(barrel.x, barrel.y);
    this.right = new Beer();
    this.play('replenish', 1.1);
    yield 1.1;
    const back = g.pathToTile(this, ...counter.barmanSlot().pos);
    if (back) yield* this.walk(back);
    this.facing = 'down';
    this.play('replenish', 1.1);
    yield 1.1;
    this.right = null;
    counter.beer = Math.min(1, counter.beer + 1);
    return true;
  }

  // -------------------------------------------------------------- enchanter
  *goEnchanting() {
    const g = this.game;
    const worthy = (rack) => rack.items.length > 0 && rack.items.some((p) => !p.enchanted);
    for (;;) {
      this.activity = 'lookingForPickaxes';
      let target = null, path = null;
      outer: for (const room of g.rooms.sorted('Workshop', this.x, this.y)) {
        for (const rack of g.objectsInRoomSorted(room, 'Rack', this)) {
          if (!worthy(rack)) continue;
          const p = g.pathToAdjacent(this, rack.x, rack.y);
          if (p) {
            target = rack;
            path = p;
            break outer;
          }
        }
      }
      if (!target) {
        yield* this.abort(COMPLAINT.NO_PICKAXE);
        continue;
      }
      yield* this.walk(path);
      if (!g.objects.has(target) || !worthy(target)) continue;
      this.face(target.x, target.y);
      this.activity = 'enchanting';
      this.play('enchant', 7);
      g.emit('enchantStart', this, target);
      yield 7;
      const tool = target.items.find((p) => !p.enchanted);
      if (tool && g.objects.has(target)) {
        tool.enchanted = true;
        this.needs.setSleep(this.needs.sleep + 5000 + Math.random() * 5000);
        this.needs.setThirst(this.needs.thirst + 2000);
        g.sound('enchant');
        g.emit('enchanted', target);
        g.emit('rackChanged', target);
      }
    }
  }

  toJSON() {
    return {
      job: this.job, x: this.tx, y: this.ty, f: this.firstName, l: this.lastName,
      n: [this.needs.sleep, this.needs.thirst, this.needs.sleepNeed, this.needs.beerNeed],
      r: this.right instanceof Pickaxe ? this.right.toJSON() : null,
    };
  }
}

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0] || 'Durin';
}
