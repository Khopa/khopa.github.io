import { t } from '../i18n.js';
import { JOBS, JOB_ORDER, OBJECTS, OBJECT_ORDER, ROOMS, ROOM_ORDER, NEEDS_MAX, DAY_DURATION } from '../defs.js';
import { Pickaxe } from '../sim/objects.js';
import { audio } from '../audio.js';

const $ = (s) => document.querySelector(s);
const ICON = {
  Dwarf: '<svg viewBox="0 0 32 32"><path d="M8 15a8 8 0 0 1 16 0z" fill="#9aa1a8"/><rect x="6" y="14" width="20" height="2.5" rx="1" fill="#7c838a"/><circle cx="16" cy="18" r="5.5" fill="#f2b98a"/><path d="M10 19c0 7 3 10 6 10s6-3 6-10c-2 2-10 2-12 0z" fill="#7a4520"/><circle cx="14" cy="17.5" r="1" fill="#2a1a10"/><circle cx="18" cy="17.5" r="1" fill="#2a1a10"/><rect x="15" y="7" width="2" height="4" rx="1" fill="#ffd27a"/></svg>',
  Room: '<svg viewBox="0 0 32 32"><path d="M4 15 16 5l12 10" fill="none" stroke="#e8c27c" stroke-width="2.6" stroke-linejoin="round"/><path d="M7 14v13h18V14" fill="#6b4a2c" stroke="#e8c27c" stroke-width="2"/><path d="M13 27v-7a3 3 0 0 1 6 0v7" fill="#2a1a10"/></svg>',
  Object: '<svg viewBox="0 0 32 32"><ellipse cx="16" cy="7" rx="9" ry="3" fill="#a0683a"/><path d="M7 7c-1 6-1 12 0 18 2 2 16 2 18 0 1-6 1-12 0-18-2 2-16 2-18 0z" fill="#8a5a33"/><path d="M6.6 11c3 1.5 15.8 1.5 18.8 0M6.6 21c3 1.5 15.8 1.5 18.8 0" stroke="#4a4d52" stroke-width="2" fill="none"/></svg>',
  Mine: '<svg viewBox="0 0 32 32"><path d="M9 27 23 9" stroke="#c99a5a" stroke-width="3" stroke-linecap="round"/><path d="M8 9c6-6 14-5 19 1-6-3-11-3-16 2z" fill="#b8c0c8" stroke="#6c737a" stroke-width="1.2"/></svg>',
  Erase: '<svg viewBox="0 0 32 32"><path d="M6 20 17 9l9 9-8 8h-7z" fill="#e7e1d6"/><path d="M6 20l5 6h7l-6-11z" fill="#ff7a6a"/><path d="M11 27h15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  Back: '<svg viewBox="0 0 32 32"><path d="M19 7 10 16l9 9" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  Rotate: '<svg viewBox="0 0 32 32"><path d="M8 16a8 8 0 1 0 3-6.2M10 4v6h6" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
const fmtTime = (s) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
};
export { fmtTime };

export class Hud {
  constructor(app) {
    this.app = app;
    this.el = $('#hud');
    this.toolbar = $('#toolbar');
    this.subbar = $('#subbar');
    this.subtools = $('#subtools');
    this.hintEl = $('#hint');
    this.infoEl = $('#info');
    this.mode = 'main';
    this.tool = null;
    this.rot = 0;
    this.enabled = { Dwarf: true, Room: true, Object: true };
    this.configured = {}; // type -> bool (script dwarf.configure)
    this.blinking = new Set(); // 'main:Mine', 'Barrel', ...
    this.popups = [];
    this.lastMoney = null;
    this.info = null;
    this.thumbs = {};
    this.statsT = 0;
    $('#btn-menu').addEventListener('click', () => {
      this.fire('hitMenuButton');
      this.app.pause();
    });
    for (const b of document.querySelectorAll('#speed button')) b.addEventListener('click', () => this.app.setSpeed(+b.dataset.speed));
    $('#cam-left').addEventListener('click', () => this.app.view.cam.rotate(-Math.PI / 4));
    $('#cam-right').addEventListener('click', () => this.app.view.cam.rotate(Math.PI / 4));
    $('#cam-in').addEventListener('click', () => this.app.view.cam.zoom(0.75, this.app.view.w / 2, this.app.view.h / 2, this.app.view.w, this.app.view.h));
    $('#cam-out').addEventListener('click', () => this.app.view.cam.zoom(1.33, this.app.view.w / 2, this.app.view.h / 2, this.app.view.w, this.app.view.h));
    $('#popup-ok').addEventListener('click', () => this.closePopup());
  }

