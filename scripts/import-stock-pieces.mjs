/* stock PNG → (必要なら背景除去) → 512/160 WebP へ取り込み
   - 既に透過あり: そのままフィット
   - チェッカー背景: scripts/remove-bg.mjs
   - それ以外の不透過: Python rembg (birefnet-portrait)
   node scripts/import-stock-pieces.mjs
*/
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { removeBgBuffer } from './remove-bg.mjs';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const STOCK = path.join(root, 'client', 'public', 'assets', 'pieces', 'stock');
const OUT = path.join(root, 'client', 'public', 'assets', 'pieces');
const OUT_SM = path.join(OUT, 'sm');
const FULL = 512;
const SM = 160;
const FILL = 0.94;
const REMBG_MODEL = 'birefnet-portrait';

function pieceIdFromFile(file) {
  return file.replace(/\.png$/i, '').replace(/\.+$/, '') || null;
}

async function alphaStats(input) {
  const meta = await sharp(input).metadata();
  if (!meta.hasAlpha) return { hasAlpha: false, opaqueRatio: 1 };
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaque = 0, clear = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 16) clear++;
    else opaque++;
  }
  return { hasAlpha: true, opaqueRatio: opaque / (opaque + clear), channels: info.channels };
}

async function hasCheckerBg(input) {
  const { data, info } = await sharp(input)
    .resize(64, 64, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let lightNeutral = 0;
  const n = info.width * info.height;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const d = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    const avg = (r + g + b) / 3;
    if (d < 18 && avg > 170) lightNeutral++;
  }
  return lightNeutral / n > 0.18;
}

function rembgCutout(inputPath, outputPath) {
  const py = `
from pathlib import Path
from rembg import remove, new_session
src = Path(r'''${inputPath.replace(/'/g, "\\'")}''')
dst = Path(r'''${outputPath.replace(/'/g, "\\'")}''')
session = new_session('${REMBG_MODEL}')
dst.write_bytes(remove(src.read_bytes(), session=session))
print('ok', dst.name)
`;
  const result = spawnSync('python', ['-c', py], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`rembg failed: ${result.stderr || result.stdout || result.status}`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
}

async function prepareCutout(input, workDir) {
  const stats = await alphaStats(input);
  /* 既に十分透過されているならユーザー作業済みとみなす */
  if (stats.hasAlpha && stats.opaqueRatio > 0.05 && stats.opaqueRatio < 0.92) {
    console.log(`  bg: already transparent (opaque ${(stats.opaqueRatio * 100).toFixed(1)}%)`);
    return sharp(input).ensureAlpha();
  }
  if (await hasCheckerBg(input)) {
    console.log('  bg: checker → remove-bg.mjs');
    return removeBgBuffer(input);
  }
  console.log(`  bg: painted → rembg(${REMBG_MODEL})`);
  const cut = path.join(workDir, `${path.basename(input)}.cut.png`);
  rembgCutout(input, cut);
  return sharp(cut).ensureAlpha();
}

async function fitPiece(rgbaSharp) {
  const png = await rgbaSharp.clone().trim({ threshold: 10 }).png().toBuffer();
  const meta = await sharp(png).metadata();
  if (!meta.width || !meta.height) throw new Error('trim 後の前景が空です');
  const side = Math.max(meta.width, meta.height);
  const canvas = Math.max(1, Math.round(side / FILL));

  /* extend→resize→webp 直列は sharp が誤サイズになることがあるため、正方形化を一度確定する */
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

  return sharp(squared).resize(FULL, FULL, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
}

await mkdir(OUT_SM, { recursive: true });
const workDir = await mkdtemp(path.join(tmpdir(), 'yokai-stock-'));
const files = (await readdir(STOCK)).filter(f => f.toLowerCase().endsWith('.png'));
if (!files.length) {
  console.error('stock に PNG がありません');
  process.exit(1);
}

try {
  for (const file of files) {
    const id = pieceIdFromFile(file);
    if (!id) continue;
    const input = path.join(STOCK, file);
    console.log(`\n${file} → ${id}`);
    const cutout = await prepareCutout(input, workDir);
    const fitted = await fitPiece(cutout);
    const fullPath = path.join(OUT, `${id}.webp`);
    const smPath = path.join(OUT_SM, `${id}.webp`);
    const full = await fitted.clone().webp({ quality: 82, alphaQuality: 90 }).toFile(fullPath);
    const sm = await fitted.clone().resize(SM, SM).webp({ quality: 80, alphaQuality: 85 }).toFile(smPath);
    console.log(`  wrote ${id}.webp (${(full.size / 1024).toFixed(0)}KB) + sm (${(sm.size / 1024).toFixed(1)}KB)`);
  }
  console.log('\ndone');
} finally {
  await rm(workDir, { recursive: true, force: true });
}
