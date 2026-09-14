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

/** 黒背景切り抜きの残渣: 角の黒、輪郭のにじみ、半透明の黒ハロを落とす */
export function cleanBlackCutoutRaw(data, width, height) {
  const n = width * height;
  const lumaAt = i => {
    const o = i * 4;
    return (data[o] * 3 + data[o + 1] * 6 + data[o + 2]) / 10;
  };
  const chromaAt = i => {
    const o = i * 4;
    return Math.max(data[o], data[o + 1], data[o + 2]) - Math.min(data[o], data[o + 1], data[o + 2]);
  };
  const glowAt = i => {
    const o = i * 4;
    return Math.max(data[o], data[o + 1], data[o + 2]) >= 88 && chromaAt(i) >= 22;
  };

  const kill = new Uint8Array(n);
  const q = [];
  const push = i => {
    if (kill[i]) return;
    kill[i] = 1;
    q.push(i);
  };
  const tryBg = i => {
    if (kill[i] || glowAt(i)) return;
    const a = data[i * 4 + 3];
    if (a > 160) return;
    const y = lumaAt(i);
    const c = chromaAt(i);
    if (a < 16 || (a < 48 && y < 12 && c < 10)) push(i);
  };

  for (let x = 0; x < width; x++) {
    tryBg(x);
    tryBg((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    tryBg(y * width);
    tryBg(y * width + width - 1);
  }
  while (q.length) {
    const i = q.pop();
    const x = i % width;
    const y = (i / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        tryBg(ny * width + nx);
      }
    }
  }

  for (let i = 0; i < n; i++) {
    if (!kill[i]) continue;
    const o = i * 4;
    data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 0;
  }

  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) alpha[i] = data[i * 4 + 3];

  const nearClear = i => {
    const x = i % width;
    const y = (i / width) | 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return true;
        if (data[(ny * width + nx) * 4 + 3] < 20) return true;
      }
    }
    return false;
  };

  for (let i = 0; i < n; i++) {
    if (!alpha[i]) continue;
    const o = i * 4;
    const y = lumaAt(i);
    const c = chromaAt(i);
    const edge = nearClear(i);
    let a = alpha[i];
    if (edge && !glowAt(i) && y < 14 && c < 10) a = 0;
    if (a > 0 && a < 230 && y < 36 && c < 14) {
      a = Math.round(a * (y / 36) * (a / 255));
    }
    if (a < 8 && !glowAt(i)) a = 0;
    else if (a > 250) a = 255;
    if (a > 0 && a < 200 && edge && y < 32 && c < 12) {
      const f = 255 / a;
      data[o] = Math.min(255, Math.round(data[o] * f));
      data[o + 1] = Math.min(255, Math.round(data[o + 1] * f));
      data[o + 2] = Math.min(255, Math.round(data[o + 2] * f));
    }
    data[o + 3] = a;
  }
  return data;
}

export async function cleanBlackCutout(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  cleanBlackCutoutRaw(data, info.width, info.height);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
}

/** rembg せず、四隅からつながる真っ黒だけ抜く。雲・水しぶきなどの画素は残す */
export function knockoutBorderBlackRaw(data, width, height) {
  const n = width * height;
  const isVoid = i => {
    const o = i * 4;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    return Math.max(r, g, b) <= 16 && Math.max(r, g, b) - Math.min(r, g, b) <= 6;
  };
  const kill = new Uint8Array(n);
  const q = [];
  const push = i => {
    if (kill[i] || !isVoid(i)) return;
    kill[i] = 1;
    q.push(i);
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (q.length) {
    const i = q.pop();
    const x = i % width;
    const y = (i / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        push(ny * width + nx);
      }
    }
  }
  for (let i = 0; i < n; i++) {
    if (!kill[i]) continue;
    const o = i * 4;
    data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 0;
  }
  return data;
}

export async function importBlackBgOriginal(src, id, root, { full = 512, sm = 160 } = {}) {
  const { mkdir } = await import('node:fs/promises');
  const path = await import('node:path');
  const stock = path.join(root, `client/public/assets/pieces/stock/${id}.png`);
  const out = path.join(root, 'client/public/assets/pieces');
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  knockoutBorderBlackRaw(data, info.width, info.height);
  const rgba = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  await mkdir(path.dirname(stock), { recursive: true });
  await sharp(rgba).png().toFile(stock);
  const fitted = sharp(rgba).resize(full, full, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  const fullOut = await fitted.clone().webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(out, `${id}.webp`));
  const smOut = await fitted.clone().resize(sm, sm).webp({ quality: 86, alphaQuality: 95 }).toFile(path.join(out, `sm/${id}.webp`));
  return { full: fullOut, sm: smOut };
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
