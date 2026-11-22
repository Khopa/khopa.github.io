// Mining task manager, ported from TaskManager.java.
// toMine: designated tiles. accessible: designated tiles next to open floor.
// assigned: tiles currently given to a miner.
export class TaskManager {
  constructor(game) {
    this.game = game;
    this.toMine = new Set();
    this.accessible = new Set();
    this.assigned = new Map(); // tile index -> miner
  }
  get map() {
    return this.game.map;
  }
  idx(x, y) {
    return y * this.map.w + x;
  }
  xy(i) {
    return [i % this.map.w, (i / this.map.w) | 0];
  }
  isDesignated(x, y) {
    return this.toMine.has(this.idx(x, y));
  }

  addArea(x0, y0, x1, y1) {
    const map = this.map;
    let added = 0;
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        if (!map.inside(x, y)) continue;
        const i = this.idx(x, y);
        if (this.toMine.has(i)) continue;
        if (!map.blocking(x, y) || !map.minable(x, y)) continue;
        this.toMine.add(i);
        added++;
        this.checkAccessible(i);
      }
    if (added) {
      this.game.fire('newTile');
      this.game.emit('tasksChanged');
    }
    return added;
  }

  removeArea(x0, y0, x1, y1) {
    let removed = 0;
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        const i = this.idx(x, y);
        if (this.toMine.delete(i)) removed++;
        this.accessible.delete(i);
        const m = this.assigned.get(i);
        if (m) {
          this.assigned.delete(i);
          if (m.toMine === i) m.toMine = null;
        }
      }
    if (removed) this.game.emit('tasksChanged');
    return removed;
  }

  checkAccessible(i) {
    const [x, y] = this.xy(i);
    const map = this.map;
    // The original ignored tiles on the map border.
    if (x <= 0 || y <= 0 || x >= map.w - 1 || y >= map.h - 1) return;
    if (!map.blocking(x + 1, y) || !map.blocking(x - 1, y) || !map.blocking(x, y + 1) || !map.blocking(x, y - 1)) {
      if (!this.accessible.has(i)) {
        this.accessible.add(i);
        this.game.fire('newAccessibleTile');
      }
    }
  }

  tileMined(i) {
    this.assigned.delete(i);
    this.accessible.delete(i);
    this.toMine.delete(i);
    for (const t of this.toMine) if (!this.accessible.has(t)) this.checkAccessible(t);
    this.game.emit('tasksChanged');
  }

  // Give the nearest accessible, unassigned (and reachable) tile to a miner.
  assign(miner) {
    const [mx, my] = [Math.round(miner.x), Math.round(miner.y)];
    const now = this.game.time;
    let best = -1, bestD = Infinity;
    for (const i of this.accessible) {
      if (this.assigned.has(i)) continue;
      const refusedAt = miner.refused.get(i);
      if (refusedAt !== undefined && now - refusedAt < 12) continue;
      const [x, y] = this.xy(i);
      const d = (x - mx) ** 2 + (y - my) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      miner.toMine = best;
      this.assigned.set(best, miner);
    } else miner.toMine = null;
  }

  // The miner could not reach its tile.
  refuse(miner) {
    const i = miner.toMine;
    if (i == null) return;
    this.assigned.delete(i);
    miner.refused.set(i, this.game.time);
    miner.toMine = null;
  }

  // The miner stops working (needs, fired...)
  leave(miner) {
    const i = miner.toMine;
    if (i != null && this.assigned.get(i) === miner) this.assigned.delete(i);
    miner.toMine = null;
  }

  toJSON() {
    return [...this.toMine];
  }
  load(arr) {
    for (const i of arr) {
      const [x, y] = this.xy(i);
      if (this.map.blocking(x, y) && this.map.minable(x, y)) {
        this.toMine.add(i);
        this.checkAccessible(i);
      }
    }
  }
}
