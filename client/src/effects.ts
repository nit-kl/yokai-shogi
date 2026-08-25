/* ============================================================
   百鬼盤 - 演出エンジン
   (canvasパーティクル / ダメージ数字 / カットイン / シェイク)
   ============================================================ */

import { AudioSys } from './audio';

interface Particle {
  kind: 'spark' | 'glow' | 'petal' | 'wisp' | 'bubble';
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  life: number; decay: number;
  color: string;
  grav?: number; drag?: number;
  wob?: number;
  rot?: number; vr?: number;
}

interface AmbientFx {
  colors: string[];
  rate: number;
  bubbles?: boolean;
  dust?: boolean;
}

export const FX = {
  canvas: null as HTMLCanvasElement | null,
  g: null as CanvasRenderingContext2D | null,
  parts: [] as Particle[],
  ambient: null as AmbientFx | null, // 環境演出(漂う魂火 / 泡)
  _raf: 0,
  _reduceMotion: false,

  init() {
    this.canvas = document.getElementById('fx-canvas') as HTMLCanvasElement;
    this.g = this.canvas.getContext('2d')!;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas!.width = innerWidth * dpr;
      this.canvas!.height = innerHeight * dpr;
      this.g!.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    addEventListener('resize', fit);
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    this._reduceMotion = motion.matches;
    motion.addEventListener('change', ev => { this._reduceMotion = ev.matches; });
    const loop = () => { this._tick(); this._raf = requestAnimationFrame(loop); };
    loop();
  },

  _tick() {
    const g = this.g!;
    g.clearRect(0, 0, innerWidth, innerHeight);

    // 環境パーティクル生成
    if (!this._reduceMotion && this.ambient && Math.random() < this.ambient.rate) {
      const c = this.ambient.colors[Math.floor(Math.random() * this.ambient.colors.length)];
      const roll = Math.random();
      if (this.ambient.dust && roll < 0.18) {
        this.parts.push({
          kind: 'petal',
          x: Math.random() * innerWidth,
          y: -8,
          vx: -0.18 + Math.random() * 0.28,
          vy: 0.22 + Math.random() * 0.32,
          size: 1.1 + Math.random() * 1.7,
          life: 1, decay: 0.0011 + Math.random() * 0.0012,
          color: c,
          rot: Math.random() * 6.28,
          vr: (Math.random() - 0.5) * 0.05,
          wob: Math.random() * 6.28,
        });
      } else if (this.ambient.bubbles && roll < 0.52) {
        this.parts.push({
          kind: 'bubble',
          x: Math.random() * innerWidth,
          y: innerHeight + 18,
          vx: (Math.random() - 0.5) * 0.22,
          vy: -(0.18 + Math.random() * 0.42),
          size: 5 + Math.random() * 11,
          life: 1, decay: 0.0011 + Math.random() * 0.0014,
          color: c, wob: Math.random() * 6.28,
        });
      } else {
        this.parts.push({
          kind: 'wisp',
          x: Math.random() * innerWidth,
          y: innerHeight + 14,
          vx: (Math.random() - 0.5) * 0.35,
          vy: -(0.25 + Math.random() * 0.55),
          size: 1.5 + Math.random() * 3.2,
          life: 1, decay: 0.0018 + Math.random() * 0.002,
          color: c, wob: Math.random() * 6.28,
        });
      }
    }

    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= p.decay;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.x += p.vx; p.y += p.vy;
      if (p.grav) p.vy += p.grav;
      if (p.drag) { p.vx *= p.drag; p.vy *= p.drag; }
      if (p.kind === 'wisp') { p.wob! += 0.03; p.x += Math.sin(p.wob!) * 0.4; }
      if (p.kind === 'bubble') { p.wob! += 0.022; p.x += Math.sin(p.wob!) * 0.55; }
      if (p.kind === 'petal' && p.wob != null) { p.wob += 0.02; p.x += Math.sin(p.wob) * 0.28; }

      const a = Math.max(0, Math.min(1, p.life));
      g.globalAlpha = a;
      if (p.kind === 'spark') {
        g.strokeStyle = p.color;
        g.lineWidth = p.size;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - p.vx * 2.4, p.y - p.vy * 2.4);
        g.stroke();
      } else if (p.kind === 'petal') {
        p.rot! += p.vr!;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot!);
        g.fillStyle = p.color;
        g.fillRect(-p.size, -p.size * 0.55, p.size * 2, p.size * 1.1);
        g.restore();
      } else if (p.kind === 'bubble') {
        const r = p.size * (0.85 + Math.sin(p.wob! * 1.6) * 0.08);
        g.globalAlpha = a * 0.42;
        const fill = g.createRadialGradient(p.x - r * 0.28, p.y - r * 0.32, 0, p.x, p.y, r);
        fill.addColorStop(0, 'rgba(255,255,255,0.55)');
        fill.addColorStop(0.22, p.color);
        fill.addColorStop(0.72, 'rgba(255,255,255,0.04)');
        fill.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = fill;
        g.beginPath();
        g.arc(p.x, p.y, r, 0, 6.28318);
        g.fill();
        g.globalAlpha = a * 0.7;
        g.strokeStyle = p.color;
        g.lineWidth = 1.15;
        g.beginPath();
        g.arc(p.x, p.y, r, 0, 6.28318);
        g.stroke();
        g.globalAlpha = a * 0.85;
        g.strokeStyle = 'rgba(255,255,255,0.75)';
        g.lineWidth = 1;
        g.beginPath();
        g.arc(p.x - r * 0.28, p.y - r * 0.32, r * 0.28, -0.6, 1.1);
        g.stroke();
      } else { // glow / wisp
        const r = p.size * (p.kind === 'wisp' ? (1 + Math.sin(p.wob! * 2) * 0.2) : (0.4 + a));
        const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(p.x, p.y, r * 3, 0, 6.28318);
        g.fill();
      }
    }
    g.globalAlpha = 1;
    // パーティクル数の安全上限
    if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
  },

  setAmbient(colors: string[] | null, rate?: number, opts?: { bubbles?: boolean; dust?: boolean }) {
    this.ambient = colors
      ? { colors, rate: rate || 0.06, bubbles: opts?.bubbles, dust: opts?.dust }
      : null;
  },

  /* ---------- バースト系 ---------- */
  burst(x: number, y: number, colors: string[], count = 26, power = 5.5) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * 6.28318;
      const v = power * (0.35 + Math.random());
      this.parts.push({
        kind: Math.random() < 0.6 ? 'spark' : 'glow',
        x, y,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v - 1,
        size: 1.6 + Math.random() * 2.6,
        life: 1, decay: 0.02 + Math.random() * 0.025,
        grav: 0.12, drag: 0.965,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  },

  ring(x: number, y: number, color: string, count = 18, radius = 60) {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * 6.28318;
      this.parts.push({
        kind: 'glow', x, y,
        vx: Math.cos(ang) * radius / 14,
        vy: Math.sin(ang) * radius / 14,
        size: 2.4, life: 1, decay: 0.03, drag: 0.94,
        color,
      });
    }
  },

  /* 立ち昇る光の柱(既定は成りの金色。colors指定でスキル演出に流用) */
  pillar(x: number, y: number, colors: readonly string[] = ['#ffe9a0', '#ffd24a', '#fff6d8', '#f0a830']) {
    for (let i = 0; i < 36; i++) {
      this.parts.push({
        kind: Math.random() < 0.5 ? 'spark' : 'glow',
        x: x + (Math.random() - 0.5) * 44,
        y: y + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -(2 + Math.random() * 5),
        size: 1.4 + Math.random() * 2.4,
        life: 1, decay: 0.014 + Math.random() * 0.014,
        drag: 0.985,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  },

  /* 葉吹雪(化け狸の葉隠れ) */
  leaves(x: number, y: number) {
    const cs = ['#7cf2a4', '#4caf50', '#a8e063', '#8d6e63'];
    for (let i = 0; i < 30; i++) {
      const ang = Math.random() * 6.28318;
      const v = 2 + Math.random() * 4.5;
      this.parts.push({
        kind: 'petal',
        x, y,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v - 2,
        size: 2.6 + Math.random() * 3,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3,
        life: 1, decay: 0.008 + Math.random() * 0.006,
        grav: 0.06, drag: 0.985,
        color: cs[Math.floor(Math.random() * cs.length)],
      });
    }
  },

  /* 勝利の紙吹雪 */
  confetti() {
    for (let i = 0; i < 90; i++) {
      this.parts.push({
        kind: 'petal',
        x: Math.random() * innerWidth,
        y: -20 - Math.random() * innerHeight * 0.5,
        vx: (Math.random() - 0.5) * 1.6,
        vy: 1.2 + Math.random() * 2.4,
        size: 3 + Math.random() * 4,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.22,
        life: 1, decay: 0.0035,
        color: ['#ffd24a', '#ff6b6b', '#6bd6ff', '#c88aff', '#fff6d8', '#7cf2a4'][Math.floor(Math.random() * 6)],
      });
    }
  },

  /* 移動の軌跡: 2点間に光の粒を撒く(strong: SSR・異装用の火花混じり高密度版) */
  trail(x1: number, y1: number, x2: number, y2: number, colors: string[], strong = false) {
    const steps = strong ? 32 : 14;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      this.parts.push({
        kind: strong && Math.random() < 0.45 ? 'spark' : 'glow',
        x: x1 + (x2 - x1) * t + (Math.random() - 0.5) * (strong ? 14 : 8),
        y: y1 + (y2 - y1) * t + (Math.random() - 0.5) * (strong ? 14 : 8),
        vx: (Math.random() - 0.5) * (strong ? 1.4 : 0.5),
        vy: -(0.2 + Math.random() * (strong ? 1.2 : 0.6)),
        size: (strong ? 2 : 1.5) + Math.random() * (strong ? 2.6 : 1.8),
        life: (strong ? 1 : 0.85) - t * (strong ? 0.2 : 0.3),
        decay: (strong ? 0.02 : 0.028) + Math.random() * (strong ? 0.015 : 0.02),
        drag: strong ? 0.97 : undefined,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  },

  /* 収束: 円周から中心へ光が吸い込まれる(溜め演出) */
  converge(x: number, y: number, color: string, count = 18, radius = 60) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * 6.28318;
      const r = radius * (0.7 + Math.random() * 0.6);
      const speed = r / 11;
      this.parts.push({
        kind: Math.random() < 0.5 ? 'spark' : 'glow',
        x: x + Math.cos(ang) * r,
        y: y + Math.sin(ang) * r,
        vx: -Math.cos(ang) * speed,
        vy: -Math.sin(ang) * speed,
        size: 1.4 + Math.random() * 2,
        life: 0.9, decay: 0.055 + Math.random() * 0.03,
        color,
      });
    }
  },

  /* ---------- DOM系演出 ---------- */
  /* 画面全体フラッシュ */
  flash(color = 'rgba(255,245,220,0.75)', dur = 180) {
    const el = document.createElement('div');
    el.className = 'fx-flash';
    el.style.background = color;
    el.style.animationDuration = dur + 'ms';
    document.getElementById('fx-layer')!.appendChild(el);
    setTimeout(() => el.remove(), dur + 80);
  },

  /* 暗転スポットライト: 画面を落として1点だけ照らす(スキル発動の"タメ") */
  spotlight(x: number, y: number, color = '#ffd24a', dur = 1600) {
    const el = document.createElement('div');
    el.className = 'fx-spotlight';
    el.style.background =
      `radial-gradient(circle at ${x}px ${y}px, transparent 46px, ` +
      `color-mix(in srgb, ${color} 10%, rgba(8, 5, 14, 0.86)) 220px)`;
    el.style.animationDuration = dur + 'ms';
    document.getElementById('fx-layer')!.appendChild(el);
    setTimeout(() => el.remove(), dur + 120);
  },

  /* 広がる衝撃波リング */
  shockwave(x: number, y: number, color = '#fff', scale = 10) {
    const el = document.createElement('div');
    el.className = 'fx-shockwave';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.setProperty('--sw-color', color);
    el.style.setProperty('--sw-scale', String(scale));
    document.getElementById('fx-layer')!.appendChild(el);
    setTimeout(() => el.remove(), 540);
  },

  /* 斬撃ライン(捕獲時) */
  slash(x: number, y: number, big = false) {
    const angles = big ? [-38, 27, -8] : [-32, 22];
    angles.forEach((a, i) => {
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'fx-slash';
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.width = big ? '210px' : '150px';
        el.style.setProperty('--sl-ang', a + 'deg');
        document.getElementById('fx-layer')!.appendChild(el);
        setTimeout(() => el.remove(), 380);
      }, i * 70);
    });
  },

  /* 画面ズームパンチ */
  zoomPunch(big = false) {
    const el = document.getElementById('screen-battle');
    if (!el) return;
    const cls = big ? 'zoom-punch-big' : 'zoom-punch';
    el.classList.remove('zoom-punch', 'zoom-punch-big');
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), big ? 360 : 260);
  },

  /* sub: 数字の右肩に添える倍率表示(例 "×2!") */
  damageNumber(x: number, y: number, value: number | string, kind = 'normal', sub?: string) {
    const el = document.createElement('div');
    el.className = `dmg-num dmg-${kind}`;
    el.textContent = String(value);
    if (sub) {
      const s = document.createElement('span');
      s.className = 'dmg-sub';
      s.textContent = sub;
      el.appendChild(s);
    }
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.getElementById('fx-layer')!.appendChild(el);
    setTimeout(() => el.remove(), 1250);
  },

  /* 成り: 金屏風の帯が指定Y座標を横一閃する */
  promoteBand(y: number) {
    const el = document.createElement('div');
    el.className = 'fx-promote-band';
    el.style.top = y + 'px';
    document.getElementById('fx-layer')!.appendChild(el);
    setTimeout(() => el.remove(), 820);
  },

  /* 大書き漢字スタンプ(「成」など) */
  kanjiStamp(x: number, y: number, char: string) {
    const el = document.createElement('div');
    el.className = 'fx-kanji-stamp';
    el.textContent = char;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.getElementById('fx-layer')!.appendChild(el);
    setTimeout(() => el.remove(), 1120);
  },

  /* コンボ表示: 数が伸びるほど大きく・派手に。4コンボ以上は画面も揺らす */
  comboLabel(x: number, y: number, n: number, isPlayer: boolean) {
    const tier = n >= 5 ? 3 : n >= 4 ? 2 : n >= 3 ? 1 : 0;
    const el = document.createElement('div');
    el.className = `fx-combo tier-${tier} ${isPlayer ? 'side-p' : 'side-e'}`;
    const num = document.createElement('b');
    num.textContent = String(n);
    const label = document.createElement('i');
    label.textContent = 'COMBO';
    el.append(num, label);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.getElementById('fx-layer')!.appendChild(el);
    if (tier >= 2) this.zoomPunch(tier >= 3);
    setTimeout(() => el.remove(), 1350);
  },

  floatLabel(x: number, y: number, text: string, color?: string) {
    const el = document.createElement('div');
    el.className = 'float-label';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.color = color || '#ffd76a';
    el.style.textShadow = `0 0 12px ${color || '#ffae30'}, 0 2px 3px rgba(0,0,0,0.9)`;
    document.getElementById('fx-layer')!.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  },

  shake(big = false) {
    const el = document.querySelector('.battle-col');
    if (!el) return;
    const cls = big ? 'shake-big' : 'shake';
    el.classList.remove('shake', 'shake-big');
    void (el as HTMLElement).offsetWidth; // reflow でアニメ再始動
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), big ? 600 : 450);
  },

  /* ---------- カットイン ---------- */
  /* colors: [light, primary, accent] 指定時はCSS変数で帯・名前が染まる。
     tier: レアリティ段階(0-3)。帯の高さ・イラストの迫力が変わる */
  cutin(imgSrc: string, name: string, sub?: string, style = 'skill', colors?: readonly string[], tier?: number): Promise<void> {
    return new Promise(resolve => {
      const root = document.getElementById('cutin')!;
      root.className = `style-${style}`
        + (colors && colors.length >= 3 ? ' has-colors' : '')
        + (tier != null ? ` tier-${tier}` : '');
      if (colors && colors.length >= 3) {
        root.style.setProperty('--cutin-light', colors[0]);
        root.style.setProperty('--cutin-primary', colors[1]);
        root.style.setProperty('--cutin-accent', colors[2]);
      } else {
        root.style.removeProperty('--cutin-light');
        root.style.removeProperty('--cutin-primary');
        root.style.removeProperty('--cutin-accent');
      }
      (document.getElementById('cutin-img') as HTMLImageElement).src = imgSrc;
      document.getElementById('cutin-name')!.textContent = name;
      document.getElementById('cutin-sub')!.textContent = sub || '';
      // フラッシュ
      const flash = document.createElement('div');
      flash.className = 'cutin-flash';
      root.appendChild(flash);
      setTimeout(() => flash.remove(), 320);
      AudioSys.play(style === 'counter' ? 'counter' : 'cutin');
      // アニメ再始動
      const restart = (el: Element) => {
        (el as HTMLElement).style.animation = 'none';
        void (el as HTMLElement).offsetWidth;
        (el as HTMLElement).style.animation = '';
      };
      root.querySelectorAll('.cutin-bg, .cutin-lines, #cutin-img, .cutin-texts').forEach(restart);
      setTimeout(() => {
        root.classList.add('hidden');
        resolve();
      }, 1450);
    });
  },
};
