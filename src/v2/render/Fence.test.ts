// The backstop is a fence you see through, not a slab. From the live cameras
// 40 degrees above the field the old solid box read as a dark bar floating
// under home plate (2026-09-29 playthrough; a raycast named it). A solid face
// is open 0% of its area, so the first test fails on it.
import { describe, expect, it } from 'vitest';
import { CHAIN_LINK, buildFence, chainLinkOpen } from './Fence';
import { VENUE_GEOMETRY } from '../sim/field';
import { VENUE_LOOKS } from './Field';
import { OutlineRegistry } from './materials/outline';

describe('the backstop is chain link', () => {
  it('is mostly open air below its rail', () => {
    let open = 0;
    let n = 0;
    for (let i = 0; i < 400; i++) {
      for (let j = 0; j < 120; j++) {
        const v = (j + 0.5) / 120 * (1 - CHAIN_LINK.railShare);
        if (chainLinkOpen((i + 0.5) / 400, v)) open++;
        n++;
      }
    }
    expect(open / n).toBeGreaterThan(0.55);
  });

  it('keeps a solid top rail so it still reads as a fence', () => {
    expect(chainLinkOpen(0.5, 0.99)).toBe(false);
  });

  it('ships the chain-link material on the backstop mesh', () => {
    const outlines = new OutlineRegistry();
    const { root } = buildFence(VENUE_GEOMETRY.park, VENUE_LOOKS.park, outlines);
    const back = root.getObjectByName('backstop') as unknown as { material: { customProgramCacheKey(): string } };
    expect(back.material.customProgramCacheKey()).toBe('chain-link-backstop');
  });
});
