// ---------------------------------------------------------------------------
// Projection guards: round-trips are exact (input must land where the sim
// thinks it is), the center column is fixed, and depth behaves.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { project, unproject, depthScale, depthAt, ZOOM } from './projection';
import { HOME, FIRST, SECOND, THIRD, MOUND, FENCE_Y, FIELD_BOTTOM_Y } from '../systems/geometry';
import { GAME_HEIGHT, HUD } from '../config';

describe('the 3/4 projection', () => {
  it('unproject(project(p)) round-trips exactly', () => {
    // The load-bearing one. Pointer input comes back through unproject, so a
    // y transform without a matching inverse puts every tap in the wrong place
    // — and the failure is silent, because the wrong place is still on the
    // field. The off-axis, off-focal-plane points are the ones that catch a
    // depth read taken on the wrong y.
    for (const p of [
      HOME,
      FIRST,
      SECOND,
      THIRD,
      MOUND,
      { x: 132, y: FENCE_Y },
      { x: 828, y: FENCE_Y },
      { x: 700, y: 260 },
      { x: 200, y: 560 },
      { x: 900, y: 320 },
    ]) {
      const back = unproject(project(p));
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it('the center column never moves sideways (home, mound, second stay on axis)', () => {
    for (const p of [HOME, MOUND, SECOND]) {
      expect(project(p).x).toBeCloseTo(p.x, 6);
    }
  });

  it('pinches symmetrically toward the fence', () => {
    const l = project({ x: 132, y: FENCE_Y });
    const r = project({ x: 828, y: FENCE_Y });
    expect(480 - l.x).toBeCloseTo(r.x - 480, 6); // same amount each side
    // The pinch is a FRACTION of the offset from centre, so it survives the
    // zoom: a fence point is pulled in relative to where the zoom alone put it.
    expect(l.x).toBeGreaterThan(480 - (480 - 132) * ZOOM);
    expect(r.x).toBeLessThan(480 + (828 - 480) * ZOOM);
  });

  it('kids shrink with depth, never below the far cap', () => {
    expect(depthScale(HOME)).toBeGreaterThan(depthScale(FIRST));
    expect(depthScale(FIRST)).toBeGreaterThan(depthScale({ x: 480, y: 225 }));
    expect(depthScale({ x: 480, y: 0 })).toBeCloseTo(depthScale({ x: 480, y: FENCE_Y }), 6); // clamped
    expect(depthAt(FENCE_Y)).toBe(1);
    expect(depthAt(HOME.y + 40)).toBe(0);
  });

  it('kids do NOT grow with the field zoom', () => {
    // The whole point of the dolly: BB's fielder is ~20% of a basepath tall,
    // ours was 33%. Scaling sprites with the field would have kept it at 33%.
    // depth 0 is the batter's-box plane (HOME.y + 40), and a kid standing
    // there draws at exactly 1x no matter what the field zoom is.
    expect(depthScale({ x: 480, y: HOME.y + 40 })).toBe(1);
    expect(depthScale({ x: 480, y: FENCE_Y })).toBeLessThan(1);
  });

  it('the zoom keeps the playable field on screen', () => {
    // The four constraints ZOOM is pinned by. Raising it without re-checking
    // these puts the catcher behind the scoreboard or the bottom of the foul
    // ground off the canvas.
    expect(project({ x: 480, y: FIELD_BOTTOM_Y }).y).toBeLessThanOrEqual(GAME_HEIGHT);
    expect(project({ x: 480, y: 540 }).y).toBeLessThan(HUD.STRIP.TOP); // the catcher's spot
    expect(project(HOME).y).toBeLessThan(HUD.STRIP.TOP);
    // The fence needs headroom above it for its own structure and the skyline.
    expect(project({ x: 480, y: FENCE_Y - 24 }).y).toBeGreaterThan(90);
  });
});
