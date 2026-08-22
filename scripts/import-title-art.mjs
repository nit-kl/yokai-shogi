/* タイトル用ロゴ／背景を ui フォルダへ取り込む。
   ロゴの純黒背景は透過にする。
   node scripts/import-title-art.mjs --logo <file> --bg <file> */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'client', 'public', 'assets', 'ui');

function knockoutAlpha(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min >= 18 && max >= 28) return 255;
  if (max <= 12) return 0;
  if (max <= 40) return Math.round(255 * (max - 12) / 28);
  return 255;
}

function parseArgs(argv) {
  const out = { logo: null, bg: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--logo') out.logo = argv[++i];
    else if (argv[i] === '--bg') out.bg = argv[++i];
  }
  return out;
}

async function importLogo(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    data[i + 3] = Math.min(data[i + 3], knockoutAlpha(data[i], data[i + 1], data[i + 2]));
  }
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] >= 10) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error(`logo has no opaque pixels: ${input}`);
  const pad = Math.round(Math.max(info.width, info.height) * 0.02);
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const width = Math.min(info.width - left, maxX - minX + 1 + pad * 2);
  const height = Math.min(info.height - top, maxY - minY + 1 + pad * 2);
  const dest = path.join(outDir, 'title-logo.webp');
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left, top, width, height })
    .webp({ quality: 90, alphaQuality: 95 })
    .toFile(dest);
  return dest;
}

async function importBg(input) {
  const dest = path.join(outDir, 'title-bg.webp');
  await sharp(input)
    .resize(1920, 1080, { fit: 'cover', withoutEnlargement: true })
    .webp({ quality: 86 })
    .toFile(dest);
  return dest;
}

const { logo, bg } = parseArgs(process.argv.slice(2));
if (!logo && !bg) {
  console.error('usage: node scripts/import-title-art.mjs --logo <file> --bg <file>');
  process.exit(1);
}
await mkdir(outDir, { recursive: true });
if (logo) console.log('logo', await importLogo(logo));
if (bg) console.log('bg', await importBg(bg));
