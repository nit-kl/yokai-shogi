import sharp from 'sharp';
import path from 'node:path';

const pairs = process.argv.slice(2);
if (!pairs.length || pairs.length % 2) {
  throw new Error('Usage: node scripts/process-chroma-assets.mjs <input> <output.webp> [...]');
}

for (let pair = 0; pair < pairs.length; pair += 2) {
  const input = pairs[pair];
  const output = pairs[pair + 1];
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const rgba = Buffer.alloc(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const source = i * channels;
    const target = i * 4;
    const r = data[source];
    const g = data[source + 1];
    const b = data[source + 2];
    const greenDominance = g - Math.max(r, b);
    const chromaArtifact = r < 90 && g > 105;
    const alpha = chromaArtifact || greenDominance >= 100
      ? 0
      : greenDominance <= 24
        ? 255
        : Math.round(255 * (100 - greenDominance) / 76);

    rgba[target] = r;
    rgba[target + 1] = alpha < 255 ? Math.min(g, Math.max(r, b) + 18) : g;
    rgba[target + 2] = b;
    rgba[target + 3] = alpha;
  }

  const image = sharp(rgba, { raw: { width, height, channels: 4 } }).resize(512, 512);
  await image.clone().webp({ quality: 88, alphaQuality: 95 }).toFile(output);
  const smallOutput = path.join(path.dirname(output), 'sm', path.basename(output));
  await image.resize(160, 160).webp({ quality: 84, alphaQuality: 92 }).toFile(smallOutput);
  console.log(`${output}\n${smallOutput}`);
}
