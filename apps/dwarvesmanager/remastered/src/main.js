import { View, autoQuality } from './render/view.js';
import { World } from './render/world.js';
import { renderThumbs } from './render/thumbs.js';
import { Game } from './sim/game.js';
import { LevelScript } from './sim/script.js';
import { Hud, fmtTime } from './ui/hud.js';
import { Labels } from './ui/labels.js';
import { Input } from './input.js';
import { audio } from './audio.js';
import { t, setLang, getLang, detectLang } from './i18n.js';
import { LEVELS, NEEDS_MAX } from './defs.js';

const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('dm3d.' + k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('dm3d.' + k, JSON.stringify(v));
    } catch {}
  },
  del(k) {
    try {
      localStorage.removeItem('dm3d.' + k);
    } catch {}
  },
};

const app = {
  state: 'loading',
  settings: Object.assign({ lang: detectLang(), music: 0.5, sfx: 0.8, quality: 'auto', gauges: 'warn' }, store.get('settings', {})),
  view: null,
  world: null,
  game: null,
  script: null,
  level: null,
  userPaused: false,
  popupOpen: false,
  menuOpen: false,
  follow: null,
  screenStack: [],
};
window.dwarvesApp = app; // handy for debugging

// ------------------------------------------------------------------ screens
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('show', s.id === id);
}
function hideScreens() {
  for (const s of document.querySelectorAll('.screen')) s.classList.remove('show');
}
function translateDom() {
  setLang(app.settings.lang);
  for (const el of document.querySelectorAll('[data-t]')) el.innerHTML = t(el.dataset.t);
  for (const el of document.querySelectorAll('[data-act]')) {
    const k = el.dataset.act;
    if (['play', 'continue', 'options', 'credits', 'resume', 'save', 'restart', 'quit'].includes(k)) el.textContent = t(k);
  }
  $('#loading-text').textContent = t('loading');
  if (app.hud) app.hud.render();
}
function saveSettings() {
  store.set('settings', app.settings);
}

// ------------------------------------------------------------------ assets
const cache = {};
async function fetchText(url) {
  if (!cache[url]) cache[url] = fetch(url).then((r) => {
    if (!r.ok) throw new Error(url + ' ' + r.status);
    return r.text();
  });
  return cache[url];
}
async function loadNames() {
  const lines = async (f) => (await fetchText('assets/data/' + f)).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return { first: await lines('dwarf_en.name'), last: await lines('dwarf_en_last.name'), fr: await lines('dwarf_fr.name') };
}

// ------------------------------------------------------------------ world lifecycle
function disposeWorld() {
  if (app.world) app.world.dispose();
  app.world = null;
  app.game = null;
  app.script = null;
  app.labels.clear();
  app.follow = null;
}

function setWorld(game) {
  app.game = game;
  app.world = new World(app.view, game);
  bindGame(game);
}

function bindGame(game) {
  game.on('sound', (n) => audio.play(n));
  game.on('log', (s) => app.hud.log(s));
  game.on('payday', (p) => app.hud.payday(p));
  game.on('tileMined', (x, y, id, info) => {
    if (info.diamond && app.state === 'game') app.hud.celebrate(`💎 ${game.diamonds} / ${game.objective}`);
  });
  game.on('end', (r) => setTimeout(() => endScreen(r), r === 'win' ? 900 : 300));
}

// Title backdrop: a small living mine.
async function startBackdrop() {
  disposeWorld();
  const mapData = JSON.parse(await fetchText('assets/levels/tuto7.json'));
  const game = new Game({ level: { file: 'backdrop' }, mapData, names: app.names, lang: getLang(), script: null });
  game.money = 1e9;
  setWorld(game);
  // carve a furnished hall next to the existing tunnels
  const map = game.map;
  const x = 16, y = 18;
  for (let i = x; i < x + 12; i++) for (let j = y; j < y + 8; j++) if (map.get(i, j) !== 4) map.set(i, j, 0);
  game.emit('mapReset');
  game.placeRoom('Tavern', x, y, x + 6, y + 7);
  game.placeObject('Counter', x, y + 6, 0, true);
  game.placeObject('Barrel', x + 6, y + 7, 0, true);
  game.placeObject('TableObject', x + 2, y + 1, 0, true);
  game.placeObject('Hearth', x + 9, y + 4, 0, true);
  game.placeRoom('Workshop', x + 8, y, x + 11, y + 2);
  game.placeObject('Anvil', x + 8, y, 0, true);
  game.placeObject('Rack', x + 11, y + 2, 0, true);
  game.placeRoom('Dorm', x + 8, y + 6, x + 11, y + 7);
  game.placeObject('Bed', x + 8, y + 6, 0, true);
  game.placeObject('Bed', x + 10, y + 7, 2, true);
  for (const job of ['Miner', 'Miner', 'Miner', 'Barman', 'Craftman', 'Enchanter']) game.addDwarf(job, x + 3 + Math.floor(Math.random() * 6), y + 5);
  game.designate(0, 0, map.w - 1, map.h - 1);
  app.view.cam.jump(x + 6, -y - 4, 12);
  if (app.world.marks) app.world.marks.visible = false;
  app.world.markMat.opacity = 0;
  app.backdropCenter = { ...app.view.cam.target };
}

