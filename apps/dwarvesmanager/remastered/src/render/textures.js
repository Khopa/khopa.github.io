import * as THREE from 'three';

// Procedural, tileable textures for terrain, packed in an atlas with gutters
// (so mipmaps do not bleed between cells). Also builds the matching normal map.

export const CELL = {
  cobble: 0, planks: 1, bedrockTop: 2, bedrockSide: 3,
  dirtTop: 4, dirtSide: 5, clayTop: 6, claySide: 7,
  graniteTop: 8, graniteSide: 9, amethyst: 10, sapphire: 11,
  emerald: 12, poorore: 13, diamond: 14, oreSide: 15,
};
const GRID = 4;

function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
// periodic value noise in [0,1]
function vnoise(x, y, p, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = (a) => ((a % p) + p) % p;
  const a = hash(m(xi), m(yi), s), b = hash(m(xi + 1), m(yi), s);
  const c = hash(m(xi), m(yi + 1), s), d = hash(m(xi + 1), m(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, p, s, oct = 4) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(x * f, y * f, p * f, s + o * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}
// periodic worley: returns [f1, f2, cellId]
function worley(x, y, p, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const mx = ((cx % p) + p) % p, my = ((cy % p) + p) % p;
      const px = cx + hash(mx, my, s), py = cy + hash(mx, my, s + 7);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash(mx, my, s + 3);
      } else if (d < f2) f2 = d;
    }
  return [f1, f2, id];
}
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const sstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// Each generator: (u, v) in [0,1) tileable -> [r, g, b, height]
function earth(base, dark, seed, pebbles = 0.5) {
  return (u, v) => {
    const n = fbm(u * 6, v * 6, 6, seed, 5);
    const [f1, f2, id] = worley(u * 9, v * 9, 9, seed + 40);
    const peb = sstep(0.32, 0.18, f1) * (id > 1 - pebbles ? 1 : 0);
    const t = n * 0.8 + 0.2 * vnoise(u * 40, v * 40, 40, seed + 9);
    let r = mix(dark[0], base[0], t), g = mix(dark[1], base[1], t), b = mix(dark[2], base[2], t);
    const pc = 0.75 + id * 0.5;
    r = mix(r, base[0] * pc, peb * 0.8);
    g = mix(g, base[1] * pc, peb * 0.8);
    b = mix(b, base[2] * pc, peb * 0.8);
    const crack = sstep(0.06, 0.0, f2 - f1) * 0.35;
    return [r * (1 - crack), g * (1 - crack), b * (1 - crack), n * 0.6 + peb * 0.5 - crack];
  };
}
function strata(base, dark, seed) {
  return (u, v) => {
    const warp = fbm(u * 3, v * 3, 3, seed, 3) * 0.6;
    const band = Math.sin((v * 5 + warp) * Math.PI * 2) * 0.5 + 0.5;
    const n = fbm(u * 8, v * 8, 8, seed + 5, 4);
    const t = clamp01(band * 0.45 + n * 0.55);
    const [f1, f2] = worley(u * 6, v * 6, 6, seed + 11);
    const crack = sstep(0.07, 0.0, f2 - f1) * 0.5;
    return [mix(dark[0], base[0], t) * (1 - crack), mix(dark[1], base[1], t) * (1 - crack), mix(dark[2], base[2], t) * (1 - crack), t * 0.7 - crack];
  };
}
function cobble(u, v) {
  const [f1, f2, id] = worley(u * 7, v * 7, 7, 3);
  const edge = f2 - f1;
  const stone = sstep(0.05, 0.2, edge);
  const n = fbm(u * 20, v * 20, 20, 21, 3);
  const dirt = fbm(u * 3, v * 3, 3, 44, 3);
  const tone = (0.26 + id * 0.13 + n * 0.1) * (0.8 + dirt * 0.4);
  const mortar = [0.1, 0.08, 0.065];
  const s = [tone * 1.0, tone * 0.9, tone * 0.78];
  return [mix(mortar[0], s[0], stone), mix(mortar[1], s[1], stone), mix(mortar[2], s[2], stone), stone * (0.6 + 0.4 * sstep(0, 0.5, edge)) + n * 0.15];
}
function planks(u, v) {
  const rows = 4;
  const row = Math.floor(v * rows);
  const off = hash(row, 0, 5);
  const lx = (u + off) % 1;
  const seam = Math.min(v * rows - row, row + 1 - v * rows);
  const endSeam = Math.abs(((lx * 2) % 1) - 0.5) > 0.485 ? 1 : 0;
  const grain = fbm(u * 2 + row, v * 40, 2, 9 + row, 4);
  const tone = 0.75 + hash(row, 1, 8) * 0.25;
  const g = 0.8 + 0.2 * Math.sin((grain * 12 + u * 3) * Math.PI);
  const gap = sstep(0.0, 0.05, seam) * (1 - endSeam * 0.8);
  const r = 0.46 * tone * g, gg = 0.29 * tone * g, b = 0.16 * tone * g;
  return [r * (0.25 + 0.75 * gap), gg * (0.25 + 0.75 * gap), b * (0.25 + 0.75 * gap), gap * 0.8 + grain * 0.2];
}
function basalt(top) {
  return (u, v) => {
    const s = top ? 12 : 5;
    const [f1, f2, id] = worley(u * s, v * s, s, 51);
    const n = fbm(u * 6, v * 6, 6, 13, 5);
    const fine = vnoise(u * 64, v * 64, 64, 3);
    const crack = sstep(0.03, 0.0, f2 - f1) * (top ? 0.3 : 0.55);
    const t = 0.085 + id * 0.025 + n * 0.09 + fine * 0.02;
    const c = t * (1 - crack);
    return [c * 1.02, c * 0.96, c * 0.95, n * 0.9 + fine * 0.15 - crack * 0.6];
  };
}
function ore(color, density, seed, glow = 1) {
  const baseFn = earth([0.42, 0.27, 0.15], [0.22, 0.13, 0.07], 77, 0.3);
  return (u, v) => {
    const b = baseFn(u, v);
    const [f1, , id] = worley(u * density, v * density, density, seed);
    const k = id > 0.45 ? sstep(0.26, 0.1, f1) : 0;
    if (k <= 0) return b;
    const facet = 0.75 + 0.5 * hash(Math.floor(u * 64), Math.floor(v * 64), seed);
    return [mix(b[0], color[0] * facet * glow, k), mix(b[1], color[1] * facet * glow, k), mix(b[2], color[2] * facet * glow, k), b[3] + k * 0.8];
  };
}

