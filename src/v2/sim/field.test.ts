import { describe, it, expect } from 'vitest';
import {
  BACKSTOP_Z,
  BASEPATH,
  BASE_COVER,
  DEFAULT_GEOMETRY,
  FIELD_POSITIONS,
  FIRST,
  FOUL_ANGLE_DEG,
  HOME,
  MOUND,
  MOUND_DIST,
  SECOND,
  THIRD,
  VENUE_GEOMETRY,
  type FieldGeometry,
  type PositionId,
  type VenueId,
  clampToField,
  dist,
  distFromHome,
  fenceDistAt,
  fenceIsConvex,
  fenceNormalAt,
  fencePointAt,
  halfWidthAt,
  isFair,
  moveToward,
  sprayOf,
} from './field';
import { V1_PX_PER_FT, v1PxToFt } from './units';

const VENUES = Object.keys(VENUE_GEOMETRY) as VenueId[];
const POSITIONS = Object.keys(FIELD_POSITIONS) as PositionId[];

describe('the diamond', () => {
  it('has four equal 60ft legs', () => {
    expect(dist(HOME, FIRST)).toBeCloseTo(BASEPATH, 6);
    expect(dist(FIRST, SECOND)).toBeCloseTo(BASEPATH, 6);
    expect(dist(SECOND, THIRD)).toBeCloseTo(BASEPATH, 6);
    expect(dist(THIRD, HOME)).toBeCloseTo(BASEPATH, 6);
  });

  it('puts 1B and 3B exactly on the ±45° foul lines', () => {
    expect(sprayOf(FIRST)).toBeCloseTo(FOUL_ANGLE_DEG, 6);
    expect(sprayOf(THIRD)).toBeCloseTo(-FOUL_ANGLE_DEG, 6);
  });

  it('puts 2B dead centre at 60·√2', () => {
    expect(sprayOf(SECOND)).toBeCloseTo(0, 6);
    expect(distFromHome(SECOND)).toBeCloseTo(BASEPATH * Math.SQRT2, 6);
  });

  it('puts the mound short of the diamond centre, as Little League does', () => {
    expect(MOUND.z).toBe(MOUND_DIST);
    // The geometric centre of the diamond is at z = 60·√2/2 = 42.43ft; a real
    // LL mound sits ~3.6ft BEYOND it. This is the check that catches someone
    // "simplifying" the mound onto the centre point.
    expect(MOUND_DIST).toBeGreaterThan((BASEPATH * Math.SQRT2) / 2);
    expect(MOUND_DIST - (BASEPATH * Math.SQRT2) / 2).toBeCloseTo(3.57, 1);
  });
});

