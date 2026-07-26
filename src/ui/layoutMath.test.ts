import { describe, it, expect } from 'vitest';
import {
  solveRow,
  solveColumn,
  overlaps,
  contains,
  insideFrame,
  intersection,
  DEFAULT_MIN_SCALE,
} from './layoutMath';

/** Left/right edges of an item, from a solved row. */
function edges(offsets: number[], widths: number[], scale = 1) {
  return offsets.map((o, i) => [o - (widths[i] * scale) / 2, o + (widths[i] * scale) / 2]);
}

describe('solveRow', () => {
  it('centers a lone item on the row origin', () => {
    const r = solveRow({ widths: [120], gap: 16 });
    expect(r.offsets).toEqual([0]);
    expect(r.width).toBe(120);
    expect(r.scale).toBe(1);
  });

  it('returns an empty solution for an empty row', () => {
    expect(solveRow({ widths: [], gap: 16 }).offsets).toEqual([]);
  });

  it('distributes items symmetrically about the origin', () => {
    for (const widths of [
      [100, 100],
      [80, 120, 80],
      [60, 60, 60, 60],
      [40, 90, 40, 90, 40],
    ]) {
      const r = solveRow({ widths, gap: 20 });
      const e = edges(r.offsets, widths);
      expect(e[0][0]).toBeCloseTo(-r.width / 2, 6);
      expect(e[e.length - 1][1]).toBeCloseTo(r.width / 2, 6);
    }
  });

  it('leaves exactly `gap` between adjacent items', () => {
    const widths = [176, 192, 84];
    const r = solveRow({ widths, gap: 16 });
    const e = edges(r.offsets, widths);
    expect(e[1][0] - e[0][1]).toBeCloseTo(16, 6);
    expect(e[2][0] - e[1][1]).toBeCloseTo(16, 6);
  });

  it('never produces overlapping items when it reports scale 1', () => {
    const widths = [176, 192];
    const r = solveRow({ widths, gap: 16, maxW: 480 });
    expect(r.scale).toBe(1);
    expect(r.overflow).toBe(false);
    const e = edges(r.offsets, widths);
    expect(e[1][0]).toBeGreaterThan(e[0][1]);
  });

  it('spends the gap down to minGap BEFORE scaling anything', () => {
    // 3x100 wants 3x100 + 2x40 = 380; budget 340 is reachable on gap alone.
    const r = solveRow({ widths: [100, 100, 100], gap: 40, minGap: 10, maxW: 340 });
    expect(r.scale).toBe(1);
    expect(r.gap).toBeCloseTo(20, 6);
    expect(r.width).toBeCloseTo(340, 6);
  });

  it('only scales once the gap has bottomed out', () => {
    // 2x200 + minGap 10 = 410 against a 380 budget -> 0.927, above the floor.
    const r = solveRow({ widths: [200, 200], gap: 40, minGap: 10, maxW: 380 });
    expect(r.gap).toBe(10);
    expect(r.scale).toBeCloseTo(380 / 410, 6);
    expect(r.width).toBeCloseTo(380, 6);
    expect(r.overflow).toBe(false);
  });

  it('clamps at minScale and reports overflow rather than squashing to nothing', () => {
    const r = solveRow({ widths: [400, 400], gap: 20, minGap: 10, maxW: 200 });
    expect(r.scale).toBe(DEFAULT_MIN_SCALE);
    expect(r.overflow).toBe(true);
    expect(r.width).toBeGreaterThan(200);
  });

  // --- Regression cases lifted from the GAME SETUP overlap bug ----------------

  it('proves OOPSIES + HELPERS cannot share one row in the left column', () => {
    // ON(84) OFF(84) SWING SPOT(176) PITCH LOCATOR(192) in the 480px the field
    // preview leaves. This is the arrangement that shipped `SWING SPOT` sitting
    // on top of `OFF`. If someone merges these back into one row, this fails.
    const r = solveRow({ widths: [84, 84, 176, 192], gap: 16, maxW: 480 });
    expect(r.overflow).toBe(true);
  });

  it('fits the HELPERS pair once it has a row to itself', () => {
    const widths = [176, 192];
    const r = solveRow({ widths, gap: 16, maxW: 480 });
    expect(r.overflow).toBe(false);
    expect(r.scale).toBe(1);
    expect(r.width).toBeLessThanOrEqual(480);
  });

  it('fits the four difficulty pills that used to collide at a 108px pitch', () => {
    // TEE-BALL measures ~133 at fontSize 15 — wider than the old hardcoded
    // pitch, which is why TEE-BALL overlapped EASY.
    const r = solveRow({ widths: [133, 92, 110, 100], gap: 14, minGap: 10, maxW: 480 });
    expect(r.overflow).toBe(false);
    const e = edges(r.offsets, [133, 92, 110, 100], r.scale);
    for (let i = 1; i < e.length; i++) expect(e[i][0]).toBeGreaterThanOrEqual(e[i - 1][1] - 1e-9);
  });
});

