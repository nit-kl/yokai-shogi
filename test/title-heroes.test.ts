import { describe, expect, it } from 'vitest';
import { pickTitleLayout, TITLE_HEROES } from '../client/src/title-heroes';

function seq(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

describe('title heroes', () => {
  it('cycles the three featured yokai in the center', () => {
    expect(TITLE_HEROES).toEqual(['kyubi', 'ibaraki', 'tamamo']);
    expect(pickTitleLayout(seq([0, 0.9])).center).toBe('kyubi');
    expect(pickTitleLayout(seq([0.4, 0.9])).center).toBe('ibaraki');
    expect(pickTitleLayout(seq([0.9, 0.9])).center).toBe('tamamo');
  });

  it('puts the other two on the sides without duplicating the center', () => {
    const layout = pickTitleLayout(seq([0, 0.9]));
    expect(layout.center).toBe('kyubi');
    expect(new Set([layout.left, layout.right, layout.center]).size).toBe(3);
    expect([layout.left, layout.right].sort()).toEqual(['ibaraki', 'tamamo']);
  });
});
