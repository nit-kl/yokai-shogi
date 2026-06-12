'use strict';
/* ============================================================
   妖怪将棋 - 演出エンジン
   (canvasパーティクル / ダメージ数字 / カットイン / シェイク)
   ============================================================ */

const FX = {
  canvas: null, g: null,
  parts: [],
  ambient: null, // {colors, rate} 環境演出(漂う魂火)
  _raf: 0,

  init() {
    this.canvas = document.getElementById('fx-canvas');
    this.g = this.canvas.getContext('2d');
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = innerWidth * dpr;
      this.canvas.height = innerHeight * dpr;
      this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    addEventListener('resize', fit);
    const loop = () => { this._tick(); this._raf = requestAnimationFrame(loop); };
    loop();
  },

  _tick() {
    const g = this.g;
    g.clearRect(0, 0, innerWidth, innerHeight);

    // 環境パーティクル生成
    if (this.ambient && Math.random() < this.ambient.rate) {
      const c = this.ambient.colors[Math.floor(Math.random() * this.ambient.colors.length)];
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

    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= p.decay;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.x += p.vx; p.y += p.vy;
      if (p.grav) p.vy += p.grav;
      if (p.drag) { p.vx *= p.drag; p.vy *= p.drag; }
      if (p.kind === 'wisp') { p.wob += 0.03; p.x += Math.sin(p.wob) * 0.4; }

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
        p.rot += p.vr;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = p.color;
        g.fillRect(-p.size, -p.size * 0.55, p.size * 2, p.size * 1.1);
        g.restore();
      } else { // glow / wisp
        const r = p.size * (p.kind === 'wisp' ? (1 + Math.sin(p.wob * 2) * 0.2) : (0.4 + a));
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

  setAmbient(colors, rate) {
    this.ambient = colors ? { colors, rate: rate || 0.06 } : null;
  },

  /* ---------- バースト系 ---------- */
  burst(x, y, colors, count = 26, power = 5.5) {
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

  ring(x, y, color, count = 18, radius = 60) {
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

  /* 成り:金の柱 */
  pillar(x, y) {
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
        color: ['#ffe9a0', '#ffd24a', '#fff6d8', '#f0a830'][Math.floor(Math.random() * 4)],
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

  /* ---------- DOM系演出 ---------- */
  damageNumber(x, y, value, kind = 'normal') {
    const el = document.createElement('div');
    el.className = `dmg-num dmg-${kind}`;
    el.textContent = value;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.getElementById('fx-layer').appendChild(el);
    setTimeout(() => el.remove(), 1250);
  },

  floatLabel(x, y, text, color) {
    const el = document.createElement('div');
    el.className = 'float-label';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.color = color || '#ffd76a';
    el.style.textShadow = `0 0 12px ${color || '#ffae30'}, 0 2px 3px rgba(0,0,0,0.9)`;
    document.getElementById('fx-layer').appendChild(el);
    setTimeout(() => el.remove(), 1300);
  },

  shake(big = false) {
    const el = document.querySelector('.battle-col');
    if (!el) return;
    const cls = big ? 'shake-big' : 'shake';
    el.classList.remove('shake', 'shake-big');
    void el.offsetWidth; // reflow でアニメ再始動
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), big ? 600 : 450);
  },

  /* ---------- カットイン ---------- */
  cutin(imgSrc, name, sub, style = 'skill') {
    return new Promise(resolve => {
      const root = document.getElementById('cutin');
      root.className = `style-${style}`;
      document.getElementById('cutin-img').src = imgSrc;
      document.getElementById('cutin-name').textContent = name;
      document.getElementById('cutin-sub').textContent = sub || '';
      // フラッシュ
      const flash = document.createElement('div');
      flash.className = 'cutin-flash';
      root.appendChild(flash);
      setTimeout(() => flash.remove(), 320);
      AudioSys.play(style === 'counter' ? 'counter' : 'cutin');
      // アニメ再始動
      const restart = el => { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; };
      root.querySelectorAll('.cutin-bg, .cutin-lines, #cutin-img, .cutin-texts').forEach(restart);
      setTimeout(() => {
        root.classList.add('hidden');
        resolve();
      }, 1450);
    });
  },
};
