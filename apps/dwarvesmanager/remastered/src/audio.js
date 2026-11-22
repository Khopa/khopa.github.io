// Sound effects through WebAudio (decoded lazily), music through a looping <audio>.
const BASE = 'assets/audio/';
const SFX = ['anvil0', 'anvil1', 'break', 'cash', 'enchant', 'forge', 'gameover', 'grunt', 'Menu_cancel', 'Menu_ok',
  'mined0', 'mined1', 'mined2', 'mined3', 'placeObject', 'placeRoom', 'removeRoom', 'snore1', 'snore2', 'success'];

class AudioManager {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.loading = {};
    this.sfxVolume = 0.8;
    this.musicVolume = 0.5;
    this.music = new Audio();
    this.music.loop = true;
    this.music.preload = 'auto';
    this.musicName = null;
    this.unlocked = false;
    this.last = {};
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      this.ensure();
      if (this.musicName) this.music.play().catch(() => {});
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.sfxVolume;
      this.gain.connect(this.ctx.destination);
      for (const n of SFX) this.load(n);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  load(name) {
    if (this.buffers[name] || this.loading[name]) return;
    this.loading[name] = fetch(BASE + name + '.mp3')
      .then((r) => r.arrayBuffer())
      .then((b) => this.ctx.decodeAudioData(b))
      .then((buf) => (this.buffers[name] = buf))
      .catch(() => {});
  }
  play(name, volume = 1) {
    if (!this.unlocked || !this.ctx || this.sfxVolume <= 0) return;
    const buf = this.buffers[name];
    if (!buf) return;
    // throttle identical sounds (many dwarves mining at once)
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < 0.05) return;
    this.last[name] = now;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.gain);
    src.start();
  }
  playMusic(name) {
    if (this.musicName === name) return;
    this.musicName = name;
    this.music.src = BASE + 'music_' + name + '.mp3';
    this.music.volume = this.musicVolume;
    if (this.unlocked && this.musicVolume > 0) this.music.play().catch(() => {});
  }
  setSfxVolume(v) {
    this.sfxVolume = v;
    if (this.gain) this.gain.gain.value = v;
  }
  setMusicVolume(v) {
    this.musicVolume = v;
    this.music.volume = v;
    if (v <= 0) this.music.pause();
    else if (this.unlocked && this.musicName) this.music.play().catch(() => {});
  }
}

export const audio = new AudioManager();