// ------------------------------------------------------------------ script API (DwarvesManagerLuaApi)
function scriptApi() {
  const g = () => app.game;
  const hud = app.hud;
  const jobName = (j) => (j === 'Bartender' ? 'Barman' : j);
  return {
    addMoney: (v) => {
      g().money += v | 0;
    },
    getMoney: () => g().money,
    getDiamonds: () => g().diamonds,
    popup: (title, text) => hud.popup(title, text || ''),
    moveCamera: (x, y, zoom) => {
      const view = Math.max(9, Math.min(24, 5.2 / (zoom || 0.5)));
      app.view.cam.target.set((x | 0) + 0.5, -(y | 0) - 0.5);
      app.view.cam.view = view;
      app.view.cam.clamp();
    },
    sound: (n) => audio.play(n),
    log: (s) => hud.log(String(s)),
    clearLog: () => hud.clearLog(),
    getLang: () => getLang(),
    disableRecruitment: () => hud.setButton('Dwarf', false),
    enableRecruitment: () => hud.setButton('Dwarf', true),
    disableRoom: () => hud.setButton('Room', false),
    enableRoom: () => hud.setButton('Room', true),
    disableObjects: () => hud.setButton('Object', false),
    enableObjects: () => hud.setButton('Object', true),
    restoreGui: () => {
      hud.enabled = { Dwarf: true, Room: true, Object: true };
      hud.backToMain();
    },
    addSprite: () => {},
    removeSprite: () => {},
    addDwarf: (x, y, job) => {
      g().addDwarf(jobName(job), x | 0, y | 0);
    },
    blink: (button, on) => {
      if (button === 'Menu') $('#btn-menu').classList.toggle('blink', !!on);
      else hud.blink('main:' + button, !!on);
    },
    blinkDwarf: (type, on) => hud.blink(type, !!on),
    blinkRoom: (type, on) => hud.blink(type, !!on),
    blinkObject: (type, on) => hud.blink(type, !!on),
    dwarfCount: () => g().dwarves.length,
    minerCount: () => g().dwarves.filter((d) => d.job === 'Miner').length,
    backGameMenu: () => hud.backToMain(),
    configure: (type, on) => hud.configure(type, !!on),
    flushRooms: () => g().rooms.clear(),
    setSleepNeed: (i, v) => {
      const d = g().dwarves[i | 0];
      if (d) d.needs.setSleep(v * NEEDS_MAX);
    },
    setThirstNeed: (i, v) => {
      const d = g().dwarves[i | 0];
      if (d) d.needs.setThirst(v * NEEDS_MAX);
    },
    getDwarfPosition: (i) => {
      const d = g().dwarves[i | 0];
      return d ? [d.x, d.y] : [0, 0];
    },
  };
}

// ------------------------------------------------------------------ levels
async function startLevel(level, resume = false) {
  show('loading');
  app.state = 'loading';
  await new Promise((r) => setTimeout(r, 30));
  disposeWorld();
  app.hud.reset();
  app.level = level;
  app.userPaused = false;
  app.menuOpen = false;
  const lua = await fetchText(`assets/levels/${level.file}.lua`);
  const script = new LevelScript(lua, scriptApi());
  app.script = script;
  const mapName = String(script.get('map') || level.file + '.tmx').replace('.tmx', '');
  const mapData = JSON.parse(await fetchText(`assets/levels/${mapName}.json`));
  const game = new Game({ level, mapData, names: app.names, lang: getLang(), script });
  game.objective = script.get('objective') || 1;
  setWorld(game);
  app.view.cam.jump(game.map.w / 2, -game.map.h / 2, 15);
  app.state = 'game';
  hideScreens();
  $('#hud').hidden = false;
  const save = resume ? store.get('save.' + level.file) : null;
  if (save) game.restore(save);
  else script.init();
  script.setup();
  app.view.cam.cur.copy(app.view.cam.target);
  app.view.cam.curView = app.view.cam.view;
  audio.playMusic(script.get('music') === 'tuto' ? 'tuto' : 'game');
  app.settings.last = level.file;
  saveSettings();
  app.hud.render();
}

