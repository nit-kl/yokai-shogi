/* 駒画像の背景(焼き込みチェッカー)除去 → 透過PNG生成
   node test/process-images.js */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'assets', 'pieces', 'processed');

const FILES = [
  ['assets/pieces/boss/piece-boss-001-kyubi-no-kitsune.png', 'kyubi.png'],
  ['assets/pieces/boss/piece-boss-002-shuten-doji.png', 'shuten.png'],
  ['assets/pieces/attack/piece-attack-001-ko-oni.png', 'kooni.png'],
  ['assets/pieces/attack/piece-attack-002-nekomata.png', 'nekomata.png'],
  ['assets/pieces/attack/piece-attack-003-ittan-momen.png', 'ittan.png'],
  ['assets/pieces/attack/piece-attack-004-nue.png', 'nue.png'],
  ['assets/pieces/defense/piece-defense-001-kappa.png', 'kappa.png'],
  ['assets/pieces/defense/piece-defense-002-nurikabe.png', 'nurikabe.png'],
  ['assets/pieces/ambush/piece-ambush-001-tengu.png', 'tengu.png'],
  ['assets/pieces/ambush/piece-ambush-002-rokurokubi.png', 'rokuro.png'],
  ['assets/pieces/attack/piece-attack-005-kamaitachi.png', 'kamaitachi.png'],
  ['assets/pieces/boss/piece-boss-003-nurarihyon.png', 'nurarihyon.png'],
  ['assets/pieces/debuff/piece-debuff-001-yuki-onna.png', 'yukionna.png'],
  ['assets/pieces/debuff/piece-debuff-002-tsuchigumo.png', 'tsuchigumo.png'],
  ['assets/pieces/debuff/piece-debuff-003-sunakake-baba.png', 'sunakake.png'],
  ['assets/pieces/support/piece-support-001-zashiki-warashi.png', 'zashiki.png'],
  ['assets/pieces/transform/piece-transform-001-baketanuki.png', 'tanuki.png'],
  // 炎に囲まれた背景の取り残しがあるため、閉領域チェッカー除去パスを有効化
  ['assets/pieces/trap/piece-trap-001-onibi.png', 'onibi.png', { interior: true }],
];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('about:blank');

  for (const [src, outName, opts] of FILES) {
    const b64 = fs.readFileSync(path.join(root, src)).toString('base64');
    const interior = !!(opts && opts.interior);
    const dataUrl = await page.evaluate(async ({ b64, interior }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const W = img.width, H = img.height;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const im = g.getImageData(0, 0, W, H);
      const d = im.data;

      // 背景候補: 明るい低彩度ピクセル(チェッカーの2色 ≈ #FCFCFC / #F3F4F4)
      const isBg = i => {
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
        return mn >= 228 && (mx - mn) <= 16;
      };

      // 境界からフラッドフィル
      const visited = new Uint8Array(W * H);
      const stack = [];
      const push = (x, y) => {
        if (x < 0 || x >= W || y < 0 || y >= H) return;
        const p = y * W + x;
        if (visited[p]) return;
        if (!isBg(p * 4)) return;
        visited[p] = 1;
        stack.push(p);
      };
      for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
      for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
      while (stack.length) {
        const p = stack.pop();
        const x = p % W, y = (p / W) | 0;
        push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
      }

      // 背景を透明化
      for (let p = 0; p < W * H; p++) if (visited[p]) d[p * 4 + 3] = 0;

      // 閉領域に残ったチェッカー背景の除去(大きな塊のみ。白い絵柄の誤爆を防ぐ)
      if (interior) {
        for (let p0 = 0; p0 < W * H; p0++) {
          if (visited[p0] || !isBg(p0 * 4)) continue;
          const comp = [p0];
          visited[p0] = 1;
          for (let i = 0; i < comp.length; i++) {
            const x = comp[i] % W, y = (comp[i] / W) | 0;
            for (const [nx, ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]) {
              if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
              const np = ny * W + nx;
              if (!visited[np] && isBg(np * 4)) { visited[np] = 1; comp.push(np); }
            }
          }
          if (comp.length >= 600) for (const p of comp) d[p * 4 + 3] = 0;
        }
      }
      g.putImageData(im, 0, 0);

      // 512pxへ縮小(縁が自然にアンチエイリアスされる)
      const out = document.createElement('canvas');
      const S = 512;
      out.width = S; out.height = S;
      const og = out.getContext('2d');
      og.imageSmoothingQuality = 'high';
      og.drawImage(cv, 0, 0, S, S);
      return out.toDataURL('image/png');
    }, { b64, interior });

    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    fs.writeFileSync(path.join(outDir, outName), buf);
    console.log(`${outName}: ${(buf.length / 1024).toFixed(0)} KB`);
  }
  await browser.close();
  console.log('DONE');
})();