const GEN = {
  [CELL.cobble]: cobble,
  [CELL.planks]: planks,
  [CELL.bedrockTop]: basalt(true),
  [CELL.bedrockSide]: basalt(false),
  [CELL.dirtTop]: earth([0.47, 0.3, 0.16], [0.25, 0.15, 0.08], 1),
  [CELL.dirtSide]: strata([0.42, 0.27, 0.14], [0.2, 0.12, 0.06], 2),
  [CELL.clayTop]: earth([0.72, 0.5, 0.38], [0.5, 0.33, 0.24], 3, 0.7),
  [CELL.claySide]: strata([0.66, 0.45, 0.34], [0.42, 0.27, 0.19], 4),
  [CELL.graniteTop]: (u, v) => {
    const n = fbm(u * 12, v * 12, 12, 31, 4);
    const sp = hash(Math.floor(u * 90), Math.floor(v * 90), 2);
    const k = sp > 0.93 ? 0.25 : sp < 0.06 ? -0.15 : 0;
    const [f1, f2] = worley(u * 3, v * 3, 3, 61);
    const crack = sstep(0.05, 0.0, f2 - f1) * 0.5;
    const c = (0.36 + n * 0.16 + k) * (1 - crack);
    return [c, c * 1.0, c * 1.04, n * 0.5 + k - crack];
  },
  [CELL.graniteSide]: strata([0.42, 0.42, 0.45], [0.22, 0.22, 0.25], 6),
  [CELL.amethyst]: ore([0.75, 0.3, 1.0], 7, 91),
  [CELL.sapphire]: ore([0.25, 0.45, 1.0], 7, 92),
  [CELL.emerald]: ore([0.2, 0.95, 0.45], 7, 93),
  [CELL.poorore]: ore([0.7, 0.35, 0.6], 5, 94, 0.8),
  [CELL.diamond]: ore([0.6, 0.95, 1.0], 4, 95, 1.2),
  [CELL.oreSide]: strata([0.42, 0.27, 0.14], [0.2, 0.12, 0.06], 8),
};

