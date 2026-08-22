/* Steam クライアントアイコン
   ショートカット: PNG 512x512（ICO も 256 を内包）
   アプリアイコン: JPG 184x184
   node scripts/steam-icons.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'client', 'public', 'assets', 'pieces', 'kyubi.webp');
const outDir = path.join(root, 'ops', 'steam-store', 'icons');
fs.mkdirSync(outDir, { recursive: true });

function pngToIco(png) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(0, 6);
  header.writeUInt8(0, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

const goldFrame = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect x="7" y="7" width="498" height="498" rx="36" fill="none" stroke="#8a5d10" stroke-width="10"/>
  <rect x="14" y="14" width="484" height="484" rx="30" fill="none" stroke="#e8c46a" stroke-width="4"/>
</svg>`);

const portrait = await sharp(src)
  .extract({ left: 96, top: 4, width: 320, height: 320 })
  .resize(512, 512, { kernel: 'lanczos3' })
  .png()
  .toBuffer();

const shortcut512 = await sharp(portrait)
  .composite([{ input: goldFrame, blend: 'over' }])
  .png()
  .toBuffer();

const shortcut256 = await sharp(shortcut512).resize(256, 256).png().toBuffer();
const app184 = await sharp(shortcut512)
  .resize(184, 184)
  .flatten({ background: '#0c0915' })
  .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
  .toBuffer();

fs.writeFileSync(path.join(outDir, 'shortcut_icon.png'), shortcut512);
fs.writeFileSync(path.join(outDir, 'shortcut_icon.ico'), pngToIco(shortcut256));
fs.writeFileSync(path.join(outDir, 'app_icon.jpg'), app184);

const a = await sharp(shortcut512).metadata();
const b = await sharp(path.join(outDir, 'app_icon.jpg')).metadata();
console.log('shortcut_icon.png', a.width + 'x' + a.height);
console.log('app_icon.jpg', b.width + 'x' + b.height);
console.log('wrote', outDir);
