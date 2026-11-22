import { t } from '../i18n.js';
import { NEEDS_MAX, ROOMS } from '../defs.js';

// HTML labels anchored to 3D positions: complaints, needs gauges, room names, floating numbers.
export class Labels {
  constructor(container, app) {
    this.el = container;
    this.app = app;
    this.items = new Map();
  }
  clear() {
    for (const e of this.items.values()) e.remove();
    this.items.clear();
  }
  get(key, cls, html) {
    let e = this.items.get(key);
    if (!e) {
      e = document.createElement('div');
      e.className = 'lbl ' + cls;
      if (html != null) e.innerHTML = html;
      this.el.appendChild(e);
      this.items.set(key, e);
    }
    e._used = true;
    return e;
  }
  place(e, x, y, center = false) {
    e.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,${center ? '-50%' : '-100%'})`;
  }
  update() {
    const { world, view, game } = this.app;
    if (!world || !game || this.app.state !== 'game') {
      if (this.items.size) this.clear();
      return;
    }
    for (const e of this.items.values()) e._used = false;
    const W = view.w, H = view.h;
    const onScreen = (x, y) => x > -60 && y > -60 && x < W + 60 && y < H + 60;
    const zoomedOut = view.cam.curView > 34;
    const gaugeMode = this.app.settings.gauges;
    for (const [d, v] of world.dwarfViews) {
      const [hx, hy, hz] = v.headPos();
      const [sx, sy] = view.project(hx, hy, hz);
      if (!onScreen(sx, sy)) continue;
      let lift = 0;
      if (d.complaint) {
        const e = this.get('c' + d.id, 'bubble');
        const i = d.complaint.id;
        e.style.backgroundPosition = `${-(i % 4) * 36}px ${-Math.floor(i / 4) * 36}px`;
        e.title = t('complaint' + i);
        this.place(e, sx, sy - 6);
        lift = 46;
      }
      const sleep = d.needs.sleep / NEEDS_MAX, thirst = d.needs.thirst / NEEDS_MAX;
      const show = !zoomedOut && (gaugeMode === 'always' || world.selected === d || sleep > 0.5 || thirst > 0.5);
      if (show) {
        const e = this.get('n' + d.id, 'needs', '<i class="s"><b></b></i><i class="t"><b></b></i>');
        const [bs, bt] = e.querySelectorAll('b');
        bs.style.width = sleep * 100 + '%';
        bt.style.width = thirst * 100 + '%';
        bs.classList.toggle('hot', sleep > 0.75);
        bt.classList.toggle('hot', thirst > 0.75);
        e.querySelectorAll('i')[1].style.display = d.job === 'Barman' ? 'none' : '';
        this.place(e, sx, sy - 4 - lift);
        lift += 14;
      }
      if (d.activity === 'sleeping' && !zoomedOut) {
        const e = this.get('z' + d.id, 'zzz', 'z<small>z</small>');
        this.place(e, sx + 14, sy - 4 - lift);
      }
      if (world.selected === d) {
        const e = this.get('name' + d.id, 'namelbl');
        if (e._txt !== d.name) e.textContent = e._txt = d.name;
        this.place(e, sx, sy - 6 - lift);
      }
    }
    if (!zoomedOut) {
      for (const room of game.rooms.list) {
        const [bx, by] = room.barycenter();
        const [sx, sy] = view.project(bx + 0.5, 0.05, -by - 0.5);
        if (!onScreen(sx, sy)) continue;
        const e = this.get('r' + room.id, 'roomlbl');
        const missing = room.missing();
        const txt = `${t(room.type)}<em>${missing.length ? t('needs') + ': ' + missing.map((m) => t(m)).join(', ') : '✓ ' + t('ready')}</em>`;
        if (e._txt !== txt) {
          e.innerHTML = e._txt = txt;
          e.classList.toggle('ok', !missing.length);
          e.style.setProperty('--rc', '#' + ROOMS[room.type].color.toString(16).padStart(6, '0'));
        }
        this.place(e, sx, sy, true);
      }
    }
    for (const f of world.floats) {
      const [sx, sy] = view.project(f.x, f.y + f.t * 0.6, f.z);
      const e = this.get('f' + f.id, 'float ' + f.cls, f.text);
      e.style.opacity = String(Math.min(1, (1.6 - f.t) * 2));
      this.place(e, sx, sy);
    }
    for (const [k, e] of this.items) if (!e._used) {
      e.remove();
      this.items.delete(k);
    }
  }
}