describe('the fence', () => {
  it('hits its control points exactly', () => {
    const g = DEFAULT_GEOMETRY;
    expect(fenceDistAt(g, -45)).toBeCloseTo(g.fence.lf, 6);
    expect(fenceDistAt(g, -22.5)).toBeCloseTo(g.fence.lcf, 6);
    expect(fenceDistAt(g, 0)).toBeCloseTo(g.fence.cf, 6);
    expect(fenceDistAt(g, 22.5)).toBeCloseTo(g.fence.rcf, 6);
    expect(fenceDistAt(g, 45)).toBeCloseTo(g.fence.rf, 6);
  });

  it.each(VENUES)('%s: the interior is CONVEX', (id) => {
    // The load-bearing invariant, inherited from v1: a convex region is what
    // makes `moveToward` between two in-bounds points unable to exit, and what
    // guarantees a caromed ball always reflects back INTO the field. v1 proved
    // it analytically from `fenceBulge >= 0`; a radial profile has no such
    // one-liner, so this checks the boundary directly — which also catches a
    // concave dent from any combination of the five control points.
    expect(fenceIsConvex(VENUE_GEOMETRY[id])).toBe(true);
  });

  it('rejects a concave (inward-dented) profile', () => {
    // Proves the convexity check can actually fail — a test that only ever
    // passes is not a test.
    const dented: FieldGeometry = {
      ...DEFAULT_GEOMETRY,
      fence: { lf: 185, lcf: 205, cf: 120, rcf: 205, rf: 185 },
    };
    expect(fenceIsConvex(dented)).toBe(false);
  });

  it('gives an inward normal that points back toward home', () => {
    for (const id of VENUES) {
      const g = VENUE_GEOMETRY[id];
      for (let s = -45; s <= 45; s += 5) {
        const p = fencePointAt(g, s);
        const n = fenceNormalAt(g, s);
        expect(Math.hypot(n.x, n.z)).toBeCloseTo(1, 6);
        // Stepping along the normal must reduce the distance to home.
        const stepped = { x: p.x + n.x, z: p.z + n.z };
        expect(distFromHome(stepped)).toBeLessThan(distFromHome(p));
      }
    }
  });

  it("the sandlot's right-field porch is a real asymmetry", () => {
    const g = VENUE_GEOMETRY.sandlot;
    expect(g.fence.lf - g.fence.rf).toBeGreaterThanOrEqual(40);
    expect(fenceDistAt(g, 45)).toBeLessThan(fenceDistAt(g, -45));
    // ...and it must be CHEAPER to homer to right than to left at every
    // matching angle, which is the whole point of the venue.
    for (let s = 5; s <= 45; s += 5) {
      expect(fenceDistAt(g, s), `right at ${s}°`).toBeLessThan(fenceDistAt(g, -s));
    }
  });

  it('makes the new city fields physical places, not palette aliases', () => {
    const tin = VENUE_GEOMETRY.tin_can;
    const cement = VENUE_GEOMETRY.cement;
    expect(tin.fenceHeight).toBeGreaterThan(VENUE_GEOMETRY.blacktop.fenceHeight);
    expect(tin.fence.cf).toBeLessThan(cement.fence.cf);
    expect(cement.rollFriction).toBeLessThan(VENUE_GEOMETRY.park.rollFriction);
    expect(cement.rollFriction).toBeGreaterThan(VENUE_GEOMETRY.blacktop.rollFriction);
    expect(cement.bounceMult).toBeLessThan(VENUE_GEOMETRY.blacktop.bounceMult);
  });

  it('rejects a fence that spikes at the foul pole', () => {
    // The sandlot's first draft. Deepest-at-the-pole is concave at
    // left-centre; keep the counterexample so nobody re-introduces it while
    // chasing "deep left field".
    const spiked: FieldGeometry = {
      ...DEFAULT_GEOMETRY,
      fence: { lf: 205, lcf: 200, cf: 200, rcf: 176, rf: 150 },
    };
    expect(fenceIsConvex(spiked)).toBe(false);
  });
});

describe('defensive positions', () => {
  it.each(VENUES)('%s: every post is fair, in front of the fence, clear of obstacles', (id) => {
    const g = VENUE_GEOMETRY[id];
    for (const pos of POSITIONS) {
      const p = FIELD_POSITIONS[pos];
      if (pos !== 'C') {
        expect(isFair(p), `${pos} must be in fair territory`).toBe(true);
      }
      expect(distFromHome(p), `${pos} must be in front of the fence`).toBeLessThan(
        fenceDistAt(g, sprayOf(p))
      );
      for (const o of g.obstacles) {
        expect(
          Math.hypot(p.x - o.x, p.z - o.z),
          `${pos} must stand clear of the ${o.kind}`
        ).toBeGreaterThan(o.r + 6);
      }
    }
  });

  it('every base has a coverer, and it is not the pitcher', () => {
    for (const base of [1, 2, 3, 4] as const) {
      const cover = BASE_COVER[base];
      expect(POSITIONS).toContain(cover);
      expect(cover).not.toBe('P');
    }
  });

  it('★ puts the outfield at real Little League depth — the v1 balance fix', () => {
    // THE regression this whole rewrite exists to prevent. v1's outfielders
    // stood at 1.49 basepaths (89ft at 60ft bases) where Little League is
    // 2.5-2.9, so no ball could land in a gap and every ball a fielder reached
    // was an out at first. If someone ever re-compresses the outfield, this
    // fails before the statistical bands do.
    for (const pos of ['LF', 'CF', 'RF'] as const) {
      const legs = distFromHome(FIELD_POSITIONS[pos]) / BASEPATH;
      expect(legs, `${pos} depth in basepaths`).toBeGreaterThanOrEqual(2.5);
      expect(legs, `${pos} depth in basepaths`).toBeLessThanOrEqual(2.9);
    }
    // ...and the fence beyond them, at 3.0-3.6 basepaths.
    for (const id of VENUES) {
      const g = VENUE_GEOMETRY[id];
      for (const s of [-45, -22.5, 0, 22.5, 45]) {
        const legs = fenceDistAt(g, s) / BASEPATH;
        expect(legs, `${id} fence at spray ${s}`).toBeGreaterThanOrEqual(2.4);
        expect(legs, `${id} fence at spray ${s}`).toBeLessThanOrEqual(3.6);
      }
    }
  });

  it('documents exactly how far v1 was off', () => {
    // v1's CF post was (480, 232) in a space whose home was (480, 500):
    // 268px deep. This is the arithmetic from the plan, pinned so the finding
    // survives in code and not just in prose.
    const v1CfFt = v1PxToFt(268);
    expect(V1_PX_PER_FT).toBeCloseTo(2.994, 3);
    expect(v1CfFt).toBeCloseTo(89.5, 1);
    expect(v1CfFt / BASEPATH).toBeCloseTo(1.49, 2);

    const v2CfLegs = distFromHome(FIELD_POSITIONS.CF) / BASEPATH;
    expect(v2CfLegs / (v1CfFt / BASEPATH)).toBeGreaterThan(1.8); // ~1.84x deeper
  });
});

