/* ガチャ限定妖怪(色違いバリアント)画像の生成
   processed/ の透過済み画像に色フィルタをかけて新妖怪の画像を作る
   node prototype/test/make-variants.js */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'assets', 'pieces', 'processed');

/* [元画像, 出力名, CSSフィルタ] */
const VARIANTS = [
  ['kooni.png',    'aooni.png',      'hue-rotate(190deg) saturate(1.15)'],
  ['nekomata.png', 'kasha.png',      'hue-rotate(-30deg) saturate(1.6) brightness(1.05)'],
  ['rokuro.png',   'hitouban.png',   'hue-rotate(-70deg) saturate(1.35)'],
  ['kappa.png',    'suiko.png',      'hue-rotate(130deg) saturate(1.3) brightness(0.95)'],
  ['nurikabe.png', 'oonyudo.png',    'hue-rotate(45deg) saturate(0.65) brightness(0.8) contrast(1.1)'],
  ['tengu.png',    'daitengu.png',   'saturate(1.7) brightness(0.88) contrast(1.15)'],
  ['nue.png',      'raiju.png',      'hue-rotate(150deg) saturate(1.45) brightness(1.08)'],
  ['shuten.png',   'ibaraki.png',    'hue-rotate(165deg) saturate(1.2) brightness(0.95)'],
  ['kyubi.png',    'tamamo.png',     'sepia(0.45) saturate(1.7) brightness(1.12)'],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('about:blank');

  for (const [src, outName, filter] of VARIANTS) {
    const b64 = fs.readFileSync(path.join(dir, src)).toString('base64');
    const dataUrl = await page.evaluate(async ({ b64, filter }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const g = cv.getContext('2d');
      g.filter = filter;
      g.drawImage(img, 0, 0);
      return cv.toDataURL('image/png');
    }, { b64, filter });

    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    fs.writeFileSync(path.join(dir, outName), buf);
    console.log(`${outName}: ${(buf.length / 1024).toFixed(0)} KB`);
  }
  await browser.close();
  console.log('DONE');
})();
