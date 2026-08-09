/* ============================================================
   妖怪将棋 - サウンド (SE: WebAudio合成 / BGM: MP3ループ)
   ============================================================ */

type BgmMode = 'title' | 'battle';

const STORAGE_KEY = 'yokaiShogi.audio.v1';
const SE_BASE = 0.9;
const BGM_TITLE_BASE = 0.28;
const BGM_BATTLE_BASE = 0.32;

const BATTLE_BGM_SOURCES = [
  '/assets/audio/battle-bgm.mp3',
  '/assets/audio/battle-bgm-1.mp3',
  '/assets/audio/battle-bgm-2.mp3',
];

type AudioSettings = {
  enabled: boolean;
  bgmVolume: number;
  seVolume: number;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: true, bgmVolume: 1, seVolume: 1 };
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      enabled: parsed.enabled !== false,
      bgmVolume: clamp01(parsed.bgmVolume ?? 1),
      seVolume: clamp01(parsed.seVolume ?? 1),
    };
  } catch {
    return { enabled: true, bgmVolume: 1, seVolume: 1 };
  }
}

function saveSettings(settings: AudioSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* 容量超過等は黙って諦める */ }
}

const initial = loadSettings();

export const AudioSys = {
  ctx: null as AudioContext | null,
  master: null as GainNode | null,
  bgmTitle: null as HTMLAudioElement | null,
  bgmBattle: null as HTMLAudioElement | null,
  bgmMode: null as BgmMode | null,
  enabled: initial.enabled,
  bgmVolume: initial.bgmVolume,
  seVolume: initial.seVolume,

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.bgmTitle = this._makeBgm('/assets/audio/title-bgm.mp3');
      this.bgmBattle = this._makeBgm('/assets/audio/battle-bgm.mp3');
      this._applyVolumes();
    } catch { /* 音なしでも動作 */ }
  },

  _makeBgm(src: string): HTMLAudioElement {
    const audio = new Audio(src);
    audio.loop = true;
    audio.preload = 'auto';
    return audio;
  },

  _persist() {
    saveSettings({
      enabled: this.enabled,
      bgmVolume: this.bgmVolume,
      seVolume: this.seVolume,
    });
  },

  _applyVolumes() {
    if (this.master) this.master.gain.value = this.enabled ? SE_BASE * this.seVolume : 0;
    if (this.bgmTitle) this.bgmTitle.volume = BGM_TITLE_BASE * this.bgmVolume;
    if (this.bgmBattle) this.bgmBattle.volume = BGM_BATTLE_BASE * this.bgmVolume;
    this._syncBgmMute();
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  },

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this._applyVolumes();
    this._persist();
  },

  setBgmVolume(volume: number) {
    this.bgmVolume = clamp01(volume);
    this._applyVolumes();
    this._persist();
  },

  setSeVolume(volume: number) {
    this.seVolume = clamp01(volume);
    this._applyVolumes();
    this._persist();
  },

  _syncBgmMute() {
    if (this.bgmTitle) this.bgmTitle.muted = !this.enabled;
    if (this.bgmBattle) this.bgmBattle.muted = !this.enabled;
  },

  _playBgm(mode: BgmMode) {
    const next = mode === 'title' ? this.bgmTitle : this.bgmBattle;
    const other = mode === 'title' ? this.bgmBattle : this.bgmTitle;
    if (!next) return;
    this.resume();
    if (this.bgmMode === mode && !next.paused) return;
    if (other && !other.paused) {
      other.pause();
      other.currentTime = 0;
    }
    this.bgmMode = mode;
    this._applyVolumes();
    void next.play().catch(() => { /* 自動再生ポリシー等 */ });
  },

  /* ---------- BGM ---------- */
  startTitleBgm() { this._playBgm('title'); },
  startBattleBgm() {
    if (this.bgmBattle) {
      const src = BATTLE_BGM_SOURCES[Math.floor(Math.random() * BATTLE_BGM_SOURCES.length)];
      if (this.bgmBattle.getAttribute('src') !== src) {
        this.bgmBattle.pause();
        this.bgmBattle.currentTime = 0;
        this.bgmBattle.src = src;
        this.bgmBattle.load();
      }
    }
    this._playBgm('battle');
  },
  startBgm() { this.startBattleBgm(); },

  stopBgm() {
    if (this.bgmTitle) { this.bgmTitle.pause(); this.bgmTitle.currentTime = 0; }
    if (this.bgmBattle) { this.bgmBattle.pause(); this.bgmBattle.currentTime = 0; }
    this.bgmMode = null;
  },

  /* ---------- 基本シンセ部品 ---------- */
  _osc(type: OscillatorType, freq: number, t0: number, dur: number, vol: number, dest?: AudioNode | null, freqEnd?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest || this.master!);
    o.start(t0); o.stop(t0 + dur + 0.05);
  },

  _noise(t0: number, dur: number, vol: number, filterFreq?: number, dest?: AudioNode | null) {
    const ctx = this.ctx!;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq || 2000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(dest || this.master!);
    src.start(t0);
  },

  _pluck(freq: number, t0: number, vol: number, dest?: AudioNode | null) {
    const d = dest || this.master;
    this._osc('triangle', freq, t0, 0.5, vol, d);
    this._osc('sine', freq * 2.01, t0, 0.25, vol * 0.3, d);
    this._osc('sine', freq * 0.5, t0, 0.6, vol * 0.25, d);
  },

  /* コンボ音: 数が伸びるほど音程が上がる */
  playCombo(n: number) {
    if (!this.ctx || !this.enabled || this.seVolume <= 0) return;
    this.resume();
    const t = this.ctx.currentTime + 0.01;
    const base = 520 * Math.pow(1.12, Math.min(n, 8) - 2);
    this._osc('triangle', base, t, 0.18, 0.28);
    this._osc('sine', base * 1.5, t + 0.06, 0.22, 0.2);
    if (n >= 4) this._osc('sine', base * 2, t + 0.12, 0.26, 0.16);
  },

  /* ---------- SE ---------- */
  play(name: string) {
    if (!this.ctx || !this.enabled || this.seVolume <= 0) return;
    this.resume();
    const t = this.ctx.currentTime + 0.01;
    switch (name) {
      case 'move':
        this._noise(t, 0.06, 0.5, 3200);
        this._osc('sine', 180, t, 0.09, 0.5, null, 70);
        break;
      case 'select':
        this._osc('sine', 660, t, 0.07, 0.18);
        this._osc('sine', 990, t + 0.04, 0.08, 0.12);
        break;
      case 'capture':
        this._noise(t, 0.16, 0.7, 5200);
        this._osc('sawtooth', 320, t + 0.02, 0.22, 0.4, null, 50);
        this._osc('sine', 95, t + 0.02, 0.3, 0.7, null, 35);
        break;
      case 'bighit':
        this._noise(t, 0.3, 0.9, 3800);
        this._osc('sawtooth', 420, t, 0.32, 0.5, null, 40);
        this._osc('sine', 70, t, 0.5, 0.95, null, 28);
        this._osc('square', 210, t + 0.05, 0.2, 0.25, null, 60);
        break;
      case 'cutin':
        this._noise(t, 0.4, 0.55, 1500);
        this._osc('sine', 160, t + 0.05, 1.1, 0.5, null, 140);
        this._osc('sine', 240, t + 0.05, 0.9, 0.3, null, 210);
        break;
      case 'counter':
        this._osc('sawtooth', 140, t, 0.5, 0.4, null, 480);
        this._osc('sine', 70, t + 0.1, 0.45, 0.6, null, 45);
        this._noise(t + 0.12, 0.25, 0.5, 1200);
        break;
      case 'promote':
        [523, 659, 784, 1047].forEach((f, i) => this._osc('sine', f, t + i * 0.07, 0.4, 0.25));
        this._noise(t, 0.1, 0.15, 8000);
        break;
      case 'drop':
        this._osc('sine', 90, t, 0.25, 0.7, null, 45);
        this._noise(t, 0.12, 0.45, 2200);
        this._osc('sine', 740, t + 0.03, 0.2, 0.12);
        break;
      case 'turn':
        this._osc('sine', 440, t, 0.12, 0.2);
        this._osc('sine', 587, t + 0.08, 0.18, 0.2);
        break;
      case 'tick':
        this._osc('sine', 880, t, 0.045, 0.14);
        this._osc('triangle', 1320, t, 0.03, 0.06);
        break;
      case 'byoyomi':
        this._osc('square', 420, t, 0.12, 0.18, null, 280);
        this._osc('sine', 660, t + 0.08, 0.18, 0.2);
        this._osc('sine', 990, t + 0.16, 0.22, 0.16);
        break;
      case 'summon':
        this._noise(t, 1.1, 0.22, 1800);
        this._osc('sine', 90, t, 1.3, 0.55, null, 360);
        [220, 330, 440, 660, 880].forEach((f, i) => this._osc('triangle', f, t + 0.18 + i * 0.14, 0.5, 0.18));
        break;
      case 'win': {
        const seq = [523, 659, 784, 1047, 784, 1047, 1319];
        seq.forEach((f, i) => {
          this._pluck(f, t + i * 0.13, 0.3);
          if (i % 2 === 0) this._osc('sine', f / 2, t + i * 0.13, 0.4, 0.15);
        });
        this._noise(t, 0.5, 0.2, 6000);
        break;
      }
      case 'lose':
        this._osc('sine', 98, t, 2.4, 0.55, null, 92);
        this._osc('sine', 147, t, 2.0, 0.3, null, 139);
        this._osc('sine', 196, t + 0.01, 1.4, 0.2);
        this._noise(t, 0.15, 0.3, 900);
        break;
      case 'click':
        this._osc('sine', 880, t, 0.06, 0.15);
        break;
    }
  },
};