  get game() {
    return this.app.game;
  }
  fire(ev, a, b) {
    if (this.game) this.game.fire(ev, a, b);
  }

  reset() {
    this.mode = 'main';
    this.tool = null;
    this.rot = 0;
    this.enabled = { Dwarf: true, Room: true, Object: true };
    this.configured = {};
    this.blinking.clear();
    this.popups = [];
    $('#popup').classList.remove('show');
    $('#log').innerHTML = '';
    this.closeInfo();
    this.render();
  }

  // ------------------------------------------------------------------ toolbar
  render() {
    const tb = this.toolbar;
    tb.innerHTML = '';
    const btn = (id, icon, label, cls = '') => {
      const b = document.createElement('button');
      b.className = 'tool ' + cls;
      b.innerHTML = ICON[icon] + `<span>${label}</span>`;
      b.dataset.id = id;
      if (this.blinking.has('main:' + id)) b.classList.add('blink');
      tb.appendChild(b);
      return b;
    };
    if (this.mode === 'main') {
      if (this.enabled.Dwarf) btn('Dwarf', 'Dwarf', t('tDwarves')).onclick = () => this.enter('recruit', 'hitDwarfButton');
      if (this.enabled.Room) btn('Room', 'Room', t('tRooms')).onclick = () => this.enter('room', 'hitRoomButton');
      if (this.enabled.Object) btn('Object', 'Object', t('tObjects')).onclick = () => this.enter('object', 'hitObjectButton');
      btn('Mine', 'Mine', t('tMine')).onclick = () => this.enter('mine', 'hitMineButton');
    } else {
      btn('Back', 'Back', t('tBack')).onclick = () => {
        this.fire('hitBackButton');
        audio.play('Menu_cancel', 0.6);
        this.back();
      };
      const modeIcon = { recruit: 'Dwarf', room: 'Room', object: 'Object', mine: 'Mine' }[this.mode];
      const main = btn('Main', modeIcon, { recruit: t('tDwarves'), room: t('tRooms'), object: t('tObjects'), mine: t('tMine') }[this.mode], this.isErase() ? '' : 'on');
      main.onclick = () => {
        if (this.mode === 'mine') this.setTool({ kind: 'mine' });
        else if (this.isErase()) this.setTool(null);
      };
      const er = btn('Erase', 'Erase', t('tErase'), 'danger' + (this.isErase() ? ' on' : ''));
      er.onclick = () => {
        this.fire('hitEraseButton');
        this.setTool(this.isErase() ? (this.mode === 'mine' ? { kind: 'mine' } : null) : { kind: this.mode + 'Erase' });
      };
      if (this.mode === 'object' && this.tool && this.tool.kind === 'object') {
        btn('Rotate', 'Rotate', t('tRotate')).onclick = () => this.rotate();
      }
    }
    this.renderSub();
    this.renderHint();
  }