describe('solveColumn', () => {
  it('stacks from the top with exactly `gap`', () => {
    const c = solveColumn([40, 60, 40], { top: 100, gap: 10 });
    expect(c).toEqual([120, 180, 240]);
  });

  it('returns nothing for no rows', () => {
    expect(solveColumn([], { top: 0, gap: 10 })).toEqual([]);
  });

  it('space-between spreads the slack evenly across the gaps', () => {
    // 3 rows of 40 in a 300px budget: 300 - 120 content - 2x10 base gap = 160
    // slack, split over 2 gaps -> each gap becomes 90.
    const c = solveColumn([40, 40, 40], { top: 0, bottom: 300, gap: 10, justify: 'space-between' });
    expect(c).toEqual([20, 150, 280]);
    // The last row's bottom edge lands exactly on the budget.
    expect(c[c.length - 1] + 20).toBe(300);
  });

  it('space-between never tightens below the requested gap', () => {
    const c = solveColumn([100, 100, 100], { top: 0, bottom: 200, gap: 12, justify: 'space-between' });
    expect(c[1] - c[0]).toBeCloseTo(112, 6);
  });

  it('keeps rows non-overlapping for any budget', () => {
    const heights = [33, 44, 33, 50];
    const c = solveColumn(heights, { top: 88, bottom: 570, gap: 8, justify: 'space-between' });
    for (let i = 1; i < c.length; i++) {
      expect(c[i] - heights[i] / 2).toBeGreaterThanOrEqual(c[i - 1] + heights[i - 1] / 2 - 1e-9);
    }
  });
});

describe('collision predicates', () => {
  const a = { x: 100, y: 100, w: 100, h: 40 };

  it('does not call exactly-touching edges an overlap', () => {
    expect(overlaps(a, { x: 200, y: 100, w: 100, h: 40 })).toBe(false);
  });

  it('detects a real overlap on both axes', () => {
    expect(overlaps(a, { x: 180, y: 100, w: 100, h: 40 })).toBe(true);
  });

  it('ignores boxes that share an x span but not a y span', () => {
    expect(overlaps(a, { x: 100, y: 200, w: 100, h: 40 })).toBe(false);
  });

  it('honors the tolerance', () => {
    const nudged = { x: 199, y: 100, w: 100, h: 40 }; // 1px of overlap
    expect(overlaps(a, nudged)).toBe(true);
    expect(overlaps(a, nudged, 2)).toBe(false);
  });

  it('reports the intersecting region', () => {
    expect(intersection(a, { x: 180, y: 100, w: 100, h: 40 })).toEqual({ x: 140, y: 100, w: 20, h: 40 });
    expect(intersection(a, { x: 400, y: 100, w: 100, h: 40 })).toBeNull();
  });

  it('treats a label inside its panel as contained, not overlapping', () => {
    const label = { x: 100, y: 100, w: 60, h: 20 };
    expect(contains(a, label)).toBe(true);
    expect(contains(label, a)).toBe(false);
  });

  it('checks the canvas frame with a margin', () => {
    expect(insideFrame({ x: 480, y: 320, w: 200, h: 100 })).toBe(true);
    expect(insideFrame({ x: 916, y: 470, w: 56, h: 44 })).toBe(true);
    expect(insideFrame({ x: 916, y: 470, w: 56, h: 44 }, 960, 640, 20)).toBe(false);
    expect(insideFrame({ x: 480, y: 10, w: 200, h: 60 })).toBe(false);
  });
});
