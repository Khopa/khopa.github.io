import { tileDef } from '../defs.js';

// Tile grid in game coordinates: x to the right, y up (as in the original).
export class TileMap {
  constructor(w, h, ids) {
    this.w = w;
    this.h = h;
    this.ids = ids; // Uint8Array, index = y * w + x
    this.listeners = [];
  }

  static fromJSON(data) {
    const ids = new Uint8Array(data.w * data.h);
    for (let y = 0; y < data.h; y++) {
      const row = data.rows[y];
      for (let x = 0; x < data.w; x++) ids[y * data.w + x] = row.charCodeAt(x) - 48;
    }
    return new TileMap(data.w, data.h, ids);
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  get(x, y) {
    return this.inside(x, y) ? this.ids[y * this.w + x] : 1;
  }
  def(x, y) {
    return tileDef(this.get(x, y));
  }
  set(x, y, id) {
    if (!this.inside(x, y)) return;
    this.ids[y * this.w + x] = id;
    for (const l of this.listeners) l(x, y, id);
  }
  // Outside the map counts as blocking, like the original.
  blocking(x, y) {
    if (!this.inside(x, y)) return true;
    return !!tileDef(this.ids[y * this.w + x]).collide;
  }
  minable(x, y) {
    const d = this.def(x, y);
    return !!(d.collide && d.minable);
  }
  prop(x, y, name) {
    return this.def(x, y)[name] || 0;
  }
  countDiamonds() {
    let n = 0;
    for (const id of this.ids) if (tileDef(id).diamond) n++;
    return n;
  }
}