  renderSub() {
    const box = this.subtools;
    box.innerHTML = '';
    let items = [];
    if (this.mode === 'recruit') items = JOB_ORDER.map((j) => ({ type: j, name: t(j), price: JOBS[j].hello, sub: JOBS[j].salary + t('perDay'), tool: { kind: 'recruit', job: j } }));
    if (this.mode === 'room') items = ROOM_ORDER.map((r) => ({ type: r, name: t(r), price: null, sub: Object.keys(ROOMS[r].needs).map((k) => t(k)).join(' · '), tool: { kind: 'room', type: r } }));
    if (this.mode === 'object') items = OBJECT_ORDER.map((o) => ({ type: o, name: t(o), price: OBJECTS[o].price, tool: { kind: 'object', type: o } }));
    items = items.filter((it) => this.configured[it.type] !== false);
    this.subbar.hidden = items.length === 0;
    document.body.classList.toggle('sub', items.length > 0);
    const money = this.game ? this.game.money : 0;
    for (const it of items) {
      const c = document.createElement('button');
      c.className = 'card';
      const on = this.tool && (this.tool.job === it.type || this.tool.type === it.type);
      if (on) c.classList.add('on');
      if (it.price != null && it.price > money) c.classList.add('poor');
      if (this.blinking.has(it.type)) c.classList.add('blink');
      c.innerHTML = `<img alt="" src="${this.thumbs[it.type] || ''}"><div class="name">${it.name}</div>` +
        (it.price != null ? `<div class="price"><span class="ico coin"></span>${it.price}</div>` : '') +
        (it.sub ? `<div class="sub">${it.sub}</div>` : '');
      c.onclick = () => {
        audio.play('Menu_ok', 0.5);
        if (it.tool.kind === 'room') this.fire('placingRoom' + it.type);
        if (it.tool.kind === 'object') this.fire('placingObject' + it.type);
        if (it.tool.kind === 'recruit') this.fire('placingDwarf');
        this.setTool(it.tool);
      };
      box.appendChild(c);
    }
  }

  renderHint() {
    const tl = this.tool;
    let h = '';
    if (this.mode === 'mine') h = tl && tl.kind === 'mineErase' ? t('hintMineErase') : t('hintMine');
    else if (this.mode === 'room') h = !tl ? t('hintChooseRoom') : tl.kind === 'roomErase' ? t('hintRoomErase') : t('hintRoom', t(tl.type));
    else if (this.mode === 'object') h = !tl ? t('hintChooseObject') : tl.kind === 'objectErase' ? t('hintObjectErase') : t('hintObject', t(tl.type));
    else if (this.mode === 'recruit') h = !tl ? t('hintChooseDwarf') : tl.kind === 'recruitErase' ? t('hintRecruitErase') : t('hintRecruit', t(tl.job));
    this.hintEl.hidden = !h;
    this.hintEl.textContent = h;
  }

  isErase() {
    return !!(this.tool && this.tool.kind.endsWith('Erase'));
  }
  enter(mode, ev) {
    this.fire(ev);
    audio.play('Menu_ok', 0.5);
    this.mode = mode;
    this.tool = mode === 'mine' ? { kind: 'mine' } : null;
    this.closeInfo();
    this.render();
  }
  back() {
    this.mode = 'main';
    this.tool = null;
    this.app.input.cancel();
    this.render();
  }
  setTool(tool) {
    this.tool = tool;
    this.app.input.cancel();
    this.render();
  }
  rotate() {
    this.rot = (this.rot + 1) % 4;
    this.app.input.refreshGhost();
  }

  // ------------------------------------------------------------------ script API
  setButton(which, on) {
    this.enabled[which] = on;
    this.backToMain();
  }
  backToMain() {
    this.mode = 'main';
    this.tool = null;
    if (this.app.input) this.app.input.cancel();
    this.render();
  }
  configure(type, on) {
    // the scripts use "Barman" while JOBS uses the same key; rooms/objects match class names
    this.configured[type] = on;
    this.render();
  }
  blink(key, on) {
    if (on) this.blinking.add(key);
    else this.blinking.delete(key);
    this.render();
  }