function saveGame(silent = false) {
  if (!app.game || app.game.ended || !app.level) return;
  store.set('save.' + app.level.file, app.game.serialize());
  if (!silent) app.hud.log(t('Saved'));
}

function endScreen(result) {
  if (app.state !== 'game') return;
  const g = app.game;
  const file = app.level.file;
  store.del('save.' + file);
  $('#end-title').textContent = result === 'win' ? t('victory') : t('defeat');
  $('#end-text').textContent = result === 'win' ? t('victoryText') : t('defeatText');
  const stats = $('#end-stats');
  const actions = $('#end-actions');
  actions.innerHTML = '';
  if (result === 'win') {
    audio.play('success');
    const best = store.get('best.' + file, null);
    const record = best == null || g.elapsed < best;
    if (record) store.set('best.' + file, g.elapsed);
    stats.innerHTML = `<div><b>${fmtTime(g.elapsed)}</b><span>${t('yourTime')}</span></div><div><b>${fmtTime(record ? g.elapsed : best)}</b><span>${t('best')}</span></div>` + (record ? `<div class="record">★ ${t('newRecord')}</div>` : '');
    const nextName = app.script && app.script.get('nextLevel');
    const next = (nextName && LEVELS.find((l) => l.file === String(nextName).replace('.lua', ''))) || LEVELS[LEVELS.indexOf(app.level) + 1];
    if (next) addBtn(actions, t('next'), 'primary', () => startLevel(next));
  } else {
    audio.play('gameover');
    stats.innerHTML = `<div><b>${fmtTime(g.elapsed)}</b><span>${t('yourTime')}</span></div>`;
  }
  addBtn(actions, t('retry'), result === 'win' ? '' : 'primary', () => startLevel(app.level));
  addBtn(actions, t('menu'), '', () => toTitle());
  app.menuOpen = true;
  show('end');
}
function addBtn(parent, label, cls, fn) {
  const b = document.createElement('button');
  b.className = 'btn ' + cls;
  b.textContent = label;
  b.onclick = () => {
    audio.play('Menu_ok', 0.6);
    fn();
  };
  parent.appendChild(b);
  return b;
}

app.pause = () => {
  if (app.state !== 'game' || app.menuOpen) return;
  app.menuOpen = true;
  $('#pause-level').textContent = app.level.title[getLang()] || app.level.title.en;
  show('pause');
};
app.resume = () => {
  app.menuOpen = false;
  hideScreens();
};
app.setSpeed = (s) => {
  if (!app.game) return;
  if (s === 0) app.userPaused = true;
  else {
    app.userPaused = false;
    app.game.speed = s;
  }
};

async function toTitle() {
  if (app.state === 'game') saveGame(true);
  app.state = 'title';
  app.menuOpen = false;
  $('#hud').hidden = true;
  $('#btn-menu').classList.remove('blink');
  show('loading');
  await startBackdrop();
  app.state = 'title';
  show('title');
  updateTitle();
  audio.playMusic('menu');
}
function updateTitle() {
  const last = app.settings.last && store.get('save.' + app.settings.last);
  $('[data-act=continue]').hidden = !last;
}

function buildLevelGrid() {
  const grid = $('#level-grid');
  grid.innerHTML = '';
  for (const lvl of LEVELS) {
    const b = document.createElement('button');
    b.className = 'lvl';
    const best = store.get('best.' + lvl.file, null);
    const save = store.get('save.' + lvl.file, null);
    b.innerHTML = `<img alt="" loading="lazy" src="assets/sprites/level${lvl.icon}.jpg">` +
      (best != null ? `<span class="badge">✓ ${fmtTime(best)}</span>` : '') +
      (save ? `<span class="badge save">⛁ ${t('savedGame')}</span>` : '') +
      `<div class="t">${lvl.title[getLang()] || lvl.title.en}</div>`;
    b.onclick = () => {
      audio.play('Menu_ok', 0.6);
      if (!save) return startLevel(lvl);
      if (b.querySelector('.lvl-actions')) return;
      const ov = document.createElement('div');
      ov.className = 'lvl-actions';
      addBtn(ov, t('resumeSaved'), 'primary', () => startLevel(lvl, true));
      addBtn(ov, t('newGame'), '', () => {
        store.del('save.' + lvl.file);
        startLevel(lvl);
      });
      ov.onclick = (e) => e.stopPropagation();
      b.appendChild(ov);
    };
    grid.appendChild(b);
  }
}

