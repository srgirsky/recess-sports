// ---------------------------------------------------------------------------
// Field geometry, in FEET. PURE — shared by the sim and the renderer, so the
// two can never disagree (the same discipline as v1's systems/geometry.ts).
//
// COORDINATE SYSTEM — right-handed, Y-up, matching three.js so the renderer
// needs no axis conversion at all:
//
//        +Z  centre field
//         |
//   3B ---+--- 1B      -X is the third-base side, +X the first-base side
//         |
//        home = ORIGIN (0, 0, 0),  +Y is up
//
// The foul lines run at exactly ±45° in world space. v1 carried a measured
// `FOUL_SLOPE` of 1.2 (band 1.197-1.241) as a FIELD property; that number is
// really a CAMERA property — it is what a real 45° foul line PROJECTS to on
// screen — and it is asserted as such in render/cameraCues.test.ts.
// ---------------------------------------------------------------------------

import { DEG, clamp, toDeg } from './units';

export interface Vec2 {
  /** ft, +X toward first base. */
  x: number;
  /** ft, +Z toward centre field. */
  z: number;
}

export interface Vec3 extends Vec2 {
  /** ft, +Y up. */
  y: number;
}

// --- The diamond ------------------------------------------------------------

/** One basepath leg (ft). Little League majors. */
export const BASEPATH = 60;

/** Front of the pitching rubber to the rear point of home plate (ft). */
export const MOUND_DIST = 46;

/** Home plate to the backstop (ft). */
export const PLATE_TO_BACKSTOP = 22;

/** Foul lines run at ±45° from the +Z axis. */
export const FOUL_ANGLE_DEG = 45;

const LEG = BASEPATH / Math.SQRT2; // 42.4264 — the x/z component of a 45° leg

export const HOME: Vec2 = { x: 0, z: 0 };
export const FIRST: Vec2 = { x: LEG, z: LEG };
export const SECOND: Vec2 = { x: 0, z: BASEPATH * Math.SQRT2 };
export const THIRD: Vec2 = { x: -LEG, z: LEG };
export const MOUND: Vec2 = { x: 0, z: MOUND_DIST };

/** Position for a base index: 0 & 4 = home, 1/2/3 = the bases. */
export function basePos(idx: number): Vec2 {
  switch (idx) {
    case 1:
      return FIRST;
    case 2:
      return SECOND;
    case 3:
      return THIRD;
    default:
      return HOME; // 0 (batter) and 4 (scored)
  }
}

// --- Spray angle ------------------------------------------------------------

/**
 * Spray angle in degrees: 0 = dead centre (+Z), negative = toward left field
 * (third-base side), positive = toward right field. Fair territory is
 * |spray| <= 45.
 */
export function sprayOf(p: Vec2): number {
  return toDeg(Math.atan2(p.x, p.z));
}

export function distFromHome(p: Vec2): number {
  return Math.hypot(p.x, p.z);
}

