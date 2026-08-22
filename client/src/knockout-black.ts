/** 純黒に近いピクセルを透過にする。金・朱・狐火の色は残す */

export function knockoutAlpha(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min >= 18 && max >= 28) return 255;
  if (max <= 12) return 0;
  if (max <= 40) return Math.round(255 * (max - 12) / 28);
  return 255;
}

export function applyKnockout(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i + 3] = Math.min(data[i + 3], knockoutAlpha(data[i], data[i + 1], data[i + 2]));
  }
}

export function opaqueBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  alphaMin = 10,
): { x: number; y: number; w: number; h: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] >= alphaMin) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