  // ------------------------------------------------------------------ popups
  popup(title, text) {
    this.popups.push({ title, text });
    if (this.popups.length === 1) this.showPopup();
  }
  showPopup() {
    const p = this.popups[0];
    if (!p) return;
    $('#popup-title').textContent = p.title;
    $('#popup-text').textContent = p.text.replace(/\s*\n \n/g, '\n\n').replace(/\n \n/g, '\n\n');
    $('#popup-ok').textContent = t('ok');
    $('#popup').classList.add('show');
    this.app.popupOpen = true;
  }
  closePopup() {
    audio.play('Menu_ok', 0.6);
    this.popups.shift();
    $('#popup').classList.remove('show');
    this.app.popupOpen = false;
    this.fire('popupClosed');
    if (this.popups.length) setTimeout(() => this.showPopup(), 120);
  }

  // ------------------------------------------------------------------ log
  log(text, neg = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (neg ? ' neg' : '');
    el.textContent = text;
    const log = $('#log');
    log.appendChild(el);
    while (log.children.length > 6) log.removeChild(log.firstChild);
    setTimeout(() => el.classList.add('out'), 6000);
    setTimeout(() => el.remove(), 6700);
  }
  clearLog() {
    $('#log').innerHTML = '';
  }
  payday({ wages, grant, total }) {
    this.log(`${t('DayEnd')} — ${t('Wages')}${wages} · ${t('Grant')}${grant} · ${t('Total')}${total > 0 ? '+' : ''}${total}`, total < 0);
  }
  celebrate(text) {
    const el = $('#celebrate');
    el.hidden = false;
    el.textContent = text;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(this.celebT);
    this.celebT = setTimeout(() => (el.hidden = true), 2500);
  }

  // ------------------------------------------------------------------ info panel
  showDwarf(d) {
    this.info = { kind: 'dwarf', d };
    this.app.world.select(d);
    this.infoEl.hidden = false;
    this.updateInfo(true);
  }
  showObject(o) {
    this.info = { kind: 'object', o };
    this.app.world.select(null);
    this.infoEl.hidden = false;
    this.updateInfo(true);
  }
  closeInfo() {
    this.info = null;
    this.infoEl.hidden = true;
    if (this.app.world) this.app.world.select(null);
    this.app.follow = null;
  }
  updateInfo(force) {
    const info = this.info;
    if (!info) return;
    const g = this.game;
    if (info.kind === 'dwarf') {
      const d = info.d;
      if (!g.dwarves.includes(d)) return this.closeInfo();
      const sleep = d.needs.sleep / NEEDS_MAX, thirst = d.needs.thirst / NEEDS_MAX;
      let item = t('nothing');
      if (d.right instanceof Pickaxe) item = `${t('Pickaxe')}${d.right.enchanted ? ' (' + t('enchanted') + ')' : ''} · ${t('wear')} ${Math.round(d.right.damage)}%`;
      else if (d.right || d.left) item = t('Beer');
      const key = [d.activity, Math.round(sleep * 50), Math.round(thirst * 50), item, this.app.follow === d].join('|');
      if (!force && key === this.infoKey) return;
      this.infoKey = key;
      this.infoEl.innerHTML = `<button class="x" aria-label="${t('close')}">×</button>
        <div class="head"><img alt="" src="${this.thumbs[d.job] || ''}"><div><h3>${d.name}</h3><div class="job">${t(d.job)}</div></div></div>
        <div class="act">${t('act.' + d.activity)}</div>
        <div class="row"><span>${t('sleep')}</span><div class="bar sleep"><i class="${sleep > 0.75 ? 'hot' : ''}" style="width:${sleep * 100}%"></i></div></div>
        <div class="row"><span>${t('thirst')}</span><div class="bar thirst"><i class="${thirst > 0.75 ? 'hot' : ''}" style="width:${thirst * 100}%"></i></div></div>
        <div class="row"><span>${t('item')}</span><span>${item}</span></div>
        <div class="row"><span>${t('salary')}</span><span>${d.salary}${t('perDay')}</span></div>
        <div class="actions"><button class="btn" data-a="follow">${t('follow')}</button><button class="btn danger" data-a="dismiss">${t('dismiss')} (−${d.def.parachute})</button></div>`;
      this.infoEl.querySelector('.x').onclick = () => this.closeInfo();
      this.infoEl.querySelector('[data-a=follow]').onclick = () => {
        this.app.follow = this.app.follow === d ? null : d;
        this.updateInfo(true);
      };
      this.infoEl.querySelector('[data-a=dismiss]').onclick = () => {
        g.dismiss(d);
        this.closeInfo();
      };
    } else {
      const o = info.o;
      if (!g.objects.has(o)) return this.closeInfo();
      const room = o.room;
      let extra = '';
      if (o.type === 'Rack') extra = `<div class="row"><span>${t('contents')}</span><span>${o.items.length}/${o.def.capacity} ${t('Pickaxe')} ${o.items.filter((p) => p.enchanted).length ? '(' + o.items.filter((p) => p.enchanted).length + '✦)' : ''}</span></div>`;
      const roomTxt = room ? `${t(room.type)} — ${room.operational ? t('ready') : t('needs') + ': ' + room.missing().map((m) => t(m)).join(', ')}` : t('none');
      const key = [o.id, roomTxt, extra].join('|');
      if (!force && key === this.infoKey) return;
      this.infoKey = key;
      this.infoEl.innerHTML = `<button class="x" aria-label="${t('close')}">×</button>
        <div class="head"><img alt="" src="${this.thumbs[o.type] || ''}"><div><h3>${t(o.type)}</h3><div class="job">${o.price} ⛁</div></div></div>
        <div class="row"><span>${t('room')}</span><span>${roomTxt}</span></div>${extra}
        <div class="actions"><button class="btn danger" data-a="sell">${t('sell')} (+${o.price})</button></div>`;
      this.infoEl.querySelector('.x').onclick = () => this.closeInfo();
      this.infoEl.querySelector('[data-a=sell]').onclick = () => {
        g.sellObjectAt(o.x, o.y);
        this.closeInfo();
      };
    }
  }

