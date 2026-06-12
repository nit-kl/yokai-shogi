/* 駒画像の最適化: prototype の透過PNG(512px) → WebP(フル512px + 小160px)
   node scripts/optimize-images.mjs */
import sharp from 'sharp';
import { readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const SRC = path.join(root, 'prototype', 'assets', 'pieces', 'processed');
const OUT = path.join(root, 'client', 'public', 'assets', 'pieces');
const OUT_SM = path.join(OUT, 'sm');

const SM_SIZE = 160; // チップ・一覧などの小サイズ用途(表示は最大~64px)

await mkdir(OUT_SM, { recursive: true });

const files = (await readdir(SRC)).filter(f => f.endsWith('.png'));
let totalIn = 0, totalOut = 0;

for (const f of files) {
  const name = f.replace(/\.png$/, '');
  const src = path.join(SRC, f);
  const full = await sharp(src).webp({ quality: 82 }).toFile(path.join(OUT, `${name}.webp`));
  const sm = await sharp(src).resize(SM_SIZE, SM_SIZE).webp({ quality: 80 }).toFile(path.join(OUT_SM, `${name}.webp`));
  const inSize = (await sharp(src).metadata()).size ?? 0;
  totalIn += inSize;
  totalOut += full.size + sm.size;
  console.log(`${name}: ${(inSize / 1024).toFixed(0)}KB -> ${(full.size / 1024).toFixed(0)}KB + sm ${(sm.size / 1024).toFixed(1)}KB`);
}

console.log(`---\n${files.length} files: ${(totalIn / 1024).toFixed(0)}KB -> ${(totalOut / 1024).toFixed(0)}KB`);
