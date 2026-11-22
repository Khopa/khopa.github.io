// 4-directional A* on the tile grid (the original disallowed diagonals).
// Only tiles block; objects and characters do not.

class Heap {
  constructor() {
    this.a = [];
  }
  push(n, f) {
    const a = this.a;
    a.push([f, n]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top[1];
  }
  get size() {
    return this.a.length;
  }
}

let gScore = null, came = null, stamp = null, curStamp = 0, closed = null;

// Returns an array of [x, y] steps excluding the start, or null if unreachable.
// An empty array means start == goal.
export function findPath(map, sx, sy, gx, gy, maxNodes = 60000) {
  if (!map.inside(gx, gy) || map.blocking(gx, gy)) return null;
  if (sx === gx && sy === gy) return [];
  const n = map.w * map.h;
  if (!gScore || gScore.length !== n) {
    gScore = new Float32Array(n);
    came = new Int32Array(n);
    stamp = new Uint32Array(n);
    closed = new Uint32Array(n);
    curStamp = 0;
  }
  curStamp++;
  const w = map.w;
  const start = sy * w + sx, goal = gy * w + gx;
  const heap = new Heap();
  stamp[start] = curStamp;
  gScore[start] = 0;
  came[start] = -1;
  heap.push(start, Math.abs(gx - sx) + Math.abs(gy - sy));
  let visited = 0;
  const dirs = [1, -1, w, -w];
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur] === curStamp) continue;
    closed[cur] = curStamp;
    if (cur === goal) break;
    if (++visited > maxNodes) return null;
    const cx = cur % w, cy = (cur / w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= w || ny >= map.h) continue;
      const ni = cur + dirs[d];
      if (closed[ni] === curStamp) continue;
      // The start tile may be blocking (dwarf placed in rock); neighbours may not.
      if (map.blocking(nx, ny)) continue;
      const g = gScore[cur] + 1;
      if (stamp[ni] !== curStamp || g < gScore[ni]) {
        stamp[ni] = curStamp;
        gScore[ni] = g;
        came[ni] = cur;
        heap.push(ni, g + Math.abs(gx - nx) + Math.abs(gy - ny));
      }
    }
  }
  if (closed[goal] !== curStamp) return null;
  const path = [];
  let c = goal;
  while (c !== start && c !== -1) {
    path.push([c % w, (c / w) | 0]);
    c = came[c];
  }
  path.reverse();
  return path;
}

// Flood-fill reachability from a tile (used to quickly reject unreachable targets).
export function reachableSet(map, sx, sy) {
  const w = map.w;
  const seen = new Uint8Array(w * map.h);
  const q = [sy * w + sx];
  seen[q[0]] = 1;
  while (q.length) {
    const c = q.pop();
    const x = c % w, y = (c / w) | 0;
    const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nx, ny] of nb) {
      if (!map.inside(nx, ny) || map.blocking(nx, ny)) continue;
      const i = ny * w + nx;
      if (!seen[i]) {
        seen[i] = 1;
        q.push(i);
      }
    }
  }
  return seen;
}