  // ------------------------------------------------------------------ per-frame
  update(dt) {
    const g = this.game;
    if (!g) return;
    this.statsT -= dt;
    if (this.statsT > 0) return;
    this.statsT = 0.2;
    const money = $('#st-money');
    money.querySelector('b').textContent = g.money.toLocaleString();
    money.classList.toggle('danger', g.money < g.payroll());
    if (this.lastMoney != null && g.money !== this.lastMoney) {
      money.classList.remove('flash-up', 'flash-down');
      void money.offsetWidth;
      money.classList.add(g.money > this.lastMoney ? 'flash-up' : 'flash-down');
      if (this.mode !== 'main') this.renderSub();
    }
    this.lastMoney = g.money;
    const dia = $('#st-diamonds');
    dia.querySelector('b').textContent = g.diamonds;
    dia.querySelector('small').textContent = '/' + g.objective;
    const left = DAY_DURATION - g.dayCounter;
    const w = $('#st-wages');
    w.querySelector('b').textContent = fmtTime(left);
    w.querySelector('.bar').style.strokeDashoffset = String(94.25 * (1 - g.dayCounter / DAY_DURATION));
    const total = 250 - g.payroll();
    $('#st-payroll').textContent = (total >= 0 ? '+' : '') + total;
    $('#st-payroll').style.color = total >= 0 ? 'var(--green)' : 'var(--red)';
    $('#st-time b').textContent = fmtTime(g.elapsed);
    const up = this.app.userPaused;
    for (const b of document.querySelectorAll('#speed button')) b.classList.toggle('on', (+b.dataset.speed === 0 && up) || (!up && +b.dataset.speed === g.speed));
    this.updateInfo(false);
  }
}