/** The point at `dist` ft from home along `sprayDeg`. */
export function pointAt(sprayDeg: number, dist: number): Vec2 {
  const a = sprayDeg * DEG;
  return { x: Math.sin(a) * dist, z: Math.cos(a) * dist };
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Step `from` toward `to` by at most `maxStep` ft. Never overshoots. */
export function moveToward(from: Vec2, to: Vec2, maxStep: number): Vec2 {
  const d = dist(from, to);
  if (d <= maxStep || d === 0) return { x: to.x, z: to.z };
  const t = maxStep / d;
  return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
}

export function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

// --- Venue geometry ---------------------------------------------------------

/**
 * The fence as a RADIAL distance function of spray angle, sampled at five
 * control points and LINEARLY interpolated between them.
 *
 * This replaces v1's chord-plus-bulge parameterisation, where a "short right
 * porch" had to be expressed as a screen-y offset and the pole x's derived
 * back out through the foul slope. Here a porch is just a smaller number: the
 * sandlot's right field is literally 150ft.
 *
 * ★ LINEAR, NOT SMOOTHSTEP — and this is not a style preference.
 *
 * A polar curve r(θ) is locally convex iff r² + 2r'² − r·r'' ≥ 0. Smoothstep
 * lands r' = 0 and r'' = 6·Δr·(dt/dθ)² at every knot, so at the poles the test
 * reduces to r ≥ 6·Δr·(dt/dθ)², i.e. a 22.5°-wide segment at r = 185ft may
 * rise at most **4.75ft** before the wall dents INWARD. Every real profile
 * here rises 7-27ft, so smoothstep is concave at all five knots — which
 * silently breaks fence caroms (a ball can reflect out of the field) and
 * `moveToward` containment. Linear gives r'' = 0, so r² + 2r'² > 0 always.
 *
 * `fenceIsConvex` is the gate; the arithmetic above is why it is not optional.
 */
export interface FenceProfile {
  /** ft from home down the left-field foul line. */
  lf: number;
  /** ft to left-centre (spray -22.5°). */
  lcf: number;
  /** ft to dead centre. */
  cf: number;
  /** ft to right-centre (spray +22.5°). */
  rcf: number;
  /** ft down the right-field foul line. */
  rf: number;
}

export interface Obstacle {
  x: number;
  z: number;
  /** ft. */
  r: number;
  kind: 'tree';
}

export interface FieldGeometry {
  fence: FenceProfile;
  /** Height of the outfield wall (ft) — a ball must clear this to be a homer. */
  fenceHeight: number;
  /** Coefficient of restitution off the wall. */
  wallRestitution: number;
  /** Rolling friction coefficient (μ_r): grass 0.28, dirt 0.18, asphalt 0.10. */
  rollFriction: number;
  /** Bounce liveliness multiplier applied to the ground restitution. */
  bounceMult: number;
  obstacles: Obstacle[];
}

/** Fence distance (ft from home) at a spray angle. */
export function fenceDistAt(geo: FieldGeometry, sprayDeg: number): number {
  const f = geo.fence;
  const s = clamp(sprayDeg, -FOUL_ANGLE_DEG, FOUL_ANGLE_DEG);
  // Four segments across [-45, -22.5, 0, +22.5, +45].
  if (s < -22.5) return lerp(f.lf, f.lcf, (s + 45) / 22.5);
  if (s < 0) return lerp(f.lcf, f.cf, (s + 22.5) / 22.5);
  if (s < 22.5) return lerp(f.cf, f.rcf, s / 22.5);
  return lerp(f.rcf, f.rf, (s - 22.5) / 22.5);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** The point on the fence at a spray angle. */
export function fencePointAt(geo: FieldGeometry, sprayDeg: number): Vec2 {
  return pointAt(sprayDeg, fenceDistAt(geo, sprayDeg));
}

/**
 * Inward (toward-home) unit normal of the fence at a spray angle — what a
 * caromed ball reflects off. Computed from the local tangent of the polar
 * curve r(θ), so a sloped wall (the sandlot's porch) deflects correctly rather
 * than behaving like a circle.
 */
export function fenceNormalAt(geo: FieldGeometry, sprayDeg: number): Vec2 {
  const h = 0.5; // degrees
  const a = fencePointAt(geo, sprayDeg - h);
  const b = fencePointAt(geo, sprayDeg + h);
  const tx = b.x - a.x;
  const tz = b.z - a.z;
  const len = Math.hypot(tx, tz) || 1;
  // Rotate the tangent -90° to point back toward home. The fence is traversed
  // left-to-right (increasing spray), so (tz, -tx) is the inward side.
  return { x: tz / len, z: -tx / len };
}

/** How far inside the fence fielders (and landings) stay, ft. */
export const FIELD_MARGIN = 4;

/**
 * How far past a foul line a fielder may stray, as a fixed LATERAL distance in
 * feet — not an angle. Foul balls never become live plays, so this is purely
 * feel: chasing a ball near the chalk shouldn't hit a glass wall on the line.
 *
 * An angular allowance is wrong at the plate end, where it collapses to zero
 * width and would squeeze the catcher and the batter's boxes out of the
 * playable region entirely. v1 had this right (a constant 28px added to the
 * half-width); this is the same rule in feet.
 */
export const FOUL_ALLOWANCE_FT = 10;

/** Nobody runs behind the backstop. */
export const BACKSTOP_Z = -PLATE_TO_BACKSTOP;

/** Half-width of legal ground at depth `z` — the foul cone, widened. */
export function halfWidthAt(z: number): number {
  return Math.max(0, z) + FOUL_ALLOWANCE_FT;
}

/**
 * Clamp a point into the playable field: in front of the backstop, inside the
 * foul cone (widened by FOUL_ALLOWANCE_FT), and in front of the fence.
 *
 * The region is the intersection of three half-planes (two foul lines, the
 * backstop) and the fence interior. `fenceIsConvex` asserts the last of those
 * is convex for every shipped venue, which is what keeps v1's argument valid:
 * `moveToward` between two in-bounds points can never exit, so only
 * externally-targeted moves (the steered fielder) need this.
 *
 * ORDER MATTERS. The lateral clamp runs BEFORE the radial one, because
 * scaling radially preserves spray: if |x| <= z + a and we scale by k < 1,
 * then |kx| <= kz + ka <= kz + a, so the foul clamp survives the fence clamp.
 * The reverse order does not hold.
 */
export function clampToField(geo: FieldGeometry, p: Vec2, margin = FIELD_MARGIN): Vec2 {
  // 1. Backstop.
  const z0 = Math.max(p.z, BACKSTOP_Z);
  // 2. Foul cone. Note this is in CARTESIAN, so it behaves at and behind the
  //    plate where spray angle is undefined or wraps past ±90°.
  const half = halfWidthAt(z0);
  const x0 = clamp(p.x, -half, half);

  // 3. Fence — radial, and only ever relevant in fair territory.
  const r = Math.hypot(x0, z0);
  if (r < 1e-6) return { x: x0, z: z0 };
  const spray = toDeg(Math.atan2(x0, z0));
  if (Math.abs(spray) > 90) return { x: x0, z: z0 }; // behind the plate

  const limit = Math.max(1, fenceDistAt(geo, spray) - margin);
  if (r <= limit) return { x: x0, z: z0 };
  const k = limit / r;
  return { x: x0 * k, z: z0 * k };
}

/** Is `p` beyond the wall at its spray angle? (Height is the caller's job.) */
export function isBeyondFence(geo: FieldGeometry, p: Vec2): boolean {
  return distFromHome(p) > fenceDistAt(geo, sprayOf(p));
}

export function isFair(p: Vec2): boolean {
  return Math.abs(sprayOf(p)) <= FOUL_ANGLE_DEG;
}

/**
 * Numerically verify the fence interior is convex, by sampling the boundary
 * and checking the turn direction never reverses.
 *
 * v1 proved this analytically (`fenceYAtX` is convex in x whenever
 * `fenceBulge >= 0`). A radial profile has no such one-line argument, so v2
 * checks it directly — which is stronger: it catches a concave dent from ANY
 * combination of the five control points, not just a negative bulge.
 */
export function fenceIsConvex(geo: FieldGeometry, samples = 181): boolean {
  const pts: Vec2[] = [];
  for (let i = 0; i < samples; i++) {
    const s = -FOUL_ANGLE_DEG + (2 * FOUL_ANGLE_DEG * i) / (samples - 1);
    pts.push(fencePointAt(geo, s));
  }
  // Close the region through home so the poles are included in the test.
  pts.push(HOME);
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const c = pts[(i + 2) % pts.length];
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

// --- Defensive positions ----------------------------------------------------

/** The nine defensive positions. Re-exported so `systems/lineup.ts` (which
 *  imports this union from v1's geometry.ts) can be SHARED unmodified. */
export type PositionId = 'P' | 'C' | '1B' | '2B' | 'SS' | '3B' | 'LF' | 'CF' | 'RF';

/**
 * Where each fielder stands at the start of a play, in feet.
 *
 * Set at real Little League ratios rather than v1's compressed ones — this
 * table IS the balance fix. The outfielders now stand at 2.68-2.75 basepaths
 * where v1 had them at 1.49, which is what creates a gap for a ball to land in.
 */
export const FIELD_POSITIONS: Record<PositionId, Vec2> = {
  P: { x: 0, z: MOUND_DIST },
  C: { x: 0, z: -5 },
  '1B': { x: 36, z: 52 },
  '2B': { x: 18, z: 74 },
  SS: { x: -18, z: 74 },
  '3B': { x: -36, z: 52 },
  LF: { x: -70, z: 145 },
  CF: { x: 0, z: 165 },
  RF: { x: 70, z: 145 },
};

/** Which position covers each base for a throw (4 = home plate). */
export const BASE_COVER: Record<1 | 2 | 3 | 4, PositionId> = {
  1: '1B',
  2: '2B',
  3: '3B',
  4: 'C',
};

// --- The venues -------------------------------------------------------------

export type VenueId = 'park' | 'sandlot' | 'blacktop';

export const VENUE_GEOMETRY: Record<VenueId, FieldGeometry> = {
  /** The classic park: symmetric, a real arc to centre. */
  park: {
    fence: { lf: 185, lcf: 205, cf: 212, rcf: 205, rf: 185 },
    fenceHeight: 8,
    wallRestitution: 0.55,
    rollFriction: 0.28, // mown grass
    bounceMult: 1,
    obstacles: [],
  },
  /**
   * The backyard: a genuinely short right-field porch (150ft against left's
   * 198) — a real 48ft asymmetry, where v1 could only express it as a screen-y
   * nudge. Shaggy grass kills rollers and deadens hops; the old oak in
   * left-centre stops rollers dead with a BONK.
   *
   * ★ The left side arcs OUT to 207 at left-centre rather than peaking at the
   * foul pole. A profile whose deepest point is the pole (the first draft was
   * lf 205 / lcf 200 / cf 200) is concave at left-centre, and `fenceIsConvex`
   * rejects it: a concave wall lets a caromed ball reflect OUT of the field
   * and breaks `moveToward` containment. Deep-left survives as an asymmetry
   * against right; it just cannot be a spike at the line.
   */
  sandlot: {
    fence: { lf: 198, lcf: 207, cf: 203, rcf: 177, rf: 150 },
    fenceHeight: 6,
    wallRestitution: 0.42, // wood planks, dead
    rollFriction: 0.36, // shaggy backyard grass
    bounceMult: 0.8,
    obstacles: [{ x: -55, z: 150, r: 8, kind: 'tree' }],
  },
  /** Chain-link all round and hot asphalt — grounders scoot, hops spring. */
  blacktop: {
    fence: { lf: 188, lcf: 188, cf: 188, rcf: 188, rf: 188 },
    fenceHeight: 10,
    wallRestitution: 0.62, // chain-link twangs it back
    rollFriction: 0.1, // asphalt
    bounceMult: 1.3,
    obstacles: [],
  },
};

export const DEFAULT_GEOMETRY = VENUE_GEOMETRY.park;
