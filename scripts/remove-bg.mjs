/* 白/チェッカー背景の除去 → 透過RGBA → WebP
   node scripts/remove-bg.mjs <input.png> [output.webp] */
import sharp from 'sharp';
import path from 'node:path';

/** 白・ライトグレー(チェッカー模様)を背景とみなす */
function bgAlpha(r, g, b) {
  const d = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
  const avg = (r + g + b) / 3;
  if (d >= 28 || avg < 155) return 255;
  if (d < 14 && avg > 218) return 0;
  if (d < 20 && avg > 188) return Math.round(255 * Math.min(1, (avg - 188) / 52));
  return 255;
}

export async function removeBgBuffer(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    data[i + 3] = Math.min(data[i + 3], bgAlpha(data[i], data[i + 1], data[i + 2]));
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
}

export async function toPieceWebp(input, outFull, outSm, size = 512, smSize = 160) {
  const base = (await removeBgBuffer(input)).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
  const full = await base.clone().webp({ quality: 82, alphaQuality: 90 }).toFile(outFull);
  const sm = await base.clone().resize(smSize, smSize).webp({ quality: 80, alphaQuality: 85 }).toFile(outSm);
  return full;
}

if (process.argv[1] && process.argv[1].endsWith('remove-bg.mjs')) {
  const [input, output = input.replace(/\.[^.]+$/, '.webp')] = process.argv.slice(2);
  if (!input) {
    console.error('usage: node scripts/remove-bg.mjs <input.png> [output.webp]');
    process.exit(1);
  }
  await toPieceWebp(input, output, output);
  console.log('wrote', output);
}
