// ---------------------------------------------------------------------------
// Field geometry. PURE — shared by the scene (rendering) and the live-play
// sim (systems/liveplay.ts), which both work in the game's fixed 960x640
// screen space. One source of truth so the sim and the pixels can't disagree.
// ---------------------------------------------------------------------------

export interface Vec {
  x: number;
  y: number;
}

// A clean diamond seen from behind home plate. The bases sit exactly on the
// foul lines (slope FOUL_SLOPE from home), and home→2B is well short of the
// fence so a real outfield band exists beyond the infield.
export const HOME: Vec = { x: 480, y: 500 };
export const FIRST: Vec = { x: 618, y: 385 };
export const SECOND: Vec = { x: 480, y: 270 };
export const THIRD: Vec = { x: 342, y: 385 };
export const MOUND: Vec = { x: 480, y: 388 };

/** Top of the outfield wall — a fly landing above this line is a home run. */
export const FENCE_Y = 210;

/**
 * Foul-line slope: x-per-y from home out through 1B/3B (138/115 = 1.2). The
 * foul poles derive from this per venue, so the drawn lines pass exactly
 * through the bags no matter where a venue's fence sits.
 */
export const FOUL_SLOPE = 1.2;

/** Where the foul lines meet a fence at the given y (left/right pole x's). */
export function foulPoleXAt(fenceY: number): { left: number; right: number } {
  const d = FOUL_SLOPE * (HOME.y - fenceY);
  return { left: HOME.x - d, right: HOME.x + d };
}

/**
 * Venue-shaped field geometry: where the fence sits per spray direction, how
 * the ground plays, and what's in the way. Bases/mound are fixed for every
 * venue. PURE data + helpers, shared by atbat launches, the live sim, and
 * the renderer.
 */
export interface FieldGeometry {
  /** Fence y at the left foul line and at the right foul line. */
  fenceLeftY: number;
  fenceRightY: number;
  /** Foul-pole x's — always foulPoleXAt(fence y), so lines hit the bags. */
  fenceLeftX: number;
  fenceRightX: number;
  /** Grounder roll-speed multiplier. */
  rollMult: number;
  obstacles: Array<{ x: number; y: number; r: number }>;
}

/** The classic park — identical to the pre-venue constants. */
export const DEFAULT_GEOMETRY: FieldGeometry = {
  fenceLeftY: FENCE_Y,
  fenceRightY: FENCE_Y,
  fenceLeftX: foulPoleXAt(FENCE_Y).left,
  fenceRightX: foulPoleXAt(FENCE_Y).right,
  rollMult: 1,
  obstacles: [],
};

/** The point on the fence at spray fraction t (0 = left line, 1 = right). */
export function fencePointAt(geo: FieldGeometry, t: number): Vec {
  return {
    x: geo.fenceLeftX + t * (geo.fenceRightX - geo.fenceLeftX),
    y: geo.fenceLeftY + t * (geo.fenceRightY - geo.fenceLeftY),
  };
}

/** How far inside the fence fielders (and landings — see atbat) stay. */
export const FIELD_MARGIN = 14;

/**
 * How far past a foul line a fielder may stray. Foul balls never become live
 * plays (landings are clamped into the fair cone), so this is purely feel —
 * chasing a ball near the chalk shouldn't hit a glass wall on the line.
 */
export const FOUL_ALLOWANCE = 28;

/** Sanity floor: nobody runs off the bottom of the 960x640 screen. */
export const FIELD_BOTTOM_Y = 600;

/** Fence y at screen x, interpolated along this venue's fence line. */
export function fenceYAtX(geo: FieldGeometry, x: number): number {
  const t = Math.min(1, Math.max(0, (x - geo.fenceLeftX) / (geo.fenceRightX - geo.fenceLeftX)));
  return geo.fenceLeftY + t * (geo.fenceRightY - geo.fenceLeftY);
}

/**
 * Clamp a point into the playable field: in front of the fence line (by
 * `margin`), inside the foul cone (+FOUL_ALLOWANCE), above FIELD_BOTTOM_Y.
 * The region is an intersection of half-planes (convex), so moveToward
 * between two in-bounds points can never exit — only externally-targeted
 * moves (the steered fielder) need this.
 */
export function clampToField(geo: FieldGeometry, p: Vec, margin = FIELD_MARGIN): Vec {
  // y first: pushing y down toward home narrows the cone, so the x-clamp
  // must use the final y.
  let y = Math.min(FIELD_BOTTOM_Y, Math.max(p.y, fenceYAtX(geo, p.x) + margin));
  const half = FOUL_SLOPE * Math.max(0, HOME.y - y) + FOUL_ALLOWANCE;
  const x = Math.min(HOME.x + half, Math.max(HOME.x - half, p.x));
  // Slanted fences (sandlot): clamping x can land under a shallower fence
  // segment, so re-check the fence at the clamped x.
  y = Math.max(y, fenceYAtX(geo, x) + margin);
  return { x, y };
}

/** Position for a base index: 0 & 4 = home, 1/2/3 = the bases. */
export function basePos(idx: number): Vec {
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

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Step `from` toward `to` by at most `maxStep` px. Never overshoots. */
export function moveToward(from: Vec, to: Vec, maxStep: number): Vec {
  const d = dist(from, to);
  if (d <= maxStep || d === 0) return { x: to.x, y: to.y };
  const t = maxStep / d;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

export function lerpVec(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** The nine defensive positions. */
export type PositionId = 'P' | 'C' | '1B' | '2B' | 'SS' | '3B' | 'LF' | 'CF' | 'RF';

/**
 * Where each fielder stands at the start of a play (screen coords). Every
 * spot is strictly inside the fair cone for EVERY venue's foul lines, and
 * clear of all venue obstacles (the sandlot oak) — asserted in tests.
 */
export const FIELD_POSITIONS: Record<PositionId, Vec> = {
  P: MOUND,
  C: { x: 480, y: 540 },
  '1B': { x: 600, y: 375 },
  '2B': { x: 555, y: 300 },
  SS: { x: 405, y: 300 },
  '3B': { x: 360, y: 375 },
  LF: { x: 295, y: 240 },
  CF: { x: 480, y: 232 },
  RF: { x: 665, y: 240 },
};

/** Which position covers each base for a throw (4 = home plate). */
export const BASE_COVER: Record<1 | 2 | 3 | 4, PositionId> = {
  1: '1B',
  2: '2B',
  3: '3B',
  4: 'C',
};