describe('clampToField', () => {
  it.each(VENUES)('%s: always returns a point inside the field', (id) => {
    const g = VENUE_GEOMETRY[id];
    // Sweep a grid in CARTESIAN, so points behind and beside the plate (where
    // spray angle wraps past ±90°) are covered — that region is exactly what
    // an angular clamp got wrong, by teleporting the catcher into fair ground.
    for (let x = -400; x <= 400; x += 11) {
      for (let z = -80; z <= 400; z += 11) {
        const p = clampToField(g, { x, z });
        expect(p.z, 'in front of the backstop').toBeGreaterThanOrEqual(BACKSTOP_Z - 1e-6);
        expect(Math.abs(p.x), 'inside the widened foul cone').toBeLessThanOrEqual(
          halfWidthAt(p.z) + 1e-6
        );
        if (p.z > 0 && Math.abs(sprayOf(p)) <= 90) {
          expect(distFromHome(p), 'in front of the fence').toBeLessThanOrEqual(
            fenceDistAt(g, sprayOf(p)) + 1e-6
          );
        }
      }
    }
  });

  it('leaves the catcher alone', () => {
    // The regression: sprayOf({x:0, z:-5}) is 180°, not 0°, so an angular
    // clamp folded the catcher 4ft into fair territory every single tick.
    const c = clampToField(DEFAULT_GEOMETRY, FIELD_POSITIONS.C);
    expect(c.x).toBeCloseTo(FIELD_POSITIONS.C.x, 9);
    expect(c.z).toBeCloseTo(FIELD_POSITIONS.C.z, 9);
  });

  it('leaves an already-legal point untouched', () => {
    const g = DEFAULT_GEOMETRY;
    for (const pos of POSITIONS) {
      const p = FIELD_POSITIONS[pos];
      const c = clampToField(g, p);
      expect(c.x).toBeCloseTo(p.x, 6);
      expect(c.z).toBeCloseTo(p.z, 6);
    }
  });

  it.each(VENUES)('%s: moveToward between two in-bounds points never exits', (id) => {
    // The property convexity buys us. If this ever fails, the fence profile
    // went concave and `fenceIsConvex` should have caught it first.
    const g = VENUE_GEOMETRY[id];
    const inside = POSITIONS.map((p) => FIELD_POSITIONS[p]).concat([HOME, MOUND, SECOND]);
    for (const a of inside) {
      for (const b of inside) {
        for (let t = 0; t <= 1.0001; t += 0.05) {
          const p = moveToward(a, b, dist(a, b) * t);
          expect(distFromHome(p)).toBeLessThanOrEqual(fenceDistAt(g, sprayOf(p)) + 1e-6);
        }
      }
    }
  });
});
