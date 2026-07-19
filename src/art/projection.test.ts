// ---------------------------------------------------------------------------
// Projection guards: round-trips are exact (input must land where the sim
// thinks it is), the center column is fixed, and depth behaves.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { project, unproject, depthScale, depthAt } from './projection';
import { HOME, FIRST, SECOND, THIRD, MOUND, FENCE_Y } from '../systems/geometry';

describe('the 3/4 projection', () => {
  it('unproject(project(p)) round-trips exactly', () => {
    for (const p of [HOME, FIRST, SECOND, THIRD, MOUND, { x: 132, y: FENCE_Y }, { x: 828, y: FENCE_Y }, { x: 700, y: 260 }]) {
      const back = unproject(project(p));
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it('the center column never moves (home, mound, second stay put)', () => {
    for (const p of [HOME, MOUND, SECOND]) {
      expect(project(p).x).toBeCloseTo(p.x, 6);
      expect(project(p).y).toBe(p.y);
    }
  });

  it('pinches symmetrically toward the fence', () => {
    const l = project({ x: 132, y: FENCE_Y });
    const r = project({ x: 828, y: FENCE_Y });
    expect(l.x).toBeGreaterThan(132); // pulled inward
    expect(r.x).toBeLessThan(828);
    expect(l.x - 132).toBeCloseTo(828 - r.x, 6); // same amount each side
    // Near the plate there is almost no pinch (~3% of the offset from center).
    expect(project({ x: 132, y: HOME.y }).x - 132).toBeLessThan(12);
  });

  it('kids shrink with depth, never below the far cap', () => {
    expect(depthScale(HOME)).toBeGreaterThan(depthScale(FIRST));
    expect(depthScale(FIRST)).toBeGreaterThan(depthScale({ x: 480, y: 225 }));
    expect(depthScale({ x: 480, y: 0 })).toBeCloseTo(depthScale({ x: 480, y: FENCE_Y }), 6); // clamped
    expect(depthAt(FENCE_Y)).toBe(1);
    expect(depthAt(HOME.y + 40)).toBe(0);
  });
});