// ------------------------------------------------------------------ menus wiring
function openScreen(id) {
  app.screenStack.push(document.querySelector('.screen.show')?.id || null);
  show(id);
}
function closeScreen() {
  const prev = app.screenStack.pop();
  if (prev) show(prev);
  else hideScreens();
}
function wireMenus() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    audio.play(act === 'back' ? 'Menu_cancel' : 'Menu_ok', 0.6);
    switch (act) {
      case 'play':
        buildLevelGrid();
        openScreen('levels');
        break;
      case 'continue': {
        const lvl = LEVELS.find((l) => l.file === app.settings.last);
        if (lvl) startLevel(lvl, true);
        break;
      }
      case 'options':
        syncOptions();
        openScreen('options');
        break;
      case 'credits':
        openScreen('credits');
        break;
      case 'back':
        closeScreen();
        break;
      case 'resume':
        app.screenStack = [];
        app.resume();
        break;
      case 'save':
        saveGame();
        app.screenStack = [];
        app.resume();
        break;
      case 'restart':
        app.screenStack = [];
        store.del('save.' + app.level.file);
        startLevel(app.level);
        break;
      case 'quit':
        app.screenStack = [];
        toTitle();
        break;
    }
  });
  const segs = (id, key, apply) => {
    for (const b of document.querySelectorAll(`#${id} button`))
      b.addEventListener('click', () => {
        app.settings[key] = b.dataset.v;
        saveSettings();
        apply(b.dataset.v);
        syncOptions();
      });
  };
  segs('opt-lang', 'lang', () => translateDom());
  segs('opt-quality', 'quality', (v) => app.view.setQuality(v === 'auto' ? autoQuality() : v));
  segs('opt-gauges', 'gauges', () => {});
  $('#opt-music').addEventListener('input', (e) => {
    app.settings.music = +e.target.value;
    audio.setMusicVolume(app.settings.music);
    saveSettings();
  });
  $('#opt-sfx').addEventListener('input', (e) => {
    app.settings.sfx = +e.target.value;
    audio.setSfxVolume(app.settings.sfx);
    saveSettings();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && app.state === 'game') {
      saveGame(true);
      app.pause();
    }
  });
  window.addEventListener('pagehide', () => app.state === 'game' && saveGame(true));
}
function syncOptions() {
  const s = app.settings;
  for (const [id, key] of [['opt-lang', 'lang'], ['opt-quality', 'quality'], ['opt-gauges', 'gauges']])
    for (const b of document.querySelectorAll(`#${id} button`)) b.classList.toggle('on', b.dataset.v === s[key]);
  $('#opt-music').value = s.music;
  $('#opt-sfx').value = s.sfx;
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
let perf = { t: 0, n: 0, slow: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const { view, world, game } = app;
  app.input.update(dt);
  if (game) {
    game.paused = app.userPaused || app.popupOpen || app.menuOpen || (app.state !== 'game' && app.state !== 'title');
    game.update(dt);
  }
  const cam = view.cam;
  if (app.state === 'title' && app.backdropCenter) {
    cam.yaw += dt * 0.05;
  }
  if (app.follow && world && world.dwarfViews.get(app.follow)) {
    const v = world.dwarfViews.get(app.follow);
    cam.target.set(v.pos.x, v.pos.z);
  }
  if (world) world.update(dt);
  cam.update(dt);
  if (world) view.updateLights(world.emitters(), world.time);
  view.render();
  app.labels.update();
  app.hud.update(dt);
  // adaptive quality in auto mode
  if (app.settings.quality === 'auto' && app.state === 'game') {
    perf.t += dt;
    perf.n++;
    if (perf.t > 4) {
      const avg = perf.t / perf.n;
      if (avg > 1 / 34 && view.qualityName !== 'low') {
        perf.slow++;
        if (perf.slow >= 2) {
          view.setQuality(view.qualityName === 'high' ? 'medium' : 'low');
          perf.slow = 0;
        }
      } else perf.slow = 0;
      perf.t = 0;
      perf.n = 0;
    }
  }
}

async function boot() {
  translateDom();
  audio.setMusicVolume(app.settings.music);
  audio.setSfxVolume(app.settings.sfx);
  const forced = new URLSearchParams(location.search).get('quality');
  if (forced) app.settings.quality = forced;
  const q = app.settings.quality === 'auto' ? autoQuality() : app.settings.quality;
  app.view = new View($('#gl'), q);
  app.names = await loadNames();
  app.hud = new Hud(app);
  app.hud.thumbs = renderThumbs(app.view.renderer);
  app.labels = new Labels($('#labels'), app);
  app.input = new Input(app, $('#gl'));
  wireMenus();
  requestAnimationFrame(frame);
  const params = new URLSearchParams(location.search);
  const direct = params.get('level') && LEVELS.find((l) => l.file === params.get('level'));
  if (direct) await startLevel(direct, params.has('resume'));
  else await toTitle();
}

boot().catch((e) => {
  console.error(e);
  $('#loading-text').textContent = 'Error: ' + e.message;
});
