import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { cleanBlackCutout } from './remove-bg.mjs';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const STOCK = path.join(root, 'client/public/assets/pieces/stock');
const OUT = path.join(root, 'client/public/assets/pieces');
const FULL = 512;
const SM = 160;
const FILL = 0.94;
const ids = process.argv.slice(2);
if (!ids.length) {
  console.error('usage: node scripts/reclean-black-pieces.mjs <id>...');
  process.exit(1);
}

async function fitPiece(rgbaSharp) {
  const png = await rgbaSharp.clone().trim({ threshold: 8 }).png().toBuffer();
  const meta = await sharp(png).metadata();
  if (!meta.width || !meta.height) throw new Error('trim 後の前景が空です');
  const side = Math.max(meta.width, meta.height);
  const canvas = Math.max(1, Math.round(side / FILL));
  const squared = await sharp(png)
    .ensureAlpha()
    .extend({
      top: Math.floor((canvas - meta.height) / 2),
      bottom: Math.ceil((canvas - meta.height) / 2),
      left: Math.floor((canvas - meta.width) / 2),
      right: Math.ceil((canvas - meta.width) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  return { squared, fitted: sharp(squared).resize(FULL, FULL, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  }) };
}

await mkdir(path.join(OUT, 'sm'), { recursive: true });
for (const id of ids) {
  const input = path.join(STOCK, `${id}.png`);
  console.log(id);
  const cleaned = await cleanBlackCutout(input);
  const { squared, fitted } = await fitPiece(cleaned);
  const full = await fitted.clone().webp({ quality: 82, alphaQuality: 95 }).toFile(path.join(OUT, `${id}.webp`));
  const sm = await fitted.clone().resize(SM, SM).webp({ quality: 80, alphaQuality: 90 }).toFile(path.join(OUT, `sm/${id}.webp`));
  await sharp(squared).png().toFile(input);
  console.log(`  ${(full.size / 1024).toFixed(0)}KB + sm ${(sm.size / 1024).toFixed(1)}KB`);
}
