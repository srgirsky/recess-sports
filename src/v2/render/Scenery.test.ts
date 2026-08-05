// ---------------------------------------------------------------------------
// The scenery must stay scenery.
//
// Three ways a prop stops being set dressing and becomes a bug, each pinned:
//
//   1. IT REACHES THE FIELD. The sim never sees scenery, so a house inside
//      the fence would not stop a single ball — the fielder would run through
//      the porch and the play would look insane. Every planned footprint must
//      clear the fence by `CLEARANCE_FT` at its own spray angle.
//
//   2. IT FLOATS OFF THE TURF. The ground plane is finite (560x400, home 80ft
//      from the near edge — Field.ts). A prop past its edge sits on the void
//      and reads as a floating box in the establishing shot.
//
//   3. IT BLOWS THE BUDGET. The whole neighborhood must merge into a fixed,
//      small number of draw calls, or the look spike's 90-draw headroom
//      quietly disappears one shrub at a time.
//
// Determinism is asserted too: placement is hash-jittered, never random, so
// two loads (and two players' establishing shots) see the same park.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';
import { VENUE_GEOMETRY, type VenueId, fenceDistAt, pointAt } from '../sim/field';
import {
  CLEARANCE_FT,
  TURF_BOUND,
  buildScenery,
  sceneryPlan,
} from './Scenery';

const VENUES = Object.keys(VENUE_GEOMETRY) as VenueId[];

describe('sceneryPlan', () => {
  it('keeps every footprint beyond the fence, for every venue', () => {
    for (const venue of VENUES) {
      const geo = VENUE_GEOMETRY[venue];
      for (const item of sceneryPlan(geo, venue)) {
        const clearance = item.distFt - item.radiusFt - fenceDistAt(geo, item.sprayDeg);
        expect(clearance, `${venue}/${item.kind} at spray ${item.sprayDeg.toFixed(1)}°`).toBeGreaterThanOrEqual(
          CLEARANCE_FT - 1e-9
        );
      }
    }
  });

  it('keeps every footprint on the turf plane', () => {
    for (const venue of VENUES) {
      const geo = VENUE_GEOMETRY[venue];
      for (const item of sceneryPlan(geo, venue)) {
        const p = pointAt(item.sprayDeg, item.distFt);
        const label = `${venue}/${item.kind}`;
        expect(Math.abs(p.x) + item.radiusFt, label).toBeLessThanOrEqual(TURF_BOUND.maxAbsX);
        expect(p.z + item.radiusFt, label).toBeLessThanOrEqual(TURF_BOUND.maxZ);
        expect(p.z, label).toBeGreaterThanOrEqual(TURF_BOUND.minZ);
      }
    }
  });

  it('is deterministic — the same park every load', () => {
    for (const venue of VENUES) {
      const geo = VENUE_GEOMETRY[venue];
      expect(sceneryPlan(geo, venue)).toEqual(sceneryPlan(geo, venue));
    }
  });
});

describe('buildScenery', () => {
  it('merges the whole neighborhood into two draw calls, inside a triangle budget', () => {
    for (const venue of VENUES) {
      const build = buildScenery(VENUE_GEOMETRY[venue], venue);
      // One merged neighborhood mesh + one cloud mesh. A third child means a
      // prop escaped the merge and is spending a draw call on its own.
      expect(build.root.children.length, venue).toBe(2);
      let tris = 0;
      build.root.traverse((obj) => {
        const geom = (obj as { geometry?: { index?: { count: number } | null } }).geometry;
        if (geom?.index) tris += geom.index.count / 3;
      });
      // The scenery layer's whole budget. The Look Spike scene measured 109k
      // against a 180k ceiling; this keeps the neighborhood a rounding error.
      expect(tris, venue).toBeGreaterThan(1000);
      expect(tris, venue).toBeLessThan(25000);
      build.dispose();
    }
  });
});
