import { describe, expect, it } from 'vitest';
import { applyKnockout, knockoutAlpha, opaqueBounds } from '../client/src/knockout-black';

describe('knockout-black', () => {
  it('clears pure black and keeps gold / foxfire', () => {
    expect(knockoutAlpha(0, 0, 0)).toBe(0);
    expect(knockoutAlpha(8, 6, 4)).toBe(0);
    expect(knockoutAlpha(232, 196, 106)).toBe(255);
    expect(knockoutAlpha(80, 200, 255)).toBe(255);
    expect(knockoutAlpha(200, 40, 50)).toBe(255);
  });

  it('softens near-black edges', () => {
    const mid = knockoutAlpha(24, 22, 20);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(255);
  });

  it('writes alpha into a pixel buffer and finds the opaque box', () => {
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) data[i + 3] = 255;
    data.set([0, 0, 0, 255], 0);
    data.set([232, 196, 106, 255], (1 * width + 1) * 4);
    applyKnockout(data);
    expect(data[3]).toBe(0);
    expect(data[(1 * width + 1) * 4 + 3]).toBe(255);
    expect(opaqueBounds(data, width, height)).toEqual({ x: 1, y: 1, w: 1, h: 1 });
  });
});
