import { describe, it, expect, vi } from 'vitest';

// hidpi.ts value-imports Phaser for the Text factory; the pure half needs none of it.
vi.mock('phaser', () => ({ default: {} }));

import { chooseRatio, textResolution } from './hidpi';

describe('hi-dpi backing store', () => {
  it('leaves a 1x screen alone', () => {
    expect(chooseRatio(1, '')).toBe(1);
    expect(chooseRatio(0.8, '')).toBe(1);
  });

  it('rounds a fractional density UP, so no screen is ever upscaled', () => {
    expect(chooseRatio(1.25, '')).toBe(2);
    expect(chooseRatio(1.5, '')).toBe(2);
    expect(chooseRatio(2, '')).toBe(2);
  });

  it('caps at 2x — a 3x phone does not pay nine times the fill', () => {
    expect(chooseRatio(3, '')).toBe(2);
    expect(chooseRatio(4, '')).toBe(2);
  });

  it('?hidpi=0 turns it off wherever it sits in the query', () => {
    expect(chooseRatio(2, '?hidpi=0')).toBe(1);
    expect(chooseRatio(2, '?seed=a&hidpi=0')).toBe(1);
    expect(chooseRatio(2, '?hidpi=0&seed=a')).toBe(1);
    expect(chooseRatio(2, '?hidpi=01')).toBe(2);
    expect(chooseRatio(2, '?nothidpi=0')).toBe(2);
  });

  it('survives a nonsense density', () => {
    expect(chooseRatio(Number.NaN, '')).toBe(1);
    expect(chooseRatio(Number.POSITIVE_INFINITY, '')).toBe(1);
  });

  it('text stays at 1 until the canvas has actually been enlarged', () => {
    expect(textResolution()).toBe(1);
  });
});