// Builds { map, normalMap, uv(cell) } ; size = cell size in px (with gutter)
export function buildTerrainAtlas(size = 256) {
  const gutter = Math.round(size / 16);
  const inner = size - gutter * 2;
  const W = size * GRID;
  const color = new Uint8ClampedArray(W * W * 4);
  const height = new Float32Array(W * W);
  for (let c = 0; c < GRID * GRID; c++) {
    const gen = GEN[c];
    if (!gen) continue;
    const ox = (c % GRID) * size, oy = Math.floor(c / GRID) * size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // wrap gutter pixels so the cell content tiles seamlessly
        const u = (((x - gutter) % inner) + inner) % inner / inner;
        const v = (((y - gutter) % inner) + inner) % inner / inner;
        const [r, g, b, h] = gen(u, v);
        const i = (oy + y) * W + ox + x;
        color[i * 4] = clamp01(r) * 255;
        color[i * 4 + 1] = clamp01(g) * 255;
        color[i * 4 + 2] = clamp01(b) * 255;
        color[i * 4 + 3] = 255;
        height[i] = h;
      }
    }
  }
  // normal map from height (Sobel within cells, wrapped)
  const normal = new Uint8ClampedArray(W * W * 4);
  const strength = 2.2;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const cx = Math.floor(x / size) * size, cy = Math.floor(y / size) * size;
      const at = (dx, dy) => {
        let xx = x + dx, yy = y + dy;
        if (xx < cx) xx += size;
        if (xx >= cx + size) xx -= size;
        if (yy < cy) yy += size;
        if (yy >= cy + size) yy -= size;
        return height[yy * W + xx];
      };
      const dx = (at(1, 0) - at(-1, 0)) * strength;
      const dy = (at(0, 1) - at(0, -1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * W + x) * 4;
      normal[i] = (-dx / len * 0.5 + 0.5) * 255;
      normal[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      normal[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;
    }
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, W, W, THREE.RGBAFormat);
    t.flipY = false;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  const map = mk(color, true);
  const normalMap = mk(normal, false);
  // UV rect (u0, v0, u1, v1) of the inner part of a cell. v grows downward in data rows.
  const uv = (c) => {
    const ox = (c % GRID) * size + gutter, oy = Math.floor(c / GRID) * size + gutter;
    return [ox / W, oy / W, (ox + inner) / W, (oy + inner) / W];
  };
  return { map, normalMap, uv, colorData: color, W, size };
}

// Small canvas helpers for sprites/markers
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function glowTexture() {
  return canvasTexture(128, 128, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, w);
  });
}

// Marker for tiles designated for mining: hatched frame
export function mineMarkerTexture() {
  const t = canvasTexture(128, 128, (g, w) => {
    g.clearRect(0, 0, w, w);
    g.save();
    g.beginPath();
    g.rect(6, 6, w - 12, w - 12);
    g.rect(22, 22, w - 44, w - 44);
    g.clip('evenodd');
    g.fillStyle = 'rgba(255,200,40,0.95)';
    g.fillRect(0, 0, w, w);
    g.fillStyle = 'rgba(40,25,0,0.9)';
    for (let i = -w; i < w * 2; i += 22) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 11, 0);
      g.lineTo(i + 11 - w, w);
      g.lineTo(i - w, w);
      g.fill();
    }
    g.restore();
    g.fillStyle = 'rgba(255,210,60,0.18)';
    g.fillRect(22, 22, w - 44, w - 44);
  });
  t.anisotropy = 4;
  return t;
}

// Soft rounded-square tile used for room floors and selection
export function tileFillTexture() {
  return canvasTexture(64, 64, (g, w) => {
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, w - 2, w - 2);
  });
}
