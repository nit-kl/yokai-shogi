// Convert the two imagegen originals into lightweight, project-owned runtime assets.
// node scripts/prepare-battle-backgrounds.mjs <landscape.png> <portrait.png>
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const [landscape, portrait] = process.argv.slice(2);
if (!landscape || !portrait) throw new Error('Provide landscape and portrait image paths');
const output = fileURLToPath(new URL('../client/public/assets/ui/', import.meta.url));
for (const [source, name, width] of [
  [landscape, 'battle-shrine.webp', 1536],
  [portrait, 'battle-shrine-mobile.webp', 768],
]) {
  const result = await sharp(source).resize({ width, withoutEnlargement: true })
    .webp({ quality: 80, effort: 6 }).toFile(output + name);
  console.log(`${name}: ${result.width}x${result.height}, ${(result.size / 1024).toFixed(1)} KiB`);
}
